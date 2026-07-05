"""
Project Z - Device User Sync Worker
Periodically syncs user records from all online devices.

Uses DeviceQueueManager for SDK access — this ensures the single-TCP-connection
constraint is respected across all device communication.

Sync interval: 5 minutes (configurable).
"""

import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

SYNC_INTERVAL_SECONDS = 300  # 5 minutes


async def sync_all_devices(db_session_factory) -> None:
    """
    Single sync pass: iterate all online devices, fetch users via SDK, sync to DB.
    Uses DeviceQueueManager for exclusive SDK access.
    """
    from sqlalchemy import select
    from app.models.device import Device
    from app.services.device_user_sync_service import DeviceUserSyncService
    from app.services.sdk_service import ZKSDKService
    from app.services.device_queue_manager import (
        DeviceQueueManager,
        JobPriority,
    )
    from app.services.websocket_service import ws_manager

    async with db_session_factory() as session:
        result = await session.execute(
            select(Device).where(Device.is_online == True)
        )
        devices = result.scalars().all()

        if not devices:
            return

        logger.info(f"[DeviceUserSync] Syncing {len(devices)} online device(s)")

        manager = await DeviceQueueManager.get_instance()

        for device in devices:
            if not device.ip_address:
                continue

            try:
                import socket
                ip = device.ip_address
                port = device.sdk_port or 4370

                # Skip if enrollment is active on this device
                if ZKSDKService.is_enrollment_active(ip):
                    logger.debug(
                        f"[DeviceUserSync] Skipping {device.name} — enrollment active"
                    )
                    continue

                # Quick TCP port check before enqueuing
                def _check_port():
                    try:
                        with socket.create_connection((ip, port), timeout=3):
                            return True
                    except (ConnectionRefusedError, TimeoutError, OSError):
                        return False

                loop = asyncio.get_event_loop()
                sdk_ok = await loop.run_in_executor(None, _check_port)
                if not sdk_ok:
                    logger.debug(
                        f"[DeviceUserSync] Skipping {device.name} — SDK port closed"
                    )
                    continue

                # Check if worker is busy with higher-priority job
                worker = manager._workers.get(ip)
                if worker and worker.state.value == "busy" and worker.current_job:
                    if worker.current_job.priority >= JobPriority.SYNC_USERS:
                        logger.debug(
                            f"[DeviceUserSync] Skipping {device.name} — "
                            f"worker busy with {worker.current_job.job_type}"
                        )
                        continue

                # Enqueue a get_users job and wait for the result
                job = await manager.enqueue(
                    device_ip=ip,
                    priority=JobPriority.DOWNLOAD_USER,
                    job_type="get_users",
                    payload={"source": "device_user_sync"},
                )

                try:
                    device_users = await job.wait_for_result(timeout=30.0)
                except asyncio.TimeoutError:
                    logger.warning(
                        f"[DeviceUserSync] Timeout fetching users from {device.name}"
                    )
                    continue

                if isinstance(device_users, Exception):
                    logger.warning(
                        f"[DeviceUserSync] Error fetching users from "
                        f"{device.name}: {device_users}"
                    )
                    continue

                if not device_users:
                    continue

                svc = DeviceUserSyncService(session)
                sync_result = await svc.sync_device_users(
                    device_id=device.id,
                    device_users_from_sdk=device_users,
                )

                if sync_result.added or sync_result.removed or sync_result.mapped:
                    await ws_manager.broadcast("device_users_synced", {
                        "device_id": str(device.id),
                        "device_name": device.name,
                        "added": len(sync_result.added),
                        "updated": len(sync_result.updated),
                        "removed": len(sync_result.removed),
                        "mapped": len(sync_result.mapped),
                        "total": sync_result.total_on_device,
                    })

            except Exception as e:
                logger.warning(
                    f"[DeviceUserSync] Failed to sync device "
                    f"{device.name} ({device.serial_number}): {e}"
                )

        await session.commit()


async def run_device_user_sync_worker(db_session_factory) -> None:
    """
    Background loop: runs sync_all_devices every SYNC_INTERVAL_SECONDS.
    """
    logger.info("[DeviceUserSync] Starting device user sync worker")

    while True:
        try:
            await asyncio.sleep(SYNC_INTERVAL_SECONDS)
            await sync_all_devices(db_session_factory)
        except asyncio.CancelledError:
            logger.info("[DeviceUserSync] Worker cancelled")
            break
        except Exception as e:
            logger.error(f"[DeviceUserSync] Worker error: {e}", exc_info=True)
            await asyncio.sleep(30)
