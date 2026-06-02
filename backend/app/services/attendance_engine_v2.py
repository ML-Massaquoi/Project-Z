"""
Project Z - AttendanceEngineV2
Shift-aware, department-aware, cross-midnight-aware attendance processing engine.

Business rules:
  - First valid scan within Check-in_Window  = check_in (reporting time)
  - Last valid scan within Check-out_Window  = check_out (departure time)
  - All other scans: stored in scan_events, ignored for session computation
  - 14 attendance statuses evaluated in strict priority order
  - Overtime is a numeric field, not a status
"""
import enum
import logging
import math
from datetime import date, datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.attendance import AttendanceSession
from app.models.holiday_calendar import HolidayCalendar, HolidayScope
from app.models.leave_request import LeaveRequest, LeaveStatus, LeaveType
from app.models.scan_event import ProcessingStatusV2, ScanEvent
from app.models.shift_template import ShiftTemplate
from app.services.shift_resolver import ResolvedShift, ShiftResolver

logger = logging.getLogger(__name__)
settings = get_settings()

HALF_DAY_THRESHOLD = 0.5          # 50% of working hours
EARLY_ARRIVAL_THRESHOLD_MIN = 30  # minutes before shift start = early_arrival


class ScanClassification(str, enum.Enum):
    CHECK_IN_CANDIDATE = "check_in_candidate"
    CHECK_OUT_CANDIDATE = "check_out_candidate"
    OUT_OF_WINDOW = "out_of_window"


