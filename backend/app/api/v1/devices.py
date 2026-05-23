"""
Project Z - Device API Routes
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.dependencies import get_current_user
from app.database.session import get_db
from app.models.device import Device
from app.schemas.device import DeviceListResponse, DeviceResponse, DeviceUpdate
from app.repositories.device import DeviceRepository

router = APIRouter(prefix="/devices", tags=["Devices"])


@router.get("", response_model=DeviceListResponse)
async def list_devices(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List all registered devices."""
    result = await db.execute(
        select(Device)
        .options(joinedload(Device.office), joinedload(Device.department))
        .order_by(Device.created_at.desc())
    )
    devices = result.unique().scalars().all()

    return DeviceListResponse(
        items=[
            DeviceResponse(
                id=d.id,
                serial_number=d.serial_number,
                name=d.name,
                ip_address=d.ip_address,
                model=d.model,
                platform=d.platform,
                is_online=d.is_online,
                is_active=d.is_active,
                last_seen=d.last_seen,
                last_activity=d.last_activity,
                office_id=d.office_id,
                office_name=d.office.name if d.office else None,
                department_id=d.department_id,
                department_name=d.department.name if d.department else None,
                created_at=d.created_at,
                updated_at=d.updated_at,
            )
            for d in devices
        ],
        total=len(devices),
    )


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get device details."""
    repo = DeviceRepository(db)
    device = await repo.get_by_id(device_id)
    if not device:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Device not found")

    return DeviceResponse(
        id=device.id,
        serial_number=device.serial_number,
        name=device.name,
        ip_address=device.ip_address,
        model=device.model,
        platform=device.platform,
        is_online=device.is_online,
        is_active=device.is_active,
        last_seen=device.last_seen,
        last_activity=device.last_activity,
        office_id=device.office_id,
        department_id=device.department_id,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


@router.put("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: UUID,
    data: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Update device settings (name, office, department)."""
    repo = DeviceRepository(db)
    device = await repo.update(device_id, data.model_dump(exclude_unset=True))
    if not device:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Device not found")

    return DeviceResponse(
        id=device.id,
        serial_number=device.serial_number,
        name=device.name,
        ip_address=device.ip_address,
        model=device.model,
        platform=device.platform,
        is_online=device.is_online,
        is_active=device.is_active,
        last_seen=device.last_seen,
        last_activity=device.last_activity,
        office_id=device.office_id,
        department_id=device.department_id,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )
