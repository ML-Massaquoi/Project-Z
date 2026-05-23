"""
Project Z - Device Service
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
            logger.info(f"Auto-registering new device: {serial_number}")
            device = await self.repo.auto_register(serial_number, ip_address)
            await ws_manager.broadcast("device.registered", {
                "device_id": str(device.id),
                "serial_number": serial_number,
                "ip_address": ip_address,
            })
        else:
            device = await self.repo.update_last_seen(serial_number, ip_address)

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
            .returning(Device.serial_number)
        )
        await self.session.flush()
        serials = result.scalars().all()

        for sn in serials:
            logger.info(f"Device {sn} marked offline (no heartbeat for {OFFLINE_THRESHOLD_MINUTES}m)")
            await ws_manager.broadcast("device.status", {
                "serial_number": sn,
                "status": "offline",
            })

        return len(serials)
