"""
Project Z - Rate Limiting Middleware
Token bucket rate limiter using Redis for distributed rate limiting.
"""

import time
import logging
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.metrics import metrics

logger = logging.getLogger("projectz.middleware.rate_limit")


class RateLimitConfig:
    """Rate limit configuration."""

    DEFAULT = 600
    AUTH = 60
    ADMS = 600
    API_WRITE = 300
    API_READ = 600
    EXPORT = 30

    EXEMPT_PATHS = {
        "/health",
        "/metrics",
        "/health/detailed",
        "/metrics/prometheus",
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/ws",
    }

    PATH_LIMITS = {
        "/iclock/cdata": ADMS,
        "/iclock/getrequest": ADMS,
    }


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Distributed rate limiter using Redis sliding window.
    Falls back to in-memory if Redis unavailable.
    Uses a single persistent Redis connection pool.
    """

    def __init__(self, app, redis_url: Optional[str] = None):
        super().__init__(app)
        self.redis_url = redis_url
        self._redis_pool = None
        self._local_store: dict[str, list[float]] = {}
        self._max_local_entries = 10000

    async def _init_redis(self):
        """Initialize Redis connection pool once."""
        if self._redis_pool is not None:
            return self._redis_pool

        if not self.redis_url:
            return None

        try:
            import redis.asyncio as aioredis
            self._redis_pool = aioredis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=3,
                socket_keepalive=True,
                retry_on_timeout=True,
            )
            await self._redis_pool.ping()
            logger.info("Redis connected for rate limiting")
            return self._redis_pool
        except Exception as e:
            logger.warning(f"Redis unavailable for rate limiting, using in-memory: {e}")
            self._redis_pool = None
            return None

    def _get_client_key(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"
        return f"rl:{ip}"

    def _get_limit(self, path: str) -> int:
        if path in RateLimitConfig.PATH_LIMITS:
            return RateLimitConfig.PATH_LIMITS[path]
        for prefix, limit in RateLimitConfig.PATH_LIMITS.items():
            if path.startswith(prefix):
                return limit
        return RateLimitConfig.DEFAULT

    async def _check_rate_limit_redis(
        self, key: str, limit: int, window: int = 60
    ) -> tuple[bool, int]:
        redis = await self._init_redis()
        if not redis:
            return await self._check_rate_limit_local(key, limit, window)

        try:
            now = time.time()
            pipe = redis.pipeline()
            pipe.zremrangebyscore(key, 0, now - window)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, window)
            results = await pipe.execute()
            current_count = results[1]
            return (current_count < limit), current_count
        except Exception as e:
            logger.debug(f"Redis rate limit check failed, falling back: {e}")
            return await self._check_rate_limit_local(key, limit, window)

    async def _check_rate_limit_local(
        self, key: str, limit: int, window: int = 60
    ) -> tuple[bool, int]:
        now = time.time()
        if key not in self._local_store:
            self._local_store[key] = []

        self._local_store[key] = [
            ts for ts in self._local_store[key] if now - ts < window
        ]

        if len(self._local_store) > self._max_local_entries:
            keys_to_remove = sorted(
                self._local_store.keys(),
                key=lambda k: self._local_store[k][0] if self._local_store[k] else 0,
            )[: len(self._local_store) // 10]
            for k in keys_to_remove:
                del self._local_store[k]

        current_count = len(self._local_store[key])
        if current_count >= limit:
            return False, current_count

        self._local_store[key].append(now)
        return True, current_count + 1

    async def dispatch(self, request: Request, call_next):
        if request.url.path in RateLimitConfig.EXEMPT_PATHS:
            return await call_next(request)

        limit = self._get_limit(request.url.path)
        client_key = self._get_client_key(request)

        allowed, count = await self._check_rate_limit_redis(client_key, limit, window=60)

        if not allowed:
            metrics.increment_counter("rate_limit_rejected")
            logger.warning(
                "Rate limit exceeded",
                extra={"client_key": client_key, "path": request.url.path, "count": count, "limit": limit},
            )
            return JSONResponse(
                status_code=429,
                content={
                    "error": True,
                    "message": "Rate limit exceeded. Please try again later.",
                    "detail": f"Rate limit of {limit} requests per minute exceeded. Retry after 60 seconds.",
                },
                headers={
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time()) + 60),
                    "Retry-After": "60",
                },
            )

        response = await call_next(request)

        remaining = max(0, limit - count)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + 60)

        return response
