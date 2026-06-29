"""
Project Z - Analytics API
GET /api/v1/analytics/departments/summary          — all depts for a date
GET /api/v1/analytics/departments/{id}/summary     — single dept date range
"""
import datetime as dt
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.attendance_summary import AttendanceSummary
from app.utils.time_utils import today_date

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/departments/summary", dependencies=[Depends(PermissionChecker("report:view"))])
async def get_all_departments_summary(
    date: Optional[str] = Query(None, description="Date YYYY-MM-DD (default: today)"),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Get attendance summary for all departments on a given date.
    Returns empty array (HTTP 200) when no data exists.
    """
    try:
        target = today_date() if not date else dt.date.fromisoformat(date)

        result = await db.execute(
            select(AttendanceSummary)
            .where(AttendanceSummary.summary_date == target)
            .order_by(AttendanceSummary.department_name)
        )
        summaries = result.scalars().all()
        return [_serialize(s) for s in summaries]
    except Exception as e:
        logger.error(f"ANALYTICS ERROR: {e}", exc_info=True)
        raise HTTPException(500, "Internal server error")


@router.get("/departments/{dept_id}/summary", dependencies=[Depends(PermissionChecker("report:view"))])
async def get_department_summary_range(
    dept_id: UUID,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Get daily attendance summaries for a single department over a date range.
    Maximum range: 90 days.
    """
    try:
        start = dt.date.fromisoformat(start_date)
        end = dt.date.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD.")

    if (end - start).days > 90:
        raise HTTPException(400, "Date range must not exceed 90 days.")

    result = await db.execute(
        select(AttendanceSummary)
        .where(
            and_(
                AttendanceSummary.department_id == dept_id,
                AttendanceSummary.summary_date >= start,
                AttendanceSummary.summary_date <= end,
            )
        )
        .order_by(AttendanceSummary.summary_date)
    )
    summaries = result.scalars().all()
    return [_serialize(s) for s in summaries]


def _serialize(s: AttendanceSummary) -> dict:
    return {
        "id": str(s.id),
        "department_id": str(s.department_id),
        "department_name": s.department_name,
        "summary_date": str(s.summary_date),
        "expected_count": s.expected_count,
        "present_count": s.present_count,
        "late_count": s.late_count,
        "absent_count": s.absent_count,
        "on_leave_count": s.on_leave_count,
        "vacation_count": s.vacation_count,
        "overtime_count": s.overtime_count,
        "on_shift_count": s.on_shift_count,
        "last_updated_at": s.last_updated_at.isoformat() if s.last_updated_at else None,
    }
