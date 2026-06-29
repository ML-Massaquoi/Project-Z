"""
Project Z - Department, Shift, Office, Report API Routes
"""

from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.dependencies import get_current_user, PermissionChecker
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
from app.services.audit_service import log_audit
from app.utils.audit_context import get_audit_context

import io

# ── Departments ──────────────────────────────────────────────
departments_router = APIRouter(prefix="/departments", tags=["Departments"])


@departments_router.get("", response_model=list[DepartmentResponse], dependencies=[Depends(PermissionChecker("department:view"))])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Department).options(
            joinedload(Department.office),
            joinedload(Department.shift_protocol),
        ).order_by(Department.name)
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
            shift_protocol_id=d.shift_protocol_id,
            shift_protocol_name=d.shift_protocol.name if d.shift_protocol else None,
            is_active=d.is_active, employee_count=emp_count,
            created_at=d.created_at, updated_at=d.updated_at,
        ))
    return items


@departments_router.post("", response_model=DepartmentResponse, status_code=201, dependencies=[Depends(PermissionChecker("department:create"))])
async def create_department(
    data: DepartmentCreate, request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    # Validate shift protocol exists if provided
    if data.shift_protocol_id:
        from app.models.shift_protocol import ShiftProtocol
        protocol = (await db.execute(
            select(ShiftProtocol).where(ShiftProtocol.id == data.shift_protocol_id)
        )).scalar_one_or_none()
        if not protocol:
            raise HTTPException(400, "Invalid shift protocol")
    
    repo = BaseRepository(Department, db)
    dept = await repo.create(data.model_dump())
    
    # Refresh to get protocol relationship
    await db.refresh(dept, ["shift_protocol"])
    
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="create", entity_type="department",
        entity_id=str(dept.id),
        details={"name": dept.name, "code": dept.code},
        new_value=dept, **audit_ctx,
    )
    
    return DepartmentResponse(
        id=dept.id, name=dept.name, code=dept.code, description=dept.description,
        head_name=dept.head_name, office_id=dept.office_id,
        shift_protocol_id=dept.shift_protocol_id,
        shift_protocol_name=dept.shift_protocol.name if dept.shift_protocol else None,
        is_active=dept.is_active,
        created_at=dept.created_at, updated_at=dept.updated_at,
    )


@departments_router.put("/{dept_id}", response_model=DepartmentResponse, dependencies=[Depends(PermissionChecker("department:update"))])
async def update_department(
    dept_id: UUID, data: DepartmentUpdate, request: Request,
    db: AsyncSession = Depends(get_db), _user=Depends(get_current_user),
):
    repo = BaseRepository(Department, db)
    old_dept = await repo.get_by_id(dept_id)
    if not old_dept:
        raise HTTPException(404, "Department not found")
    dept = await repo.update(dept_id, data.model_dump(exclude_unset=True))
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="update", entity_type="department",
        entity_id=str(dept_id),
        details={"changed_fields": list(data.model_dump(exclude_unset=True).keys())},
        previous_value=old_dept, new_value=dept, **audit_ctx,
    )
    return DepartmentResponse(
        id=dept.id, name=dept.name, code=dept.code, description=dept.description,
        head_name=dept.head_name, office_id=dept.office_id, is_active=dept.is_active,
        created_at=dept.created_at, updated_at=dept.updated_at,
    )


@departments_router.delete("/{dept_id}", dependencies=[Depends(PermissionChecker("department:delete"))])
async def delete_department(
    dept_id: UUID, request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    repo = BaseRepository(Department, db)
    old_dept = await repo.get_by_id(dept_id)
    await repo.delete(dept_id)
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="delete", entity_type="department",
        entity_id=str(dept_id),
        previous_value=old_dept, **audit_ctx,
    )
    return {"message": "Department deleted"}


# ── Shifts ───────────────────────────────────────────────────
shifts_router = APIRouter(prefix="/shifts", tags=["Shifts"])


@shifts_router.get("", response_model=list[ShiftResponse], dependencies=[Depends(PermissionChecker("shift:view"))])
async def list_shifts(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(Shift).order_by(Shift.start_time))
    shifts = result.scalars().all()
    return [ShiftResponse.model_validate(s) for s in shifts]


