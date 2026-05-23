"""
Project Z - Device Repository
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.repositories.base import BaseRepository


class DeviceRepository(BaseRepository[Device]):
    def __init__(self, session: AsyncSession):
        super().__init__(Device, session)

    async def get_by_serial(self, serial_number: str) -> Optional[Device]:
        """Find device by serial number."""
        result = await self.session.execute(
            select(Device).where(Device.serial_number == serial_number)
        )
        return result.scalar_one_or_none()

    async def update_last_seen(
        self, serial_number: str, ip_address: Optional[str] = None
    ) -> Optional[Device]:
        """Update device last_seen timestamp and set online."""
        values = {
            "last_seen": datetime.now(timezone.utc),
            "is_online": True,
        }
        if ip_address:
            values["ip_address"] = ip_address

        await self.session.execute(
            update(Device)
            .where(Device.serial_number == serial_number)
            .values(**values)
        )
        await self.session.flush()
        return await self.get_by_serial(serial_number)

    async def auto_register(
        self, serial_number: str, ip_address: Optional[str] = None
    ) -> Device:
        """Auto-register a new device when it first connects."""
        device = Device(
            serial_number=serial_number,
            name=f"Device {serial_number}",
            ip_address=ip_address,
            is_online=True,
            last_seen=datetime.now(timezone.utc),
            last_activity="Auto-registered via ADMS",
        )
        self.session.add(device)
        await self.session.flush()
        await self.session.refresh(device)
        return device

    async def count_online(self) -> int:
        """Count online devices."""
        result = await self.session.execute(
            select(func.count())
            .select_from(Device)
            .where(Device.is_online == True)
        )
        return result.scalar_one()

    async def count_active(self) -> int:
        """Count active devices."""
        result = await self.session.execute(
            select(func.count())
            .select_from(Device)
            .where(Device.is_active == True)
        )
        return result.scalar_one()
