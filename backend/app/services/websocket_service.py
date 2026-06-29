"""
Project Z - WebSocket Service
Connection management and event broadcasting via Redis pub/sub.

Uses Redis as the message bus so broadcasts work correctly even when
uvicorn --reload restarts the worker process.

Events are also stored in Redis Streams for replay on reconnection.
"""

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Redis pub/sub channel for real-time broadcasts
REDIS_CHANNEL = "projectz:ws_events"

# Redis Stream for event replay (stores last 1000 events)
REDIS_STREAM = "projectz:ws_events_stream"
REDIS_STREAM_MAX_LEN = 1000

# Event ID counter key
EVENT_COUNTER_KEY = "projectz:ws_event_counter"


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
        Also stores event in Redis Stream for replay on reconnection.
        Falls back to direct broadcast if Redis is unavailable.
        """
        redis = await self._get_redis()
        event_payload = {"event": event, "data": data}
        message = json.dumps(event_payload)

        if redis:
            try:
                # Store in Redis Stream for replay
                event_id = await redis.incr(EVENT_COUNTER_KEY)
                stream_entry = {
                    "event_id": str(event_id),
                    "event": event,
                    "data": json.dumps(data),
                    "timestamp": str(time.time()),
                }
                await redis.xadd(
                    REDIS_STREAM,
                    stream_entry,
                    maxlen=REDIS_STREAM_MAX_LEN,
                )

                # Publish for real-time delivery
                await redis.publish(REDIS_CHANNEL, message)
                return
            except Exception as e:
                logger.warning(f"Redis publish failed, using direct broadcast: {e}")

        # Fallback: direct broadcast to local connections
        await self._broadcast_local(message)

    async def replay_events(self, after_event_id: str | None = None, limit: int = 100) -> list[dict]:
        """
        Replay events from Redis Stream after a given event ID.
        Used for WebSocket reconnection recovery.
        """
        redis = await self._get_redis()
        if not redis:
            return []

        try:
            if after_event_id:
                # Read events after the given ID
                entries = await redis.xrange(
                    REDIS_STREAM,
                    min=f"({after_event_id}",
                    max="+",
                    count=limit,
                )
            else:
                # Read last N events
                entries = await redis.xrevrange(
                    REDIS_STREAM,
                    max="+",
                    min="-",
                    count=limit,
                )

            events = []
            for entry_id, fields in entries:
                events.append({
                    "event_id": fields.get("event_id", entry_id),
                    "event": fields.get("event"),
                    "data": json.loads(fields.get("data", "{}")),
                    "timestamp": fields.get("timestamp"),
                })
            return list(reversed(events))  # Return in chronological order
        except Exception as e:
            logger.error(f"Event replay failed: {e}")
            return []

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
