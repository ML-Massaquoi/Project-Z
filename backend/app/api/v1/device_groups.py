"""
Device Groups API.

CRUD operations for device groups and employee device assignments.
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/device-groups", tags=["Device Groups"])


class DeviceGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class DeviceGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class EmployeeDeviceAssignmentCreate(BaseModel):
    employee_id: UUID
    device_ids: list[UUID]


class EmployeeGroupAssignmentCreate(BaseModel):
    employee_id: UUID
    group_ids: list[UUID]


# ── Device Group CRUD ───────────────────────────────────────

@router.get("", dependencies=[Depends(PermissionChecker("device:view"))])
async def list_device_groups(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List all device groups with device counts."""
    from app.models.device_group import DeviceGroup
    from app.models.device import Device

    result = await db.execute(
        select(DeviceGroup).order_by(DeviceGroup.name)
    )
    groups = result.scalars().all()

    items = []
    for group in groups:
        # Count devices in this group
        count_result = await db.execute(
            select(func.count()).select_from(Device).where(Device.device_group_id == group.id)
        )
        device_count = count_result.scalar_one()

        # Count online devices
        online_result = await db.execute(
            select(func.count()).select_from(Device).where(
                (Device.device_group_id == group.id) & (Device.is_online == True)
            )
        )
        online_count = online_result.scalar_one()

        items.append({
            "id": str(group.id),
            "name": group.name,
            "description": group.description,
            "color": group.color,
            "icon": group.icon,
            "device_count": device_count,
            "online_count": online_count,
            "created_at": group.created_at.isoformat() if group.created_at else None,
        })

    return {"items": items, "total": len(items)}


