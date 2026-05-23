"""
Project Z - Employee API Routes
"""

import math
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database.session import get_db
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

router = APIRouter(prefix="/employees", tags=["Employees"])


@router.get("", response_model=EmployeeListResponse)
async def list_employees(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    department_id: Optional[UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List employees with search, filters, and pagination."""
    service = EmployeeService(db)
    items, total = await service.list_employees(
        search=search,
        department_id=department_id,
        status=status,
        page=page,
        per_page=per_page,
    )

    return EmployeeListResponse(
        items=[
            EmployeeResponse(
                id=e.id,
                employee_code=e.employee_code,
                full_name=e.full_name,
                email=e.email,
                phone=e.phone,
                position=e.position,
                status=e.status.value if hasattr(e.status, 'value') else str(e.status),
                department_id=e.department_id,
                department_name=e.department.name if e.department else None,
                shift_id=e.shift_id,
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


@router.post("", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    data: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Create a new employee."""
    service = EmployeeService(db)
    emp = await service.create_employee(data.model_dump())
    return EmployeeResponse(
        id=emp.id,
        employee_code=emp.employee_code,
        full_name=emp.full_name,
        email=emp.email,
        phone=emp.phone,
        position=emp.position,
        status=emp.status.value if hasattr(emp.status, 'value') else str(emp.status),
        department_id=emp.department_id,
        shift_id=emp.shift_id,
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


@router.get("/{employee_id}", response_model=EmployeeResponse)
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
        full_name=emp.full_name,
        email=emp.email,
        phone=emp.phone,
        position=emp.position,
        status=emp.status.value if hasattr(emp.status, 'value') else str(emp.status),
        department_id=emp.department_id,
        department_name=emp.department.name if emp.department else None,
        shift_id=emp.shift_id,
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Update an employee."""
    service = EmployeeService(db)
    emp = await service.update_employee(employee_id, data.model_dump(exclude_unset=True))
    return EmployeeResponse(
        id=emp.id,
        employee_code=emp.employee_code,
        full_name=emp.full_name,
        email=emp.email,
        phone=emp.phone,
        position=emp.position,
        status=emp.status.value if hasattr(emp.status, 'value') else str(emp.status),
        department_id=emp.department_id,
        shift_id=emp.shift_id,
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Delete an employee."""
    service = EmployeeService(db)
    await service.delete_employee(employee_id)
    return {"message": "Employee deleted successfully"}


# ── Device Mappings ──────────────────────────────────────────

@router.get("/{employee_id}/device-mappings", tags=["Employees"])
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


@router.post("/{employee_id}/device-mappings", status_code=201, tags=["Employees"])
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
