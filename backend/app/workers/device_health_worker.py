"""
Project Z - Device Health Worker
Periodically probes all active devices via TCP SDK and records health data.
Records status transitions (online/offline/disconnected) with full audit trail.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.metrics import metrics

logger = logging.getLogger(__name__)

WORKER_INTERVAL = 300       # Probe every 5 minutes
INITIAL_DELAY   = 60        # Wait 60s after startup before first probe

# Status thresholds (seconds since last heartbeat)
ONLINE_THRESHOLD = 60       # < 60s = online
OFFLINE_THRESHOLD = 300     # > 5 min = disconnected
# Between 60s and 5 min = offline (warning)


async def run_device_health_worker(
    session_factory: async_sessionmaker,
) -> None:
    """
    Background worker that:
    1. Probes all active devices via TCP SDK every 5 minutes
    2. Records response times and success/failure
    3. Updates device health_status and consecutive_failures
    4. Generates system alerts for critical devices
    5. Records status transitions (online/offline/disconnected)
    """
    logger.info("[DeviceHealthWorker] Starting...")

    # Give the server time to finish startup before hitting device TCP ports
    await asyncio.sleep(INITIAL_DELAY)

    cycle = 0

    while True:
        cycle += 1

        try:
            metrics.update_worker_heartbeat("device_health_worker")

            async with session_factory() as session:
                from app.services.device_health_service import DeviceHealthService
                service = DeviceHealthService(session)

                logger.info(f"[DeviceHealthWorker] Cycle {cycle}: Probing devices...")
                logs = await service.probe_all_active_devices()

                await _check_for_critical_devices(session, logs)
                await _record_status_transitions(session, logs)

                success_count = sum(1 for l in logs if l.check_result.value == "success")
                logger.info(
                    f"[DeviceHealthWorker] Cycle {cycle} complete: "
                    f"{success_count}/{len(logs)} devices healthy"
                )

        except asyncio.CancelledError:
            logger.info("[DeviceHealthWorker] Cancelled, shutting down")
            return
        except Exception as e:
            logger.error(f"[DeviceHealthWorker] Cycle {cycle} error: {e}", exc_info=True)

        await asyncio.sleep(WORKER_INTERVAL)


async def _record_status_transitions(
    session: AsyncSession,
    logs: list,
) -> None:
    """Record status transitions for each probed device."""
    from app.models.device import Device
    from app.services.device_activity_service import record_status_transition

    now = datetime.now(timezone.utc)

    for log_entry in logs:
        device = (await session.execute(
            select(Device).where(Device.id == log_entry.device_id)
        )).scalar_one_or_none()

        if not device:
            continue

        # Determine new status based on last_seen
        if device.last_seen:
            seconds_since = (now - device.last_seen).total_seconds()
            if seconds_since < ONLINE_THRESHOLD:
                new_status = "online"
            elif seconds_since < OFFLINE_THRESHOLD:
                new_status = "offline"
            else:
                new_status = "disconnected"
        else:
            new_status = "offline"

        # Override based on probe result
        if log_entry.check_result.value == "success":
            new_status = "online"
        elif log_entry.check_result.value in ("timeout", "connection_refused"):
            new_status = "disconnected"

        await record_status_transition(
            device_id=device.id,
            new_status=new_status,
            ip_address=device.ip_address,
            firmware_version=device.firmware_version,
            device_name=device.name,
            reason=f"health_probe: {log_entry.check_result.value}",
            db=session,
        )

        # Also log the health probe as an activity
        from app.services.device_activity_service import log_device_activity
        await log_device_activity(
            device_id=device.id,
            activity_type="health_probe",
            details={
                "result": log_entry.check_result.value,
                "response_time_ms": log_entry.response_time_ms,
                "error_message": log_entry.error_message,
            },
            ip_address=device.ip_address,
            db=session,
        )

    await session.flush()


async def _check_for_critical_devices(
    session: AsyncSession,
    logs: list,
) -> None:
    """Generate system alerts for devices with 3+ consecutive failures."""
    from app.models.device import Device
    from app.models.system_alert import SystemAlert, AlertSeverity
    from app.services.alert_service import create_device_alert

    result = await session.execute(
        select(Device).where(
            and_(
                Device.is_active == True,
                Device.consecutive_failures >= 3,
            )
        )
    )
    critical_devices = result.scalars().all()

    for device in critical_devices:
        # Deduplicate: only alert once per 30 minutes per device
        recent_cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
        existing = await session.execute(
            select(func.count()).select_from(SystemAlert).where(
                and_(
                    SystemAlert.source_id == str(device.id),
                    SystemAlert.event_type == "device_health_critical",
                    SystemAlert.created_at >= recent_cutoff,
                )
            )
        )
        if existing.scalar_one() > 0:
            continue

        await create_device_alert(
            session=session,
            severity=AlertSeverity.WARNING,
            title=f"Device Health Degraded: {device.name or device.serial_number}",
            message=(
                f"Device '{device.name or device.serial_number}' at {device.ip_address} "
                f"has failed {device.consecutive_failures} consecutive health checks. "
                f"Current status: {device.health_status}."
            ),
            device_id=str(device.id),
            device_name=device.name or device.serial_number,
            extra={
                "consecutive_failures": device.consecutive_failures,
                "health_status": device.health_status,
                "avg_response_time_ms": device.avg_response_time_ms,
            },
        )
