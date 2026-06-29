"""
Project Z - System Settings API
Organization-level configuration management.

Endpoints:
  GET  /api/v1/settings        — List all settings
  PUT  /api/v1/settings        — Update settings
"""

import logging
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.organization import Organization
from app.services.audit_service import log_audit
from app.utils.audit_context import get_audit_context

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["Settings"])

# Settings keys that map to organization fields
ORG_FIELD_MAP = {
    "organization_name": "name",
    "organization_code": "code",
    "timezone": "timezone",
}

# Settings keys that map to config defaults (read-only for now)
CONFIG_KEYS = {
    "default_grace_period": "DEFAULT_GRACE_PERIOD_MINUTES",
    "duplicate_scan_window": "DUPLICATE_SCAN_WINDOW_SECONDS",
    "auto_checkout_hours": "AUTO_CHECKOUT_HOURS",
}


@router.get("", dependencies=[Depends(PermissionChecker("settings:view"))])
async def list_settings(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Return current system settings."""
    settings = get_settings()

    # Fetch org settings from DB
    result = await db.execute(select(Organization).limit(1))
    org = result.scalar_one_or_none()

    org_data = {}
    if org:
        org_data = {
            "organization_name": org.name or "",
            "organization_code": org.code or "",
            "timezone": org.timezone or settings.TIMEZONE,
        }

    # Merge with config defaults
    config_data = {
        "default_grace_period": str(settings.DEFAULT_GRACE_PERIOD_MINUTES),
        "duplicate_scan_window": str(settings.DUPLICATE_SCAN_WINDOW_SECONDS),
        "auto_checkout_hours": str(settings.AUTO_CHECKOUT_HOURS),
        "default_office": "",
        "attendance_calculation_mode": "session-based",
        "auto_checkout_enabled": "true",
        "overtime_threshold_minutes": "0",
        "device_heartbeat_interval": "30",
        "device_offline_threshold": "300",
        "adms_listener_port": "8081",
        "alert_on_device_offline": "true",
        "alert_on_critical_absence": "true",
        "email_notifications": "false",
        "session_timeout_minutes": str(settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
        "max_login_attempts": "5",
        "password_min_length": "8",
    }

    return {**config_data, **org_data}


@router.put("", dependencies=[Depends(PermissionChecker("settings:update"))])
async def update_settings(
    data: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Update system settings (org-level fields are persisted to DB)."""
    # Capture previous state
    result = await db.execute(select(Organization).limit(1))
    org = result.scalar_one_or_none()
    old_org_data = None

    if org:
        old_org_data = {
            "name": org.name,
            "code": org.code,
            "timezone": org.timezone,
        }
        for key, db_field in ORG_FIELD_MAP.items():
            if key in data:
                setattr(org, db_field, data[key])
        await db.commit()

    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="update", entity_type="settings",
        details={"changed_keys": list(data.keys())},
        previous_value=old_org_data,
        new_value=data, **audit_ctx,
    )

    return {"message": "Settings updated"}
