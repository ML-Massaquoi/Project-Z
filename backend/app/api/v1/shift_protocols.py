"""
Project Z - Shift Protocols API
CRUD for shift protocol management and department assignment.
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.shift_protocol import ShiftProtocol, ProtocolType

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/shift-protocols", tags=["Shift Protocols"])


# ── Schemas ────────────────────────────────────────────────

class ShiftProtocolCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    protocol_type: str  # "fixed" | "rotating" | "custom"
    
    # Fixed schedule
    working_days: Optional[list[int]] = None  # [1,2,3,4,5] for Mon-Fri
    working_hours_start: Optional[str] = None  # "08:00"
    working_hours_end: Optional[str] = None    # "17:00"
    
    # Rotating schedule
    days_on: Optional[int] = None
    days_off: Optional[int] = None
    rotation_shifts: Optional[list[str]] = None  # ["day", "day", "off", "off", "night", "night", "off", "off"]
    
    # Shift times
    day_shift_start: Optional[str] = None   # "08:00"
    day_shift_end: Optional[str] = None     # "20:00"
    night_shift_start: Optional[str] = None  # "20:00"
    night_shift_end: Optional[str] = None    # "08:00"
    
    # Common
    grace_period_minutes: int = 15
    include_weekends: bool = False
    color: Optional[str] = None


class ShiftProtocolUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    protocol_type: Optional[str] = None
    working_days: Optional[list[int]] = None
    working_hours_start: Optional[str] = None
    working_hours_end: Optional[str] = None
    days_on: Optional[int] = None
    days_off: Optional[int] = None
    rotation_shifts: Optional[list[str]] = None
    day_shift_start: Optional[str] = None
    day_shift_end: Optional[str] = None
    night_shift_start: Optional[str] = None
    night_shift_end: Optional[str] = None
    grace_period_minutes: Optional[int] = None
    include_weekends: Optional[bool] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None


class DepartmentProtocolAssign(BaseModel):
    shift_protocol_id: Optional[UUID] = None


# ── Serialization ──────────────────────────────────────────

def serialize_protocol(p: ShiftProtocol) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "code": p.code,
        "description": p.description,
        "protocol_type": p.protocol_type.value if hasattr(p.protocol_type, 'value') else str(p.protocol_type),
        "working_days": p.working_days or [],
        "working_hours_start": p.working_hours_start,
        "working_hours_end": p.working_hours_end,
        "days_on": p.days_on,
        "days_off": p.days_off,
        "rotation_shifts": p.rotation_shifts or [],
        "day_shift_start": p.day_shift_start,
        "day_shift_end": p.day_shift_end,
        "night_shift_start": p.night_shift_start,
        "night_shift_end": p.night_shift_end,
        "grace_period_minutes": p.grace_period_minutes,
        "include_weekends": p.include_weekends,
        "is_active": p.is_active,
        "color": p.color,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


# ── Endpoints ──────────────────────────────────────────────

@router.get("", dependencies=[Depends(PermissionChecker("shift:view"))])
async def list_protocols(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List all shift protocols."""
    result = await db.execute(
        select(ShiftProtocol).order_by(ShiftProtocol.name)
    )
    protocols = result.scalars().all()
    return [serialize_protocol(p) for p in protocols]


