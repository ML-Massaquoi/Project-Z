"""
Project Z - WebSocket Service
Connection management and event broadcasting via Redis pub/sub.

Uses Redis as the message bus so broadcasts work correctly even when
uvicorn --reload restarts the worker process.
"""

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Renamed from projectz:events to projectz:ws_events (enterprise platform v2)
REDIS_CHANNEL = "projectz:ws_events"


class WebSocketManager:
    """Manages WebSocket connections and broadcasts via Redis pub/sub."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self._redis = None
        self._pubsub_task: asyncio.Task | None = None

    async def _get_redis(self):
        """Lazy Redis connection."""
        if self._redis is None:
            try:
                import redis.asyncio as aioredis
                from app.core.config import get_settings
                settings = get_settings()
                self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            except Exception as e:
                logger.warning(f"Redis unavailable, falling back to direct broadcast: {e}")
                self._redis = None
        return self._redis

    async def connect(self, websocket: WebSocket):
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")

        # Start Redis subscriber if not running
        if self._pubsub_task is None or self._pubsub_task.done():
            self._pubsub_task = asyncio.create_task(self._redis_subscriber())

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, event: str, data: Any):
        """
        Publish event to Redis channel — all workers receive it and
        forward to their local WebSocket connections.
        Falls back to direct broadcast if Redis is unavailable.
        """
        message = json.dumps({"event": event, "data": data})
        redis = await self._get_redis()
        if redis:
            try:
                await redis.publish(REDIS_CHANNEL, message)
                return
            except Exception as e:
                logger.warning(f"Redis publish failed, using direct broadcast: {e}")

        # Fallback: direct broadcast to local connections
        await self._broadcast_local(message)

    async def _broadcast_local(self, message: str):
        """Send message directly to all local WebSocket connections."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

    async def _redis_subscriber(self):
        """
        Subscribe to Redis channel and forward messages to local WS connections.
        Auto-reconnects within 10 seconds if the connection drops (Req 13.6).
        """
        while True:
            redis = await self._get_redis()
            if not redis:
                await asyncio.sleep(10)
                continue
            try:
                pubsub = redis.pubsub()
                await pubsub.subscribe(REDIS_CHANNEL)
                logger.info(f"Redis pubsub subscribed to {REDIS_CHANNEL}")
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        await self._broadcast_local(message["data"])
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.error(f"Redis subscriber error: {e} — reconnecting in 5s")
                self._redis = None  # Force reconnect on next attempt
                await asyncio.sleep(5)

    async def send_personal(self, websocket: WebSocket, event: str, data: Any):
        """Send an event to a specific client."""
        message = json.dumps({"event": event, "data": data})
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.warning(f"WebSocket personal send error: {e}")
            self.disconnect(websocket)

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)


# Global singleton
ws_manager = WebSocketManager()
