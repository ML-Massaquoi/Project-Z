"""
Project Z - Shift Templates API
Full CRUD for ShiftTemplate (replaces the old /shifts endpoints).
"""
from datetime import time
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database.session import get_db
from app.models.shift_template import ShiftTemplate

router = APIRouter(prefix="/shift-templates", tags=["Shift Templates"])


class ShiftTemplateCreate(BaseModel):
    name: str
    code: str
    start_time: str          # "HH:MM"
    end_time: str
    checkin_window_start: str
    checkin_window_end: str
    checkout_window_start: str
    checkout_window_end: str
    grace_period_minutes: int = 15
    break_duration_minutes: int = 60
    working_hours: float = 8.0
    is_overnight: bool = False
    description: Optional[str] = None


class ShiftTemplateUpdate(BaseModel):
    name: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    checkin_window_start: Optional[str] = None
    checkin_window_end: Optional[str] = None
    checkout_window_start: Optional[str] = None
    checkout_window_end: Optional[str] = None
    grace_period_minutes: Optional[int] = None
    break_duration_minutes: Optional[int] = None
    working_hours: Optional[float] = None
    is_overnight: Optional[bool] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


def _parse_time(t: str) -> time:
    h, m = t.split(":")[:2]
    return time(int(h), int(m))


def _serialize(t: ShiftTemplate) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "code": t.code,
        "start_time": str(t.start_time),
        "end_time": str(t.end_time),
        "checkin_window_start": str(t.checkin_window_start),
        "checkin_window_end": str(t.checkin_window_end),
        "checkout_window_start": str(t.checkout_window_start),
        "checkout_window_end": str(t.checkout_window_end),
        "grace_period_minutes": t.grace_period_minutes,
        "break_duration_minutes": t.break_duration_minutes,
        "working_hours": float(t.working_hours),
        "is_overnight": t.is_overnight,
        "description": t.description,
        "is_active": t.is_active,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
    }


@router.get("")
async def list_shift_templates(
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    query = select(ShiftTemplate).order_by(ShiftTemplate.name)
    if is_active is not None:
        query = query.where(ShiftTemplate.is_active == is_active)
    result = await db.execute(query)
    return [_serialize(t) for t in result.scalars().all()]


@router.post("", status_code=201)
async def create_shift_template(
    data: ShiftTemplateCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    # Check unique code
    existing = await db.execute(select(ShiftTemplate).where(ShiftTemplate.code == data.code))
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Shift template with code '{data.code}' already exists")

    t = ShiftTemplate(
        name=data.name,
        code=data.code,
        start_time=_parse_time(data.start_time),
        end_time=_parse_time(data.end_time),
        checkin_window_start=_parse_time(data.checkin_window_start),
        checkin_window_end=_parse_time(data.checkin_window_end),
        checkout_window_start=_parse_time(data.checkout_window_start),
        checkout_window_end=_parse_time(data.checkout_window_end),
        grace_period_minutes=data.grace_period_minutes,
        break_duration_minutes=data.break_duration_minutes,
        working_hours=Decimal(str(data.working_hours)),
        is_overnight=data.is_overnight,
        description=data.description,
        is_active=True,
    )
    db.add(t)
    await db.flush()
    await db.refresh(t)
    return _serialize(t)


@router.get("/{template_id}")
async def get_shift_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Shift template not found")
    return _serialize(t)


@router.put("/{template_id}")
async def update_shift_template(
    template_id: UUID,
    data: ShiftTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Shift template not found")

    updates = data.model_dump(exclude_unset=True)
    for time_field in ["start_time", "end_time", "checkin_window_start", "checkin_window_end",
                       "checkout_window_start", "checkout_window_end"]:
        if time_field in updates:
            updates[time_field] = _parse_time(updates[time_field])
    if "working_hours" in updates:
        updates["working_hours"] = Decimal(str(updates["working_hours"]))

    if updates:
        await db.execute(update(ShiftTemplate).where(ShiftTemplate.id == template_id).values(**updates))
        await db.flush()

    result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.id == template_id))
    return _serialize(result.scalar_one())


@router.delete("/{template_id}")
async def delete_shift_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Soft delete: sets is_active = False."""
    result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.id == template_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Shift template not found")
    await db.execute(
        update(ShiftTemplate).where(ShiftTemplate.id == template_id).values(is_active=False)
    )
    return {"message": "Shift template deactivated"}
