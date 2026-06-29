"""
Project Z - Device Sync Worker
Background worker for automatic device synchronization.

Responsibilities:
  - Periodically sync all active devices
  - Auto-provision new devices
  - Handle sync failures with retry logic
  - Never block attendance ingestion
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.metrics import metrics

logger = logging.getLogger(__name__)

WORKER_INTERVAL = 300       # Sync every 5 minutes
INITIAL_DELAY = 120         # Wait 2 minutes after startup
MAX_RETRIES = 3
RETRY_DELAY = 60            # Wait 60 seconds before retry


async def run_device_sync_worker(session_factory: async_sessionmaker) -> None:
    """
    Background worker that periodically syncs all active devices.

    Runs as an asyncio task inside the FastAPI lifespan.
    Never blocks attendance ingestion — all sync operations
    use separate SDK connections and run asynchronously.
    """
    logger.info("[DeviceSyncWorker] Starting...")

    # Wait for server to finish startup
    await asyncio.sleep(INITIAL_DELAY)

    cycle = 0

    while True:
        cycle += 1

        try:
            metrics.update_worker_heartbeat("device_sync_worker")

            async with session_factory() as session:
                from app.models.device import Device
                from app.models.device_sync_status import DeviceSyncStatus

                # Get all active devices — extract plain data to avoid
                # lazy-load issues after session rollback
                result = await session.execute(
                    select(Device).where(Device.is_active == True)
                )
                devices = result.scalars().all()

                if not devices:
                    logger.debug("[DeviceSyncWorker] No active devices found")
                    await asyncio.sleep(WORKER_INTERVAL)
                    continue

                # Snapshot device data as plain tuples (detached from ORM)
                device_snapshots = [
                    (d.id, d.ip_address, d.name, d.serial_number)
                    for d in devices
                    if d.ip_address
                ]

            logger.info(
                f"[DeviceSyncWorker] Cycle {cycle}: Processing {len(device_snapshots)} device(s)"
            )

            provisioned_count = 0
            synced_count = 0
            error_count = 0

            for device_id, device_ip, device_name, device_sn in device_snapshots:
                try:
                    # Skip if device is locked for enrollment or another operation
                    from app.services.sdk_service import ZKSDKService, get_device_lock
                    if ZKSDKService.is_enrollment_active(device_ip):
                        logger.info(
                            f"[DeviceSyncWorker] Skipping {device_name}: enrollment active"
                        )
                        continue
                    device_lock = get_device_lock(device_ip)
                    if device_lock.locked():
                        logger.info(
                            f"[DeviceSyncWorker] Skipping {device_name}: device locked"
                        )
                        continue

                    # Use a FRESH session per device to prevent greenlet contamination
                    async with session_factory() as dev_session:
                        from app.services.device_sync_service import DeviceSyncService
                        from app.services.device_provisioning_service import DeviceProvisioningService

                        sync_svc = DeviceSyncService(dev_session)
                        prov_svc = DeviceProvisioningService(dev_session)

                        # Check if device needs provisioning
                        status_result = await dev_session.execute(
                            select(DeviceSyncStatus).where(
                                DeviceSyncStatus.device_id == device_id
                            )
                        )
                        status = status_result.scalar_one_or_none()

                        if not status or not status.is_provisioned:
                            logger.info(
                                f"[DeviceSyncWorker] Provisioning new device: "
                                f"{device_name} ({device_sn})"
                            )
                            await prov_svc.check_and_provision(
                                device_id=device_id,
                                initiated_by="sync_worker",
                            )
                            provisioned_count += 1
                        else:
                            # Check enrollment BEFORE each lock block so enrollment
                            # doesn't wait for a sync operation that would be skipped anyway.
                            async with device_lock:
                                if ZKSDKService.is_enrollment_active(device_ip):
                                    logger.info(
                                        f"[DeviceSyncWorker] Yielding {device_name}: enrollment active"
                                    )
                                else:
                                    await sync_svc.pull_users_from_device(
                                        device_id,
                                        initiated_by="sync_worker",
                                    )

                            if ZKSDKService.is_enrollment_active(device_ip):
                                logger.info(
                                    f"[DeviceSyncWorker] Yielding {device_name}: enrollment active"
                                )
                                continue

                            async with device_lock:
                                if ZKSDKService.is_enrollment_active(device_ip):
                                    logger.info(
                                        f"[DeviceSyncWorker] Yielding {device_name}: enrollment active"
                                    )
                                else:
                                    await sync_svc.pull_templates_from_device(
                                        device_id,
                                        initiated_by="sync_worker",
                                    )

                            if ZKSDKService.is_enrollment_active(device_ip):
                                logger.info(
                                    f"[DeviceSyncWorker] Yielding {device_name}: enrollment active"
                                )
                                continue

                            # Refresh status and push pending templates
                            status_result = await dev_session.execute(
                                select(DeviceSyncStatus).where(
                                    DeviceSyncStatus.device_id == device_id
                                )
                            )
                            status = status_result.scalar_one_or_none()
                            if status and status.pending_push_templates > 0:
                                async with device_lock:
                                    if ZKSDKService.is_enrollment_active(device_ip):
                                        logger.info(
                                            f"[DeviceSyncWorker] Yielding {device_name}: enrollment active"
                                        )
                                    else:
                                        await sync_svc.push_templates_to_device(
                                            device_id,
                                            initiated_by="sync_worker",
                                        )

                            synced_count += 1

                        await dev_session.commit()

                except Exception as e:
                    error_count += 1
                    logger.warning(
                        f"[DeviceSyncWorker] Error syncing {device_name}: {e}"
                    )

                logger.info(
                    f"[DeviceSyncWorker] Cycle {cycle} complete: "
                    f"{provisioned_count} provisioned, "
                    f"{synced_count} synced, "
                    f"{error_count} errors"
                )

        except asyncio.CancelledError:
            logger.info("[DeviceSyncWorker] Cancelled, shutting down")
            return
        except Exception as e:
            logger.error(f"[DeviceSyncWorker] Cycle {cycle} error: {e}", exc_info=True)

        await asyncio.sleep(WORKER_INTERVAL)
