"""
Project Z - Employee Repository
"""

from typing import Optional, Sequence
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.employee import Employee
from app.models.employee_device_mapping import EmployeeDeviceMapping
from app.repositories.base import BaseRepository


class EmployeeRepository(BaseRepository[Employee]):
    def __init__(self, session: AsyncSession):
        super().__init__(Employee, session)

    async def get_with_relations(self, id: UUID) -> Optional[Employee]:
        """Get employee with department and shift loaded."""
        result = await self.session.execute(
            select(Employee)
            .options(
                joinedload(Employee.department),
            )
            .where(Employee.id == id)
        )
        return result.unique().scalar_one_or_none()

    async def search(
        self,
        search: Optional[str] = None,
        department_id: Optional[UUID] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[Sequence[Employee], int]:
        """Search employees with filters and return (items, total)."""
        filters = []
        if search:
            filters.append(
                or_(
                    Employee.full_name.ilike(f"%{search}%"),
                    Employee.employee_code.ilike(f"%{search}%"),
                    Employee.email.ilike(f"%{search}%"),
                )
            )
        if department_id:
            filters.append(Employee.department_id == department_id)
        if status:
            filters.append(Employee.status == status)

        # Count
        count_query = select(func.count()).select_from(Employee)
        for f in filters:
            count_query = count_query.where(f)
        total = (await self.session.execute(count_query)).scalar_one()

        # Items
        query = (
            select(Employee)
            .options(joinedload(Employee.department))
            .order_by(Employee.full_name)
            .offset(skip)
            .limit(limit)
        )
        for f in filters:
            query = query.where(f)
        result = await self.session.execute(query)
        items = result.unique().scalars().all()

        return items, total

    async def get_by_device_user_id(
        self, device_user_id: str, device_id: Optional[UUID] = None
    ) -> Optional[Employee]:
        """Find employee by device-local user ID."""
        query = (
            select(Employee)
            .join(EmployeeDeviceMapping)
            .where(EmployeeDeviceMapping.device_user_id == device_user_id)
        )
        if device_id:
            query = query.where(EmployeeDeviceMapping.device_id == device_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def count_active(self) -> int:
        """Count active employees."""
        result = await self.session.execute(
            select(func.count())
            .select_from(Employee)
            .where(Employee.status == "active")
        )
        return result.scalar_one()