@shifts_router.post("", response_model=ShiftResponse, status_code=201, dependencies=[Depends(PermissionChecker("shift:create"))])
async def create_shift(
    data: ShiftCreate, request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    repo = BaseRepository(Shift, db)
    shift = await repo.create(data.model_dump())
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="create", entity_type="shift",
        entity_id=str(shift.id),
        details={"name": shift.name, "code": shift.code},
        new_value=shift, **audit_ctx,
    )
    return ShiftResponse.model_validate(shift)


@shifts_router.put("/{shift_id}", response_model=ShiftResponse, dependencies=[Depends(PermissionChecker("shift:update"))])
async def update_shift(
    shift_id: UUID, data: ShiftUpdate, request: Request,
    db: AsyncSession = Depends(get_db), _user=Depends(get_current_user),
):
    repo = BaseRepository(Shift, db)
    old_shift = await repo.get_by_id(shift_id)
    shift = await repo.update(shift_id, data.model_dump(exclude_unset=True))
    if not shift:
        raise HTTPException(404, "Shift not found")
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="update", entity_type="shift",
        entity_id=str(shift_id),
        details={"changed_fields": list(data.model_dump(exclude_unset=True).keys())},
        previous_value=old_shift, new_value=shift, **audit_ctx,
    )
    return ShiftResponse.model_validate(shift)


@shifts_router.delete("/{shift_id}", dependencies=[Depends(PermissionChecker("shift:delete"))])
async def delete_shift(
    shift_id: UUID, request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    repo = BaseRepository(Shift, db)
    old_shift = await repo.get_by_id(shift_id)
    await repo.delete(shift_id)
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="delete", entity_type="shift",
        entity_id=str(shift_id),
        previous_value=old_shift, **audit_ctx,
    )
    return {"message": "Shift deleted"}


# ── Offices ──────────────────────────────────────────────────
offices_router = APIRouter(prefix="/offices", tags=["Offices"])


@offices_router.get("", response_model=list[OfficeResponse], dependencies=[Depends(PermissionChecker("department:view"))])
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


@offices_router.post("", response_model=OfficeResponse, status_code=201, dependencies=[Depends(PermissionChecker("department:create"))])
async def create_office(
    data: OfficeCreate, request: Request,
    db: AsyncSession = Depends(get_db),
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
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="create", entity_type="office",
        entity_id=str(office.id),
        details={"name": office.name, "code": office.code},
        new_value=office, **audit_ctx,
    )
    return OfficeResponse(
        id=office.id, name=office.name, code=office.code,
        address=office.address, city=office.city, phone=office.phone,
        organization_id=office.organization_id, is_active=office.is_active,
        created_at=office.created_at, updated_at=office.updated_at,
    )


@offices_router.put("/{office_id}", response_model=OfficeResponse, dependencies=[Depends(PermissionChecker("department:update"))])
async def update_office(
    office_id: UUID, data: OfficeUpdate, request: Request,
    db: AsyncSession = Depends(get_db), _user=Depends(get_current_user),
):
    repo = BaseRepository(Office, db)
    old_office = await repo.get_by_id(office_id)
    office = await repo.update(office_id, data.model_dump(exclude_unset=True))
    if not office:
        raise HTTPException(404, "Office not found")
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="update", entity_type="office",
        entity_id=str(office_id),
        details={"changed_fields": list(data.model_dump(exclude_unset=True).keys())},
        previous_value=old_office, new_value=office, **audit_ctx,
    )
    return OfficeResponse(
        id=office.id, name=office.name, code=office.code,
        address=office.address, city=office.city, phone=office.phone,
        organization_id=office.organization_id, is_active=office.is_active,
        created_at=office.created_at, updated_at=office.updated_at,
    )


# ── Reports ──────────────────────────────────────────────────
reports_router = APIRouter(prefix="/reports", tags=["Reports"])


@reports_router.get("/attendance", dependencies=[Depends(PermissionChecker("report:export"))])
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
