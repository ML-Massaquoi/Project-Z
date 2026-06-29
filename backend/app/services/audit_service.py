"""
Project Z - Audit Logging Service
Records critical actions to audit_logs table with full context.
"""

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _serialize_for_audit(obj) -> Optional[dict]:
    """
    Safely serialize a SQLAlchemy model instance to a dict for audit storage.
    Handles datetime, UUID, enum, and nested objects.
    """
    if obj is None:
        return None

    from datetime import datetime, date
    from decimal import Decimal
    import uuid as _uuid

    if hasattr(obj, "__dict__"):
        result = {}
        for key, value in obj.__dict__.items():
            if key.startswith("_"):
                continue
            if isinstance(value, (datetime, date)):
                result[key] = value.isoformat()
            elif isinstance(value, _uuid.UUID):
                result[key] = str(value)
            elif isinstance(value, Decimal):
                result[key] = float(value)
            elif hasattr(value, "value"):  # enum
                result[key] = value.value
            elif isinstance(value, dict):
                result[key] = value
            elif isinstance(value, list):
                result[key] = [
                    str(v) if isinstance(v, _uuid.UUID) else v
                    for v in value
                ]
            elif isinstance(value, str):
                result[key] = value
            elif isinstance(value, (int, float, bool)):
                result[key] = value
            elif value is None:
                result[key] = None
            # Skip relationship objects to avoid circular refs
        return result
    elif isinstance(obj, dict):
        return obj
    return None


async def log_audit(
    session: AsyncSession,
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    details: Optional[dict] = None,
    previous_value=None,
    new_value=None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    endpoint: Optional[str] = None,
    request_method: Optional[str] = None,
):
    """
    Write an audit log entry with full context.

    Args:
        session: Database session
        action: Action performed (e.g., 'create', 'update', 'delete', 'login', 'assign_department')
        entity_type: Type of entity (e.g., 'employee', 'shift', 'device', 'department')
        entity_id: ID of the affected entity
        user_id: ID of the user performing the action
        username: Username of the actor (denormalized for fast queries)
        details: Additional context
        previous_value: Entity state before mutation (model instance or dict)
        new_value: Entity state after mutation (model instance or dict)
        ip_address: Client IP
        user_agent: Browser user agent string
        endpoint: API endpoint path
        request_method: HTTP method
    """
    from app.models.audit import AuditLog

    try:
        # Serialize previous/new values if they are model instances
        prev_dict = _serialize_for_audit(previous_value) if previous_value else None
        new_dict = _serialize_for_audit(new_value) if new_value else None

        # Build description
        description = f"{action} {entity_type}"
        if entity_id:
            description += f" {entity_id}"

        audit = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            username=username,
            description=description,
            details=details or {},
            previous_value=prev_dict,
            new_value=new_dict,
            ip_address=ip_address,
            user_agent=user_agent,
            endpoint=endpoint,
            request_method=request_method,
        )
        session.add(audit)
        await session.flush()
        logger.debug(f"[Audit] {action} {entity_type} {entity_id} by {username or user_id}")
    except Exception as e:
        logger.warning(f"[Audit] Failed to write audit log: {e}")
