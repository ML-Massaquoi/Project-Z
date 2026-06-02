"""
Project Z - WebSocket Endpoint
"""

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.websocket_service import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Wait for client messages with a keepalive timeout
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(), timeout=25
                )
                if data == "ping":
                    await ws_manager.send_personal(websocket, "pong", {})
            except asyncio.TimeoutError:
                # Send server-side keepalive
                try:
                    await ws_manager.send_personal(websocket, "ping", {})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"WebSocket closed: {e}")
    finally:
        ws_manager.disconnect(websocket)
