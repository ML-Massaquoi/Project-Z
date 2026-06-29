"""
Device Activity Logging Service.

Centralized service for logging all device activities:
heartbeats, data pushes, restarts, user changes, etc.
Also handles device status transitions with history tracking.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import async_session_factory
from app.models.device import Device
from app.models.device_status_history import DeviceStatusHistory
from app.models.device_activity_log import DeviceActivityLog

logger = logging.getLogger(__name__)


async def log_device_activity(
    device_id: UUID,
    activity_type: str,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """
    Log a device activity event.
    Creates an immutable record in device_activity_logs.
    Broadcasts via WebSocket for real-time monitoring.
    """
    async def _insert(session: AsyncSession):
        log = DeviceActivityLog(
            device_id=device_id,
            activity_type=activity_type,
            details=details,
            ip_address=ip_address,
            created_at=datetime.now(timezone.utc),
        )
        session.add(log)

    if db:
        await _insert(db)
    else:
        async with async_session_factory() as session:
            await _insert(session)
            await session.commit()

    # Broadcast for real-time monitoring (non-blocking, best-effort)
    try:
        from app.services.websocket_service import ws_manager
        await ws_manager.broadcast("device.activity", {
            "device_id": str(device_id),
            "activity_type": activity_type,
            "details": details,
            "ip_address": ip_address,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass  # WebSocket broadcast is best-effort


async def record_status_transition(
    device_id: UUID,
    new_status: str,
    ip_address: Optional[str] = None,
    firmware_version: Optional[str] = None,
    device_name: Optional[str] = None,
    reason: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """
    Record a device status transition.
    Only records if the status actually changed from the last recorded status.
    """
    async def _check_and_record(session: AsyncSession):
        # Get the last recorded status
        last = (await session.execute(
            select(DeviceStatusHistory)
            .where(DeviceStatusHistory.device_id == device_id)
            .order_by(DeviceStatusHistory.recorded_at.desc())
            .limit(1)
        )).scalar_one_or_none()

        # Skip if status hasn't changed
        if last and last.status == new_status:
            return

        record = DeviceStatusHistory(
            device_id=device_id,
            status=new_status,
            ip_address=ip_address,
            firmware_version=firmware_version,
            device_name=device_name,
            reason=reason,
            recorded_at=datetime.now(timezone.utc),
        )
        session.add(record)
        logger.info(f"Device {device_id} status: {last.status if last else 'unknown'} → {new_status}")

    if db:
        await _check_and_record(db)
    else:
        async with async_session_factory() as session:
            await _check_and_record(session)
            await session.commit()

    # Broadcast status change for real-time monitoring
    try:
        from app.services.websocket_service import ws_manager
        await ws_manager.broadcast("device.status_change", {
            "device_id": str(device_id),
            "new_status": new_status,
            "ip_address": ip_address,
            "device_name": device_name,
            "reason": reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass  # WebSocket broadcast is best-effort


async def get_device_status_history(
    device_id: UUID,
    hours: int = 24,
    limit: int = 100,
) -> list[dict]:
    """Get status transition history for a device."""
    async with async_session_factory() as session:
        from datetime import timedelta
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        result = await session.execute(
            select(DeviceStatusHistory)
            .where(and_(
                DeviceStatusHistory.device_id == device_id,
                DeviceStatusHistory.recorded_at >= since,
            ))
            .order_by(DeviceStatusHistory.recorded_at.desc())
            .limit(limit)
        )
        return [
            {
                "id": str(r.id),
                "status": r.status,
                "ip_address": r.ip_address,
                "firmware_version": r.firmware_version,
                "device_name": r.device_name,
                "reason": r.reason,
                "recorded_at": r.recorded_at.isoformat(),
            }
            for r in result.scalars().all()
        ]


async def get_device_activity_logs(
    device_id: UUID,
    activity_type: Optional[str] = None,
    hours: int = 24,
    limit: int = 100,
) -> list[dict]:
    """Get activity logs for a device."""
    async with async_session_factory() as session:
        from datetime import timedelta
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        query = (
            select(DeviceActivityLog)
            .where(and_(
                DeviceActivityLog.device_id == device_id,
                DeviceActivityLog.created_at >= since,
            ))
            .order_by(DeviceActivityLog.created_at.desc())
            .limit(limit)
        )
        if activity_type:
            query = query.where(DeviceActivityLog.activity_type == activity_type)

        result = await session.execute(query)
        return [
            {
                "id": str(r.id),
                "activity_type": r.activity_type,
                "details": r.details,
                "ip_address": r.ip_address,
                "created_at": r.created_at.isoformat(),
            }
            for r in result.scalars().all()
        ]


async def get_fleet_activity_summary(hours: int = 24) -> dict:
    """Get fleet-wide activity summary for dashboard."""
    async with async_session_factory() as session:
        from datetime import timedelta
        from sqlalchemy import func
        since = datetime.now(timezone.utc) - timedelta(hours=hours)

        # Activity counts by type
        result = await session.execute(
            select(
                DeviceActivityLog.activity_type,
                func.count(DeviceActivityLog.id),
            )
            .where(DeviceActivityLog.created_at >= since)
            .group_by(DeviceActivityLog.activity_type)
        )
        activity_counts = {row[0]: row[1] for row in result.all()}

        # Recent activity (last 20)
        recent = await session.execute(
            select(DeviceActivityLog)
            .order_by(DeviceActivityLog.created_at.desc())
            .limit(20)
        )
        recent_items = [
            {
                "id": str(r.id),
                "device_id": str(r.device_id),
                "activity_type": r.activity_type,
                "details": r.details,
                "ip_address": r.ip_address,
                "created_at": r.created_at.isoformat(),
            }
            for r in recent.scalars().all()
        ]

        return {
            "activity_counts": activity_counts,
            "recent_activity": recent_items,
            "period_hours": hours,
        }
