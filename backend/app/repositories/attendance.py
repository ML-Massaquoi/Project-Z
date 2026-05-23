"""
Project Z - Attendance Repository
Data access for attendance logs, sessions, and raw payloads.
"""

from datetime import date, datetime, timedelta
from typing import Optional, Sequence
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.attendance import (
    AttendanceLog,
    AttendanceSession,
    RawAttendancePayload,
)
from app.models.employee import Employee
from app.models.device import Device
from app.repositories.base import BaseRepository


class AttendanceLogRepository(BaseRepository[AttendanceLog]):
    def __init__(self, session: AsyncSession):
        super().__init__(AttendanceLog, session)

    async def get_live_feed(
        self, limit: int = 50, department_id: Optional[UUID] = None
    ) -> Sequence[AttendanceLog]:
        """Get latest attendance logs with employee and device info."""
        query = (
            select(AttendanceLog)
            .options(
                joinedload(AttendanceLog.employee),
                joinedload(AttendanceLog.device),
            )
            .where(AttendanceLog.is_duplicate == False)
            .order_by(AttendanceLog.timestamp.desc())
            .limit(limit)
        )
        if department_id:
            query = query.join(Employee).where(
                Employee.department_id == department_id
            )
        result = await self.session.execute(query)
        return result.unique().scalars().all()

    async def get_last_log_for_employee(
        self, employee_id: UUID, within_seconds: int = 60
    ) -> Optional[AttendanceLog]:
        """Check for duplicate scans within the configured window."""
        cutoff = datetime.utcnow() - timedelta(seconds=within_seconds)
        result = await self.session.execute(
            select(AttendanceLog)
            .where(
                and_(
                    AttendanceLog.employee_id == employee_id,
                    AttendanceLog.timestamp >= cutoff,
                    AttendanceLog.is_duplicate == False,
                )
            )
            .order_by(AttendanceLog.timestamp.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_today_count_by_direction(
        self, target_date: date, direction: str
    ) -> int:
        """Count today's attendance by punch direction."""
        result = await self.session.execute(
            select(func.count(func.distinct(AttendanceLog.employee_id)))
            .where(
                and_(
                    func.date(AttendanceLog.timestamp) == target_date,
                    AttendanceLog.punch_direction == direction,
                    AttendanceLog.is_duplicate == False,
                )
            )
        )
        return result.scalar_one()


class AttendanceSessionRepository(BaseRepository[AttendanceSession]):
    def __init__(self, session: AsyncSession):
        super().__init__(AttendanceSession, session)

    async def get_open_session(
        self, employee_id: UUID, target_date: date
    ) -> Optional[AttendanceSession]:
        """Get an open (incomplete) session for an employee on a given date."""
        result = await self.session.execute(
            select(AttendanceSession)
            .where(
                and_(
                    AttendanceSession.employee_id == employee_id,
                    AttendanceSession.date == target_date,
                    AttendanceSession.is_complete == False,
                )
            )
            .order_by(AttendanceSession.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_sessions_for_date(
        self,
        target_date: date,
        department_id: Optional[UUID] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Sequence[AttendanceSession]:
        """Get all attendance sessions for a date."""
        query = (
            select(AttendanceSession)
            .options(joinedload(AttendanceSession.employee))
            .where(AttendanceSession.date == target_date)
            .order_by(AttendanceSession.check_in.desc())
            .offset(skip)
            .limit(limit)
        )
        if department_id:
            query = query.join(Employee).where(
                Employee.department_id == department_id
            )
        result = await self.session.execute(query)
        return result.unique().scalars().all()

    async def count_by_status(self, target_date: date, status: str) -> int:
        """Count sessions by status for a date."""
        result = await self.session.execute(
            select(func.count())
            .select_from(AttendanceSession)
            .where(
                and_(
                    AttendanceSession.date == target_date,
                    AttendanceSession.status == status,
                )
            )
        )
        return result.scalar_one()

    async def get_present_employee_ids(self, target_date: date) -> set[UUID]:
        """Get set of employee IDs who have checked in today."""
        result = await self.session.execute(
            select(AttendanceSession.employee_id)
            .where(AttendanceSession.date == target_date)
            .distinct()
        )
        return set(result.scalars().all())


class RawPayloadRepository(BaseRepository[RawAttendancePayload]):
    def __init__(self, session: AsyncSession):
        super().__init__(RawAttendancePayload, session)