class AttendanceEngineV2:
    """
    Processes a single scan_event and upserts the corresponding attendance_session.

    Called by the Redis Streams consumer (Layer 3) for every queued scan.
    """

    def __init__(self, session: AsyncSession):
        self.session = session
        self.resolver = ShiftResolver(session)

    async def process(self, scan_event_id: UUID) -> Optional[AttendanceSession]:
        """
        Process a single scan event.

        Steps:
          1. Load scan_event
          2. Resolve shift for employee + date
          3. Classify scan (check-in / check-out / out-of-window)
          4. Compute attendance status (14-status priority chain)
          5. Upsert attendance_session
          6. Update scan_event.processing_status
          7. Trigger summary update + WebSocket broadcast

        Returns the upserted AttendanceSession, or None if scan is out-of-window.
        """
        # ── 1. Load scan event ────────────────────────────────
        scan = await self._load_scan(scan_event_id)
        if scan is None:
            # Raise — NOT a silent return.
            # This can be a transient race condition: the Redis task was enqueued
            # before the DB transaction committed (flush vs commit boundary).
            # Raising causes the stream consumer to re-enqueue and retry.
            raise LookupError(
                f"[EngineV2] scan_event {scan_event_id} not found — "
                f"may not be committed yet (transient) or was deleted"
            )

        if scan.employee_id is None:
            # Unknown employee — mark processed, nothing to compute
            await self._update_scan_status(scan.id, scan.scan_timestamp, ProcessingStatusV2.PROCESSED)
            return None

        employee_id = scan.employee_id
        scan_time = scan.scan_timestamp

        # ── 2. Resolve shift ──────────────────────────────────
        # For overnight shifts, the shift_date is the start date of the shift,
        # not necessarily the calendar date of the scan.
        shift_date = scan_time.date()
        resolved = await self.resolver.resolve(employee_id, shift_date)

        # Check if this scan might belong to an overnight session from the previous day
        if resolved is None or (resolved and not resolved.is_weekend_off):
            prev_date = shift_date - timedelta(days=1)
            prev_resolved = await self.resolver.resolve(employee_id, prev_date)
            if prev_resolved and not prev_resolved.is_weekend_off:
                template = prev_resolved.template
                if template.is_overnight:
                    _, window_close = get_shift_window(template, prev_date)
                    if scan_time <= window_close:
                        # This scan belongs to the overnight session from prev_date
                        shift_date = prev_date
                        resolved = prev_resolved

        # ── 3. Handle special statuses (holiday, leave, weekend) ─
        if resolved is None:
            # Unscheduled — still store the scan, mark as unscheduled
            await self._update_scan_status(scan.id, scan.scan_timestamp, ProcessingStatusV2.PROCESSED)
            session_obj = await self._upsert_session(
                employee_id=employee_id,
                shift_date=shift_date,
                status="unscheduled_attendance",
                check_in=scan_time,
                check_in_device_id=scan.device_id,
            )
            await self._post_process(session_obj, scan, employee_id, shift_date)
            return session_obj

        if resolved.is_weekend_off:
            await self._update_scan_status(scan.id, scan.scan_timestamp, ProcessingStatusV2.PROCESSED)
            session_obj = await self._upsert_session(
                employee_id=employee_id,
                shift_date=shift_date,
                status="weekend_off",
            )
            await self._post_process(session_obj, scan, employee_id, shift_date)
            return session_obj

        template = resolved.template
        grace = resolved.grace_period_minutes

        # Check holiday
        is_holiday = await self._is_holiday(employee_id, shift_date)
        if is_holiday:
            await self._update_scan_status(scan.id, scan.scan_timestamp, ProcessingStatusV2.PROCESSED)
            session_obj = await self._upsert_session(
                employee_id=employee_id,
                shift_date=shift_date,
                status="holiday",
                shift_template_id=template.id,
                shift_name=template.name,
            )
            await self._post_process(session_obj, scan, employee_id, shift_date)
            return session_obj

        # Check approved leave
        leave = await self._get_approved_leave(employee_id, shift_date)
        if leave is not None:
            status = "vacation" if leave.is_vacation else "on_leave"
            await self._update_scan_status(scan.id, scan.scan_timestamp, ProcessingStatusV2.PROCESSED)
            session_obj = await self._upsert_session(
                employee_id=employee_id,
                shift_date=shift_date,
                status=status,
                shift_template_id=template.id,
                shift_name=template.name,
            )
            await self._post_process(session_obj, scan, employee_id, shift_date)
            return session_obj

        # ── 4. Classify scan within attendance windows ────────
        existing_session = await self._get_session(employee_id, shift_date)
        classification = classify_scan(scan_time, template, shift_date, existing_session)

        if classification == ScanClassification.OUT_OF_WINDOW:
            await self._update_scan_status(scan.id, scan.scan_timestamp, ProcessingStatusV2.OUT_OF_WINDOW)
            return None

        # ── 5. Upsert session based on classification ─────────
        if classification == ScanClassification.CHECK_IN_CANDIDATE:
            if existing_session is None or existing_session.check_in is None:
                # First valid check-in
                late_min, early_min, status = compute_checkin_status(
                    scan_time, template, grace
                )
                session_obj = await self._upsert_session(
                    employee_id=employee_id,
                    shift_date=shift_date,
                    status=status,
                    check_in=scan_time,
                    check_in_device_id=scan.device_id,
                    late_minutes=late_min,
                    early_minutes=early_min,
                    shift_template_id=template.id,
                    shift_name=template.name,
                )
            else:
                # Subsequent check-in window scan — already have check_in, just mark processed
                await self._update_scan_status(scan.id, scan.scan_timestamp, ProcessingStatusV2.PROCESSED)
                return existing_session

        else:  # CHECK_OUT_CANDIDATE
            if existing_session is None:
                # Orphan check-out — create session with just check_out
                session_obj = await self._upsert_session(
                    employee_id=employee_id,
                    shift_date=shift_date,
                    status="missed_checkin",
                    check_out=scan_time,
                    check_out_device_id=scan.device_id,
                    shift_template_id=template.id,
                    shift_name=template.name,
                )
            else:
                # Update check_out (rolling last scan)
                duration = None
                overtime = 0.0
                if existing_session.check_in:
                    delta = scan_time - existing_session.check_in
                    duration = round(delta.total_seconds() / 60, 1)
                    overtime = compute_overtime(duration, float(template.working_hours))

                # Recompute status with check_out
                status = recompute_status_with_checkout(
                    existing_session, duration, template
                )

                await self.session.execute(
                    update(AttendanceSession)
                    .where(AttendanceSession.id == existing_session.id)
                    .values(
                        check_out=scan_time,
                        check_out_device_id=scan.device_id,
                        duration_minutes=duration,
                        overtime_minutes=overtime,
                        status=status,
                        is_complete=True,
                        updated_at=datetime.utcnow(),
                    )
                )
                await self.session.flush()
                session_obj = await self._get_session(employee_id, shift_date)

        await self._update_scan_status(scan.id, scan.scan_timestamp, ProcessingStatusV2.PROCESSED)
        await self._post_process(session_obj, scan, employee_id, shift_date)
        return session_obj

    # ── Private helpers ───────────────────────────────────────

    async def _load_scan(self, scan_event_id: UUID) -> Optional[ScanEvent]:
        result = await self.session.execute(
            select(ScanEvent).where(ScanEvent.id == scan_event_id)
        )
        return result.scalar_one_or_none()

    async def _get_session(
        self, employee_id: UUID, shift_date: date
    ) -> Optional[AttendanceSession]:
        result = await self.session.execute(
            select(AttendanceSession).where(
                and_(
                    AttendanceSession.employee_id == employee_id,
                    AttendanceSession.date == shift_date,
                )
            )
        )
        return result.scalar_one_or_none()

    async def _upsert_session(
        self,
        employee_id: UUID,
        shift_date: date,
        status: str,
        check_in: Optional[datetime] = None,
        check_in_device_id: Optional[UUID] = None,
        check_out: Optional[datetime] = None,
        check_out_device_id: Optional[UUID] = None,
        late_minutes: float = 0.0,
        early_minutes: float = 0.0,
        overtime_minutes: float = 0.0,
        duration_minutes: Optional[float] = None,
        shift_template_id: Optional[UUID] = None,
        shift_name: Optional[str] = None,
    ) -> AttendanceSession:
        existing = await self._get_session(employee_id, shift_date)
        if existing is None:
            new_session = AttendanceSession(
                employee_id=employee_id,
                date=shift_date,
                status=status,
                check_in=check_in,
                check_in_device_id=check_in_device_id,
                check_out=check_out,
                check_out_device_id=check_out_device_id,
                late_minutes=late_minutes,
                early_minutes=early_minutes,
                overtime_minutes=overtime_minutes,
                duration_minutes=duration_minutes,
                is_complete=check_out is not None,
            )
            # Set new columns if they exist on the model
            if hasattr(new_session, "shift_date"):
                new_session.shift_date = shift_date
            if hasattr(new_session, "shift_template_id"):
                new_session.shift_template_id = shift_template_id
            if hasattr(new_session, "shift_name"):
                new_session.shift_name = shift_name
            if hasattr(new_session, "early_minutes"):
                new_session.early_minutes = early_minutes
            self.session.add(new_session)
            await self.session.flush()
            await self.session.refresh(new_session)
            return new_session
        else:
            updates: dict = {"status": status, "updated_at": datetime.utcnow()}
            if check_in is not None and existing.check_in is None:
                updates["check_in"] = check_in
                updates["check_in_device_id"] = check_in_device_id
                updates["late_minutes"] = late_minutes
                if hasattr(AttendanceSession, "early_minutes"):
                    updates["early_minutes"] = early_minutes
            if check_out is not None:
                updates["check_out"] = check_out
                updates["check_out_device_id"] = check_out_device_id
                updates["is_complete"] = True
                if duration_minutes is not None:
                    updates["duration_minutes"] = duration_minutes
                updates["overtime_minutes"] = overtime_minutes
            if shift_template_id and hasattr(AttendanceSession, "shift_template_id"):
                updates["shift_template_id"] = shift_template_id
            if shift_name and hasattr(AttendanceSession, "shift_name"):
                updates["shift_name"] = shift_name
            await self.session.execute(
                update(AttendanceSession)
                .where(AttendanceSession.id == existing.id)
                .values(**updates)
            )
            await self.session.flush()
            return await self._get_session(employee_id, shift_date)

    async def _update_scan_status(
        self, scan_id: UUID, scan_timestamp: datetime, status: ProcessingStatusV2
    ) -> None:
        await self.session.execute(
            update(ScanEvent)
            .where(
                and_(
                    ScanEvent.id == scan_id,
                    ScanEvent.scan_timestamp == scan_timestamp,
                )
            )
            .values(processing_status=status)
        )
        await self.session.flush()

    async def _is_holiday(self, employee_id: UUID, target_date: date) -> bool:
        from app.models.employee import Employee
        emp_result = await self.session.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        employee = emp_result.scalar_one_or_none()
        if employee is None:
            return False

        result = await self.session.execute(
            select(HolidayCalendar).where(
                and_(
                    HolidayCalendar.date == target_date,
                    (
                        (HolidayCalendar.scope == HolidayScope.ORGANIZATION)
                        | (
                            (HolidayCalendar.scope == HolidayScope.DEPARTMENT)
                            & (HolidayCalendar.department_id == employee.department_id)
                        )
                    ),
                )
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def _get_approved_leave(
        self, employee_id: UUID, target_date: date
    ) -> Optional[LeaveRequest]:
        result = await self.session.execute(
            select(LeaveRequest).where(
                and_(
                    LeaveRequest.employee_id == employee_id,
                    LeaveRequest.status == LeaveStatus.APPROVED,
                    LeaveRequest.start_date <= target_date,
                    LeaveRequest.end_date >= target_date,
                )
            ).limit(1)
        )
        return result.scalar_one_or_none()

    async def _post_process(
        self,
        session_obj: Optional[AttendanceSession],
        scan: ScanEvent,
        employee_id: UUID,
        shift_date: date,
    ) -> None:
        """Trigger summary update and WebSocket broadcasts."""
        if session_obj is None:
            return
        try:
            from app.services.summary_service import SummaryService
            from app.models.employee import Employee
            emp_result = await self.session.execute(
                select(Employee).where(Employee.id == employee_id)
            )
            employee = emp_result.scalar_one_or_none()
            if employee and employee.department_id:
                svc = SummaryService(self.session)
                await svc.update_summary(employee.department_id, shift_date)
        except Exception as e:
            logger.error(f"[EngineV2] Summary update failed: {e}", exc_info=True)

        try:
            from app.services.websocket_service import ws_manager
            await ws_manager.broadcast("attendance_update", {
                "session_id": str(session_obj.id),
                "employee_id": str(employee_id),
                "shift_date": str(shift_date),
                "check_in": session_obj.check_in.isoformat() if session_obj.check_in else None,
                "check_out": session_obj.check_out.isoformat() if session_obj.check_out else None,
                "status": session_obj.status if isinstance(session_obj.status, str) else session_obj.status.value,
                "late_minutes": float(session_obj.late_minutes or 0),
                "overtime_minutes": float(session_obj.overtime_minutes or 0),
                "duration_minutes": float(session_obj.duration_minutes or 0),
            })
            # Late alert
            if session_obj.status in ("late",) and (session_obj.late_minutes or 0) > 0:
                await ws_manager.broadcast("late_alert", {
                    "employee_id": str(employee_id),
                    "shift_date": str(shift_date),
                    "late_minutes": float(session_obj.late_minutes),
                })
        except Exception as e:
            logger.warning(f"[EngineV2] WebSocket broadcast failed: {e}")


# ── Pure functions (testable without DB) ─────────────────────

def get_shift_window(
    template: ShiftTemplate, shift_date: date
) -> tuple[datetime, datetime]:
    """
    Returns (window_open, window_close) for a shift.
    For overnight shifts, window_close is on shift_date + 1 day.
    """
    window_open = datetime.combine(shift_date, template.checkin_window_start)
    if template.is_overnight:
        window_close = datetime.combine(
            shift_date + timedelta(days=1), template.checkout_window_end
        )
    else:
        window_close = datetime.combine(shift_date, template.checkout_window_end)
    return window_open, window_close


def classify_scan(
    scan_time: datetime,
    template: ShiftTemplate,
    shift_date: date,
    session: Optional[AttendanceSession],
) -> ScanClassification:
    """
    Classify a scan as check_in_candidate, check_out_candidate, or out_of_window.
    Handles overlapping windows: if scan falls in both, treat as check-in if no
    existing check_in, otherwise treat as check-out.
    """
    checkin_start = datetime.combine(shift_date, template.checkin_window_start)
    checkin_end = datetime.combine(shift_date, template.checkin_window_end)
    checkout_start = datetime.combine(shift_date, template.checkout_window_start)
    if template.is_overnight:
        checkout_end = datetime.combine(
            shift_date + timedelta(days=1), template.checkout_window_end
        )
    else:
        checkout_end = datetime.combine(shift_date, template.checkout_window_end)

    # Strip timezone for naive comparison if needed
    t = scan_time.replace(tzinfo=None) if scan_time.tzinfo else scan_time

    in_checkin = checkin_start <= t <= checkin_end
    in_checkout = checkout_start <= t <= checkout_end

    if in_checkin and in_checkout:
        # Overlapping window: check_in if no session yet, else check_out
        if session is None or session.check_in is None:
            return ScanClassification.CHECK_IN_CANDIDATE
        return ScanClassification.CHECK_OUT_CANDIDATE
    elif in_checkin:
        return ScanClassification.CHECK_IN_CANDIDATE
    elif in_checkout:
        return ScanClassification.CHECK_OUT_CANDIDATE
    return ScanClassification.OUT_OF_WINDOW


def compute_checkin_status(
    check_in: datetime,
    template: ShiftTemplate,
    grace_period_minutes: int,
) -> tuple[float, float, str]:
    """
    Compute (late_minutes, early_minutes, status) for a check-in scan.
    """
    shift_start = datetime.combine(check_in.date(), template.start_time)
    t = check_in.replace(tzinfo=None) if check_in.tzinfo else check_in

    # Early arrival: more than 30 minutes before shift start
    if t < shift_start - timedelta(minutes=EARLY_ARRIVAL_THRESHOLD_MIN):
        early_min = math.floor((shift_start - t).total_seconds() / 60)
        return 0.0, float(early_min), "early_arrival"

    # On time: within grace period
    grace_cutoff = shift_start + timedelta(minutes=grace_period_minutes)
    if t <= grace_cutoff:
        return 0.0, 0.0, "present"

    # Late
    late_min = math.floor((t - shift_start).total_seconds() / 60)
    return float(late_min), 0.0, "late"


def compute_overtime(duration_minutes: float, working_hours: float) -> float:
    """Overtime is a separate numeric field, not a status."""
    expected = working_hours * 60
    if duration_minutes > expected:
        return round(duration_minutes - expected, 1)
    return 0.0


def is_half_day(duration_minutes: float, working_hours: float) -> bool:
    """Both check_in and check_out must exist for half_day to apply."""
    return duration_minutes < (working_hours * 60 * HALF_DAY_THRESHOLD)


def recompute_status_with_checkout(
    session: AttendanceSession,
    duration_minutes: Optional[float],
    template: ShiftTemplate,
) -> str:
    """Recompute status when check_out is updated."""
    current = session.status if isinstance(session.status, str) else session.status.value
    # Don't override leave/holiday/weekend statuses
    if current in ("on_leave", "vacation", "holiday", "weekend_off"):
        return current
    if duration_minutes is not None and is_half_day(
        duration_minutes, float(template.working_hours)
    ):
        return "half_day"
    return current
