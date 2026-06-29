"""
Project Z - Employee API Routes
"""

import math
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.employee import Employee
from app.models.employee_device_mapping import EmployeeDeviceMapping
from app.models.device import Device
from app.repositories.base import BaseRepository
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeListResponse,
    EmployeeResponse,
    EmployeeUpdate,
)
from app.services.employee_service import EmployeeService
from app.services.audit_service import log_audit
from app.utils.audit_context import get_audit_context

router = APIRouter(prefix="/employees", tags=["Employees"])


@router.get("", response_model=EmployeeListResponse, dependencies=[Depends(PermissionChecker("employee:view"))])
async def list_employees(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    department_id: Optional[UUID] = None,
    status: Optional[str] = None,
    only_enrolled: bool = Query(False, description="Only show employees created via enrollment wizard"),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List employees with search, filters, and pagination."""
    service = EmployeeService(db)
    items, total = await service.list_employees(
        search=search,
        department_id=department_id,
        status=status,
        only_enrolled=only_enrolled,
        page=page,
        per_page=per_page,
    )

    return EmployeeListResponse(
        items=[
            EmployeeResponse(
                id=e.id,
                employee_code=e.employee_code,
                employee_number=getattr(e, 'employee_number', None),
                first_name=getattr(e, 'first_name', None),
                last_name=getattr(e, 'last_name', None),
                middle_name=getattr(e, 'middle_name', None),
                full_name=e.full_name,
                gender=getattr(e, 'gender', None),
                email=e.email,
                phone=e.phone,
                position=e.position,
                employment_type=getattr(e, 'employment_type', None),
                date_joined=getattr(e, 'date_joined', None),
                status=e.status.value if hasattr(e.status, 'value') else str(e.status),
                department_id=e.department_id,
                department_name=e.department.name if e.department else None,
                shift_id=e.shift_id,
                avatar_url=getattr(e, 'avatar_url', None),
                created_at=e.created_at,
                updated_at=e.updated_at,
            )
            for e in items
        ],
        total=total,
        page=page,
        per_page=per_page,
        pages=math.ceil(total / per_page) if total > 0 else 1,
    )


@router.post("", response_model=EmployeeResponse, status_code=201, dependencies=[Depends(PermissionChecker("employee:create"))])
async def create_employee(
    data: EmployeeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Create a new employee."""
    service = EmployeeService(db)
    emp = await service.create_employee(data.model_dump())
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="create", entity_type="employee",
        entity_id=str(emp.id), details={"full_name": emp.full_name, "employee_code": emp.employee_code},
        new_value=emp, **audit_ctx,
    )
    return EmployeeResponse(
        id=emp.id,
        employee_code=emp.employee_code,
        employee_number=getattr(emp, 'employee_number', None),
        first_name=getattr(emp, 'first_name', None),
        last_name=getattr(emp, 'last_name', None),
        middle_name=getattr(emp, 'middle_name', None),
        full_name=emp.full_name,
        gender=getattr(emp, 'gender', None),
        email=emp.email,
        phone=emp.phone,
        position=emp.position,
        employment_type=getattr(emp, 'employment_type', None),
        date_joined=getattr(emp, 'date_joined', None),
        status=emp.status.value if hasattr(emp.status, 'value') else str(emp.status),
        department_id=emp.department_id,
        shift_id=emp.shift_id,
        avatar_url=getattr(emp, 'avatar_url', None),
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


@router.get("/{employee_id}", response_model=EmployeeResponse, dependencies=[Depends(PermissionChecker("employee:view"))])
async def get_employee(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get employee details."""
    service = EmployeeService(db)
    emp = await service.get_employee(employee_id)
    return EmployeeResponse(
        id=emp.id,
        employee_code=emp.employee_code,
        employee_number=getattr(emp, 'employee_number', None),
        first_name=getattr(emp, 'first_name', None),
        last_name=getattr(emp, 'last_name', None),
        middle_name=getattr(emp, 'middle_name', None),
        full_name=emp.full_name,
        gender=getattr(emp, 'gender', None),
        email=emp.email,
        phone=emp.phone,
        position=emp.position,
        employment_type=getattr(emp, 'employment_type', None),
        date_joined=getattr(emp, 'date_joined', None),
        status=emp.status.value if hasattr(emp.status, 'value') else str(emp.status),
        department_id=emp.department_id,
        department_name=emp.department.name if emp.department else None,
        shift_id=emp.shift_id,
        avatar_url=getattr(emp, 'avatar_url', None),
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


@router.put("/{employee_id}", response_model=EmployeeResponse, dependencies=[Depends(PermissionChecker("employee:update"))])
async def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Update an employee."""
    service = EmployeeService(db)
    # Capture state before mutation
    old_emp = await service.get_employee(employee_id)
    emp = await service.update_employee(employee_id, data.model_dump(exclude_unset=True))
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="update", entity_type="employee",
        entity_id=str(employee_id),
        details={"changed_fields": list(data.model_dump(exclude_unset=True).keys())},
        previous_value=old_emp, new_value=emp, **audit_ctx,
    )
    return EmployeeResponse(
        id=emp.id,
        employee_code=emp.employee_code,
        employee_number=getattr(emp, 'employee_number', None),
        first_name=getattr(emp, 'first_name', None),
        last_name=getattr(emp, 'last_name', None),
        middle_name=getattr(emp, 'middle_name', None),
        full_name=emp.full_name,
        gender=getattr(emp, 'gender', None),
        email=emp.email,
        phone=emp.phone,
        position=emp.position,
        employment_type=getattr(emp, 'employment_type', None),
        date_joined=getattr(emp, 'date_joined', None),
        status=emp.status.value if hasattr(emp.status, 'value') else str(emp.status),
        department_id=emp.department_id,
        shift_id=emp.shift_id,
        avatar_url=getattr(emp, 'avatar_url', None),
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


@router.delete("/{employee_id}", dependencies=[Depends(PermissionChecker("employee:delete"))])
async def delete_employee(
    employee_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Delete an employee."""
    service = EmployeeService(db)
    # Capture state before deletion
    old_emp = await service.get_employee(employee_id)
    await service.delete_employee(employee_id)
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="delete", entity_type="employee",
        entity_id=str(employee_id),
        previous_value=old_emp, **audit_ctx,
    )
    return {"message": "Employee deleted successfully"}


# ── Device Mappings ──────────────────────────────────────────

@router.get("/{employee_id}/device-mappings", tags=["Employees"], dependencies=[Depends(PermissionChecker("employee:view"))])
async def list_device_mappings(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List all device-user mappings for an employee."""
    result = await db.execute(
        select(EmployeeDeviceMapping, Device)
        .join(Device, Device.id == EmployeeDeviceMapping.device_id)
        .where(EmployeeDeviceMapping.employee_id == employee_id)
    )
    rows = result.all()
    return [
        {
            "id": str(mapping.id),
            "employee_id": str(mapping.employee_id),
            "device_id": str(mapping.device_id),
            "device_serial": device.serial_number,
            "device_name": device.name,
            "device_user_id": mapping.device_user_id,
            "created_at": mapping.created_at,
        }
        for mapping, device in rows
    ]


@router.post("/{employee_id}/device-mappings", status_code=201, tags=["Employees"], dependencies=[Depends(PermissionChecker("employee:update"))])
async def create_device_mapping(
    employee_id: UUID,
    device_id: UUID,
    device_user_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Map a device-local user ID to this employee.
    This is how the system knows which employee a biometric scan belongs to.
    """
    # Verify employee exists
    service = EmployeeService(db)
    await service.get_employee(employee_id)

    # Verify device exists
    device_result = await db.execute(select(Device).where(Device.id == device_id))
    device = device_result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Check for duplicate mapping
    existing = await db.execute(
        select(EmployeeDeviceMapping).where(
            EmployeeDeviceMapping.device_id == device_id,
            EmployeeDeviceMapping.device_user_id == device_user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Device user '{device_user_id}' on device '{device.serial_number}' is already mapped to an employee",
        )

    repo = BaseRepository(EmployeeDeviceMapping, db)
    mapping = await repo.create({
        "employee_id": employee_id,
        "device_id": device_id,
        "device_user_id": device_user_id,
    })
    return {
        "id": str(mapping.id),
        "employee_id": str(mapping.employee_id),
        "device_id": str(mapping.device_id),
        "device_serial": device.serial_number,
        "device_user_id": mapping.device_user_id,
        "created_at": mapping.created_at,
    }


@router.delete("/{employee_id}/device-mappings/{mapping_id}", tags=["Employees"])
async def delete_device_mapping(
    employee_id: UUID,
    mapping_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Remove a device-user mapping from an employee."""
    repo = BaseRepository(EmployeeDeviceMapping, db)
    mapping = await repo.get_by_id(mapping_id)
    if not mapping or mapping.employee_id != employee_id:
        raise HTTPException(status_code=404, detail="Mapping not found")
    await repo.delete(mapping_id)
    return {"message": "Device mapping removed"}


# ── Bulk Department Assignment ──────────────────────────────

from pydantic import BaseModel

class BulkDepartmentAssign(BaseModel):
    department_id: UUID
    employee_ids: list[UUID]

@router.post("/bulk-department")
async def bulk_assign_department(
    data: BulkDepartmentAssign,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Bulk assign a department to multiple employees.
    POST /employees/bulk-department
    Body: { "department_id": "uuid", "employee_ids": ["uuid1", "uuid2", ...] }
    """
    from sqlalchemy import update as sa_update

    result = await db.execute(
        sa_update(Employee)
        .where(Employee.id.in_(data.employee_ids))
        .values(department_id=data.department_id)
    )
    await db.commit()
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="bulk_assign_department", entity_type="employee",
        details={
            "department_id": str(data.department_id),
            "employee_count": result.rowcount,
            "employee_ids": [str(eid) for eid in data.employee_ids],
        }, **audit_ctx,
    )
    return {"message": f"Updated {result.rowcount} employees", "updated": result.rowcount}


# ── Bulk Shift Protocol Assignment ─────────────────────────

class BulkShiftAssign(BaseModel):
    shift_protocol_id: UUID
    employee_ids: list[UUID]

@router.post("/bulk-shift")
async def bulk_assign_shift(
    data: BulkShiftAssign,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Bulk assign a shift protocol to multiple employees.
    POST /employees/bulk-shift
    Body: { "shift_protocol_id": "uuid", "employee_ids": ["uuid1", "uuid2", ...] }
    """
    from sqlalchemy import update as sa_update

    result = await db.execute(
        sa_update(Employee)
        .where(Employee.id.in_(data.employee_ids))
        .values(shift_protocol_id=data.shift_protocol_id)
    )
    await db.commit()
    return {"message": f"Updated {result.rowcount} employees", "updated": result.rowcount}


@router.post("/bulk-shift-department")
async def bulk_assign_shift_to_department(
    department_id: UUID,
    shift_protocol_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Assign a shift protocol to ALL employees in a department.
    POST /employees/bulk-shift-department?department_id=xxx&shift_protocol_id=yyy
    """
    from sqlalchemy import update as sa_update

    result = await db.execute(
        sa_update(Employee)
        .where(Employee.department_id == department_id)
        .values(shift_protocol_id=shift_protocol_id)
    )
    await db.commit()
    return {"message": f"Updated {result.rowcount} employees", "updated": result.rowcount}