@router.post("", dependencies=[Depends(PermissionChecker("device:manage"))])
async def create_device_group(
    data: DeviceGroupCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Create a new device group."""
    from app.models.device_group import DeviceGroup

    # Check name uniqueness
    existing = await db.execute(
        select(DeviceGroup).where(DeviceGroup.name == data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Group name already exists")

    group = DeviceGroup(
        name=data.name,
        description=data.description,
        color=data.color,
        icon=data.icon,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)

    return {
        "id": str(group.id),
        "name": group.name,
        "description": group.description,
        "color": group.color,
        "icon": group.icon,
    }


@router.put("/{group_id}", dependencies=[Depends(PermissionChecker("device:manage"))])
async def update_device_group(
    group_id: UUID,
    data: DeviceGroupUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Update a device group."""
    from app.models.device_group import DeviceGroup

    group = await db.get(DeviceGroup, group_id)
    if not group:
        raise HTTPException(404, "Device group not found")

    if data.name is not None:
        existing = await db.execute(
            select(DeviceGroup).where(DeviceGroup.name == data.name, DeviceGroup.id != group_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(400, "Group name already exists")
        group.name = data.name

    if data.description is not None:
        group.description = data.description
    if data.color is not None:
        group.color = data.color
    if data.icon is not None:
        group.icon = data.icon

    await db.commit()
    return {"status": "updated"}


@router.delete("/{group_id}", dependencies=[Depends(PermissionChecker("device:manage"))])
async def delete_device_group(
    group_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Delete a device group. Devices in the group are unassigned, not deleted."""
    from app.models.device_group import DeviceGroup
    from app.models.device import Device

    group = await db.get(DeviceGroup, group_id)
    if not group:
        raise HTTPException(404, "Device group not found")

    # Unassign devices from this group
    await db.execute(
        select(Device).where(Device.device_group_id == group_id)
    )
    result = await db.execute(
        select(Device).where(Device.device_group_id == group_id)
    )
    for device in result.scalars().all():
        device.device_group_id = None

    await db.delete(group)
    await db.commit()
    return {"status": "deleted"}


@router.post("/{group_id}/devices/{device_id}", dependencies=[Depends(PermissionChecker("device:manage"))])
async def add_device_to_group(
    group_id: UUID,
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Add a device to a group."""
    from app.models.device_group import DeviceGroup
    from app.models.device import Device

    group = await db.get(DeviceGroup, group_id)
    if not group:
        raise HTTPException(404, "Device group not found")

    device = await db.get(Device, device_id)
    if not device:
        raise HTTPException(404, "Device not found")

    device.device_group_id = group_id
    await db.commit()
    return {"status": "added"}


@router.delete("/{group_id}/devices/{device_id}", dependencies=[Depends(PermissionChecker("device:manage"))])
async def remove_device_from_group(
    group_id: UUID,
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Remove a device from its group."""
    from app.models.device import Device

    device = await db.get(Device, device_id)
    if not device:
        raise HTTPException(404, "Device not found")

    device.device_group_id = None
    await db.commit()
    return {"status": "removed"}


# ── Employee Device Assignments ─────────────────────────────

@router.get("/employee/{employee_id}/devices", dependencies=[Depends(PermissionChecker("employee:view"))])
async def get_employee_device_assignments(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get all device assignments for an employee."""
    from app.models.employee_device_assignment import EmployeeDeviceAssignment
    from app.models.device import Device

    result = await db.execute(
        select(EmployeeDeviceAssignment).where(
            EmployeeDeviceAssignment.employee_id == employee_id
        )
    )
    assignments = result.scalars().all()

    devices = []
    for a in assignments:
        device = await db.get(Device, a.device_id)
        if device:
            devices.append({
                "assignment_id": str(a.id),
                "device_id": str(device.id),
                "device_name": device.name,
                "device_serial": device.serial_number,
                "device_ip": device.ip_address,
                "is_online": device.is_online,
                "sync_status": a.sync_status,
                "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
                "last_synced_at": a.last_synced_at.isoformat() if a.last_synced_at else None,
            })

    return {"employee_id": str(employee_id), "devices": devices}


@router.post("/employee/assign-devices", dependencies=[Depends(PermissionChecker("device:manage"))])
async def assign_employee_to_devices(
    data: EmployeeDeviceAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Assign an employee to specific devices (replaces existing assignments)."""
    from app.models.employee_device_assignment import EmployeeDeviceAssignment
    from app.models.device import Device

    # Remove existing assignments
    existing = await db.execute(
        select(EmployeeDeviceAssignment).where(
            EmployeeDeviceAssignment.employee_id == data.employee_id
        )
    )
    for a in existing.scalars().all():
        await db.delete(a)

    # Create new assignments
    assignments = []
    for device_id in data.device_ids:
        device = await db.get(Device, device_id)
        if not device:
            continue
        assignment = EmployeeDeviceAssignment(
            employee_id=data.employee_id,
            device_id=device_id,
            assigned_by=str(user.id),
            sync_status="pending",
        )
        db.add(assignment)
        assignments.append(str(device_id))

    await db.commit()
    return {"assigned_devices": len(assignments), "device_ids": assignments}


@router.post("/employee/assign-groups", dependencies=[Depends(PermissionChecker("device:manage"))])
async def assign_employee_to_groups(
    data: EmployeeGroupAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Assign an employee to device groups (auto-assigns to all devices in groups)."""
    from app.models.employee_device_group_assignment import EmployeeDeviceGroupAssignment
    from app.models.employee_device_assignment import EmployeeDeviceAssignment
    from app.models.device_group import DeviceGroup
    from app.models.device import Device

    # Remove existing group assignments
    existing_groups = await db.execute(
        select(EmployeeDeviceGroupAssignment).where(
            EmployeeDeviceGroupAssignment.employee_id == data.employee_id
        )
    )
    for a in existing_groups.scalars().all():
        await db.delete(a)

    # Create new group assignments
    for group_id in data.group_ids:
        group = await db.get(DeviceGroup, group_id)
        if group:
            ga = EmployeeDeviceGroupAssignment(
                employee_id=data.employee_id,
                group_id=group_id,
                assigned_by=str(user.id),
            )
            db.add(ga)

    # Resolve group memberships to device assignments
    # Remove existing device assignments first
    existing_devices = await db.execute(
        select(EmployeeDeviceAssignment).where(
            EmployeeDeviceAssignment.employee_id == data.employee_id
        )
    )
    for a in existing_devices.scalars().all():
        await db.delete(a)

    # Get all devices in assigned groups
    all_device_ids = set()
    for group_id in data.group_ids:
        dev_result = await db.execute(
            select(Device.id).where(Device.device_group_id == group_id)
        )
        for row in dev_result.all():
            all_device_ids.add(row[0])

    # Create device assignments for all group devices
    for device_id in all_device_ids:
        assignment = EmployeeDeviceAssignment(
            employee_id=data.employee_id,
            device_id=device_id,
            assigned_by=str(user.id),
            sync_status="pending",
        )
        db.add(assignment)

    await db.commit()
    return {"assigned_groups": len(data.group_ids), "resolved_devices": len(all_device_ids)}
