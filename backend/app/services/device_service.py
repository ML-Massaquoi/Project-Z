"""
Project Z - Device Service
Device lifecycle management with structured operational logging.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.repositories.device import DeviceRepository
from app.services.websocket_service import ws_manager

logger = logging.getLogger(__name__)

# Devices are considered offline if not seen within this window
OFFLINE_THRESHOLD_MINUTES = 5


class DeviceService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = DeviceRepository(session)

    async def handle_device_connection(
        self, serial_number: str, ip_address: Optional[str] = None
    ):
        """Handle device connection — auto-register if new, update last_seen."""
        device = await self.repo.get_by_serial(serial_number)

        if not device:
            logger.info(
                f"\n"
                f"{'='*60}\n"
                f"[DEVICE CONNECTED]\n"
                f"  Device Name: Device {serial_number}\n"
                f"  SN: {serial_number}\n"
                f"  IP: {ip_address or 'Unknown'}\n"
                f"  Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"  Status: AUTO-REGISTERED (new device)\n"
                f"{'='*60}"
            )
            device = await self.repo.auto_register(serial_number, ip_address)
            await ws_manager.broadcast("device.registered", {
                "device_id": str(device.id),
                "serial_number": serial_number,
                "ip_address": ip_address,
            })
        else:
            was_offline = not device.is_online
            device = await self.repo.update_last_seen(serial_number, ip_address)

            if was_offline:
                logger.info(
                    f"\n"
                    f"{'='*60}\n"
                    f"[DEVICE RECONNECTED]\n"
                    f"  Device Name: {device.name}\n"
                    f"  SN: {serial_number}\n"
                    f"  IP: {ip_address or device.ip_address}\n"
                    f"  Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}\n"
                    f"  Status: Online\n"
                    f"{'='*60}"
                )
                await ws_manager.broadcast("device_status_update", {
                    "device_id": str(device.id),
                    "serial_number": serial_number,
                    "device_name": device.name or f"Device {serial_number}",
                    "status": "online",
                    "ip_address": ip_address or device.ip_address,
                    "office_name": "Unassigned",
                    "department_name": "Unassigned",
                })
            else:
                logger.debug(
                    f"[HEARTBEAT] SN={serial_number} IP={ip_address} Status=Online"
                )

        return device

    async def mark_stale_devices_offline(self) -> int:
        """
        Mark devices as offline if they haven't been seen within the threshold.
        Returns the number of devices marked offline.
        Called periodically (e.g. every minute) from a background task.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=OFFLINE_THRESHOLD_MINUTES)
        result = await self.session.execute(
            update(Device)
            .where(Device.is_online == True)
            .where(Device.last_seen < cutoff)
            .values(is_online=False)
            .returning(Device.serial_number, Device.name, Device.last_seen)
        )
        await self.session.flush()
        rows = result.all()

        for sn, name, last_seen in rows:
            logger.warning(
                f"\n"
                f"{'='*60}\n"
                f"[DEVICE DISCONNECTED]\n"
                f"  Device Name: {name}\n"
                f"  SN: {sn}\n"
                f"  Last Seen: {last_seen.strftime('%Y-%m-%d %H:%M:%S') if last_seen else 'Unknown'}\n"
                f"  Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"  Status: Offline (no heartbeat for {OFFLINE_THRESHOLD_MINUTES}m)\n"
                f"{'='*60}"
            )
            await ws_manager.broadcast("device_status_update", {
                "serial_number": sn,
                "device_name": name,
                "status": "offline",
            })

        return len(rows)
