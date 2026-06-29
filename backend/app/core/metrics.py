"""
Project Z - Request Metrics Collector
In-memory metrics collection for request counts, latencies, and error rates.
Thread-safe counters for Prometheus export and internal dashboards.
"""

import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class EndpointMetrics:
    """Metrics for a single endpoint."""
    count: int = 0
    error_count: int = 0
    total_latency_ms: float = 0
    min_latency_ms: float = float("inf")
    max_latency_ms: float = 0
    last_request_at: str | None = None

    def record(self, status_code: int, elapsed_ms: float):
        self.count += 1
        self.total_latency_ms += elapsed_ms
        self.min_latency_ms = min(self.min_latency_ms, elapsed_ms)
        self.max_latency_ms = max(self.max_latency_ms, elapsed_ms)
        if status_code >= 400:
            self.error_count += 1
        self.last_request_at = datetime.now(timezone.utc).isoformat()

    @property
    def avg_latency_ms(self) -> float:
        return self.total_latency_ms / self.count if self.count > 0 else 0


class MetricsCollector:
    """Thread-safe in-memory metrics collector."""

    def __init__(self):
        self._lock = threading.Lock()
        self._start_time = time.monotonic()
        self._endpoints: dict[str, EndpointMetrics] = defaultdict(EndpointMetrics)
        self._status_codes: dict[int, int] = defaultdict(int)
        self._total_requests: int = 0
        self._total_errors: int = 0
        self._websocket_connections: int = 0
        self._websocket_total_connected: int = 0
        self._worker_heartbeats: dict[str, str] = {}
        self._custom_counters: dict[str, int] = defaultdict(int)

    def record_request(
        self,
        method: str,
        path: str,
        status_code: int,
        elapsed_ms: float,
    ):
        """Record a completed request."""
        # Normalize path (strip IDs to group by pattern)
        normalized = self._normalize_path(path)
        key = f"{method} {normalized}"

        with self._lock:
            self._endpoints[key].record(status_code, elapsed_ms)
            self._status_codes[status_code] += 1
            self._total_requests += 1
            if status_code >= 500:
                self._total_errors += 1

    def record_websocket_connect(self):
        with self._lock:
            self._websocket_connections += 1
            self._websocket_total_connected += 1

    def record_websocket_disconnect(self):
        with self._lock:
            self._websocket_connections = max(0, self._websocket_connections - 1)

    def update_worker_heartbeat(self, worker_name: str):
        with self._lock:
            self._worker_heartbeats[worker_name] = datetime.now(timezone.utc).isoformat()

    def increment_counter(self, name: str, value: int = 1):
        with self._lock:
            self._custom_counters[name] += value

    def get_snapshot(self) -> dict:
        """Get a point-in-time snapshot of all metrics."""
        with self._lock:
            uptime_seconds = int(time.monotonic() - self._start_time)

            # Build endpoint summary (sorted by request count)
            top_endpoints = sorted(
                self._endpoints.items(),
                key=lambda x: x[1].count,
                reverse=True,
            )[:50]

            endpoints = {}
            for key, m in top_endpoints:
                endpoints[key] = {
                    "count": m.count,
                    "error_count": m.error_count,
                    "avg_latency_ms": round(m.avg_latency_ms, 1),
                    "min_latency_ms": round(m.min_latency_ms, 1) if m.min_latency_ms != float("inf") else 0,
                    "max_latency_ms": round(m.max_latency_ms, 1),
                    "last_request_at": m.last_request_at,
                }

            # Status code distribution
            status_dist = dict(sorted(self._status_codes.items()))

            return {
                "uptime_seconds": uptime_seconds,
                "total_requests": self._total_requests,
                "total_errors": self._total_errors,
                "error_rate_percent": round(
                    (self._total_errors / self._total_requests * 100)
                    if self._total_requests > 0 else 0,
                    2,
                ),
                "status_codes": status_dist,
                "endpoints": endpoints,
                "websocket": {
                    "active_connections": self._websocket_connections,
                    "total_connected": self._websocket_total_connected,
                },
                "worker_heartbeats": dict(self._worker_heartbeats),
                "custom_counters": dict(self._custom_counters),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

    def get_prometheus_text(self) -> str:
        """Export metrics in Prometheus text format."""
        with self._lock:
            lines = []
            lines.append("# HELP projectz_requests_total Total number of HTTP requests")
            lines.append("# TYPE projectz_requests_total counter")
            lines.append(f"projectz_requests_total {self._total_requests}")

            lines.append("# HELP projectz_errors_total Total number of 5xx errors")
            lines.append("# TYPE projectz_errors_total counter")
            lines.append(f"projectz_errors_total {self._total_errors}")

            lines.append("# HELP projectz_uptime_seconds Application uptime")
            lines.append("# TYPE projectz_uptime_seconds gauge")
            lines.append(f"projectz_uptime_seconds {int(time.monotonic() - self._start_time)}")

            lines.append("# HELP projectz_websocket_active Active WebSocket connections")
            lines.append("# TYPE projectz_websocket_active gauge")
            lines.append(f"projectz_websocket_active {self._websocket_connections}")

            # Per-endpoint metrics
            lines.append("# HELP projectz_endpoint_requests_total Requests per endpoint")
            lines.append("# TYPE projectz_endpoint_requests_total counter")
            for key, m in self._endpoints.items():
                escaped = key.replace(" ", "_").replace("/", "_").replace("-", "_")
                lines.append(f'projectz_endpoint_requests_total{{endpoint="{key}"}} {m.count}')

            lines.append("# HELP projectz_endpoint_latency_ms Average latency per endpoint")
            lines.append("# TYPE projectz_endpoint_latency_ms gauge")
            for key, m in self._endpoints.items():
                lines.append(f'projectz_endpoint_latency_ms{{endpoint="{key}"}} {round(m.avg_latency_ms, 1)}')

            # Status code distribution
            lines.append("# HELP projectz_status_code_total Requests by status code")
            lines.append("# TYPE projectz_status_code_total counter")
            for code, count in self._status_codes.items():
                lines.append(f'projectz_status_code_total{{code="{code}"}} {count}')

            return "\n".join(lines) + "\n"

    @staticmethod
    def _normalize_path(path: str) -> str:
        """Normalize path by replacing UUIDs and numeric IDs with placeholders."""
        import re
        # Replace UUIDs
        path = re.sub(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            "{id}",
            path,
            flags=re.IGNORECASE,
        )
        # Replace numeric IDs
        path = re.sub(r"/\d+", "/{id}", path)
        return path


# Singleton instance
metrics = MetricsCollector()
