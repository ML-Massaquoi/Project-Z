"""
Project Z - WebSocket Endpoint
Handles real-time WebSocket connections for the dashboard.
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.websocket_service import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handle WebSocket connections for real-time updates."""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, receive any client messages
            data = await websocket.receive_text()
            # Clients can send ping/pong or subscribe to specific rooms
            if data == "ping":
                await ws_manager.send_personal(websocket, "pong", {})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        logger.info("WebSocket client disconnected")
    except Exception as e:
        ws_manager.disconnect(websocket)
        logger.error(f"WebSocket error: {e}")
