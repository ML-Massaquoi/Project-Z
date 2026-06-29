"""
Fingerprint Replication Engine.

Detects new biometric enrollments on devices and replicates them
to the central database and other assigned devices.
"""

import asyncio
import logging
import socket
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.device_status_history import DeviceStatusHistory
from app.models.employee import Employee
from app.models.employee_enrollment_history import EmployeeEnrollmentHistory
from app.models.fingerprint_template import BiometricType, FingerprintTemplate, SyncStatus
from app.models.offline_sync_queue import OfflineSyncQueue, QueueStatus, SyncOperation
from app.services.sdk_service import ZKSDKService

logger = logging.getLogger(__name__)

SDK_TIMEOUT_SECONDS = 5
TCP_PROBE_TIMEOUT = 3


def _check_sdk_port(ip: str, port: int) -> bool:
    """Synchronous TCP port probe. Returns True if port is reachable."""
    try:
        with socket.create_connection((ip, port), timeout=TCP_PROBE_TIMEOUT):
            return True
    except (ConnectionRefusedError, TimeoutError, OSError):
        return False


class FingerprintReplicationEngine:
    """
    Core engine for detecting and replicating biometric enrollments.

    Flow:
    1. Detect new enrollment (via heartbeat, scan event, or manual trigger)
    2. Pull template from device
    3. Store in central database
    4. Push to all other assigned devices
    5. Record audit trail
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def detect_and_replicate(
        self,
        source_device_id: UUID,
        employee_code: str,
        fingerprint_id: int,
        initiated_by: str = "scan_event",
    ) -> dict:
        """
        Detect a new enrollment on a device and replicate it.
        Returns operation result.
        """
        logger.info(
            f"[Replication] Detecting enrollment: device={source_device_id} "
            f"employee={employee_code} fp_id={fingerprint_id}"
        )

        # 1. Find source device
        source_device = await self.session.get(Device, source_device_id)
        if not source_device:
            return {"status": "error", "message": "Source device not found"}

        # 2. Find employee
        emp_result = await self.session.execute(
            select(Employee).where(Employee.employee_code == employee_code)
        )
        employee = emp_result.scalar_one_or_none()
        if not employee:
            return {"status": "error", "message": f"Employee {employee_code} not found in system"}

        # 3. Pull template from source device
        template_data = await self._pull_template_from_device(
            source_device, employee_code, fingerprint_id
        )
        if not template_data:
            return {"status": "error", "message": "Failed to pull template from device"}

        # 4. Store/update in central database
        template_record = await self._store_template(
            employee_id=employee.id,
            source_device_id=source_device_id,
            fingerprint_id=fingerprint_id,
            template_data=template_data,
            initiated_by=initiated_by,
        )

        # 5. Push to all other assigned devices
        push_results = await self._push_to_assigned_devices(
            employee_code=employee_code,
            fingerprint_id=fingerprint_id,
            template_data=template_data,
            exclude_device_id=source_device_id,
            initiated_by=initiated_by,
        )

        # 6. Record enrollment history
        await self._record_enrollment(
            employee_id=employee.id,
            source_device_id=source_device_id,
            fingerprint_id=fingerprint_id,
            template_size=len(template_data),
            initiated_by=initiated_by,
            push_results=push_results,
        )

        succeeded = sum(1 for r in push_results.values() if r.get("status") == "success")
        failed = sum(1 for r in push_results.values() if r.get("status") != "success")

        result = {
            "status": "success",
            "employee_code": employee_code,
            "source_device": source_device.name,
            "template_size": len(template_data),
            "push_results": push_results,
            "pushed_to": succeeded,
            "failed": failed,
        }

        logger.info(
            f"[Replication] Completed: {employee_code} from {source_device.name} "
            f"→ pushed to {succeeded} devices, {failed} failed"
        )

        return result

    async def replicate_all_for_employee(
        self,
        employee_code: str,
        target_device_ids: list[UUID],
        initiated_by: str = "bulk_sync",
    ) -> dict:
        """
        Replicate all fingerprints for an employee to specified devices.
        Used during initial device provisioning or manual sync.
        """
        emp_result = await self.session.execute(
            select(Employee).where(Employee.employee_code == employee_code)
        )
        employee = emp_result.scalar_one_or_none()
        if not employee:
            return {"status": "error", "message": "Employee not found"}

        # Get all central templates for this employee
        templates_result = await self.session.execute(
            select(FingerprintTemplate).where(
                and_(
                    FingerprintTemplate.employee_id == employee.id,
                    FingerprintTemplate.is_active == True,
                )
            )
        )
        templates = templates_result.scalars().all()

        if not templates:
            return {"status": "error", "message": "No templates in central database"}

        results = {}
        for template in templates:
            template_data = template.template_data
            if not template_data:
                continue

            for device_id in target_device_ids:
                device = await self.session.get(Device, device_id)
                if not device or not device.is_online:
                    continue

                push_result = await self._push_template_to_device(
                    device, employee_code, template.fingerprint_id, template_data
                )

                device_key = str(device_id)
                if device_key not in results:
                    results[device_key] = {"success": 0, "failed": 0}

                if push_result.get("status") == "success":
                    results[device_key]["success"] += 1
                else:
                    results[device_key]["failed"] += 1

        return {
            "status": "success",
            "employee_code": employee_code,
            "templates_replicated": len(templates),
            "target_devices": len(target_device_ids),
            "results": results,
        }

    async def sync_device_to_central(
        self,
        device_id: UUID,
        initiated_by: str = "device_sync",
    ) -> dict:
        """
        Pull all templates from a device and store in central database.
        Used during initial device provisioning.
        """
        device = await self.session.get(Device, device_id)
        if not device:
            return {"status": "error", "message": "Device not found"}

        ip = device.ip_address
        port = device.sdk_port or 4370
        loop = asyncio.get_event_loop()

        # Pre-check SDK port
        sdk_reachable = await loop.run_in_executor(None, _check_sdk_port, ip, port)
        if not sdk_reachable:
            return {"status": "error", "message": f"SDK port {port} not reachable on {device.name}"}

        zk = ZKSDKService(ip=ip, port=port, timeout=SDK_TIMEOUT_SECONDS)

        connected = await loop.run_in_executor(None, zk.connect)
        if not connected:
            return {"status": "error", "message": "Cannot connect to device"}

        try:
            users = await loop.run_in_executor(None, zk.get_users)
            total_users = len(users)
            total_templates = 0
            stored_templates = 0

            for user in users:
                user_id = str(user["uid"])
                user_name = user.get("name", "")

                templates = await loop.run_in_executor(
                    None, zk.get_user_template, user["uid"]
                )
                if templates:
                    for tpl in templates:
                        total_templates += 1
                        template_bytes = tpl.template
                        if not template_bytes:
                            continue

                        # Check if already exists
                        emp_result = await self.session.execute(
                            select(Employee).where(Employee.employee_code == user_id)
                        )
                        employee = emp_result.scalar_one_or_none()
                        if not employee:
                            continue

                        existing = await self.session.execute(
                            select(FingerprintTemplate).where(
                                and_(
                                    FingerprintTemplate.employee_id == employee.id,
                                    FingerprintTemplate.fingerprint_id == tpl.fid,
                                    FingerprintTemplate.source_device_id == device_id,
                                )
                            )
                        )
                        if existing.scalar_one_or_none():
                            continue

                        template_record = FingerprintTemplate(
                            employee_id=employee.id,
                            fingerprint_id=tpl.fid,
                            biometric_type=BiometricType.FINGERPRINT.value,
                            template_data=template_bytes,
                            template_size=len(template_bytes),
                            template_version=1,
                            sync_status=SyncStatus.SYNCED.value,
                            source_device_id=device_id,
                            is_active=True,
                        )
                        self.session.add(template_record)
                        stored_templates += 1

            await self.session.flush()

            return {
                "status": "success",
                "device": device.name,
                "total_users": total_users,
                "total_templates": total_templates,
                "stored_templates": stored_templates,
            }

        finally:
            zk.disconnect()

    # ── Private Helpers ──────────────────────────────────────

    async def _pull_template_from_device(
        self,
        device: Device,
        employee_code: str,
        fingerprint_id: int,
    ) -> Optional[bytes]:
        """Pull a specific template from a device."""
        ip = device.ip_address
        port = device.sdk_port or 4370
        loop = asyncio.get_event_loop()

        # Pre-check SDK port
        sdk_reachable = await loop.run_in_executor(None, _check_sdk_port, ip, port)
        if not sdk_reachable:
            return None

        zk = ZKSDKService(ip=ip, port=port, timeout=SDK_TIMEOUT_SECONDS)

        connected = await loop.run_in_executor(None, zk.connect)
        if not connected:
            return None

        try:
            # Convert employee_code to device UID
            try:
                uid = int(employee_code)
            except ValueError:
                return None

            template = await loop.run_in_executor(
                None, zk.get_user_template, uid, fingerprint_id
            )
            if template is None:
                return None
            return template.get("template")
        finally:
            zk.disconnect()

    async def _store_template(
        self,
        employee_id: UUID,
        source_device_id: UUID,
        fingerprint_id: int,
        template_data: bytes,
        initiated_by: str,
    ) -> FingerprintTemplate:
        """Store or update a template in the central database."""
        # Check for existing template
        existing = await self.session.execute(
            select(FingerprintTemplate).where(
                and_(
                    FingerprintTemplate.employee_id == employee_id,
                    FingerprintTemplate.fingerprint_id == fingerprint_id,
                    FingerprintTemplate.source_device_id == source_device_id,
                )
            )
        )
        template = existing.scalar_one_or_none()

        if template:
            # Update if template changed
            import hashlib
            new_hash = hashlib.sha256(template_data).hexdigest()
            if template.template_hash != new_hash:
                template.template_data = template_data
                template.template_size = len(template_data)
                template.template_hash = new_hash
                template.template_version = (template.template_version or 0) + 1
                template.sync_status = SyncStatus.SYNCED.value
                template.last_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)
                logger.info(f"[Replication] Updated template {fingerprint_id} for employee {employee_id}")
        else:
            import hashlib
            template = FingerprintTemplate(
                employee_id=employee_id,
                fingerprint_id=fingerprint_id,
                biometric_type=BiometricType.FINGERPRINT.value,
                template_data=template_data,
                template_size=len(template_data),
                template_hash=hashlib.sha256(template_data).hexdigest(),
                template_version=1,
                sync_status=SyncStatus.SYNCED.value,
                source_device_id=source_device_id,
                is_active=True,
            )
            self.session.add(template)
            logger.info(f"[Replication] Stored new template {fingerprint_id} for employee {employee_id}")

        await self.session.flush()
        return template

    async def _push_to_assigned_devices(
        self,
        employee_code: str,
        fingerprint_id: int,
        template_data: bytes,
        exclude_device_id: UUID,
        initiated_by: str,
    ) -> dict:
        """Push template to all devices except the source."""
        from app.models.employee_device_assignment import EmployeeDeviceAssignment

        # Find assigned devices
        emp_result = await self.session.execute(
            select(Employee).where(Employee.employee_code == employee_code)
        )
        employee = emp_result.scalar_one_or_none()
        if not employee:
            return {}

        assignments_result = await self.session.execute(
            select(EmployeeDeviceAssignment).where(
                EmployeeDeviceAssignment.employee_id == employee.id
            )
        )
        assignments = assignments_result.scalars().all()

        results = {}
        for assignment in assignments:
            if assignment.device_id == exclude_device_id:
                continue

            device = await self.session.get(Device, assignment.device_id)
            if not device or not device.is_online:
                results[str(assignment.device_id)] = {
                    "status": "offline",
                    "device": device.name if device else "Unknown",
                }
                # Queue for later
                queue = OfflineSyncQueue(
                    device_id=assignment.device_id,
                    employee_id=employee.id,
                    operation=SyncOperation.PUSH_TEMPLATE.value,
                    status=QueueStatus.PENDING.value,
                    payload={"fingerprint_id": fingerprint_id},
                    initiated_by=initiated_by,
                )
                self.session.add(queue)
                continue

            push_result = await self._push_template_to_device(
                device, employee_code, fingerprint_id, template_data
            )
            results[str(assignment.device_id)] = push_result

        await self.session.flush()
        return results

    async def _push_template_to_device(
        self,
        device: Device,
        employee_code: str,
        fingerprint_id: int,
        template_data: bytes,
    ) -> dict:
        """Push a single template to a device."""
        ip = device.ip_address
        port = device.sdk_port or 4370
        loop = asyncio.get_event_loop()

        # Pre-check SDK port
        sdk_reachable = await loop.run_in_executor(None, _check_sdk_port, ip, port)
        if not sdk_reachable:
            return {"status": "offline", "device": device.name}

        zk = ZKSDKService(ip=ip, port=port, timeout=SDK_TIMEOUT_SECONDS)

        connected = await loop.run_in_executor(None, zk.connect)
        if not connected:
            return {"status": "offline", "device": device.name}

        try:
            result = await loop.run_in_executor(
                None,
                zk.save_user_template_from_bytes,
                employee_code, fingerprint_id, template_data,
            )
            return {
                "status": "success" if result else "failed",
                "device": device.name,
                "device_ip": device.ip_address,
            }
        except Exception as e:
            return {"status": "error", "device": device.name, "error": str(e)}
        finally:
            zk.disconnect()

    async def _record_enrollment(
        self,
        employee_id: UUID,
        source_device_id: UUID,
        fingerprint_id: int,
        template_size: int,
        initiated_by: str,
        push_results: dict,
    ):
        """Record enrollment in audit trail."""
        history = EmployeeEnrollmentHistory(
            employee_id=employee_id,
            device_user_id=str(employee_id),
            enrollment_type="fingerprint",
            action="enrolled",
            device_id=source_device_id,
            details={"fingerprint_id": fingerprint_id, "template_size": template_size},
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        self.session.add(history)

        # Record device activity
        from app.models.device_activity_log import DeviceActivityLog

        activity = DeviceActivityLog(
            device_id=source_device_id,
            activity_type="template_sync",
            details={
                "employee_id": str(employee_id),
                "fingerprint_id": fingerprint_id,
                "initiated_by": initiated_by,
                "push_results": push_results,
            },
        )
        self.session.add(activity)

        await self.session.flush()
