"""
Project Z - IngestionService (Layer 1)
Raw scan ingestion orchestrator.

Pipeline (strict order, per Req 2.2):
  1. Resolve device, employee, location context
  2. Classify scan_result
  3. INSERT scan_events row (always — never fails silently)
  4. Fire-and-forget: broadcast scan_event WebSocket
  5. Fire-and-forget: publish to Redis stream projectz:attendance_tasks

Steps 4 and 5 MUST NOT block step 3.
All errors after step 3 are logged and swallowed — the ADMS device always gets "OK".
"""
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

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

# Mapping from ADMS verify_type integer to VerificationMethod enum
_VERIFY_TYPE_MAP = {
    0: VerificationMethod.PASSWORD,
    1: VerificationMethod.FINGERPRINT,
    2: VerificationMethod.CARD,
    9: VerificationMethod.FACE,
}


class IngestionService:
    """
    Layer 1 orchestrator: store every scan, then fire-and-forget broadcast + queue.
    Never raises — all post-storage errors are caught and logged.
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
        """
        Ingest a single biometric scan event.

        Returns the stored ScanEvent, or None if the DB write failed.
        """
        t_start = time.monotonic()

        # ── Step 1: Resolve device ────────────────────────────
        device = await self._resolve_device(device_serial)
        device_id = device.id if device else None
        device_name = device.name or f"Device {device_serial}" if device else "Unknown Device"
        office_id = device.office_id if device else None
        department_id_from_device = device.department_id if device else None

        # Resolve office/department names (never null — default "Unassigned")
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
            # Employee's department takes precedence over device's department
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

        # ── Step 4: Map verification method ──────────────────
        verification_method = _VERIFY_TYPE_MAP.get(
            verify_type_code, VerificationMethod.OTHER
        )

        # ── Step 5: INSERT scan_events row ────────────────────
        scan_event = None
        try:
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
                processing_status=ProcessingStatusV2.PENDING,
                websocket_broadcasted=False,
            )
            self.session.add(scan_event)
            await self.session.flush()
            await self.session.refresh(scan_event)

            elapsed_ms = (time.monotonic() - t_start) * 1000
            logger.debug(
                f"[Ingestion] Stored scan_event {scan_event.id} "
                f"employee={employee_code} result={scan_result} "
                f"in {elapsed_ms:.1f}ms"
            )
        except Exception as e:
            logger.error(
                f"[Ingestion] CRITICAL: scan storage failed | "
                f"device={device_serial} user={device_user_id} | "
                f"error={e} | payload={str(raw_payload)[:500]}",
                exc_info=True,
            )
            return None

        # ── Step 6: Fire-and-forget WebSocket broadcast ───────
        try:
            await self._broadcast_scan_event(scan_event, employee, device)
        except Exception as e:
            logger.warning(f"[Ingestion] WebSocket broadcast failed: {e}")

        # ── Step 7: Fire-and-forget Redis stream enqueue ──────
        try:
            await self._enqueue_processing_task(scan_event)
        except Exception as e:
            logger.warning(
                f"[Ingestion] Redis enqueue failed, marking queued_offline: {e}"
            )
            try:
                from sqlalchemy import update
                await self.session.execute(
                    update(ScanEvent)
                    .where(
                        and_(
                            ScanEvent.id == scan_event.id,
                            ScanEvent.scan_timestamp == scan_event.scan_timestamp,
                        )
                    )
                    .values(processing_status=ProcessingStatusV2.QUEUED_OFFLINE)
                )
                await self.session.flush()
            except Exception as e2:
                logger.error(f"[Ingestion] Failed to mark queued_offline: {e2}")

        return scan_event

    # ── Private helpers ───────────────────────────────────────

    async def _resolve_device(self, serial_number: str) -> Optional[Device]:
        result = await self.session.execute(
            select(Device).where(Device.serial_number == serial_number)
        )
        return result.scalar_one_or_none()

    async def _resolve_employee(
        self, device_user_id: str, device_id: UUID
    ) -> Optional[Employee]:
        result = await self.session.execute(
            select(Employee)
            .join(
                EmployeeDeviceMapping,
                EmployeeDeviceMapping.employee_id == Employee.id,
            )
            .where(
                and_(
                    EmployeeDeviceMapping.device_user_id == device_user_id,
                    EmployeeDeviceMapping.device_id == device_id,
                )
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _broadcast_scan_event(
        self,
        scan: ScanEvent,
        employee: Optional[Employee],
        device: Optional[Device],
    ) -> None:
        from app.services.websocket_service import ws_manager

        payload = {
            "scan_event_id": str(scan.id),
            "employee_photo_url": getattr(employee, "avatar_url", None) if employee else None,
            "employee_name": scan.employee_name,
            "employee_code": scan.employee_code,
            "department_name": scan.department_name,
            "office_name": scan.office_name,
            "device_name": scan.device_name,
            "device_serial": scan.device_serial,
            "verification_method": scan.verification_method.value
            if hasattr(scan.verification_method, "value")
            else str(scan.verification_method),
            "scan_timestamp": scan.scan_timestamp.isoformat(),
            "scan_result": scan.scan_result.value
            if hasattr(scan.scan_result, "value")
            else str(scan.scan_result),
            "shift_type": "unknown",  # Resolved by attendance engine after processing
        }

        await ws_manager.broadcast("scan_event", payload)

        # Unknown user alert
        if scan.scan_result in (ScanResult.UNKNOWN_USER, ScanResult.UNKNOWN_DEVICE):
            await ws_manager.broadcast("unknown_user_alert", {
                "device_serial_number": scan.device_serial,
                "raw_device_user_id": scan.employee_code,
                "scan_timestamp": scan.scan_timestamp.isoformat(),
                "device_name": scan.device_name,
                "office_name": scan.office_name,
            })

        # Mark broadcasted
        from sqlalchemy import update
        await self.session.execute(
            update(ScanEvent)
            .where(
                and_(
                    ScanEvent.id == scan.id,
                    ScanEvent.scan_timestamp == scan.scan_timestamp,
                )
            )
            .values(websocket_broadcasted=True)
        )
        await self.session.flush()

    async def _enqueue_processing_task(self, scan: ScanEvent) -> None:
        """Publish to Redis stream projectz:attendance_tasks."""
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
            # Update processing_status to queued
            from sqlalchemy import update
            await self.session.execute(
                update(ScanEvent)
                .where(
                    and_(
                        ScanEvent.id == scan.id,
                        ScanEvent.scan_timestamp == scan.scan_timestamp,
                    )
                )
                .values(processing_status=ProcessingStatusV2.QUEUED)
            )
            await self.session.flush()
        finally:
            await redis.aclose()
