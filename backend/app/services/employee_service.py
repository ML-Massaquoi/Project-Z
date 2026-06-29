"""
Project Z - Employee Service
"""

from typing import Optional, Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DuplicateException, NotFoundException
from app.models.employee import Employee
from app.repositories.employee import EmployeeRepository


class EmployeeService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = EmployeeRepository(session)

    async def list_employees(
        self,
        search: Optional[str] = None,
        department_id: Optional[UUID] = None,
        status: Optional[str] = None,
        only_enrolled: bool = False,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[Sequence[Employee], int]:
        skip = (page - 1) * per_page
        return await self.repo.search(
            search=search,
            department_id=department_id,
            status=status,
            only_enrolled=only_enrolled,
            skip=skip,
            limit=per_page,
        )

    async def get_employee(self, employee_id: UUID) -> Employee:
        emp = await self.repo.get_with_relations(employee_id)
        if not emp:
            raise NotFoundException("Employee", employee_id)
        return emp

    async def create_employee(self, data: dict) -> Employee:
        existing = await self.repo.get_by_field("employee_code", data["employee_code"])
        if existing:
            raise DuplicateException("Employee", "employee_code")

        if data.get("employee_number"):
            existing_num = await self.repo.get_by_field("employee_number", data["employee_number"])
            if existing_num:
                raise ValueError(
                    f"Employee Number '{data['employee_number']}' already exists "
                    f"and belongs to another employee."
                )

        if not data.get("employee_number") and data.get("employee_code"):
            data["employee_number"] = data["employee_code"]

        if not data.get("first_name") and data.get("full_name"):
            parts = data["full_name"].strip().split(" ", 1)
            data["first_name"] = parts[0]
            data["last_name"] = parts[1] if len(parts) > 1 else ""

        from app.models.employee import EmployeeStatus, EmploymentType
        if "status" in data:
            status_val = data["status"]
            if isinstance(status_val, str):
                data["status"] = EmployeeStatus(status_val.lower())

        if "employment_type" in data and data["employment_type"]:
            et_val = data["employment_type"]
            if isinstance(et_val, str):
                data["employment_type"] = EmploymentType(et_val.lower())

        return await self.repo.create(data)

    async def update_employee(self, employee_id: UUID, data: dict) -> Employee:
        emp = await self.repo.get_by_id(employee_id)
        if not emp:
            raise NotFoundException("Employee", employee_id)

        if "employee_number" in data and data["employee_number"]:
            existing_num = await self.repo.get_by_field("employee_number", data["employee_number"])
            if existing_num and existing_num.id != employee_id:
                raise ValueError(
                    f"Employee Number '{data['employee_number']}' already exists "
                    f"and belongs to another employee."
                )

        from app.models.employee import EmployeeStatus, EmploymentType
        if "status" in data:
            status_val = data["status"]
            if isinstance(status_val, str):
                data["status"] = EmployeeStatus(status_val.lower())

        if "employment_type" in data and data["employment_type"]:
            et_val = data["employment_type"]
            if isinstance(et_val, str):
                data["employment_type"] = EmploymentType(et_val.lower())

        return await self.repo.update(employee_id, data)

    async def delete_employee(self, employee_id: UUID) -> bool:
        emp = await self.repo.get_by_id(employee_id)
        if not emp:
            raise NotFoundException("Employee", employee_id)
        return await self.repo.delete(employee_id)
