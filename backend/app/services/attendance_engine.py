"""
DEPRECATED: This is the v1 attendance engine.
Use attendance_engine_v2.py instead for production.

The v1 engine is kept for reference only and will be removed in a future release.
All active code paths use AttendanceEngineV2 which supports:
  - 14+ attendance status types
  - Shift-aware processing via ShiftResolver
  - Cross-midnight shift support
  - Grace period and overtime calculations
"""

# This module is deprecated and should not be imported.
# All references have been migrated to attendance_engine_v2.py.

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.attendance import (
    AttendanceLog,
    AttendanceSession,
    AttendanceStatus,
)
from app.models.employee import Employee
from app.models.shift import Shift
from app.repositories.attendance import (
    AttendanceLogRepository,
    AttendanceSessionRepository,
)

logger = logging.getLogger(__name__)
settings = get_settings()


class AttendanceEngine:
    """
    Enforced biometric attendance engine.

    Every scan is recorded. First scan = check-in. Last scan = check-out.
    """

    def __init__(self, session: AsyncSession):
        self.session = session
        self.log_repo = AttendanceLogRepository(session)
        self.session_repo = AttendanceSessionRepository(session)

    async def process_attendance_event(
        self,
        employee_id: UUID,
        device_id: Optional[UUID],
        timestamp: datetime,
        verify_type: str = "fingerprint",
        punch_status: int = 0,
        device_user_id: Optional[str] = None,
        work_code: Optional[str] = None,
    ) -> dict:
        """
        Process a single biometric scan event.

        Always returns an event dict — never returns None.
        Every scan is stored and reflected in the session.

        Returns:
            dict with keys: direction, action, session_id, status,
                            late_minutes, duration_minutes, scan_count
        """
        event_date = timestamp.date()

        # ── 1. Load employee + shift ──────────────────────────
        emp_result = await self.session.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        employee = emp_result.scalar_one_or_none()

        shift: Optional[Shift] = None
        if employee and employee.shift_id:
            shift_result = await self.session.execute(
                select(Shift).where(Shift.id == employee.shift_id)
            )
            shift = shift_result.scalar_one_or_none()

        # ── 2. Get or create today's session ──────────────────
        existing_session = await self.session_repo.get_session_for_date(
            employee_id, event_date
        )

        if existing_session is None:
            # ── FIRST SCAN OF THE DAY → Check-In ─────────────
            late_minutes, att_status = self._calculate_lateness(timestamp, shift)

            new_session = await self.session_repo.create({
                "employee_id": employee_id,
                "date": event_date,
                "check_in": timestamp,
                "check_in_device_id": device_id,
                "late_minutes": late_minutes,
                "status": att_status,
                "is_complete": False,
            })

            direction = "in"
            action = "check_in"

            log = await self._store_log(
                employee_id=employee_id,
                device_id=device_id,
                session_id=new_session.id,
                timestamp=timestamp,
                verify_type=verify_type,
                punch_direction=direction,
                device_user_id=device_user_id,
                work_code=work_code,
            )

            logger.info(
                f"[ENGINE] CHECK-IN  | {employee.full_name if employee else employee_id} "
                f"| {timestamp.strftime('%H:%M:%S')} "
                f"| late={late_minutes}min | status={att_status.value}"
            )

            return {
                "log_id": str(log.id),
                "employee_id": str(employee_id),
                "device_id": str(device_id) if device_id else None,
                "timestamp": timestamp.isoformat(),
                "direction": direction,
                "action": action,
                "verify_type": verify_type,
                "device_user_id": device_user_id,
                "session_id": str(new_session.id),
                "status": att_status.value,
                "late_minutes": late_minutes,
                "duration_minutes": 0,
                "scan_count": 1,
            }

        else:
            # ── SUBSEQUENT SCAN → Rolling Check-Out ──────────
            # Every scan after the first updates check_out.
            # This means the LAST scan of the day is always the departure time.

            duration_minutes = 0.0
            overtime_minutes = 0.0

            if existing_session.check_in:
                delta = timestamp - existing_session.check_in
                duration_minutes = round(delta.total_seconds() / 60, 1)
                overtime_minutes = self._calculate_overtime(
                    duration_minutes, shift
                )

            # Count how many scans this employee has today (for logging)
            scan_count = await self.log_repo.count_scans_today(
                employee_id, event_date
            )

            await self.session_repo.update(existing_session.id, {
                "check_out": timestamp,
                "check_out_device_id": device_id,
                "duration_minutes": duration_minutes,
                "overtime_minutes": overtime_minutes,
                "is_complete": True,
            })

            direction = "out"
            action = "check_out_updated"

            log = await self._store_log(
                employee_id=employee_id,
                device_id=device_id,
                session_id=existing_session.id,
                timestamp=timestamp,
                verify_type=verify_type,
                punch_direction=direction,
                device_user_id=device_user_id,
                work_code=work_code,
            )

            logger.info(
                f"[ENGINE] SCAN #{scan_count + 1:<3} | "
                f"{employee.full_name if employee else employee_id} "
                f"| {timestamp.strftime('%H:%M:%S')} "
                f"| duration={duration_minutes}min "
                f"| overtime={overtime_minutes}min"
            )

            return {
                "log_id": str(log.id),
                "employee_id": str(employee_id),
                "device_id": str(device_id) if device_id else None,
                "timestamp": timestamp.isoformat(),
                "direction": direction,
                "action": action,
                "verify_type": verify_type,
                "device_user_id": device_user_id,
                "session_id": str(existing_session.id),
                "status": (
                    existing_session.status.value
                    if hasattr(existing_session.status, "value")
                    else str(existing_session.status)
                ),
                "late_minutes": existing_session.late_minutes or 0,
                "duration_minutes": duration_minutes,
                "overtime_minutes": overtime_minutes,
                "scan_count": scan_count + 1,
            }

    # ── Private helpers ───────────────────────────────────────

    async def _store_log(
        self,
        employee_id: UUID,
        device_id: Optional[UUID],
        session_id: UUID,
        timestamp: datetime,
        verify_type: str,
        punch_direction: str,
        device_user_id: Optional[str],
        work_code: Optional[str],
    ) -> AttendanceLog:
        """Store a scan log. is_duplicate is always False — every scan is real."""
        return await self.log_repo.create({
            "employee_id": employee_id,
            "device_id": device_id,
            "session_id": session_id,
            "timestamp": timestamp,
            "verify_type": verify_type,
            "punch_direction": punch_direction,
            "device_user_id": device_user_id,
            "work_code": work_code,
            "is_duplicate": False,  # Every scan is real — no suppression
        })

    def _calculate_lateness(
        self,
        check_in: datetime,
        shift: Optional[Shift],
    ) -> tuple[float, AttendanceStatus]:
        """
        Calculate late minutes against shift start time.
        Returns (late_minutes, AttendanceStatus).
        If no shift assigned, employee is always ON_TIME.
        """
        if not shift:
            return 0.0, AttendanceStatus.ON_TIME

        grace = shift.grace_period_minutes or settings.DEFAULT_GRACE_PERIOD_MINUTES
        shift_start_dt = datetime.combine(check_in.date(), shift.start_time)

        # Make timezone-aware if check_in is aware
        if check_in.tzinfo is not None:
            shift_start_dt = shift_start_dt.replace(tzinfo=check_in.tzinfo)

        grace_cutoff = shift_start_dt + timedelta(minutes=grace)
        check_in_naive = check_in.replace(tzinfo=None) if check_in.tzinfo else check_in
        shift_start_naive = shift_start_dt.replace(tzinfo=None)
        grace_cutoff_naive = grace_cutoff.replace(tzinfo=None)

        if check_in_naive <= grace_cutoff_naive:
            return 0.0, AttendanceStatus.ON_TIME

        late_delta = check_in_naive - shift_start_naive
        late_minutes = round(late_delta.total_seconds() / 60, 1)
        return late_minutes, AttendanceStatus.LATE

    def _calculate_overtime(
        self,
        duration_minutes: float,
        shift: Optional[Shift],
    ) -> float:
        """
        Calculate overtime minutes beyond expected working hours.
        If no shift, no overtime tracked.
        """
        if not shift:
            return 0.0
        expected = (shift.working_hours or 8.0) * 60
        if duration_minutes > expected:
            return round(duration_minutes - expected, 1)
        return 0.0
