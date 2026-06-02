"""
Project Z - Attendance Repository
Data access for attendance logs, sessions, and raw payloads.

Scan model: every scan is real — no duplicate suppression.
  - get_session_for_date: returns the ONE session per employee per day
  - count_scans_today: how many times an employee has scanned today
"""

from datetime import date, datetime, timedelta, timezone
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
        """
        Get latest attendance logs with employee and device info.
        Shows ALL scans (no duplicate filter) — every scan is real.
        """
        query = (
            select(AttendanceLog)
            .options(
                joinedload(AttendanceLog.employee).joinedload(Employee.department),
                joinedload(AttendanceLog.device),
            )
            .order_by(AttendanceLog.timestamp.desc())
            .limit(limit)
        )
        if department_id:
            query = query.join(Employee).where(
                Employee.department_id == department_id
            )
        result = await self.session.execute(query)
        return result.unique().scalars().all()

    async def count_scans_today(
        self, employee_id: UUID, target_date: date
    ) -> int:
        """
        Count how many times an employee has scanned today.
        Used for logging (scan #1, #2, #3...).
        """
        result = await self.session.execute(
            select(func.count())
            .select_from(AttendanceLog)
            .where(
                and_(
                    AttendanceLog.employee_id == employee_id,
                    func.date(AttendanceLog.timestamp) == target_date,
                )
            )
        )
        return result.scalar_one()

    async def get_today_count_by_direction(
        self, target_date: date, direction: str
    ) -> int:
        """Count today's attendance logs by punch direction."""
        result = await self.session.execute(
            select(func.count(func.distinct(AttendanceLog.employee_id)))
            .where(
                and_(
                    func.date(AttendanceLog.timestamp) == target_date,
                    AttendanceLog.punch_direction == direction,
                )
            )
        )
        return result.scalar_one()


class AttendanceSessionRepository(BaseRepository[AttendanceSession]):
    def __init__(self, session: AsyncSession):
        super().__init__(AttendanceSession, session)

    async def get_session_for_date(
        self, employee_id: UUID, target_date: date
    ) -> Optional[AttendanceSession]:
        """
        Get the attendance session for an employee on a specific date.

        There is exactly ONE session per employee per day.
        Returns None if the employee hasn't scanned yet today.
        """
        result = await self.session.execute(
            select(AttendanceSession)
            .where(
                and_(
                    AttendanceSession.employee_id == employee_id,
                    AttendanceSession.date == target_date,
                )
            )
            .order_by(AttendanceSession.created_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    # Keep for backward compatibility (midnight rollover uses this)
    async def get_open_session(
        self, employee_id: UUID, target_date: date
    ) -> Optional[AttendanceSession]:
        """Alias for get_session_for_date — kept for compatibility."""
        return await self.get_session_for_date(employee_id, target_date)

    async def get_sessions_for_date(
        self,
        target_date: date,
        department_id: Optional[UUID] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Sequence[AttendanceSession]:
        """Get all attendance sessions for a date with employee info."""
        query = (
            select(AttendanceSession)
            .options(
                joinedload(AttendanceSession.employee).joinedload(Employee.department)
            )
            .where(AttendanceSession.date == target_date)
            .order_by(AttendanceSession.check_in.asc())
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
        """Get set of employee IDs who have at least one scan today."""
        result = await self.session.execute(
            select(AttendanceSession.employee_id)
            .where(AttendanceSession.date == target_date)
            .distinct()
        )
        return set(result.scalars().all())


class RawPayloadRepository(BaseRepository[RawAttendancePayload]):
    def __init__(self, session: AsyncSession):
        super().__init__(RawAttendancePayload, session)
