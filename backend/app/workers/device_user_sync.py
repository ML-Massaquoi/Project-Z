"""
Project Z - Device User Sync Worker
Periodically syncs user records from all online devices.

Runs as an asyncio background task inside the FastAPI lifespan.
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
    """
    from sqlalchemy import select
    from app.models.device import Device
    from app.services.device_user_sync_service import DeviceUserSyncService
    from app.services.sdk_service import ZKSDKService, get_device_lock
    from app.services.websocket_service import ws_manager

    async with db_session_factory() as session:
        result = await session.execute(
            select(Device).where(Device.is_online == True)
        )
        devices = result.scalars().all()

        if not devices:
            return

        logger.info(f"[DeviceUserSync] Syncing {len(devices)} online device(s)")

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

                device_lock = get_device_lock(ip)
                if device_lock.locked():
                    logger.debug(
                        f"[DeviceUserSync] Skipping {device.name} — device lock held"
                    )
                    continue

                # Quick TCP port check
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

                async with device_lock:
                    if ZKSDKService.is_enrollment_active(ip):
                        logger.debug(
                            f"[DeviceUserSync] Skipping {device.name} — enrollment started"
                        )
                        continue
                    sdk = ZKSDKService(ip=ip, port=port, timeout=5)
                    device_users = await loop.run_in_executor(None, sdk.get_users)

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
