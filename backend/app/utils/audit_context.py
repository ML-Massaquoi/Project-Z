"""
Project Z - Audit Context Helpers
Utilities for extracting audit context from FastAPI requests.
"""

from typing import Optional
from fastapi import Request


def get_audit_context(request: Request, user=None) -> dict:
    """
    Extract audit context from request.state (set by AuditMiddleware)
    and current user. Returns a dict suitable for log_audit() kwargs.
    """
    ctx = getattr(request.state, "audit_context", {}) or {}

    result = {
        "ip_address": ctx.get("ip_address"),
        "user_agent": ctx.get("user_agent"),
        "endpoint": ctx.get("endpoint"),
        "request_method": ctx.get("request_method"),
    }

    if user:
        result["user_id"] = str(user.id) if hasattr(user, "id") else None
        result["username"] = getattr(user, "username", None)

    return result