@router.get("/{protocol_id}", dependencies=[Depends(PermissionChecker("shift:view"))])
async def get_protocol(
    protocol_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get a single shift protocol."""
    result = await db.execute(
        select(ShiftProtocol).where(ShiftProtocol.id == protocol_id)
    )
    protocol = result.scalar_one_or_none()
    if not protocol:
        raise HTTPException(404, "Shift protocol not found")
    return serialize_protocol(protocol)


@router.post("", status_code=201, dependencies=[Depends(PermissionChecker("shift:create"))])
async def create_protocol(
    data: ShiftProtocolCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Create a new shift protocol."""
    # Check unique code
    existing = await db.execute(
        select(ShiftProtocol).where(ShiftProtocol.code == data.code)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Protocol with code '{data.code}' already exists")
    
    protocol = ShiftProtocol(
        name=data.name,
        code=data.code.upper(),
        description=data.description,
        protocol_type=ProtocolType(data.protocol_type),
        working_days=data.working_days,
        working_hours_start=data.working_hours_start,
        working_hours_end=data.working_hours_end,
        days_on=data.days_on,
        days_off=data.days_off,
        rotation_shifts=data.rotation_shifts,
        day_shift_start=data.day_shift_start,
        day_shift_end=data.day_shift_end,
        night_shift_start=data.night_shift_start,
        night_shift_end=data.night_shift_end,
        grace_period_minutes=data.grace_period_minutes,
        include_weekends=data.include_weekends,
        color=data.color,
    )
    db.add(protocol)
    await db.flush()
    await db.refresh(protocol)
    
    logger.info(f"Created shift protocol: {protocol.name} ({protocol.code})")
    return serialize_protocol(protocol)


@router.put("/{protocol_id}", dependencies=[Depends(PermissionChecker("shift:update"))])
async def update_protocol(
    protocol_id: UUID,
    data: ShiftProtocolUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Update a shift protocol."""
    result = await db.execute(
        select(ShiftProtocol).where(ShiftProtocol.id == protocol_id)
    )
    protocol = result.scalar_one_or_none()
    if not protocol:
        raise HTTPException(404, "Shift protocol not found")
    
    updates = data.model_dump(exclude_unset=True)
    if "protocol_type" in updates and updates["protocol_type"]:
        updates["protocol_type"] = ProtocolType(updates["protocol_type"])
    
    for key, value in updates.items():
        setattr(protocol, key, value)
    
    await db.flush()
    await db.refresh(protocol)
    
    logger.info(f"Updated shift protocol: {protocol.name}")
    return serialize_protocol(protocol)


@router.delete("/{protocol_id}", dependencies=[Depends(PermissionChecker("shift:delete"))])
async def delete_protocol(
    protocol_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Delete a shift protocol."""
    from sqlalchemy import delete as sql_delete
    
    result = await db.execute(
        select(ShiftProtocol).where(ShiftProtocol.id == protocol_id)
    )
    protocol = result.scalar_one_or_none()
    if not protocol:
        raise HTTPException(404, "Shift protocol not found")
    
    # Check if any department uses this protocol
    from app.models.department import Department
    dept_result = await db.execute(
        select(Department).where(Department.shift_protocol_id == protocol_id).limit(1)
    )
    if dept_result.scalar_one_or_none():
        raise HTTPException(
            409, 
            "Cannot delete protocol that is assigned to departments. "
            "Unassign it first."
        )
    
    await db.execute(
        sql_delete(ShiftProtocol).where(ShiftProtocol.id == protocol_id)
    )
    
    logger.info(f"Deleted shift protocol: {protocol.name}")
    return {"message": "Protocol deleted"}


# ── Preset Protocols ───────────────────────────────────────

@router.post("/presets/seed", dependencies=[Depends(PermissionChecker("shift:create"))])
async def seed_preset_protocols(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Create preset protocols for common work patterns."""
    presets = [
        {
            "name": "Standard Weekly (Mon-Fri, 8am-5pm)",
            "code": "WEEKLY_8_5",
            "description": "Standard Monday to Friday schedule, 8:00 AM to 5:00 PM",
            "protocol_type": ProtocolType.FIXED,
            "working_days": [1, 2, 3, 4, 5],
            "working_hours_start": "08:00",
            "working_hours_end": "17:00",
            "include_weekends": False,
            "color": "#2563eb",
        },
        {
            "name": "Extended Weekly (Mon-Fri, 8am-6pm)",
            "code": "WEEKLY_8_6",
            "description": "Monday to Friday schedule, 8:00 AM to 6:00 PM",
            "protocol_type": ProtocolType.FIXED,
            "working_days": [1, 2, 3, 4, 5],
            "working_hours_start": "08:00",
            "working_hours_end": "18:00",
            "include_weekends": False,
            "color": "#7c3aed",
        },
        {
            "name": "Executive (Mon-Fri, 8:30am-5pm)",
            "code": "EXECUTIVE",
            "description": "Executive schedule, Monday to Friday, 8:30 AM to 5:00 PM",
            "protocol_type": ProtocolType.FIXED,
            "working_days": [1, 2, 3, 4, 5],
            "working_hours_start": "08:30",
            "working_hours_end": "17:00",
            "include_weekends": False,
            "color": "#0891b2",
        },
        {
            "name": "2-on-2-off Rotation (Day/Night)",
            "code": "ROTATE_2_2",
            "description": "2 days day shift, 2 days off, 2 nights, 2 days off (repeating)",
            "protocol_type": ProtocolType.ROTATING,
            "days_on": 2,
            "days_off": 2,
            "rotation_shifts": ["day", "day", "off", "off", "night", "night", "off", "off"],
            "day_shift_start": "08:00",
            "day_shift_end": "20:00",
            "night_shift_start": "20:00",
            "night_shift_end": "08:00",
            "include_weekends": True,
            "color": "#ea580c",
        },
        {
            "name": "3-on-3-off Rotation (Day/Night)",
            "code": "ROTATE_3_3",
            "description": "3 days day shift, 3 days off, 3 nights, 3 days off (repeating)",
            "protocol_type": ProtocolType.ROTATING,
            "days_on": 3,
            "days_off": 3,
            "rotation_shifts": ["day", "day", "day", "off", "off", "off", "night", "night", "night", "off", "off", "off"],
            "day_shift_start": "08:00",
            "day_shift_end": "20:00",
            "night_shift_start": "20:00",
            "night_shift_end": "08:00",
            "include_weekends": True,
            "color": "#dc2626",
        },
        {
            "name": "Weekend Only (Sat-Sun)",
            "code": "WEEKEND",
            "description": "Saturday and Sunday only",
            "protocol_type": ProtocolType.FIXED,
            "working_days": [6, 7],
            "working_hours_start": "08:00",
            "working_hours_end": "17:00",
            "include_weekends": True,
            "color": "#16a34a",
        },
    ]
    
    created = 0
    for preset in presets:
        # Check if already exists
        existing = await db.execute(
            select(ShiftProtocol).where(ShiftProtocol.code == preset["code"])
        )
        if existing.scalar_one_or_none():
            continue
        
        protocol = ShiftProtocol(**preset)
        db.add(protocol)
        created += 1
    
    await db.flush()
    
    logger.info(f"Seeded {created} preset shift protocols")
    return {"message": f"Seeded {created} preset protocols", "created": created}
