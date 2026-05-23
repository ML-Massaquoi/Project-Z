"""
Project Z - WebSocket Service
Connection management and event broadcasting.
"""

import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections and broadcasts events."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(
            f"WebSocket connected. Total connections: {len(self.active_connections)}"
        )

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(
            f"WebSocket disconnected. Total connections: {len(self.active_connections)}"
        )

    async def broadcast(self, event: str, data: Any):
        """Broadcast an event to all connected clients."""
        message = json.dumps({"event": event, "data": data})
        disconnected = []

        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.warning(f"WebSocket send error: {e}")
                disconnected.append(connection)

        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn)

    async def send_personal(self, websocket: WebSocket, event: str, data: Any):
        """Send an event to a specific client."""
        message = json.dumps({"event": event, "data": data})
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.warning(f"WebSocket personal send error: {e}")

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)


# Global singleton
ws_manager = WebSocketManager()
