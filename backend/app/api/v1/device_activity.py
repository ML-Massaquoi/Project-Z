"""
Device Activity, Status History, and Enrollment History API.
Provides endpoints for Phase 2 real-time monitoring data.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database.session import get_db

router = APIRouter(prefix="/device-activity", tags=["Device Activity"])


# ── Status History ──────────────────────────────────────────

@router.get("/{device_id}/status-history")
async def get_status_history(
    device_id: UUID,
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(100, ge=1, le=500),
    _user=Depends(get_current_user),
):
    """Get status transition history for a device."""
    from app.services.device_activity_service import get_device_status_history
    return await get_device_status_history(device_id, hours, limit)


# ── Activity Logs ───────────────────────────────────────────

@router.get("/{device_id}/activity-logs")
async def get_activity_logs(
    device_id: UUID,
    activity_type: Optional[str] = Query(None),
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(100, ge=1, le=500),
    _user=Depends(get_current_user),
):
    """Get activity logs for a device."""
    from app.services.device_activity_service import get_device_activity_logs
    return await get_device_activity_logs(device_id, activity_type, hours, limit)


@router.get("/fleet/summary")
async def get_fleet_activity_summary(
    hours: int = Query(24, ge=1, le=168),
    _user=Depends(get_current_user),
):
    """Get fleet-wide activity summary for dashboard."""
    from app.services.device_activity_service import get_fleet_activity_summary
    return await get_fleet_activity_summary(hours)


# ── Enrollment History ──────────────────────────────────────

@router.get("/enrollment/employee/{employee_id}")
async def get_employee_enrollment(
    employee_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    _user=Depends(get_current_user),
):
    """Get enrollment history for an employee."""
    from app.services.enrollment_detection_service import get_employee_enrollment_history
    return await get_employee_enrollment_history(employee_id, limit)


@router.get("/enrollment/device/{device_id}")
async def get_device_enrollment(
    device_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    _user=Depends(get_current_user),
):
    """Get enrollment history for a device."""
    from app.services.enrollment_detection_service import get_device_enrollment_history
    return await get_device_enrollment_history(device_id, limit)


@router.get("/enrollment/recent")
async def get_recent_enrollments(
    limit: int = Query(20, ge=1, le=100),
    _user=Depends(get_current_user),
):
    """Get recent enrollment events across all devices."""
    from app.services.enrollment_detection_service import get_recent_enrollment_events
    return await get_recent_enrollment_events(limit)
