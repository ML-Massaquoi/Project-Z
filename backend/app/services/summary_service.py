"""
Project Z - SummaryService
Maintains pre-computed attendance_summaries snapshots.
Updated within 10 seconds of any AttendanceSession status change.
"""
import logging
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceSession
from app.models.attendance_summary import AttendanceSummary
from app.models.department import Department
from app.models.employee import Employee

logger = logging.getLogger(__name__)


class SummaryService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def update_summary(
        self, department_id: UUID, summary_date: date
    ) -> AttendanceSummary:
        """
        Recompute and upsert the attendance_summaries row for
        (department_id, summary_date).

        Publishes a department_summary_update WebSocket event after upsert.
        """
        # ── Fetch department name ─────────────────────────────
        dept_result = await self.session.execute(
            select(Department).where(Department.id == department_id)
        )
        dept = dept_result.scalar_one_or_none()
        dept_name = dept.name if dept else "Unknown Department"

        # ── Count expected staff (active employees in dept) ───
        expected_result = await self.session.execute(
            select(func.count())
            .select_from(Employee)
            .where(
                and_(
                    Employee.department_id == department_id,
                    Employee.status == "active",
                )
            )
        )
        expected_count = expected_result.scalar_one()

        # ── Count sessions by status ──────────────────────────
        sessions_result = await self.session.execute(
            select(AttendanceSession)
            .join(Employee, Employee.id == AttendanceSession.employee_id)
            .where(
                and_(
                    Employee.department_id == department_id,
                    AttendanceSession.date == summary_date,
                )
            )
        )
        sessions = sessions_result.scalars().all()

        present_count = 0
        late_count = 0
        absent_count = 0
        on_leave_count = 0
        vacation_count = 0
        overtime_count = 0
        on_shift_count = 0

        for s in sessions:
            status = s.status if isinstance(s.status, str) else s.status.value
            if status in ("present", "late", "early_arrival", "unscheduled_attendance", "on_duty", "in_progress"):
                present_count += 1
            if status == "late":
                late_count += 1
            if status in ("absent", "missed_checkin"):
                absent_count += 1
            if status == "on_leave":
                on_leave_count += 1
            if status == "vacation":
                vacation_count += 1
            if (s.overtime_minutes or 0) > 0:
                overtime_count += 1
            # On shift: checked in but not yet checked out
            if s.check_in is not None and s.check_out is None:
                on_shift_count += 1

        # ── Upsert attendance_summaries ───────────────────────
        existing = await self._get_summary(department_id, summary_date)
        now = datetime.now(timezone.utc)

        if existing is None:
            summary = AttendanceSummary(
                department_id=department_id,
                department_name=dept_name,
                summary_date=summary_date,
                expected_count=expected_count,
                present_count=present_count,
                late_count=late_count,
                absent_count=absent_count,
                on_leave_count=on_leave_count,
                vacation_count=vacation_count,
                overtime_count=overtime_count,
                on_shift_count=on_shift_count,
                last_updated_at=now,
            )
            self.session.add(summary)
            await self.session.flush()
            await self.session.refresh(summary)
        else:
            await self.session.execute(
                update(AttendanceSummary)
                .where(AttendanceSummary.id == existing.id)
                .values(
                    department_name=dept_name,
                    expected_count=expected_count,
                    present_count=present_count,
                    late_count=late_count,
                    absent_count=absent_count,
                    on_leave_count=on_leave_count,
                    vacation_count=vacation_count,
                    overtime_count=overtime_count,
                    on_shift_count=on_shift_count,
                    last_updated_at=now,
                )
            )
            await self.session.flush()
            summary = await self._get_summary(department_id, summary_date)

        # ── Broadcast WebSocket event ─────────────────────────
        try:
            from app.services.websocket_service import ws_manager
            await ws_manager.broadcast("department_summary_update", {
                "department_id": str(department_id),
                "department_name": dept_name,
                "summary_date": str(summary_date),
                "expected_count": expected_count,
                "present_count": present_count,
                "late_count": late_count,
                "absent_count": absent_count,
                "on_leave_count": on_leave_count,
                "vacation_count": vacation_count,
                "overtime_count": overtime_count,
                "on_shift_count": on_shift_count,
            })
        except Exception as e:
            logger.warning(f"[SummaryService] WebSocket broadcast failed: {e}")

        logger.info(
            f"[SummaryService] Updated summary dept={department_id} "
            f"date={summary_date} present={present_count}/{expected_count}"
        )
        return summary

    async def _get_summary(
        self, department_id: UUID, summary_date: date
    ) -> AttendanceSummary | None:
        result = await self.session.execute(
            select(AttendanceSummary).where(
                and_(
                    AttendanceSummary.department_id == department_id,
                    AttendanceSummary.summary_date == summary_date,
                )
            )
        )
        return result.scalar_one_or_none()
