"""
Project Z - Department, Shift, Office, Report API Routes
"""

from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.dependencies import get_current_user
from app.database.session import get_db
from app.models.department import Department
from app.models.device import Device
from app.models.employee import Employee
from app.models.office import Office
from app.models.organization import Organization
from app.models.shift import Shift
from app.repositories.base import BaseRepository
from app.schemas.common import (
    DepartmentCreate, DepartmentResponse, DepartmentUpdate,
    OfficeCreate, OfficeResponse, OfficeUpdate,
    ShiftCreate, ShiftResponse, ShiftUpdate,
)
from app.services.report_service import ReportService

import io

# ── Departments ──────────────────────────────────────────────
departments_router = APIRouter(prefix="/departments", tags=["Departments"])


@departments_router.get("", response_model=list[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Department).options(joinedload(Department.office)).order_by(Department.name)
    )
    departments = result.unique().scalars().all()

    items = []
    for d in departments:
        emp_count = (await db.execute(
            select(func.count()).select_from(Employee).where(Employee.department_id == d.id)
        )).scalar_one()
        items.append(DepartmentResponse(
            id=d.id, name=d.name, code=d.code, description=d.description,
            head_name=d.head_name, office_id=d.office_id,
            office_name=d.office.name if d.office else None,
            is_active=d.is_active, employee_count=emp_count,
            created_at=d.created_at, updated_at=d.updated_at,
        ))
    return items


@departments_router.post("", response_model=DepartmentResponse, status_code=201)
async def create_department(
    data: DepartmentCreate, db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    repo = BaseRepository(Department, db)
    dept = await repo.create(data.model_dump())
    return DepartmentResponse(
        id=dept.id, name=dept.name, code=dept.code, description=dept.description,
        head_name=dept.head_name, office_id=dept.office_id, is_active=dept.is_active,
        created_at=dept.created_at, updated_at=dept.updated_at,
    )


@departments_router.put("/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: UUID, data: DepartmentUpdate,
    db: AsyncSession = Depends(get_db), _user=Depends(get_current_user),
):
    repo = BaseRepository(Department, db)
    dept = await repo.update(dept_id, data.model_dump(exclude_unset=True))
    if not dept:
        raise HTTPException(404, "Department not found")
    return DepartmentResponse(
        id=dept.id, name=dept.name, code=dept.code, description=dept.description,
        head_name=dept.head_name, office_id=dept.office_id, is_active=dept.is_active,
        created_at=dept.created_at, updated_at=dept.updated_at,
    )


@departments_router.delete("/{dept_id}")
async def delete_department(
    dept_id: UUID, db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    repo = BaseRepository(Department, db)
    await repo.delete(dept_id)
    return {"message": "Department deleted"}


# ── Shifts ───────────────────────────────────────────────────
shifts_router = APIRouter(prefix="/shifts", tags=["Shifts"])


@shifts_router.get("", response_model=list[ShiftResponse])
async def list_shifts(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Shift).order_by(Shift.start_time))
    shifts = result.scalars().all()
    return [ShiftResponse.model_validate(s) for s in shifts]


@shifts_router.post("", response_model=ShiftResponse, status_code=201)
async def create_shift(
    data: ShiftCreate, db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    repo = BaseRepository(Shift, db)
    shift = await repo.create(data.model_dump())
    return ShiftResponse.model_validate(shift)


@shifts_router.put("/{shift_id}", response_model=ShiftResponse)
async def update_shift(
    shift_id: UUID, data: ShiftUpdate,
    db: AsyncSession = Depends(get_db), _user=Depends(get_current_user),
):
    repo = BaseRepository(Shift, db)
    shift = await repo.update(shift_id, data.model_dump(exclude_unset=True))
    if not shift:
        raise HTTPException(404, "Shift not found")
    return ShiftResponse.model_validate(shift)


@shifts_router.delete("/{shift_id}")
async def delete_shift(
    shift_id: UUID, db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    repo = BaseRepository(Shift, db)
    await repo.delete(shift_id)
    return {"message": "Shift deleted"}


# ── Offices ──────────────────────────────────────────────────
offices_router = APIRouter(prefix="/offices", tags=["Offices"])


@offices_router.get("", response_model=list[OfficeResponse])
async def list_offices(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Office).order_by(Office.name))
    offices = result.scalars().all()
    items = []
    for o in offices:
        dept_count = (await db.execute(
            select(func.count()).select_from(Department).where(Department.office_id == o.id)
        )).scalar_one()
        device_count = (await db.execute(
            select(func.count()).select_from(Device).where(Device.office_id == o.id)
        )).scalar_one()
        items.append(OfficeResponse(
            id=o.id, name=o.name, code=o.code, address=o.address,
            city=o.city, phone=o.phone, organization_id=o.organization_id,
            is_active=o.is_active, department_count=dept_count,
            device_count=device_count,
            created_at=o.created_at, updated_at=o.updated_at,
        ))
    return items


@offices_router.post("", response_model=OfficeResponse, status_code=201)
async def create_office(
    data: OfficeCreate, db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    # Auto-assign to the first organization if not provided
    from sqlalchemy import select as sa_select
    org_result = await db.execute(sa_select(Organization).limit(1))
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=400, detail="No organization found")

    payload = data.model_dump()
    payload['organization_id'] = org.id

    repo = BaseRepository(Office, db)
    office = await repo.create(payload)
    return OfficeResponse(
        id=office.id, name=office.name, code=office.code,
        address=office.address, city=office.city, phone=office.phone,
        organization_id=office.organization_id, is_active=office.is_active,
        created_at=office.created_at, updated_at=office.updated_at,
    )


@offices_router.put("/{office_id}", response_model=OfficeResponse)
async def update_office(
    office_id: UUID, data: OfficeUpdate,
    db: AsyncSession = Depends(get_db), _user=Depends(get_current_user),
):
    repo = BaseRepository(Office, db)
    office = await repo.update(office_id, data.model_dump(exclude_unset=True))
    if not office:
        raise HTTPException(404, "Office not found")
    return OfficeResponse(
        id=office.id, name=office.name, code=office.code,
        address=office.address, city=office.city, phone=office.phone,
        organization_id=office.organization_id, is_active=office.is_active,
        created_at=office.created_at, updated_at=office.updated_at,
    )


# ── Reports ──────────────────────────────────────────────────
reports_router = APIRouter(prefix="/reports", tags=["Reports"])


@reports_router.get("/attendance")
async def generate_attendance_report(
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    department_id: Optional[UUID] = None,
    format: str = Query("excel", description="Export format: csv, excel, pdf"),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Generate and download attendance report."""
    service = ReportService(db)
    content, filename, content_type = await service.generate_attendance_report(
        start_date=date.fromisoformat(start_date),
        end_date=date.fromisoformat(end_date),
        department_id=department_id,
        format=format,
    )

    return StreamingResponse(
        io.BytesIO(content),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
