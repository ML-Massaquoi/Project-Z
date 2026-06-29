"""
Offline Sync Worker.

Background worker that monitors device online/offline status
and automatically processes queued sync operations when devices
come back online.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.database.session import async_session_factory
from app.models.device import Device
from app.services.offline_sync_service import OfflineSyncService

logger = logging.getLogger(__name__)

OFFLINE_SYNC_INTERVAL = 60  # Check every 60 seconds
OFFLINE_SYNC_INITIAL_DELAY = 30  # Start 30s after startup


async def offline_sync_worker():
    """
    Background worker that processes pending sync operations
    for devices that come back online.
    """
    logger.info(
        "[OfflineSyncWorker] Starting offline sync worker "
        f"(interval={OFFLINE_SYNC_INTERVAL}s, initial_delay={OFFLINE_SYNC_INITIAL_DELAY}s)"
    )

    # Wait before starting to let the system initialize
    await asyncio.sleep(OFFLINE_SYNC_INITIAL_DELAY)

    while True:
        try:
            async with async_session_factory() as session:
                # Find all devices with pending sync operations
                from app.models.offline_sync_queue import OfflineSyncQueue, QueueStatus

                svc = OfflineSyncService(session)

                pending_devices = await session.execute(
                    select(OfflineSyncQueue.device_id).where(
                        OfflineSyncQueue.status == QueueStatus.PENDING.value
                    ).distinct()
                )
                device_ids = [row[0] for row in pending_devices.all()]

                if device_ids:
                    logger.debug(f"[OfflineSyncWorker] Found {len(device_ids)} devices with pending sync")

                    for device_id in device_ids:
                        # Check if device is online
                        device = await session.get(Device, device_id)
                        if device and device.is_online:
                            logger.info(
                                f"[OfflineSyncWorker] Device {device.name} ({device.ip_address}) "
                                "is online, processing pending sync operations"
                            )
                            result = await svc.process_pending_for_device(device_id)
                            if result["processed"] > 0:
                                logger.info(
                                    f"[OfflineSyncWorker] Device {device.name}: "
                                    f"processed={result['processed']}, "
                                    f"succeeded={result['succeeded']}, "
                                    f"failed={result['failed']}"
                                )
                            await session.commit()
                        else:
                            logger.debug(f"[OfflineSyncWorker] Device {device_id} still offline, skipping")

                # Expire old items
                expired = await svc.expire_old_items(max_age_hours=48)
                if expired > 0:
                    logger.info(f"[OfflineSyncWorker] Expired {expired} old queue items")
                    await session.commit()

        except Exception as e:
            logger.error(f"[OfflineSyncWorker] Error in offline sync worker: {e}", exc_info=True)

        await asyncio.sleep(OFFLINE_SYNC_INTERVAL)
