"""
Project Z - Audit Logs API
Query and export audit trail entries with full context.
"""
import csv
import io
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.audit import AuditLog

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


def _serialize_log(log: AuditLog) -> dict:
    """Serialize an audit log entry with all fields."""
    return {
        "id": str(log.id),
        "action": log.action,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "description": log.description,
        "details": log.details,
        "previous_value": log.previous_value,
        "new_value": log.new_value,
        "user_id": str(log.user_id) if log.user_id else None,
        "username": log.username,
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
        "endpoint": log.endpoint,
        "request_method": log.request_method,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


@router.get("", dependencies=[Depends(PermissionChecker("audit:view"))])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    action: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    request_method: Optional[str] = Query(None),
    endpoint: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List audit log entries with advanced filtering and pagination."""
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))

    # Apply filters
    filters = []
    if action:
        filters.append(AuditLog.action == action)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if user_id:
        filters.append(AuditLog.user_id == user_id)
    if username:
        filters.append(AuditLog.username.ilike(f"%{username}%"))
    if request_method:
        filters.append(AuditLog.request_method == request_method.upper())
    if endpoint:
        filters.append(AuditLog.endpoint.ilike(f"%{endpoint}%"))
    if start_date:
        try:
            start_dt = date.fromisoformat(start_date)
            filters.append(AuditLog.created_at >= datetime.combine(start_dt, datetime.min.time()))
        except ValueError:
            raise HTTPException(400, f"Invalid start_date: {start_date}")
    if end_date:
        try:
            end_dt = date.fromisoformat(end_date)
            filters.append(AuditLog.created_at <= datetime.combine(end_dt, datetime.max.time()))
        except ValueError:
            raise HTTPException(400, f"Invalid end_date: {end_date}")
    if search:
        filters.append(
            AuditLog.description.ilike(f"%{search}%") |
            AuditLog.username.ilike(f"%{search}%") |
            AuditLog.entity_id.ilike(f"%{search}%")
        )

    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))

    # Get total count
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    offset = (page - 1) * per_page
    query = query.order_by(AuditLog.created_at.desc())
    query = query.offset(offset).limit(per_page)

    result = await db.execute(query)
    logs = result.scalars().all()

    return {
        "items": [_serialize_log(log) for log in logs],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


@router.get("/actions", dependencies=[Depends(PermissionChecker("audit:view"))])
async def list_audit_actions(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List distinct audit actions for filter dropdowns."""
    result = await db.execute(
        select(AuditLog.action).distinct().order_by(AuditLog.action)
    )
    return {"items": [row[0] for row in result.all()]}


@router.get("/entity-types", dependencies=[Depends(PermissionChecker("audit:view"))])
async def list_audit_entity_types(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List distinct entity types for filter dropdowns."""
    result = await db.execute(
        select(AuditLog.entity_type).distinct().order_by(AuditLog.entity_type)
    )
    return {"items": [row[0] for row in result.all()]}


@router.get("/methods", dependencies=[Depends(PermissionChecker("audit:view"))])
async def list_audit_methods(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List distinct HTTP methods for filter dropdowns."""
    result = await db.execute(
        select(AuditLog.request_method).distinct().where(
            AuditLog.request_method.isnot(None)
        ).order_by(AuditLog.request_method)
    )
    return {"items": [row[0] for row in result.all()]}


@router.get("/stats", dependencies=[Depends(PermissionChecker("audit:view"))])
async def audit_stats(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get audit summary statistics."""
    filters = []
    if start_date:
        try:
            start_dt = date.fromisoformat(start_date)
            filters.append(AuditLog.created_at >= datetime.combine(start_dt, datetime.min.time()))
        except ValueError:
            pass
    if end_date:
        try:
            end_dt = date.fromisoformat(end_date)
            filters.append(AuditLog.created_at <= datetime.combine(end_dt, datetime.max.time()))
        except ValueError:
            pass

    where_clause = and_(*filters) if filters else None

    # Total events
    total_q = select(func.count(AuditLog.id))
    if where_clause:
        total_q = total_q.where(where_clause)
    total = (await db.execute(total_q)).scalar() or 0

    # By action
    action_q = select(AuditLog.action, func.count(AuditLog.id)).group_by(AuditLog.action)
    if where_clause:
        action_q = action_q.where(where_clause)
    action_result = await db.execute(action_q)
    by_action = {row[0]: row[1] for row in action_result.all()}

    # By entity type
    entity_q = select(AuditLog.entity_type, func.count(AuditLog.id)).group_by(AuditLog.entity_type)
    if where_clause:
        entity_q = entity_q.where(where_clause)
    entity_result = await db.execute(entity_q)
    by_entity = {row[0]: row[1] for row in entity_result.all()}

    # Top actors
    actor_q = (
        select(AuditLog.username, func.count(AuditLog.id))
        .where(AuditLog.username.isnot(None))
        .group_by(AuditLog.username)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
    )
    if where_clause:
        actor_q = actor_q.where(where_clause)
    actor_result = await db.execute(actor_q)
    top_actors = [{"username": row[0], "count": row[1]} for row in actor_result.all()]

    return {
        "total_events": total,
        "by_action": by_action,
        "by_entity_type": by_entity,
        "top_actors": top_actors,
    }


@router.get("/export", dependencies=[Depends(PermissionChecker("audit:export"))])
async def export_audit_logs(
    action: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    format: str = Query("csv", regex="^(csv|json)$"),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Export audit logs as CSV or JSON."""
    query = select(AuditLog)
    filters = []
    if action:
        filters.append(AuditLog.action == action)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if username:
        filters.append(AuditLog.username.ilike(f"%{username}%"))
    if start_date:
        try:
            start_dt = date.fromisoformat(start_date)
            filters.append(AuditLog.created_at >= datetime.combine(start_dt, datetime.min.time()))
        except ValueError:
            pass
    if end_date:
        try:
            end_dt = date.fromisoformat(end_date)
            filters.append(AuditLog.created_at <= datetime.combine(end_dt, datetime.max.time()))
        except ValueError:
            pass
    if filters:
        query = query.where(and_(*filters))

    query = query.order_by(AuditLog.created_at.desc()).limit(10000)
    result = await db.execute(query)
    logs = result.scalars().all()

    if format == "json":
        import json
        data = json.dumps([_serialize_log(log) for log in logs], default=str, indent=2)
        return StreamingResponse(
            io.BytesIO(data.encode()),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="audit_logs_{date.today().isoformat()}.json"'},
        )

    # CSV format
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Timestamp", "Action", "Entity Type", "Entity ID", "Username",
        "IP Address", "Endpoint", "Method", "Description",
    ])
    for log in logs:
        writer.writerow([
            log.created_at.isoformat() if log.created_at else "",
            log.action,
            log.entity_type,
            log.entity_id or "",
            log.username or "",
            log.ip_address or "",
            log.endpoint or "",
            log.request_method or "",
            log.description or "",
        ])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="audit_logs_{date.today().isoformat()}.csv"'},
    )


@router.get("/{log_id}", dependencies=[Depends(PermissionChecker("audit:view"))])
async def get_audit_log(
    log_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get a single audit log entry by ID with full details."""
    result = await db.execute(
        select(AuditLog).where(AuditLog.id == log_id)
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(404, "Audit log not found")

    return _serialize_log(log)
