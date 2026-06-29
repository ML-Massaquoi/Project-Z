"""
Project Z - IngestionService (Layer 1)
Raw scan ingestion orchestrator.

Pipeline:
  1. Resolve device, employee, location context
  2. Classify scan_result
  3. INSERT scan_events row
  4. INSERT attendance_logs row (immediate — no waiting for background worker)
  5. Create/update attendance_session
  6. Broadcast WebSocket
  7. Enqueue to Redis stream (for summary updates)
"""

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceLog, AttendanceSession, PunchDirection, VerifyType
from app.models.device import Device
from app.models.employee import Employee
from app.models.employee_device_mapping import EmployeeDeviceMapping
from app.models.scan_event import (
    ProcessingStatusV2,
    ScanEvent,
    ScanResult,
    VerificationMethod,
)

logger = logging.getLogger(__name__)

_VERIFY_TYPE_MAP = {
    0: VerificationMethod.PASSWORD,
    1: VerificationMethod.FINGERPRINT,
    2: VerificationMethod.CARD,
    9: VerificationMethod.FACE,
}

_VERIFY_TYPE_STR_MAP = {
    0: "password",
    1: "fingerprint",
    2: "card",
    9: "face",
}

_PUNCH_STATUS_MAP = {
    0: PunchDirection.IN,
    1: PunchDirection.OUT,
    2: PunchDirection.OUT,   # break-out
    3: PunchDirection.IN,    # break-in
    4: PunchDirection.IN,    # OT-in
    5: PunchDirection.OUT,   # OT-out
}


