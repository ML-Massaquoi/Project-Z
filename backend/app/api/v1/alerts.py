"""
Project Z - System Alerts API
CRUD, acknowledge, and statistics for server-persisted operational alerts.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.system_alert import AlertSeverity, AlertCategory
from app.schemas.alert import (
    AlertResponse,
    AlertListResponse,
    AlertAcknowledgeRequest,
    AlertStatsResponse,
)
from app.services.alert_service import AlertService
from app.services.audit_service import log_audit
from app.utils.audit_context import get_audit_context

router = APIRouter(prefix="/alerts", tags=["System Alerts"])


@router.get("", response_model=AlertListResponse, dependencies=[Depends(PermissionChecker("audit:view"))])
async def list_alerts(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    severity: Optional[AlertSeverity] = None,
    category: Optional[AlertCategory] = None,
    acknowledged: Optional[bool] = None,
):
    """List alerts with optional filters. Defaults to active (unacknowledged) alerts."""
    service = AlertService(db)
    ctx = get_audit_context(request)

    if acknowledged is True:
        alerts = await service.get_acknowledged_alerts(skip=skip, limit=limit)
        total = len(alerts)
        active_count = 0
    elif acknowledged is False:
        alerts, total = await service.get_active_alerts(
            skip=skip, limit=limit, severity=severity, category=category,
        )
        active_count = total
    else:
        # Return active by default
        alerts, total = await service.get_active_alerts(
            skip=skip, limit=limit, severity=severity, category=category,
        )
        active_count = total

    return AlertListResponse(
        items=[AlertResponse.model_validate(a) for a in alerts],
        total=total,
        active_count=active_count,
        page=skip // limit + 1,
        page_size=limit,
    )


@router.get("/stats", response_model=AlertStatsResponse, dependencies=[Depends(PermissionChecker("audit:view"))])
async def get_alert_stats(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get alert statistics: active counts by severity, today's activity."""
    service = AlertService(db)
    stats = await service.get_stats()
    return AlertStatsResponse(**stats)


@router.get("/{alert_id}", response_model=AlertResponse, dependencies=[Depends(PermissionChecker("audit:view"))])
async def get_alert(
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get a single alert by ID."""
    service = AlertService(db)
    alert = await service.repo.get_by_id(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return AlertResponse.model_validate(alert)


@router.put("/{alert_id}/acknowledge", response_model=AlertResponse, dependencies=[Depends(PermissionChecker("audit:view"))])
async def acknowledge_alert(
    alert_id: UUID,
    body: AlertAcknowledgeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Acknowledge an alert, attributing it to the current user."""
    service = AlertService(db)
    ctx = get_audit_context(request)

    alert = await service.acknowledge_alert(
        alert_id=alert_id,
        username=current_user.username,
        resolution_note=body.resolution_note,
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    await log_audit(
        session=db,
        action="acknowledge",
        entity_type="system_alert",
        entity_id=str(alert_id),
        user_id=str(current_user.id),
        username=current_user.username,
        details={"resolution_note": body.resolution_note},
        ip_address=ctx.get("ip_address"),
        endpoint=ctx.get("endpoint"),
        request_method=ctx.get("request_method"),
    )

    return AlertResponse.model_validate(alert)


@router.post("/acknowledge-all", dependencies=[Depends(PermissionChecker("audit:view"))])
async def acknowledge_all_alerts(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Acknowledge all active alerts."""
    service = AlertService(db)
    ctx = get_audit_context(request)

    count = await service.acknowledge_all(current_user.username)

    await log_audit(
        session=db,
        action="acknowledge_all",
        entity_type="system_alert",
        user_id=str(current_user.id),
        username=current_user.username,
        details={"count": count},
        ip_address=ctx.get("ip_address"),
        endpoint=ctx.get("endpoint"),
        request_method=ctx.get("request_method"),
    )

    return {"acknowledged_count": count}


@router.delete("/purge", dependencies=[Depends(PermissionChecker("audit:view"))])
async def purge_expired_alerts(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Delete expired alerts."""
    service = AlertService(db)
    count = await service.purge_expired()
    return {"purged_count": count}
