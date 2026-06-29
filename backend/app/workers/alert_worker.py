"""
Project Z - Alert Worker
Background tasks for system alert management:
  - Purge expired alerts every 15 minutes
  - Generate system health alerts (device offline, high failure rate)
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.device import Device
from app.models.scan_event import ScanEvent, ProcessingStatusV2
from app.models.system_alert import SystemAlert, AlertSeverity
from app.services.alert_service import AlertService, create_device_alert, create_system_alert
from app.core.metrics import metrics

logger = logging.getLogger(__name__)

WORKER_INTERVAL = 300  # 5 minutes
PURGE_INTERVAL = 900   # 15 minutes


async def run_alert_worker(
    session_factory: async_sessionmaker,
) -> None:
    """
    Background worker that:
    1. Purges expired alerts
    2. Monitors device health and generates alerts
    3. Monitors attendance processing failures
    """
    logger.info("[AlertWorker] Starting...")

    last_purge = datetime.min.replace(tzinfo=timezone.utc)
    cycle = 0

    while True:
        cycle += 1
        now = datetime.now(timezone.utc)

        try:
            # Record heartbeat
            metrics.update_worker_heartbeat("alert_worker")

            async with session_factory() as session:
                if (now - last_purge).total_seconds() >= PURGE_INTERVAL:
                    service = AlertService(session)
                    purged = await service.purge_expired()
                    if purged > 0:
                        logger.info(f"[AlertWorker] Purged {purged} expired alerts")
                    last_purge = now

                await _check_device_health(session)
                await _check_attendance_failures(session)
                await session.commit()

        except asyncio.CancelledError:
            logger.info("[AlertWorker] Cancelled, shutting down")
            return
        except Exception as e:
            logger.error(f"[AlertWorker] Cycle {cycle} error: {e}", exc_info=True)

        await asyncio.sleep(WORKER_INTERVAL)


async def _check_device_health(session: AsyncSession):
    """Check for devices that have gone offline and generate alerts."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    result = await session.execute(
        select(Device).where(
            and_(
                Device.is_online == True,
                Device.last_seen < cutoff,
            )
        )
    )
    stale_devices = result.scalars().all()

    if not stale_devices:
        return

    for device in stale_devices:
        recent_cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
        existing = await session.execute(
            select(func.count()).select_from(SystemAlert).where(
                and_(
                    SystemAlert.source_id == str(device.id),
                    SystemAlert.event_type == "device_offline",
                    SystemAlert.created_at >= recent_cutoff,
                )
            )
        )
        if existing.scalar_one() > 0:
            continue

        await create_device_alert(
            session=session,
            severity=AlertSeverity.WARNING,
            title=f"Device Offline: {device.name or device.serial_number}",
            message=(
                f"Device '{device.name or device.serial_number}' at {device.ip_address} "
                f"has not communicated since "
                f"{device.last_seen.strftime('%H:%M UTC') if device.last_seen else 'unknown'}."
            ),
            device_id=str(device.id),
            device_name=device.name or device.serial_number,
            extra={
                "ip_address": device.ip_address,
                "office_id": str(device.office_id) if device.office_id else None,
            },
        )


async def _check_attendance_failures(session: AsyncSession):
    """Check for high attendance processing failure rates."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    result = await session.execute(
        select(func.count()).select_from(ScanEvent).where(
            and_(
                ScanEvent.processing_status == ProcessingStatusV2.FAILED_PERMANENT,
                ScanEvent.created_at >= cutoff,
            )
        )
    )
    failed_count = result.scalar_one()

    if failed_count < 5:
        return

    recent_cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    existing = await session.execute(
        select(func.count()).select_from(SystemAlert).where(
            and_(
                SystemAlert.event_type == "high_failure_rate",
                SystemAlert.created_at >= recent_cutoff,
            )
        )
    )
    if existing.scalar_one() > 0:
        return

    await create_system_alert(
        session=session,
        severity=AlertSeverity.CRITICAL,
        title="High Attendance Processing Failure Rate",
        message=(
            f"{failed_count} attendance scans failed permanently in the last 10 minutes. "
            f"Investigate attendance worker logs."
        ),
        source="alert_worker",
        extra={"failed_count": failed_count, "window_minutes": 10},
    )
