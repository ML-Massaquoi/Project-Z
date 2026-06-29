"""
Project Z - Audit Middleware
Automatically logs all mutating API requests (POST, PUT, DELETE, PATCH)
to the audit_logs table with request context.
"""

import json
import logging
import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("projectz.audit_middleware")

# Paths to exclude from automatic audit logging
_EXCLUDED_PATHS = {
    "/health",
    "/metrics",
    "/health/detailed",
    "/docs",
    "/redoc",
    "/openapi.json",
}

# Paths that are device communication (no user auth)
_EXCLUDED_PREFIXES = (
    "/iclock",
    "/adms",
    "/ws",
)

# Methods that should be audited
_AUDIT_METHODS = {"POST", "PUT", "DELETE", "PATCH"}


class AuditMiddleware(BaseHTTPMiddleware):
    """
    Middleware that automatically captures audit context for mutating requests.

    This middleware captures:
    - Request method and endpoint
    - User agent
    - Client IP
    - Request body (for POST/PUT/PATCH)
    - Response status code
    - Timing

    The actual audit log entry is created by the route handler calling log_audit().
    This middleware enriches request.state with audit context for downstream use.
    """

    async def dispatch(self, request: Request, call_next):
        # Only audit mutating methods
        if request.method not in _AUDIT_METHODS:
            return await call_next(request)

        # Skip excluded paths
        path = request.url.path
        if path in _EXCLUDED_PATHS or path.startswith(_EXCLUDED_PREFIXES):
            return await call_next(request)

        # Capture request context
        start_time = time.monotonic()
        client_ip = self._get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")
        method = request.method
        endpoint = path

        # Store audit context in request.state for route handlers
        request.state.audit_context = {
            "ip_address": client_ip,
            "user_agent": user_agent,
            "endpoint": endpoint,
            "request_method": method,
            "timestamp": start_time,
        }

        # Try to capture request body
        try:
            body = await request.body()
            if body:
                try:
                    request.state.audit_context["request_body"] = json.loads(body)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    request.state.audit_context["request_body"] = "<unparseable>"
            else:
                request.state.audit_context["request_body"] = None
        except Exception:
            request.state.audit_context["request_body"] = None

        # Process request
        response: Response = await call_next(request)

        # Add timing to audit context
        elapsed_ms = round((time.monotonic() - start_time) * 1000, 1)
        request.state.audit_context["response_status"] = response.status_code
        request.state.audit_context["elapsed_ms"] = elapsed_ms

        # Log the audit event at middleware level for observability
        status = response.status_code
        if status >= 400:
            logger.warning(
                f"[Audit] {method} {endpoint} -> {status} "
                f"({elapsed_ms}ms) IP={client_ip}"
            )
        else:
            logger.debug(
                f"[Audit] {method} {endpoint} -> {status} "
                f"({elapsed_ms}ms) IP={client_ip}"
            )

        return response

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract client IP, respecting X-Forwarded-For behind reverse proxy."""
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        if request.client:
            return request.client.host
        return "unknown"
