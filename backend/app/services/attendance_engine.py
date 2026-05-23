"""
Project Z - Attendance Engine Service
Core business logic for attendance processing.

Handles:
- Duplicate scan prevention
- IN/OUT detection
- Lateness calculation
- Overtime detection
- Missing checkout handling
"""

import logging
from datetime import date, datetime, timedelta, timezone, time as dt_time
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.attendance import (
    AttendanceLog,
    AttendanceSession,
    AttendanceStatus,
    PunchDirection,
    VerifyType,
)
from app.models.shift import Shift
from app.models.employee import Employee
from app.repositories.attendance import (
    AttendanceLogRepository,
    AttendanceSessionRepository,
)

logger = logging.getLogger(__name__)
settings = get_settings()


class AttendanceEngine:
    """Core attendance processing engine."""

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
    ) -> Optional[dict]:
        """
        Process a single attendance event from a biometric device.

        Returns dict with event details for WebSocket broadcast, or None if duplicate.
        """
        # ── 1. Duplicate Prevention ──────────────────────────
        is_duplicate = await self._check_duplicate(
            employee_id, timestamp
        )
        if is_duplicate:
            logger.info(
                f"Duplicate scan detected for employee {employee_id} "
                f"within {settings.DUPLICATE_SCAN_WINDOW_SECONDS}s window"
            )
            # Still store the log, but mark as duplicate
            await self._create_log(
                employee_id=employee_id,
                device_id=device_id,
                timestamp=timestamp,
                verify_type=verify_type,
                punch_direction="unknown",
                device_user_id=device_user_id,
                work_code=work_code,
                is_duplicate=True,
            )
            return None

        # ── 2. Determine Punch Direction ─────────────────────
        event_date = timestamp.date()
        direction = await self._determine_direction(
            employee_id, event_date, punch_status
        )

        # ── 3. Create Attendance Log ─────────────────────────
        log = await self._create_log(
            employee_id=employee_id,
            device_id=device_id,
            timestamp=timestamp,
            verify_type=verify_type,
            punch_direction=direction,
            device_user_id=device_user_id,
            work_code=work_code,
            is_duplicate=False,
        )

        # ── 4. Update Attendance Session ─────────────────────
        session_data = await self._update_session(
            employee_id=employee_id,
            device_id=device_id,
            timestamp=timestamp,
            direction=direction,
            event_date=event_date,
            log_id=log.id,
        )

        # ── 5. Build Event for WebSocket ─────────────────────
        event = {
            "log_id": str(log.id),
            "employee_id": str(employee_id),
            "device_id": str(device_id) if device_id else None,
            "timestamp": timestamp.isoformat(),
            "direction": direction,
            "verify_type": verify_type,
            "device_user_id": device_user_id,
            "session_id": str(session_data["session_id"]) if session_data else None,
            "status": session_data.get("status") if session_data else None,
            "late_minutes": session_data.get("late_minutes", 0) if session_data else 0,
        }

        return event

    async def _check_duplicate(
        self, employee_id: UUID, timestamp: datetime
    ) -> bool:
        """Check if this scan is a duplicate within the configured window."""
        last_log = await self.log_repo.get_last_log_for_employee(
            employee_id, settings.DUPLICATE_SCAN_WINDOW_SECONDS
        )
        return last_log is not None

    async def _determine_direction(
        self, employee_id: UUID, event_date: date, punch_status: int
    ) -> str:
        """
        Determine IN/OUT direction.

        ZKTeco punch_status values:
          0 = check-in, 1 = check-out, 2 = break-out, 3 = break-in, 4 = OT-in, 5 = OT-out

        Some devices always send 0 (no explicit direction). In that case we
        fall back to toggle logic: if there is an open session → OUT, else → IN.
        """
        # Explicit OUT signals from device
        if punch_status in (1, 2, 5):
            return "out"

        # Explicit IN signals from device (4 = OT-in, 3 = break-in)
        if punch_status in (3, 4):
            return "in"

        # punch_status == 0: device either means "check-in" OR sends 0 for everything.
        # Use toggle logic to be safe: check for an open session.
        open_session = await self.session_repo.get_open_session(
            employee_id, event_date
        )
        if open_session and open_session.check_in and not open_session.check_out:
            return "out"
        return "in"

    async def _create_log(
        self,
        employee_id: UUID,
        device_id: Optional[UUID],
        timestamp: datetime,
        verify_type: str,
        punch_direction: str,
        device_user_id: Optional[str],
        work_code: Optional[str],
        is_duplicate: bool,
    ) -> AttendanceLog:
        """Create an attendance log entry."""
        log = await self.log_repo.create({
            "employee_id": employee_id,
            "device_id": device_id,
            "timestamp": timestamp,
            "verify_type": verify_type,
            "punch_direction": punch_direction,
            "device_user_id": device_user_id,
            "work_code": work_code,
            "is_duplicate": is_duplicate,
        })
        return log

    async def _update_session(
        self,
        employee_id: UUID,
        device_id: Optional[UUID],
        timestamp: datetime,
        direction: str,
        event_date: date,
        log_id: UUID,
    ) -> dict:
        """Create or update attendance session based on punch direction."""
        from sqlalchemy import select, update
        from app.models.employee import Employee
        from app.models.shift import Shift

        # Fetch employee + shift once — used in both check-in and check-out branches
        emp_result = await self.session.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        employee = emp_result.scalar_one_or_none()

        shift = None
        if employee and employee.shift_id:
            shift_result = await self.session.execute(
                select(Shift).where(Shift.id == employee.shift_id)
            )
            shift = shift_result.scalar_one_or_none()

        if direction == "in":
            # ── CHECK-IN: Create new session ─────────────────
            late_minutes = 0.0
            status = AttendanceStatus.ON_TIME

            if shift:
                late_minutes, status = self._calculate_lateness(timestamp, shift)

            session_obj = await self.session_repo.create({
                "employee_id": employee_id,
                "date": event_date,
                "check_in": timestamp,
                "check_in_device_id": device_id,
                "late_minutes": late_minutes,
                "status": status,
                "is_complete": False,
            })

            # Link log to session
            await self.session.execute(
                update(AttendanceLog)
                .where(AttendanceLog.id == log_id)
                .values(session_id=session_obj.id)
            )

            return {
                "session_id": session_obj.id,
                "status": status.value,
                "late_minutes": late_minutes,
                "action": "check_in",
            }

        else:
            # ── CHECK-OUT: Close existing session ────────────
            open_session = await self.session_repo.get_open_session(
                employee_id, event_date
            )
            if open_session:
                duration = None
                overtime = 0.0

                if open_session.check_in:
                    delta = timestamp - open_session.check_in
                    duration = delta.total_seconds() / 60  # minutes

                    if shift:
                        overtime = self._calculate_overtime(timestamp, shift, duration)

                await self.session_repo.update(open_session.id, {
                    "check_out": timestamp,
                    "check_out_device_id": device_id,
                    "duration_minutes": duration,
                    "overtime_minutes": overtime,
                    "is_complete": True,
                })

                # Link log to session
                await self.session.execute(
                    update(AttendanceLog)
                    .where(AttendanceLog.id == log_id)
                    .values(session_id=open_session.id)
                )

                return {
                    "session_id": open_session.id,
                    "status": open_session.status.value if hasattr(open_session.status, "value") else str(open_session.status),
                    "late_minutes": open_session.late_minutes or 0,
                    "duration_minutes": duration,
                    "overtime_minutes": overtime,
                    "action": "check_out",
                }

            # No open session found — orphan check-out
            logger.warning(
                f"Check-out without open session for employee {employee_id} on {event_date}"
            )
            return {
                "session_id": None,
                "status": "unknown",
                "late_minutes": 0,
                "action": "orphan_check_out",
            }

    def _calculate_lateness(
        self, check_in: datetime, shift: "Shift"
    ) -> tuple[float, AttendanceStatus]:
        """
        Calculate late minutes and attendance status.

        Returns (late_minutes, status).
        """
        check_in_time = check_in.time()
        shift_start = shift.start_time

        # Calculate grace period cutoff
        grace_minutes = shift.grace_period_minutes or settings.DEFAULT_GRACE_PERIOD_MINUTES

        # Convert shift start to datetime for comparison
        shift_start_dt = datetime.combine(check_in.date(), shift_start)
        grace_cutoff = shift_start_dt + timedelta(minutes=grace_minutes)
        check_in_dt = datetime.combine(check_in.date(), check_in_time)

        if check_in_dt <= shift_start_dt:
            # Early or on time
            return 0.0, AttendanceStatus.ON_TIME
        elif check_in_dt <= grace_cutoff:
            # Within grace period - still on time
            return 0.0, AttendanceStatus.ON_TIME
        else:
            # Late
            late_delta = check_in_dt - shift_start_dt
            late_minutes = late_delta.total_seconds() / 60
            return round(late_minutes, 1), AttendanceStatus.LATE

    def _calculate_overtime(
        self, check_out: datetime, shift: "Shift", duration_minutes: float
    ) -> float:
        """Calculate overtime minutes."""
        working_hours = shift.working_hours or 8.0
        expected_minutes = working_hours * 60

        if duration_minutes > expected_minutes:
            return round(duration_minutes - expected_minutes, 1)
        return 0.0
