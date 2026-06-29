"""
Project Z - API v1 Router Aggregator
All routes versioned under /api/v1/
"""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import router as auth_router
from app.api.v1.attendance import router as attendance_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.devices import router as devices_router
from app.api.v1.employees import router as employees_router
from app.api.v1.users import router as users_router, roles_router
from app.api.v1.routes import (
    departments_router,
    offices_router,
    reports_router,
    shifts_router,
)
# ── Enterprise platform v2 routers ───────────────────────────
from app.api.v1.scan_events import router as scan_events_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.reports_v2 import router as reports_v2_router
from app.api.v1.leave_requests import router as leave_requests_router
from app.api.v1.shift_templates import router as shift_templates_router
from app.api.v1.dept_shift_rules import router as dept_shift_rules_router
from app.api.v1.shift_assignments import router as shift_assignments_router
from app.api.v1.device_users import router as device_users_router
from app.api.v1.shift_protocols import router as shift_protocols_router
from app.api.v1.workforce_analytics import router as workforce_analytics_router
from app.api.v1.security import router as security_router
from app.api.v1.settings import router as settings_router
from app.api.v1.workforce import router as workforce_router
from app.api.v1.audit_logs import router as audit_logs_router
from app.api.v1.daily_reports import router as daily_reports_router
from app.api.v1.alerts import router as alerts_router
from app.api.v1.device_health import router as device_health_router
from app.api.v1.data_integrity import router as data_integrity_router
from app.api.v1.backups import router as backups_router
from app.api.v1.roster import router as roster_router
from app.api.v1.sync import router as sync_router
from app.api.v1.device_discovery import router as device_discovery_router
from app.api.v1.device_activity import router as device_activity_router
from app.api.v1.device_groups import router as device_groups_router
from app.api.v1.offline_sync import router as offline_sync_router
from app.api.v1.enrollment import router as enrollment_router
from app.api.v1.employee_status import router as employee_status_router
from app.core.dependencies import get_current_user
from app.database.session import get_db

api_router = APIRouter(prefix="/api/v1")

# ── Existing routers ──────────────────────────────────────────
api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(attendance_router)
api_router.include_router(employees_router)
api_router.include_router(devices_router)
api_router.include_router(departments_router)
api_router.include_router(shifts_router)
api_router.include_router(offices_router)
api_router.include_router(reports_router)
api_router.include_router(users_router)
api_router.include_router(roles_router)

# ── Enterprise platform v2 routers ───────────────────────────
api_router.include_router(scan_events_router)
api_router.include_router(analytics_router)
api_router.include_router(reports_v2_router)
api_router.include_router(leave_requests_router)
api_router.include_router(shift_templates_router)
api_router.include_router(dept_shift_rules_router)
api_router.include_router(shift_assignments_router)
api_router.include_router(device_users_router)
api_router.include_router(shift_protocols_router)
api_router.include_router(workforce_analytics_router)
api_router.include_router(security_router)
api_router.include_router(settings_router)
api_router.include_router(workforce_router)
api_router.include_router(audit_logs_router)
api_router.include_router(daily_reports_router)
api_router.include_router(alerts_router)
api_router.include_router(device_health_router)
api_router.include_router(data_integrity_router)
api_router.include_router(backups_router)
api_router.include_router(roster_router)
api_router.include_router(sync_router)
api_router.include_router(device_discovery_router)
api_router.include_router(device_activity_router)
api_router.include_router(device_groups_router)
api_router.include_router(offline_sync_router)
api_router.include_router(enrollment_router)
api_router.include_router(employee_status_router)


@api_router.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "service": "Project Z API", "version": "2.0.0"}


@api_router.get("/health/detailed", tags=["Health"])
async def detailed_health_check(
    db: AsyncSession = Depends(get_db),
):
    """
    Detailed system health check for operations monitoring.
    Checks: API, Database, Redis, Workers, Devices.
    """
    from datetime import datetime, timezone
    import redis.asyncio as aioredis
    from app.core.config import get_settings
    
    settings = get_settings()
    health = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "2.0.0",
        "checks": {}
    }
    
    # 1. API Health
    health["checks"]["api"] = {"status": "healthy", "message": "API responding"}
    
    # 2. Database Health
    try:
        from sqlalchemy import text
        result = await db.execute(text("SELECT 1"))
        result.scalar()
        health["checks"]["database"] = {"status": "healthy", "message": "PostgreSQL connected"}
    except Exception as e:
        health["checks"]["database"] = {"status": "unhealthy", "message": str(e)}
        health["status"] = "degraded"
    
    # 3. Redis Health
    try:
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await redis.ping()
        await redis.aclose()
        health["checks"]["redis"] = {"status": "healthy", "message": "Redis connected"}
    except Exception as e:
        health["checks"]["redis"] = {"status": "unhealthy", "message": str(e)}
        health["status"] = "degraded"
    
    # 4. Device Health
    try:
        from app.models.device import Device
        from sqlalchemy import func, select, and_
        from datetime import timedelta
        
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        online_result = await db.execute(
            select(func.count()).select_from(Device).where(
                and_(Device.is_online == True, Device.last_seen >= cutoff)
            )
        )
        online_count = online_result.scalar_one()
        
        total_result = await db.execute(select(func.count()).select_from(Device))
        total_count = total_result.scalar_one()
        
        health["checks"]["devices"] = {
            "status": "healthy" if online_count > 0 else "warning",
            "message": f"{online_count}/{total_count} devices online",
            "online": online_count,
            "total": total_count,
        }
    except Exception as e:
        health["checks"]["devices"] = {"status": "unknown", "message": str(e)}
    
    # 5. Attendance Processing Health
    try:
        from app.models.scan_event import ScanEvent, ProcessingStatusV2
        from datetime import timedelta
        
        recent_cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        failed_result = await db.execute(
            select(func.count()).select_from(ScanEvent).where(
                and_(
                    ScanEvent.processing_status == ProcessingStatusV2.FAILED_PERMANENT,
                    ScanEvent.created_at >= recent_cutoff,
                )
            )
        )
        failed_count = failed_result.scalar_one()
        
        health["checks"]["attendance_processing"] = {
            "status": "healthy" if failed_count == 0 else "warning",
            "message": f"{failed_count} failed scans in last 5 minutes",
            "failed_recent": failed_count,
        }
    except Exception as e:
        health["checks"]["attendance_processing"] = {"status": "unknown", "message": str(e)}
    
    return health


@api_router.get("/events/replay", tags=["Events"])
async def replay_events(
    after_event_id: Optional[str] = Query(None, description="Replay events after this event ID"),
    limit: int = Query(100, ge=1, le=500, description="Maximum events to replay"),
    _user=Depends(get_current_user),
):
    """
    Replay WebSocket events after a given event ID.
    Used for reconnection recovery when the WebSocket drops.

    Returns events in chronological order from Redis Stream.
    """
    from app.services.websocket_service import ws_manager

    events = await ws_manager.replay_events(
        after_event_id=after_event_id,
        limit=limit,
    )
    return {"items": events, "count": len(events)}
