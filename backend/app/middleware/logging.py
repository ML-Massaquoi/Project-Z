"""
Project Z - Request Logging Middleware
Adds correlation IDs to all requests for distributed tracing.
Logs structured request/response details with timing.
"""

import time
import uuid
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.metrics import metrics

logger = logging.getLogger("projectz.middleware")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that:
    1. Generates a unique correlation ID for each request
    2. Adds it to response headers
    3. Logs request/response details with timing (structured)
    4. Stores correlation ID in request.state for downstream use
    5. Records request metrics (count, latency, status codes)
    """

    async def dispatch(self, request: Request, call_next):
        # Generate or use existing correlation ID
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())[:8]
        request.state.correlation_id = correlation_id

        # Skip logging for health checks and metrics to reduce noise
        skip_logging = request.url.path in ("/health", "/metrics", "/health/detailed", "/metrics/prometheus")

        # Start timing
        start_time = time.monotonic()

        # Process request
        try:
            response: Response = await call_next(request)
        except Exception as exc:
            elapsed_ms = round((time.monotonic() - start_time) * 1000, 1)
            # Record the error in metrics
            metrics.record_request(
                method=request.method,
                path=request.url.path,
                status_code=500,
                elapsed_ms=elapsed_ms,
            )
            logger.error(
                "Request failed",
                extra={
                    "correlation_id": correlation_id,
                    "request_method": request.method,
                    "request_path": request.url.path,
                    "elapsed_ms": elapsed_ms,
                    "client_ip": request.client.host if request.client else None,
                },
            )
            raise

        # Calculate timing
        elapsed_ms = round((time.monotonic() - start_time) * 1000, 1)

        # Add correlation ID to response headers
        response.headers["X-Correlation-ID"] = correlation_id

        # Log request details (skip noisy paths)
        if not skip_logging:
            status = response.status_code
            level = logging.WARNING if status >= 400 else logging.INFO
            logger.log(
                level,
                "Request completed",
                extra={
                    "correlation_id": correlation_id,
                    "request_method": request.method,
                    "request_path": request.url.path,
                    "status_code": status,
                    "elapsed_ms": elapsed_ms,
                    "client_ip": request.client.host if request.client else None,
                },
            )

        return response
