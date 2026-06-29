"""
Project Z - Device Provisioning Service
Automatically provisions new devices with users and templates.

When a new device comes online:
1. Detect it's not provisioned
2. Pull any existing data from it
3. Push all active employees and their templates
4. Mark as provisioned
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.device_sync_status import DeviceSyncStatus
from app.models.employee import Employee
from app.models.fingerprint_template import FingerprintTemplate, BiometricType, SyncStatus
from app.services.device_sync_service import DeviceSyncService

logger = logging.getLogger(__name__)


class DeviceProvisioningService:
    """
    Handles automatic provisioning of new devices.

    When a device connects for the first time (or after being unprovisioned),
    this service pushes all active employees and their templates to it.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def check_and_provision(
        self,
        device_id: UUID,
        initiated_by: str = "system",
    ) -> Optional[dict]:
        """
        Check if a device needs provisioning and provision it if so.

        Returns provisioning result dict or None if no provisioning needed.
        """
        device = await self.session.get(Device, device_id)
        if not device:
            return None

        # Check if already provisioned
        status = await self._get_sync_status(device_id)
        if status and status.is_provisioned:
            logger.debug(f"[Provisioning] Device {device.name} already provisioned")
            return None

        logger.info(
            f"\n"
            f"{'='*60}\n"
            f"[DEVICE PROVISIONING STARTED]\n"
            f"  Device: {device.name}\n"
            f"  SN: {device.serial_number}\n"
            f"  IP: {device.ip_address}\n"
            f"  Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"{'='*60}"
        )

        result = await self.provision_device(device_id, initiated_by)
        return result

    async def provision_device(
        self,
        device_id: UUID,
        initiated_by: str = "system",
    ) -> dict:
        """
        Fully provision a device:
        1. Pull existing users/templates from device
        2. Push all active employees and templates to device
        3. Mark as provisioned
        """
        device = await self.session.get(Device, device_id)
        if not device:
            raise ValueError(f"Device {device_id} not found")

        sync_svc = DeviceSyncService(self.session)
        device_name = device.name
        device_sn = device.serial_number
        results = {
            "device_id": str(device_id),
            "device_name": device_name,
            "serial_number": device_sn,
            "steps": [],
        }

        try:
            # Step 1: Pull existing data from device
            logger.info(f"[Provisioning] Step 1: Pulling existing data from {device_name}")
            pull_log = await sync_svc.pull_users_from_device(device_id, initiated_by)
            results["steps"].append({
                "step": "pull_users",
                "status": pull_log.status,
                "users_affected": pull_log.users_affected,
            })

            # Step 2: Pull templates
            pull_tpl_log = await sync_svc.pull_templates_from_device(device_id, initiated_by)
            results["steps"].append({
                "step": "pull_templates",
                "status": pull_tpl_log.status,
                "templates_affected": pull_tpl_log.templates_affected,
            })

            # Step 3: Push all active employees
            logger.info(f"[Provisioning] Step 2: Pushing all active employees to {device_name}")
            push_users_log = await sync_svc.push_users_to_device(device_id, initiated_by=initiated_by)
            results["steps"].append({
                "step": "push_users",
                "status": push_users_log.status,
                "users_affected": push_users_log.users_affected,
            })

            # Step 4: Push all templates
            logger.info(f"[Provisioning] Step 3: Pushing all templates to {device_name}")
            push_tpl_log = await sync_svc.push_templates_to_device(device_id, initiated_by=initiated_by)
            results["steps"].append({
                "step": "push_templates",
                "status": push_tpl_log.status,
                "templates_affected": push_tpl_log.templates_affected,
            })

            # Step 5: Mark as provisioned
            status = await self._get_sync_status(device_id)
            if not status:
                status = DeviceSyncStatus(device_id=device_id)
                self.session.add(status)

            now = datetime.now(timezone.utc).replace(tzinfo=None)
            status.is_provisioned = True
            status.provisioned_at = now
            status.last_full_sync_at = now
            status.sync_health = "healthy"

            # Update device
            device.is_provisioned = True
            device.provisioned_at = now
            device.last_sync_at = now

            await self.session.flush()

            results["status"] = "completed"
            results["provisioned_at"] = now.isoformat()

            logger.info(
                f"\n"
                f"{'='*60}\n"
                f"[DEVICE PROVISIONING COMPLETE]\n"
                f"  Device: {device_name}\n"
                f"  SN: {device_sn}\n"
                f"  Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"{'='*60}"
            )

        except Exception as e:
            results["status"] = "failed"
            results["error"] = str(e)
            logger.error(f"[Provisioning] FAILED for {device_name}: {e}")

        return results

    async def re_provision_device(
        self,
        device_id: UUID,
        initiated_by: str = "system",
    ) -> dict:
        """
        Force re-provision a device.
        Clears the provisioned flag and re-runs provisioning.
        """
        status = await self._get_sync_status(device_id)
        if status:
            status.is_provisioned = False
            await self.session.flush()

        device = await self.session.get(Device, device_id)
        if device:
            device.is_provisioned = False
            await self.session.flush()

        return await self.provision_device(device_id, initiated_by)

    async def push_employee_to_all_devices(
        self,
        employee_id: UUID,
        initiated_by: str = "system",
    ) -> list[dict]:
        """
        Push a single employee's templates to ALL active devices.
        """
        # Get all active devices
        result = await self.session.execute(
            select(Device).where(Device.is_active == True)
        )
        devices = result.scalars().all()

        results = []
        sync_svc = DeviceSyncService(self.session)

        for device in devices:
            try:
                log = await sync_svc.push_templates_to_device(
                    device_id=device.id,
                    employee_ids=[employee_id],
                    initiated_by=initiated_by,
                )
                results.append({
                    "device_id": str(device.id),
                    "device_name": device.name,
                    "status": log.status,
                    "templates_affected": log.templates_affected,
                    "errors": log.errors_count,
                })
            except Exception as e:
                results.append({
                    "device_id": str(device.id),
                    "device_name": device.name,
                    "status": "failed",
                    "error": str(e),
                })

        return results

    async def push_employee_to_device(
        self,
        employee_id: UUID,
        device_id: UUID,
        initiated_by: str = "system",
    ) -> dict:
        """
        Push a single employee's templates to a specific device.
        """
        sync_svc = DeviceSyncService(self.session)
        log = await sync_svc.push_templates_to_device(
            device_id=device_id,
            employee_ids=[employee_id],
            initiated_by=initiated_by,
        )

        return {
            "device_id": str(device_id),
            "employee_id": str(employee_id),
            "status": log.status,
            "templates_affected": log.templates_affected,
            "errors": log.errors_count,
            "duration_ms": log.duration_ms,
        }

    async def _get_sync_status(self, device_id: UUID) -> Optional[DeviceSyncStatus]:
        """Get device sync status."""
        result = await self.session.execute(
            select(DeviceSyncStatus).where(DeviceSyncStatus.device_id == device_id)
        )
        return result.scalar_one_or_none()