class IngestionService:
    """
    Layer 1 orchestrator: store every scan, create attendance log immediately.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def ingest(
        self,
        device_serial: str,
        device_user_id: str,
        scan_timestamp: datetime,
        verify_type_code: int,
        raw_punch_state: int,
        raw_payload: dict,
        source_ip: Optional[str] = None,
    ) -> Optional[ScanEvent]:
        """Ingest a single biometric scan event."""
        t_start = time.monotonic()

        # ── Step 1: Resolve device ────────────────────────────
        device = await self._resolve_device(device_serial)
        device_id = device.id if device else None
        device_name = device.name or f"Device {device_serial}" if device else "Unknown Device"
        office_id = device.office_id if device else None
        department_id_from_device = device.department_id if device else None

        office_name = "Unassigned"
        department_name = "Unassigned"
        if device and device.office_id:
            from app.models.office import Office
            office_result = await self.session.execute(
                select(Office).where(Office.id == device.office_id)
            )
            office = office_result.scalar_one_or_none()
            if office:
                office_name = office.name

        if device and device.department_id:
            from app.models.department import Department
            dept_result = await self.session.execute(
                select(Department).where(Department.id == device.department_id)
            )
            dept = dept_result.scalar_one_or_none()
            if dept:
                department_name = dept.name

        # ── Step 2: Resolve employee ──────────────────────────
        employee = None
        employee_id = None
        employee_code = "UNKNOWN"
        employee_name = None
        employee_dept_id = None

        if device_id is not None:
            employee = await self._resolve_employee(device_user_id, device_id)

        if employee:
            employee_id = employee.id
            employee_code = employee.employee_code
            employee_name = employee.full_name
            employee_dept_id = employee.department_id
            if employee_dept_id:
                from app.models.department import Department
                dept_result = await self.session.execute(
                    select(Department).where(Department.id == employee_dept_id)
                )
                dept = dept_result.scalar_one_or_none()
                if dept:
                    department_name = dept.name

        # ── Step 3: Classify scan_result ──────────────────────
        if device is None:
            scan_result = ScanResult.UNKNOWN_DEVICE
        elif employee is None:
            scan_result = ScanResult.UNKNOWN_USER
        else:
            scan_result = ScanResult.SUCCESSFUL

        verification_method = _VERIFY_TYPE_MAP.get(verify_type_code, VerificationMethod.OTHER)
        punch_direction = _PUNCH_STATUS_MAP.get(raw_punch_state, PunchDirection.UNKNOWN)

        # ── Step 4: INSERT scan_events row ────────────────────
        scan_event = None
        try:
            # Ensure partition exists for this timestamp
            from app.services.partition_manager import partition_manager
            await partition_manager.ensure_partition_exists(self.session, scan_timestamp)

            scan_event = ScanEvent(
                employee_id=employee_id,
                employee_code=employee_code,
                employee_name=employee_name,
                department_id=employee_dept_id or department_id_from_device,
                department_name=department_name,
                office_id=office_id,
                office_name=office_name,
                device_id=device_id,
                device_name=device_name,
                device_serial=device_serial,
                verification_method=verification_method,
                scan_result=scan_result,
                raw_punch_state=raw_punch_state,
                raw_payload=raw_payload,
                scan_timestamp=scan_timestamp,
                processing_status=ProcessingStatusV2.PROCESSED,
                websocket_broadcasted=False,
            )
            self.session.add(scan_event)
            await self.session.flush()
            await self.session.refresh(scan_event)
            logger.info(f">>> SCAN SAVED | id={scan_event.id} employee={employee_code} result={scan_result}")
        except Exception as e:
            logger.error(f"[Ingestion] Scan storage failed: {e}", exc_info=True)
            return None

        # ── Step 5: Create attendance_log immediately ──────────
        if employee and device and scan_result == ScanResult.SUCCESSFUL:
            try:
                await self._create_attendance_log(
                    employee_id=employee_id,
                    device_id=device_id,
                    timestamp=scan_timestamp,
                    verify_type_code=verify_type_code,
                    punch_direction=punch_direction,
                    device_user_id=device_user_id,
                    work_code=raw_payload.get("work_code", ""),
                )
                logger.info(f">>> ATTENDANCE LOG CREATED | employee={employee_code}")
            except Exception as e:
                logger.error(f"[Ingestion] Failed to create attendance log: {e}", exc_info=True)

        # ── Step 6: Broadcast WebSocket ────────────────────────
        try:
            await self._broadcast_scan_event(scan_event, employee, device)
        except Exception as e:
            logger.warning(f"[Ingestion] WebSocket broadcast failed: {e}")

        # ── Step 7: Enqueue to Redis stream ────────────────────
        try:
            await self._enqueue_processing_task(scan_event)
        except Exception as e:
            logger.warning(f"[Ingestion] Redis enqueue failed: {e}")

        return scan_event

    async def _create_attendance_log(
        self,
        employee_id: UUID,
        device_id: UUID,
        timestamp: datetime,
        verify_type_code: int,
        punch_direction: PunchDirection,
        device_user_id: str,
        work_code: str,
    ) -> AttendanceLog:
        """Create an attendance_log record immediately."""
        verify_type_str = _VERIFY_TYPE_STR_MAP.get(verify_type_code, "other")
        
        log = AttendanceLog(
            employee_id=employee_id,
            device_id=device_id,
            timestamp=timestamp,
            device_user_id=device_user_id,
            verify_type=verify_type_str,
            punch_direction=punch_direction,
            work_code=work_code,
            is_duplicate=False,
        )
        self.session.add(log)
        
        # Also create or update attendance_session
        await self._upsert_attendance_session(employee_id, device_id, timestamp, punch_direction)
        
        await self.session.flush()
        return log

    async def _upsert_attendance_session(
        self,
        employee_id: UUID,
        device_id: UUID,
        timestamp: datetime,
        punch_direction: PunchDirection,
    ) -> None:
        """Create or update attendance_session for this employee today.
        
        For night shifts that cross midnight:
        - If check-in is between 18:00-23:59, attribute to that day's shift
        - If check-out is between 00:00-06:00, attribute to previous day's shift
        - This ensures a night shift (e.g., 20:00 Mon → 08:00 Tue) is one session
        """
        from app.utils.time_utils import today_date
        
        # Determine the "shift date" based on time of day
        hour = timestamp.hour
        
        # Night shift crossing midnight: 00:00-06:00 belongs to previous day's shift
        if hour < 6:
            event_date = (timestamp - timedelta(days=1)).date()
        else:
            event_date = timestamp.date()
        
        # Find existing session for today
        result = await self.session.execute(
            select(AttendanceSession).where(
                and_(
                    AttendanceSession.employee_id == employee_id,
                    AttendanceSession.date == event_date,
                )
            )
        )
        session = result.scalar_one_or_none()
        
        if session is None:
            # First scan of the day — create session with check_in
            session = AttendanceSession(
                employee_id=employee_id,
                date=event_date,
                check_in=timestamp,
                check_in_device_id=device_id,
                late_minutes=0,
                status="on_time",
                is_complete=False,
            )
            self.session.add(session)
            logger.info(f">>> SESSION CREATED | employee={employee_id} check_in={timestamp} shift_date={event_date}")
        else:
            # Update check_out (rolling last scan)
            updates = {
                "check_out": timestamp,
                "check_out_device_id": device_id,
                "is_complete": True,
            }
            
            # Calculate duration — normalize timezones before subtraction
            if session.check_in:
                # ADMS timestamps are naive; DB timestamps are tz-aware. Normalize both to naive UTC.
                t_out = timestamp.replace(tzinfo=None) if timestamp.tzinfo else timestamp
                t_in  = session.check_in.replace(tzinfo=None) if session.check_in.tzinfo else session.check_in
                delta = t_out - t_in
                updates["duration_minutes"] = round(delta.total_seconds() / 60, 1)
            
            await self.session.execute(
                update(AttendanceSession)
                .where(AttendanceSession.id == session.id)
                .values(**updates)
            )
            logger.info(f">>> SESSION UPDATED | employee={employee_id} check_out={timestamp} shift_date={event_date}")

    # ── Private helpers ───────────────────────────────────────

    async def _resolve_device(self, serial_number: str) -> Optional[Device]:
        result = await self.session.execute(
            select(Device).where(Device.serial_number == serial_number)
        )
        return result.scalar_one_or_none()

    async def _resolve_employee(self, device_user_id: str, device_id: UUID) -> Optional[Employee]:
        result = await self.session.execute(
            select(Employee)
            .join(EmployeeDeviceMapping, EmployeeDeviceMapping.employee_id == Employee.id)
            .where(
                and_(
                    EmployeeDeviceMapping.device_user_id == device_user_id,
                    EmployeeDeviceMapping.device_id == device_id,
                )
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _broadcast_scan_event(self, scan: ScanEvent, employee: Optional[Employee], device: Optional[Device]) -> None:
        from app.services.websocket_service import ws_manager

        payload = {
            "scan_event_id": str(scan.id),
            "employee_name": scan.employee_name,
            "employee_code": scan.employee_code,
            "department_name": scan.department_name,
            "office_name": scan.office_name,
            "device_name": scan.device_name,
            "device_serial": scan.device_serial,
            "verification_method": scan.verification_method.value if hasattr(scan.verification_method, "value") else str(scan.verification_method),
            "scan_timestamp": scan.scan_timestamp.isoformat(),
            "scan_result": scan.scan_result.value if hasattr(scan.scan_result, "value") else str(scan.scan_result),
        }

        await ws_manager.broadcast("scan_event", payload)

        if scan.scan_result in (ScanResult.UNKNOWN_USER, ScanResult.UNKNOWN_DEVICE):
            await ws_manager.broadcast("unknown_user_alert", {
                "device_serial_number": scan.device_serial,
                "raw_device_user_id": scan.employee_code,
                "scan_timestamp": scan.scan_timestamp.isoformat(),
                "device_name": scan.device_name,
            })

        await self.session.execute(
            update(ScanEvent)
            .where(and_(ScanEvent.id == scan.id, ScanEvent.scan_timestamp == scan.scan_timestamp))
            .values(websocket_broadcasted=True)
        )
        await self.session.flush()

    async def _enqueue_processing_task(self, scan: ScanEvent) -> None:
        from app.core.config import get_settings
        import redis.asyncio as aioredis

        settings = get_settings()
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            await redis.xadd(
                "projectz:attendance_tasks",
                {
                    "scan_event_id": str(scan.id),
                    "employee_id": str(scan.employee_id) if scan.employee_id else "",
                    "scan_timestamp": scan.scan_timestamp.isoformat(),
                    "attempt": "1",
                },
            )
            await self.session.execute(
                update(ScanEvent)
                .where(and_(ScanEvent.id == scan.id, ScanEvent.scan_timestamp == scan.scan_timestamp))
                .values(processing_status=ProcessingStatusV2.QUEUED)
            )
            await self.session.flush()
        finally:
            await redis.aclose()
