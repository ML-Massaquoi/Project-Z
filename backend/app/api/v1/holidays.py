"""
Project Z - Holiday Calendar API
Full CRUD for public, organizational, and departmental holidays.
"""
import logging
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.holiday_calendar import HolidayCalendar, HolidayScope, HolidayType

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/holidays", tags=["Holiday Calendar"])


class HolidayCreate(BaseModel):
    date: date
    name: str
    holiday_type: str = "public"
    scope: str = "organization"
    department_id: Optional[UUID] = None


class HolidayUpdate(BaseModel):
    date: Optional[date] = None
    name: Optional[str] = None
    holiday_type: Optional[str] = None
    scope: Optional[str] = None
    department_id: Optional[UUID] = None


def _serialize(h: HolidayCalendar) -> dict:
    return {
        "id": str(h.id),
        "date": h.date.isoformat(),
        "name": h.name,
        "holiday_type": h.holiday_type.value if hasattr(h.holiday_type, "value") else str(h.holiday_type),
        "scope": h.scope.value if hasattr(h.scope, "value") else str(h.scope),
        "organization_id": str(h.organization_id),
        "department_id": str(h.department_id) if h.department_id else None,
        "created_at": h.created_at.isoformat(),
        "updated_at": h.updated_at.isoformat(),
    }


@router.get("", dependencies=[Depends(PermissionChecker("shift:view"))])
async def list_holidays(
    year: Optional[int] = Query(None, ge=2020, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    scope: Optional[str] = Query(None),
    department_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    query = select(HolidayCalendar).order_by(HolidayCalendar.date)
    if year is not None and month is not None:
        from datetime import date as dt_date
        first = dt_date(year, month, 1)
        import calendar
        last_day = calendar.monthrange(year, month)[1]
        last = dt_date(year, month, last_day)
        query = query.where(and_(HolidayCalendar.date >= first, HolidayCalendar.date <= last))
    if scope:
        query = query.where(HolidayCalendar.scope == scope)
    if department_id:
        query = query.where(
            or_(
                HolidayCalendar.department_id == department_id,
                HolidayCalendar.scope == HolidayScope.ORGANIZATION,
            )
        )
    result = await db.execute(query)
    return [_serialize(h) for h in result.scalars().all()]


@router.get("/{holiday_id}", dependencies=[Depends(PermissionChecker("shift:view"))])
async def get_holiday(
    holiday_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(HolidayCalendar).where(HolidayCalendar.id == holiday_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(404, "Holiday not found")
    return _serialize(h)


@router.post("", status_code=201, dependencies=[Depends(PermissionChecker("shift:create"))])
async def create_holiday(
    data: HolidayCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    existing = await db.execute(
        select(HolidayCalendar).where(
            and_(
                HolidayCalendar.date == data.date,
                HolidayCalendar.name == data.name,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Holiday already exists on this date")

    # Get the organization ID
    from app.models.organization import Organization
    org_result = await db.execute(select(Organization).limit(1))
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(400, "No organization found. Create one first.")

    h = HolidayCalendar(
        date=data.date,
        name=data.name,
        holiday_type=data.holiday_type,
        scope=data.scope,
        organization_id=org.id,
        department_id=data.department_id,
    )
    db.add(h)
    await db.flush()
    await db.refresh(h)
    logger.info(f"Created holiday: {h.name} on {h.date}")
    return _serialize(h)


@router.put("/{holiday_id}", dependencies=[Depends(PermissionChecker("shift:update"))])
async def update_holiday(
    holiday_id: UUID,
    data: HolidayUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(HolidayCalendar).where(HolidayCalendar.id == holiday_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(404, "Holiday not found")
    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(h, key, value)
    await db.flush()
    await db.refresh(h)
    return _serialize(h)


@router.delete("/{holiday_id}", status_code=204, dependencies=[Depends(PermissionChecker("shift:delete"))])
async def delete_holiday(
    holiday_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(HolidayCalendar).where(HolidayCalendar.id == holiday_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(404, "Holiday not found")
    await db.delete(h)
    await db.flush()
