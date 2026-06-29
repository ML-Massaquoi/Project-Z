"""
Project Z - Security & Compliance API
Security dashboard, audit logs, compliance reporting, incident investigation.

Endpoints:
  GET  /api/v1/security/dashboard          — Security overview
  GET  /api/v1/security/audit-logs         — Audit log search
  GET  /api/v1/security/failed-logins      — Failed login attempts
  GET  /api/v1/security/active-sessions    — Active user sessions
  GET  /api/v1/security/user-activity      — User activity report
  GET  /api/v1/security/compliance         — Compliance summary
  GET  /api/v1/security/investigate        — Incident investigation
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_auditor, require_admin
from app.database.session import get_db
from app.models.audit import AuditLog
from app.models.user import User, Role
from app.models.employee import Employee
from app.models.attendance import AttendanceSession
from app.models.scan_event import ScanEvent
from app.models.device import Device

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/security", tags=["Security & Compliance"])


# ── 1. Security Dashboard ────────────────────────────────────

@router.get("/dashboard")
async def security_dashboard(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    """
    Security overview for administrators.
    Returns: users summary, recent audit events, failed logins, active roles.
    """
    # User counts by status
    total_users_result = await db.execute(select(func.count()).select_from(User))
    total_users = total_users_result.scalar_one()

    active_users_result = await db.execute(
        select(func.count()).select_from(User).where(User.is_active == True)
    )
    active_users = active_users_result.scalar_one()

    inactive_users = total_users - active_users

    # Users by role
    role_result = await db.execute(
        select(Role.name, func.count(User.id))
        .join(User, User.role_id == Role.id, isouter=True)
        .group_by(Role.name)
    )
    users_by_role = {row[0]: row[1] for row in role_result.all()}

    # Recent audit events (last 24 hours)
    cutoff_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    recent_audit_result = await db.execute(
        select(AuditLog)
        .where(AuditLog.created_at >= cutoff_24h)
        .order_by(desc(AuditLog.created_at))
        .limit(50)
    )
    recent_events = [
        {
            "id": str(a.id),
            "action": a.action,
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "user_id": str(a.user_id) if a.user_id else None,
            "ip_address": a.ip_address,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in recent_audit_result.scalars().all()
    ]

    # Failed logins (last 24 hours) - from audit logs
    failed_logins_result = await db.execute(
        select(func.count()).select_from(AuditLog).where(
            and_(
                AuditLog.action == "login_failed",
                AuditLog.created_at >= cutoff_24h,
            )
        )
    )
    failed_logins_24h = failed_logins_result.scalar_one()

    # Locked accounts
    locked_result = await db.execute(
        select(func.count()).select_from(User).where(
            User.locked_until.isnot(None)
        )
    )
    locked_accounts = locked_result.scalar_one()

    # Recent security events
    security_events_result = await db.execute(
        select(AuditLog)
        .where(
            and_(
                AuditLog.action.in_(["login_failed", "password_change", "user_delete", "role_change"]),
                AuditLog.created_at >= cutoff_24h,
            )
        )
        .order_by(desc(AuditLog.created_at))
        .limit(20)
    )
    security_events = [
        {
            "action": a.action,
            "entity_type": a.entity_type,
            "ip_address": a.ip_address,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in security_events_result.scalars().all()
    ]

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "inactive": inactive_users,
            "by_role": users_by_role,
        },
        "security": {
            "failed_logins_24h": failed_logins_24h,
            "locked_accounts": locked_accounts,
        },
        "recent_audit_events": recent_events,
        "security_events": security_events,
    }


# ── 2. Audit Log Search ─────────────────────────────────────

@router.get("/audit-logs")
async def search_audit_logs(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    user_id: Optional[UUID] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_auditor),
):
    """
    Search and filter audit logs.
    Returns: paginated audit log entries with filters.
    """
    query = select(AuditLog)
    count_query = select(func.count()).select_from(AuditLog)

    filters = []
    if start_date:
        start_dt = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
        filters.append(AuditLog.created_at >= start_dt)
    if end_date:
        end_dt = datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc)
        filters.append(AuditLog.created_at <= end_dt)
    if action:
        filters.append(AuditLog.action == action)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if user_id:
        filters.append(AuditLog.user_id == user_id)

    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    skip = (page - 1) * per_page
    result = await db.execute(
        query.order_by(desc(AuditLog.created_at)).offset(skip).limit(per_page)
    )
    logs = result.scalars().all()

    return {
        "items": [
            {
                "id": str(a.id),
                "action": a.action,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "user_id": str(a.user_id) if a.user_id else None,
                "description": a.description,
                "ip_address": a.ip_address,
                "details": a.details,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in logs
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


# ── 3. Failed Logins ────────────────────────────────────────

@router.get("/failed-logins")
async def failed_logins(
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    """
    Get failed login attempts in the last N hours.
    Returns: list of failed login events.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    result = await db.execute(
        select(AuditLog)
        .where(
            and_(
                AuditLog.action == "login_failed",
                AuditLog.created_at >= cutoff,
            )
        )
        .order_by(desc(AuditLog.created_at))
    )
    events = result.scalars().all()

    return {
        "hours": hours,
        "count": len(events),
        "events": [
            {
                "id": str(a.id),
                "entity_id": a.entity_id,
                "ip_address": a.ip_address,
                "details": a.details,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in events
        ],
    }


# ── 4. Active Sessions ──────────────────────────────────────

@router.get("/active-sessions")
async def active_sessions(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    """
    Get currently active users (based on recent audit activity).
    Returns: users with recent activity.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)

    result = await db.execute(
        select(
            AuditLog.user_id,
            func.max(AuditLog.created_at).label("last_activity"),
        )
        .where(AuditLog.created_at >= cutoff)
        .group_by(AuditLog.user_id)
    )
    active_user_ids = [(row.user_id, row.last_activity) for row in result.all() if row.user_id]

    sessions = []
    for user_id, last_activity in active_user_ids:
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user:
            sessions.append({
                "user_id": str(user.id),
                "username": user.username,
                "full_name": user.full_name,
                "role": user.role.display_name if user.role else None,
                "last_activity": last_activity.isoformat() if last_activity else None,
            })

    return {
        "count": len(sessions),
        "sessions": sessions,
    }


# ── 5. User Activity Report ─────────────────────────────────

@router.get("/user-activity")
async def user_activity_report(
    user_id: Optional[UUID] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_auditor),
):
    """
    User activity report for compliance.
    Returns: action counts, recent actions, entity interactions.
    """
    filters = []
    if user_id:
        filters.append(AuditLog.user_id == user_id)
    if start_date:
        filters.append(AuditLog.created_at >= datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc))
    if end_date:
        filters.append(AuditLog.created_at <= datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc))

    # Action counts
    query = select(AuditLog.action, func.count()).group_by(AuditLog.action)
    if filters:
        query = query.where(and_(*filters))

    counts_result = await db.execute(query)
    action_counts = {row[0]: row[1] for row in counts_result.all()}

    # Recent actions
    recent_query = select(AuditLog).order_by(desc(AuditLog.created_at)).limit(100)
    if filters:
        recent_query = recent_query.where(and_(*filters))

    recent_result = await db.execute(recent_query)
    recent_actions = [
        {
            "action": a.action,
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "ip_address": a.ip_address,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in recent_result.scalars().all()
    ]

    return {
        "action_counts": action_counts,
        "recent_actions": recent_actions,
        "total_actions": sum(action_counts.values()),
    }


# ── 6. Compliance Summary ───────────────────────────────────

@router.get("/compliance")
async def compliance_summary(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_auditor),
):
    """
    Compliance summary for a date range.
    Returns: audit coverage, modification tracking, security events.
    """
    start_dt = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end_dt = datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc)

    # Total audit events
    total_result = await db.execute(
        select(func.count()).select_from(AuditLog).where(
            and_(AuditLog.created_at >= start_dt, AuditLog.created_at <= end_dt)
        )
    )
    total_events = total_result.scalar_one()

    # Events by category
    category_result = await db.execute(
        select(AuditLog.entity_type, func.count())
        .where(and_(AuditLog.created_at >= start_dt, AuditLog.created_at <= end_dt))
        .group_by(AuditLog.entity_type)
    )
    by_category = {row[0]: row[1] for row in category_result.all()}

    # Security events
    security_result = await db.execute(
        select(func.count()).select_from(AuditLog).where(
            and_(
                AuditLog.action.in_(["login_failed", "password_change", "user_delete"]),
                AuditLog.created_at >= start_dt,
                AuditLog.created_at <= end_dt,
            )
        )
    )
    security_events = security_result.scalar_one()

    # Attendance modifications
    attendance_mods_result = await db.execute(
        select(func.count()).select_from(AuditLog).where(
            and_(
                AuditLog.entity_type == "attendance",
                AuditLog.action.in_(["update", "delete"]),
                AuditLog.created_at >= start_dt,
                AuditLog.created_at <= end_dt,
            )
        )
    )
    attendance_modifications = attendance_mods_result.scalar_one()

    return {
        "period": {"start": start_date, "end": end_date},
        "total_audit_events": total_events,
        "events_by_category": by_category,
        "security_events": security_events,
        "attendance_modifications": attendance_modifications,
    }


# ── 7. Incident Investigation ───────────────────────────────

@router.get("/investigate")
async def investigate_incident(
    employee_id: Optional[UUID] = Query(None),
    device_id: Optional[UUID] = Query(None),
    date: Optional[str] = Query(None),
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_auditor),
):
    """
    Incident investigation tool.
    Combines audit logs, scan events, and attendance for a comprehensive view.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    target_date = datetime.fromisoformat(date).replace(tzinfo=timezone.utc) if date else cutoff

    result = {
        "investigation_window": f"Last {hours} hours",
        "employee_id": str(employee_id) if employee_id else None,
        "device_id": str(device_id) if device_id else None,
    }

    # 1. Scan events
    scan_filters = [ScanEvent.scan_timestamp >= target_date]
    if employee_id:
        scan_filters.append(ScanEvent.employee_id == employee_id)
    if device_id:
        scan_filters.append(ScanEvent.device_id == device_id)

    scans_result = await db.execute(
        select(ScanEvent).where(and_(*scan_filters)).order_by(desc(ScanEvent.scan_timestamp)).limit(100)
    )
    result["scan_events"] = [
        {
            "id": str(s.id),
            "employee_code": s.employee_code,
            "employee_name": s.employee_name,
            "device_name": s.device_name,
            "scan_result": s.scan_result.value if hasattr(s.scan_result, "value") else str(s.scan_result),
            "scan_timestamp": s.scan_timestamp.isoformat(),
        }
        for s in scans_result.scalars().all()
    ]

    # 2. Attendance sessions
    att_filters = [AttendanceSession.date >= target_date.date()]
    if employee_id:
        att_filters.append(AttendanceSession.employee_id == employee_id)

    att_result = await db.execute(
        select(AttendanceSession).where(and_(*att_filters)).order_by(desc(AttendanceSession.date)).limit(50)
    )
    result["attendance_sessions"] = [
        {
            "id": str(s.id),
            "employee_id": str(s.employee_id),
            "date": str(s.date),
            "check_in": s.check_in.isoformat() if s.check_in else None,
            "check_out": s.check_out.isoformat() if s.check_out else None,
            "status": s.status if isinstance(s.status, str) else str(s.status),
            "late_minutes": float(s.late_minutes or 0),
        }
        for s in att_result.scalars().all()
    ]

    # 3. Audit trail for this employee/user
    if employee_id:
        audit_result = await db.execute(
            select(AuditLog)
            .where(
                and_(
                    AuditLog.entity_type == "employee",
                    AuditLog.entity_id == str(employee_id),
                    AuditLog.created_at >= target_date,
                )
            )
            .order_by(desc(AuditLog.created_at))
            .limit(50)
        )
        result["audit_trail"] = [
            {
                "action": a.action,
                "entity_type": a.entity_type,
                "description": a.description,
                "ip_address": a.ip_address,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in audit_result.scalars().all()
        ]

    return result
