"""
Project Z - WebSocket Endpoint
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.core.security import verify_access_token
from app.services.websocket_service import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter()

# Maximum connections per IP to prevent abuse
MAX_CONNECTIONS_PER_IP: int = 5
_ip_connection_counts: dict[str, int] = {}


@router.websocket("/ws-app")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None, description="JWT access token"),
):
    # Authenticate via query parameter token
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return

    payload = verify_access_token(token)
    if not payload:
        await websocket.close(code=4003, reason="Invalid or expired token")
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=4003, reason="Invalid token payload")
        return

    # Rate limit connections per IP
    client_ip = websocket.client.host if websocket.client else "unknown"
    current_count = _ip_connection_counts.get(client_ip, 0)
    if current_count >= MAX_CONNECTIONS_PER_IP:
        await websocket.close(code=4029, reason="Too many connections")
        return
    _ip_connection_counts[client_ip] = current_count + 1

    await ws_manager.connect(websocket)
    logger.info(f"WebSocket connected: user={user_id} ip={client_ip}")
    try:
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(), timeout=30
                )
                if data == "ping":
                    await ws_manager.send_personal(websocket, "pong", {})
            except asyncio.TimeoutError:
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
        _ip_connection_counts[client_ip] = max(0, _ip_connection_counts.get(client_ip, 1) - 1)
        logger.info(f"WebSocket disconnected: user={user_id} ip={client_ip}")
