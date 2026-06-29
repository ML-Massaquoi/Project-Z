"""
Project Z - Metrics Middleware
Automatically records request metrics for every HTTP request.
"""

import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.metrics import metrics


class MetricsMiddleware(BaseHTTPMiddleware):
    """
    Middleware that records request metrics:
    - Request count per endpoint
    - Latency (min/max/avg)
    - Error rates (5xx)
    - Status code distribution
    """

    async def dispatch(self, request: Request, call_next):
        # Skip metrics for metrics endpoint itself
        if request.url.path in ("/metrics", "/metrics/prometheus"):
            return await call_next(request)

        start_time = time.monotonic()

        response: Response = await call_next(request)

        elapsed_ms = round((time.monotonic() - start_time) * 1000, 2)

        # Record metrics
        metrics.record_request(
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            elapsed_ms=elapsed_ms,
        )

        # Add server timing header
        response.headers["Server-Timing"] = f"total;dur={elapsed_ms}"

        return response
