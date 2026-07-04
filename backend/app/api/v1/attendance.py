"""
Project Z - Attendance API Routes
"""

import math
import logging
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.repositories.attendance import AttendanceLogRepository, AttendanceSessionRepository
from app.schemas.attendance import (
    AttendanceLiveResponse,
    AttendanceLogResponse,
    AttendanceHistoryResponse,
    AttendanceSessionResponse,
)
from app.utils.time_utils import today_date

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.get("/live", response_model=AttendanceLiveResponse, dependencies=[Depends(PermissionChecker("attendance:view"))])
async def get_live_attendance(
    limit: int = Query(50, ge=1, le=200),
    department_id: Optional[UUID] = None,
    target_date: Optional[str] = Query(None, description="Filter by date YYYY-MM-DD (default: today)"),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get live attendance feed (latest records for today by default)."""
    try:
        from datetime import date
        d = today_date() if not target_date else date.fromisoformat(target_date)
        repo = AttendanceLogRepository(db)
        logs = await repo.get_live_feed(limit=limit, department_id=department_id, target_date=d)

        return AttendanceLiveResponse(
            items=[
                AttendanceLogResponse(
                    id=log.id,
                    employee_id=log.employee_id,
                    employee_name=log.employee.full_name if log.employee else None,
                    employee_code=log.employee.employee_code if log.employee else None,
                    department_name=(
                        log.employee.department.name
                        if log.employee and log.employee.department
                        else None
                    ),
                    device_id=log.device_id,
                    device_name=log.device.name if log.device else None,
                    device_ip=log.device.ip_address if log.device else None,
                    timestamp=log.timestamp,
                    verify_type=log.verify_type.value if hasattr(log.verify_type, 'value') else str(log.verify_type),
                    punch_direction=log.punch_direction.value if hasattr(log.punch_direction, 'value') else str(log.punch_direction),
                    is_duplicate=log.is_duplicate,
                    created_at=log.created_at,
                )
                for log in logs
            ],
            total=len(logs),
        )
    except Exception as e:
        logger.error(f"Live attendance error: {e}", exc_info=True)
        if settings.DEBUG:
            return JSONResponse(status_code=500, content={"error": str(e)})
        raise


@router.get("/history", response_model=AttendanceHistoryResponse, dependencies=[Depends(PermissionChecker("attendance:view"))])
async def get_attendance_history(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    target_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    department_id: Optional[UUID] = None,
    employee_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get historical attendance sessions."""
    try:
        repo = AttendanceSessionRepository(db)
        d = today_date()
        if target_date:
            d = date.fromisoformat(target_date)

        skip = (page - 1) * per_page
        sessions = await repo.get_sessions_for_date(
            target_date=d,
            department_id=department_id,
            skip=skip,
            limit=per_page,
        )

        from sqlalchemy import func, select, and_
        from app.models.attendance import AttendanceSession
        from app.models.employee import Employee

        count_query = select(func.count()).select_from(AttendanceSession).where(
            AttendanceSession.date == d
        )
        if department_id:
            count_query = count_query.join(Employee).where(Employee.department_id == department_id)
        total = (await db.execute(count_query)).scalar_one()

        return AttendanceHistoryResponse(
            items=[
                AttendanceSessionResponse(
                    id=s.id,
                    employee_id=s.employee_id,
                    employee_name=s.employee.full_name if s.employee else None,
                    employee_code=s.employee.employee_code if s.employee else None,
                    department_name=(
                        s.employee.department.name
                        if s.employee and hasattr(s.employee, 'department') and s.employee.department
                        else None
                    ),
                    date=s.date,
                    check_in=s.check_in,
                    check_out=s.check_out,
                    duration_minutes=s.duration_minutes,
                    late_minutes=s.late_minutes,
                    overtime_minutes=s.overtime_minutes,
                    status=s.status if isinstance(s.status, str) else str(s.status),
                    is_complete=s.is_complete,
                    created_at=s.created_at,
                )
                for s in sessions
            ],
            total=total,
            page=page,
            per_page=per_page,
            pages=math.ceil(total / per_page) if total > 0 else 1,
        )
    except Exception as e:
        logger.error(f"Attendance history error: {e}", exc_info=True)
        if settings.DEBUG:
            return JSONResponse(status_code=500, content={"error": str(e)})
        raise
