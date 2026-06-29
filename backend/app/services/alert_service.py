"""
Project Z - Alert Service
Business logic for system alerts: creation, acknowledgement, broadcasting.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_alert import SystemAlert, AlertSeverity, AlertCategory
from app.repositories.alert import AlertRepository
from app.schemas.alert import AlertCreate

logger = logging.getLogger(__name__)


class AlertService:
    """Service for managing system alerts."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = AlertRepository(session)

    async def create_alert(
        self,
        data: AlertCreate,
        broadcast: bool = True,
    ) -> SystemAlert:
        """Create a new system alert and optionally broadcast via WebSocket."""
        expires_at = None
        if data.expires_in_minutes:
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=data.expires_in_minutes)

        alert = await self.repo.create({
            "severity": data.severity,
            "category": data.category,
            "title": data.title,
            "message": data.message,
            "source": data.source,
            "source_id": data.source_id,
            "event_type": data.event_type,
            "metadata": data.metadata,
            "expires_at": expires_at,
        })

        logger.info(
            f"[Alert] Created {data.severity.value} alert [{data.category.value}]: "
            f"{data.title}"
        )

        if broadcast:
            await self._broadcast_alert(alert)

        return alert

    async def acknowledge_alert(
        self,
        alert_id: UUID,
        username: str,
        resolution_note: Optional[str] = None,
    ) -> Optional[SystemAlert]:
        """Acknowledge an alert."""
        alert = await self.repo.acknowledge(alert_id, username, resolution_note)
        if alert:
            logger.info(f"[Alert] Acknowledged by {username}: {alert.title}")
        return alert

    async def acknowledge_all(self, username: str) -> int:
        """Acknowledge all active alerts."""
        count = await self.repo.acknowledge_all(username)
        logger.info(f"[Alert] {username} acknowledged all {count} alerts")
        return count

    async def get_active_alerts(
        self,
        skip: int = 0,
        limit: int = 50,
        severity: Optional[AlertSeverity] = None,
        category: Optional[AlertCategory] = None,
    ) -> tuple[list[SystemAlert], int]:
        """Get active alerts with count."""
        alerts = await self.repo.list_active(
            skip=skip, limit=limit, severity=severity, category=category,
        )
        total = await self.repo.count_active(severity=severity, category=category)
        return alerts, total

    async def get_acknowledged_alerts(
        self,
        skip: int = 0,
        limit: int = 50,
    ) -> list[SystemAlert]:
        """Get acknowledged alert history."""
        return await self.repo.list_acknowledged(skip=skip, limit=limit)

    async def get_stats(self) -> dict:
        """Get alert statistics."""
        return await self.repo.get_stats()

    async def purge_expired(self) -> int:
        """Delete expired alerts."""
        count = await self.repo.purge_expired()
        if count > 0:
            logger.info(f"[Alert] Purged {count} expired alerts")
        return count

    async def _broadcast_alert(self, alert: SystemAlert):
        """Broadcast alert via WebSocket to all connected clients."""
        try:
            from app.services.websocket_service import ws_manager

            alert_data = {
                "id": str(alert.id),
                "severity": alert.severity.value,
                "category": alert.category.value,
                "title": alert.title,
                "message": alert.message,
                "source": alert.source,
                "source_id": alert.source_id,
                "event_type": alert.event_type,
                "metadata": alert.extra,
                "created_at": alert.created_at.isoformat() if alert.created_at else None,
            }

            await ws_manager.broadcast("system_alert", alert_data)
        except Exception as e:
            logger.warning(f"[Alert] Failed to broadcast alert: {e}")


# ── Convenience functions for creating alerts from anywhere ──────

async def create_device_alert(
    session: AsyncSession,
    severity: AlertSeverity,
    title: str,
    message: str,
    device_id: str,
    device_name: str = "",
    extra: Optional[dict] = None,
) -> SystemAlert:
    """Helper to create a device-related alert."""
    service = AlertService(session)
    metadata = {"device_id": device_id, "device_name": device_name}
    if extra:
        metadata.update(extra)

    return await service.create_alert(AlertCreate(
        severity=severity,
        category=AlertCategory.DEVICE,
        title=title,
        message=message,
        source="device_monitor",
        source_id=device_id,
        event_type="device_status",
        metadata=metadata,
    ))


async def create_attendance_alert(
    session: AsyncSession,
    severity: AlertSeverity,
    title: str,
    message: str,
    employee_id: Optional[str] = None,
    extra: Optional[dict] = None,
) -> SystemAlert:
    """Helper to create an attendance-related alert."""
    service = AlertService(session)
    metadata = extra or {}

    return await service.create_alert(AlertCreate(
        severity=severity,
        category=AlertCategory.ATTENDANCE,
        title=title,
        message=message,
        source="attendance_engine",
        source_id=employee_id,
        event_type="attendance_anomaly",
        metadata=metadata,
    ))


async def create_system_alert(
    session: AsyncSession,
    severity: AlertSeverity,
    title: str,
    message: str,
    source: str = "system",
    extra: Optional[dict] = None,
) -> SystemAlert:
    """Helper to create a system-level alert."""
    service = AlertService(session)

    return await service.create_alert(AlertCreate(
        severity=severity,
        category=AlertCategory.SYSTEM,
        title=title,
        message=message,
        source=source,
        event_type="system_event",
        metadata=extra,
    ))
