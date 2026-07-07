"""
Project Z - Device Sync Service
Core synchronization engine for biometric templates.

Responsibilities:
  - Pull templates from devices → central repository
  - Push templates from central repository → devices
  - Detect new/updated/deleted templates
  - Manage sync status per device
  - Create audit logs for all operations
  - Never block attendance ingestion
"""

import asyncio
import hashlib
import logging
import socket
import time
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.device_sync_log import DeviceSyncLog
from app.models.device_sync_status import DeviceSyncStatus
from app.models.device_user import DeviceUser
from app.models.employee import Employee
from app.models.employee_device_mapping import EmployeeDeviceMapping
from app.models.fingerprint_template import (
    BiometricType,
    FingerprintTemplate,
    SyncStatus,
)
from app.models.user import User

logger = logging.getLogger(__name__)

SDK_TIMEOUT_SECONDS = 5
TCP_PROBE_TIMEOUT = 3


def _check_sdk_port(ip: str, port: int) -> bool:
    """Synchronous TCP port probe. Returns True if port is reachable."""
    try:
        with socket.create_connection((ip, port), timeout=TCP_PROBE_TIMEOUT) as sock:
            return True
    except (ConnectionRefusedError, TimeoutError, OSError):
        return False


def _run_sdk_call(func, *args, **kwargs):
    """Run a synchronous SDK function (blocking call)."""
    return func(*args, **kwargs)


class SyncDirection:
    PUSH = "push"
    PULL = "pull"
    BIDIRECTIONAL = "bidirectional"


class SyncType:
    PUSH_USERS = "push_users"
    PUSH_TEMPLATES = "push_templates"
    PULL_USERS = "pull_users"
    PULL_TEMPLATES = "pull_templates"
    FULL_SYNC = "full_sync"
    PROVISIONING = "provisioning"


class SyncStatusValue:
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class DeviceSyncService:
    """
    Core synchronization engine.

    Handles bidirectional sync of users and templates between
    the central repository and biometric devices.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    # ── PULL: Device → Central Repository ─────────────────────

    async def pull_templates_from_device(
        self,
        device_id: UUID,
        initiated_by: str = "system",
    ) -> DeviceSyncLog:
        """
        Pull ALL fingerprint templates from a device and store centrally.

        This is the core "import" operation. It:
        1. Connects to device via TCP SDK
        2. Reads all templates
        3. For each template, stores in central repository
        4. Creates sync log entry
        """
        device = await self._get_device(device_id)
        log = await self._create_sync_log(
            device_id=device_id,
            sync_type=SyncType.PULL_TEMPLATES,
            direction=SyncDirection.PULL,
            initiated_by=initiated_by,
        )

        start_time = time.monotonic()
        templates_affected = 0
        errors = []

        try:
            from app.services.sdk_service import ZKSDKService

            # Pre-check: is the SDK port reachable?
            ip = device.ip_address
            port = device.sdk_port or 4370
            loop = asyncio.get_event_loop()
            sdk_reachable = await loop.run_in_executor(
                None, _check_sdk_port, ip, port
            )
            if not sdk_reachable:
                raise ConnectionRefusedError(
                    f"SDK port {port} not reachable on {device.name} ({ip})"
                )

            sdk = ZKSDKService(ip=ip, port=port, timeout=SDK_TIMEOUT_SECONDS)

            # Get all templates from device (run sync SDK call in thread pool)
            device_templates = await loop.run_in_executor(
                None, sdk.get_templates
            )
            logger.info(
                f"[Sync] Pulled {len(device_templates)} templates from "
                f"{device.name} ({device.serial_number})"
            )

            # Get users to resolve device_user_id → employee mapping
            device_users = await loop.run_in_executor(
                None, sdk.get_users
            )
            uid_to_user_id = {u["uid"]: u["user_id"] for u in device_users}

            seen_templates: set[tuple] = set()
            for dt in device_templates:
                try:
                    device_user_id = uid_to_user_id.get(dt["uid"], str(dt["uid"]))
                    template_hash = hashlib.sha256(dt["template"]).hexdigest() if dt["template"] else None

                    # Resolve employee_id early so we can use it for lookup
                    employee_id = await self._resolve_employee_id(
                        device_id=device_id,
                        device_user_id=device_user_id,
                    )

                    # Find existing template or create new
                    existing = await self._find_existing_template(
                        device_id=device_id,
                        device_user_id=device_user_id,
                        finger_index=dt["fid"],
                        employee_id=employee_id,
                    )

                    if existing:
                        # Check if template changed
                        if existing.template_hash != template_hash and template_hash:
                            existing.template_data = dt["template"]
                            existing.template_size = dt["size"]
                            existing.template_hash = template_hash
                            existing.template_version += 1
                            existing.sync_status = SyncStatus.SYNCED.value
                            existing.last_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)
                            existing.quality = dt["valid"]
                            templates_affected += 1
                    else:
                        # Check if we already staged this template in this batch
                        dedup_key = (device_id, device_user_id, dt["fid"])
                        if dedup_key in seen_templates:
                            continue
                        seen_templates.add(dedup_key)

                        # New template — add to batch (flushed at end)
                        new_template = FingerprintTemplate(
                            employee_id=employee_id or device_id,
                            device_id=device_id,
                            device_user_id=device_user_id,
                            biometric_type=BiometricType.FINGERPRINT.value,
                            finger_index=dt["fid"],
                            template_data=dt["template"],
                            template_size=dt["size"],
                            template_hash=template_hash,
                            quality=dt["valid"],
                            source_device_id=device.serial_number,
                            sync_status=SyncStatus.SYNCED.value,
                            last_synced_at=datetime.now(timezone.utc).replace(tzinfo=None),
                            is_active=True,
                        )
                        self.session.add(new_template)
                        templates_affected += 1

                except Exception as e:
                    errors.append(f"Template uid={dt['uid']} fid={dt['fid']}: {str(e)}")
                    logger.warning(f"[Sync] Error processing template: {e}")

            # Flush all batched inserts/updates
            await self.session.flush()

            # Update sync status
            await self._update_sync_status(
                device_id=device_id,
                last_pull_at=datetime.now(timezone.utc).replace(tzinfo=None),
                total_templates_stored=templates_affected,
            )

            elapsed_ms = int((time.monotonic() - start_time) * 1000)

            # Complete the log
            log.status = SyncStatusValue.COMPLETED if not errors else SyncStatusValue.PARTIAL
            log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            log.duration_ms = elapsed_ms
            log.templates_affected = templates_affected
            log.errors_count = len(errors)
            if errors:
                log.error_details = {"errors": errors[:100]}  # Cap at 100

            await self.session.flush()

            logger.info(
                f"[Sync] Pull templates complete: {device.name} — "
                f"{templates_affected} templates, {len(errors)} errors, {elapsed_ms}ms"
            )

        except Exception as e:
            log.status = SyncStatusValue.FAILED
            log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            log.duration_ms = int((time.monotonic() - start_time) * 1000)
            log.error_details = {"error": str(e)}
            log.last_error = str(e)
            await self.session.flush()
            logger.error(f"[Sync] Pull templates FAILED for {device.name}: {e}")

        return log

    async def pull_users_from_device(
        self,
        device_id: UUID,
        initiated_by: str = "system",
    ) -> DeviceSyncLog:
        """
        Pull ALL users from a device and sync to device_users table.
        Also pulls templates as part of the user sync.
        """
        device = await self._get_device(device_id)
        log = await self._create_sync_log(
            device_id=device_id,
            sync_type=SyncType.PULL_USERS,
            direction=SyncDirection.PULL,
            initiated_by=initiated_by,
        )

        start_time = time.monotonic()
        users_affected = 0
        errors = []

        try:
            from app.services.sdk_service import ZKSDKService
            from app.services.device_user_sync_service import DeviceUserSyncService

            # Pre-check: is the SDK port reachable?
            ip = device.ip_address
            port = device.sdk_port or 4370
            loop = asyncio.get_event_loop()
            sdk_reachable = await loop.run_in_executor(
                None, _check_sdk_port, ip, port
            )
            if not sdk_reachable:
                raise ConnectionRefusedError(
                    f"SDK port {port} not reachable on {device.name} ({ip})"
                )

            sdk = ZKSDKService(ip=ip, port=port, timeout=SDK_TIMEOUT_SECONDS)

            # Run sync SDK call in thread pool
            device_users = await loop.run_in_executor(
                None, sdk.get_users
            )

            sync_svc = DeviceUserSyncService(self.session)
            sync_result = await sync_svc.sync_device_users(
                device_id=device_id,
                device_users_from_sdk=device_users,
            )

            users_affected = len(sync_result.added) + len(sync_result.updated)
            if sync_result.errors:
                errors = sync_result.errors

            elapsed_ms = int((time.monotonic() - start_time) * 1000)

            log.status = SyncStatusValue.COMPLETED if not errors else SyncStatusValue.PARTIAL
            log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            log.duration_ms = elapsed_ms
            log.users_affected = users_affected
            log.errors_count = len(errors)

            await self._update_sync_status(
                device_id=device_id,
                last_pull_at=datetime.now(timezone.utc).replace(tzinfo=None),
                total_users_on_device=len(device_users),
            )

            await self.session.flush()

            logger.info(
                f"[Sync] Pull users complete: {device.name} — "
                f"{users_affected} users affected, {len(errors)} errors"
            )

        except Exception as e:
            log.status = SyncStatusValue.FAILED
            log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            log.duration_ms = int((time.monotonic() - start_time) * 1000)
            log.error_details = {"error": str(e)}
            await self.session.flush()
            logger.error(f"[Sync] Pull users FAILED for {device.name}: {e}")

        return log

    # ── PUSH: Central Repository → Device ─────────────────────

    async def push_templates_to_device(
        self,
        device_id: UUID,
        employee_ids: Optional[list[UUID]] = None,
        initiated_by: str = "system",
    ) -> DeviceSyncLog:
        """
        Push fingerprint templates FROM central repository TO a device.

        If employee_ids is provided, only push templates for those employees.
        Otherwise, push ALL templates for all active employees.

        This is the core "provisioning" operation that makes employees
        able to scan on a specific device.
        """
        device = await self._get_device(device_id)
        log = await self._create_sync_log(
            device_id=device_id,
            sync_type=SyncType.PUSH_TEMPLATES,
            direction=SyncDirection.PUSH,
            initiated_by=initiated_by,
        )

        start_time = time.monotonic()
        templates_affected = 0
        errors = []

        try:
            # Get templates to push
            templates = await self._get_templates_to_push(device_id, employee_ids)
            if not templates:
                logger.info(f"[Sync] No templates to push to {device.name}")
                log.status = SyncStatusValue.COMPLETED
                log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                log.duration_ms = 0
                log.templates_affected = 0
                await self.session.flush()
                return log

            from app.services.sdk_service import ZKSDKService

            # Pre-check: is the SDK port reachable?
            ip = device.ip_address
            port = device.sdk_port or 4370
            loop = asyncio.get_event_loop()
            sdk_reachable = await loop.run_in_executor(
                None, _check_sdk_port, ip, port
            )
            if not sdk_reachable:
                raise ConnectionRefusedError(
                    f"SDK port {port} not reachable on {device.name} ({ip})"
                )

            sdk = ZKSDKService(ip=ip, port=port, timeout=SDK_TIMEOUT_SECONDS)

            # Resolve device UIDs so templates are associated with the correct user
            device_users_on_device = await loop.run_in_executor(None, sdk.get_users)
            user_id_to_uid = {u["user_id"]: u["uid"] for u in device_users_on_device}
            next_uid = max(user_id_to_uid.values()) + 1 if user_id_to_uid else 1

            logger.info(
                f"[Sync] Pushing {len(templates)} templates to "
                f"{device.name} ({device.serial_number})"
            )

            # Group templates by employee
            by_employee: dict[UUID, list[FingerprintTemplate]] = {}
            for t in templates:
                if t.employee_id not in by_employee:
                    by_employee[t.employee_id] = []
                by_employee[t.employee_id].append(t)

            for emp_id, emp_templates in by_employee.items():
                try:
                    employee = await self.session.get(Employee, emp_id)
                    if not employee:
                        continue

                    du_result = await self.session.execute(
                        select(DeviceUser).where(
                            and_(
                                DeviceUser.device_id == device_id,
                                DeviceUser.employee_id == emp_id,
                            )
                        ).limit(1)
                    )
                    device_user = du_result.scalar_one_or_none()

                    if not device_user:
                        device_user_id = employee.employee_code
                        device_user = DeviceUser(
                            device_id=device_id,
                            device_user_id=device_user_id,
                            name=employee.full_name,
                            privilege=0,
                            employee_id=emp_id,
                            last_synced_at=datetime.now(timezone.utc).replace(tzinfo=None),
                            first_seen_at=datetime.now(timezone.utc).replace(tzinfo=None),
                        )
                        self.session.add(device_user)
                        await self.session.flush()
                    else:
                        device_user_id = device_user.device_user_id

                    # Resolve the device's internal UID for this user
                    device_uid = user_id_to_uid.get(device_user_id)
                    if device_uid is None:
                        # User not on device yet — register with next available UID
                        device_uid = next_uid
                        next_uid += 1
                        await loop.run_in_executor(
                            None,
                            sdk.set_user,
                            device_uid, employee.full_name, 0, "", "", device_user_id,
                        )

                    finger_list = []
                    for t in emp_templates:
                        if t.template_data:
                            finger_list.append({
                                "fid": t.finger_index,
                                "template": t.template_data,
                            })

                    if not finger_list:
                        continue

                    await loop.run_in_executor(
                        None,
                        sdk.save_user_template,
                        device_uid, device_user_id, employee.full_name, finger_list,
                    )

                    for t in emp_templates:
                        t.sync_status = SyncStatus.SYNCED.value
                        t.last_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)
                        templates_affected += 1

                    # Update fingerprint count on DeviceUser
                    if device_user.fingerprint_count != len(emp_templates):
                        device_user.fingerprint_count = len(emp_templates)

                except Exception as e:
                    errors.append(f"Employee {emp_id}: {str(e)}")
                    logger.warning(f"[Sync] Error pushing templates for employee {emp_id}: {e}")

            await self.session.flush()

            # Update sync status
            await self._update_sync_status(
                device_id=device_id,
                last_push_at=datetime.now(timezone.utc).replace(tzinfo=None),
                total_templates_pushed=templates_affected,
            )

            elapsed_ms = int((time.monotonic() - start_time) * 1000)

            log.status = SyncStatusValue.COMPLETED if not errors else SyncStatusValue.PARTIAL
            log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            log.duration_ms = elapsed_ms
            log.templates_affected = templates_affected
            log.errors_count = len(errors)
            if errors:
                log.error_details = {"errors": errors[:100]}

            await self.session.flush()

            logger.info(
                f"[Sync] Push templates complete: {device.name} — "
                f"{templates_affected} templates, {len(errors)} errors, {elapsed_ms}ms"
            )

        except Exception as e:
            log.status = SyncStatusValue.FAILED
            log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            log.duration_ms = int((time.monotonic() - start_time) * 1000)
            log.error_details = {"error": str(e)}
            await self.session.flush()
            logger.error(f"[Sync] Push templates FAILED for {device.name}: {e}")

        return log

    async def push_users_to_device(
        self,
        device_id: UUID,
        employee_ids: Optional[list[UUID]] = None,
        initiated_by: str = "system",
    ) -> DeviceSyncLog:
        """
        Push users FROM central repository TO a device.
        Creates user records on the device for active employees
        that do not already exist on this device.
        """
        device = await self._get_device(device_id)
        log = await self._create_sync_log(
            device_id=device_id,
            sync_type=SyncType.PUSH_USERS,
            direction=SyncDirection.PUSH,
            initiated_by=initiated_by,
        )

        start_time = time.monotonic()
        users_affected = 0
        errors = []

        try:
            employees = await self._get_employees_to_push(device_id, employee_ids)
            if not employees:
                logger.info(f"[Sync] No employees to push to {device.name}")
                log.status = SyncStatusValue.COMPLETED
                log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                log.duration_ms = 0
                log.users_affected = 0
                await self.session.flush()
                return log

            from app.services.sdk_service import ZKSDKService

            ip = device.ip_address
            port = device.sdk_port or 4370
            loop = asyncio.get_event_loop()
            sdk_reachable = await loop.run_in_executor(
                None, _check_sdk_port, ip, port
            )
            if not sdk_reachable:
                raise ConnectionRefusedError(
                    f"SDK port {port} not reachable on {device.name} ({ip})"
                )

            sdk = ZKSDKService(ip=ip, port=port, timeout=SDK_TIMEOUT_SECONDS)

            # Resolve device user UIDs so template sync can use the correct UID
            device_users_on_device = await loop.run_in_executor(None, sdk.get_users)
            user_id_to_uid = {u["user_id"]: u["uid"] for u in device_users_on_device}
            next_uid = max(user_id_to_uid.values()) + 1 if user_id_to_uid else 1

            existing_result = await self.session.execute(
                select(DeviceUser).where(DeviceUser.device_id == device_id)
            )
            all_device_users = existing_result.scalars().all()
            existing_users = {du.employee_id: du for du in all_device_users if du.employee_id}
            existing_uids = {du.device_user_id for du in all_device_users}

            for emp in employees:
                try:
                    device_user_id = emp.employee_code

                    if emp.id in existing_users or device_user_id in existing_uids:
                        continue

                    # Determine UID: reuse existing or allocate next
                    device_uid = user_id_to_uid.get(device_user_id, next_uid)
                    if device_uid == next_uid:
                        next_uid += 1

                    new_du = DeviceUser(
                        device_id=device_id,
                        device_user_id=device_user_id,
                        name=emp.full_name,
                        privilege=0,
                        employee_id=emp.id,
                        last_synced_at=datetime.now(timezone.utc).replace(tzinfo=None),
                        first_seen_at=datetime.now(timezone.utc).replace(tzinfo=None),
                    )
                    self.session.add(new_du)
                    await self.session.flush()
                    existing_uids.add(device_user_id)

                    await loop.run_in_executor(
                        None,
                        sdk.set_user,
                        device_uid, emp.full_name, 0, "", "", device_user_id,
                    )

                    mapping = EmployeeDeviceMapping(
                        employee_id=emp.id,
                        device_id=device_id,
                        device_user_id=device_user_id,
                    )
                    self.session.add(mapping)

                    users_affected += 1

                except Exception as e:
                    errors.append(f"Employee {emp.id}: {str(e)}")

            elapsed_ms = int((time.monotonic() - start_time) * 1000)

            log.status = SyncStatusValue.COMPLETED if not errors else SyncStatusValue.PARTIAL
            log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            log.duration_ms = elapsed_ms
            log.users_affected = users_affected
            log.errors_count = len(errors)

            await self._update_sync_status(
                device_id=device_id,
                last_push_at=datetime.now(timezone.utc).replace(tzinfo=None),
                total_users_synced=users_affected,
            )

            await self.session.flush()

        except Exception as e:
            log.status = SyncStatusValue.FAILED
            log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            log.duration_ms = int((time.monotonic() - start_time) * 1000)
            log.error_details = {"error": str(e)}
            await self.session.flush()
            logger.error(f"[Sync] Push users FAILED for {device.name}: {e}")

        return log

    # ── FULL SYNC ─────────────────────────────────────────────

    async def full_sync_device(
        self,
        device_id: UUID,
        initiated_by: str = "system",
    ) -> DeviceSyncLog:
        """
        Full bidirectional sync: pull from device, then push pending to device.
        """
        device = await self._get_device(device_id)
        log = await self._create_sync_log(
            device_id=device_id,
            sync_type=SyncType.FULL_SYNC,
            direction=SyncDirection.BIDIRECTIONAL,
            initiated_by=initiated_by,
        )

        start_time = time.monotonic()

        try:
            # Step 1: Pull users
            await self.pull_users_from_device(device_id, initiated_by)

            # Step 2: Pull templates
            await self.pull_templates_from_device(device_id, initiated_by)

            # Step 3: Push pending templates
            pending = await self._count_pending_templates(device_id)
            if pending > 0:
                await self.push_templates_to_device(device_id, initiated_by=initiated_by)

            elapsed_ms = int((time.monotonic() - start_time) * 1000)

            log.status = SyncStatusValue.COMPLETED
            log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            log.duration_ms = elapsed_ms
            await self.session.flush()

            # Update sync status
            await self._update_sync_status(
                device_id=device_id,
                last_full_sync_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )

            logger.info(f"[Sync] Full sync complete: {device.name} — {elapsed_ms}ms")

        except Exception as e:
            log.status = SyncStatusValue.FAILED
            log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            log.duration_ms = int((time.monotonic() - start_time) * 1000)
            log.error_details = {"error": str(e)}
            await self.session.flush()
            logger.error(f"[Sync] Full sync FAILED for {device.name}: {e}")

        return log

    # ── SYNC STATUS ───────────────────────────────────────────

    # ── BULK OPERATIONS ──────────────────────────────────────

    async def bulk_sync_all(
        self,
        initiated_by: str = "system",
    ) -> dict:
        """
        Push all active employees and templates to all active devices.
        Returns per-device results.
        """
        device_result = await self.session.execute(
            select(Device).where(and_(
                Device.is_active == True,
                Device.is_online == True,
                Device.ip_address.isnot(None),
            ))
        )
        devices = device_result.scalars().all()

        results = []
        for device in devices:
            did = str(device.id)
            dname = device.name
            try:
                async with self.session.begin_nested():
                    user_log = await self.push_users_to_device(device.id, initiated_by=initiated_by)
                    template_log = await self.push_templates_to_device(device.id, initiated_by=initiated_by)
                results.append({
                    "device_id": did,
                    "device_name": dname,
                    "status": "completed",
                    "users_synced": user_log.users_affected,
                    "templates_synced": template_log.templates_affected,
                })
                await self._broadcast_sync_event(
                    employee_id=None,
                    device_id=device.id,
                    device_name=device.name,
                    employee_name="All Employees",
                    action="bulk_sync",
                    status="success",
                )
            except Exception as e:
                results.append({
                    "device_id": did,
                    "device_name": dname,
                    "status": "failed",
                    "error": str(e),
                })

        await self.session.flush()
        return {
            "total_devices": len(devices),
            "completed": sum(1 for r in results if r["status"] == "completed"),
            "failed": sum(1 for r in results if r["status"] == "failed"),
            "results": results,
        }

    async def bulk_sync_department(
        self,
        department_id: UUID,
        initiated_by: str = "system",
    ) -> dict:
        """Push all employees in a department to all active devices."""
        emp_result = await self.session.execute(
            select(Employee).where(
                and_(Employee.department_id == department_id, Employee.status == "active")
            )
        )
        employees = emp_result.scalars().all()
        employee_ids = [e.id for e in employees]

        device_result = await self.session.execute(
            select(Device).where(and_(
                Device.is_active == True,
                Device.is_online == True,
                Device.ip_address.isnot(None),
            ))
        )
        devices = device_result.scalars().all()

        results = []
        for device in devices:
            did = str(device.id)
            dname = device.name
            try:
                async with self.session.begin_nested():
                    user_log = await self.push_users_to_device(
                        device.id, employee_ids=employee_ids, initiated_by=initiated_by,
                    )
                    template_log = await self.push_templates_to_device(
                        device.id, employee_ids=employee_ids, initiated_by=initiated_by,
                    )
                results.append({
                    "device_id": did,
                    "device_name": dname,
                    "status": "completed",
                    "users_synced": user_log.users_affected,
                    "templates_synced": template_log.templates_affected,
                })
            except Exception as e:
                results.append({
                    "device_id": did,
                    "device_name": dname,
                    "status": "failed",
                    "error": str(e),
                })

        await self.session.flush()
        return {
            "department_id": str(department_id),
            "employee_count": len(employees),
            "total_devices": len(devices),
            "completed": sum(1 for r in results if r["status"] == "completed"),
            "failed": sum(1 for r in results if r["status"] == "failed"),
            "results": results,
        }

    async def bulk_sync_employees(
        self,
        employee_ids: list[UUID],
        initiated_by: str = "system",
    ) -> dict:
        """Push selected employees to all active devices."""
        device_result = await self.session.execute(
            select(Device).where(and_(
                Device.is_active == True,
                Device.is_online == True,
                Device.ip_address.isnot(None),
            ))
        )
        devices = device_result.scalars().all()

        results = []
        for device in devices:
            did = str(device.id)
            dname = device.name
            try:
                async with self.session.begin_nested():
                    user_log = await self.push_users_to_device(
                        device.id, employee_ids=employee_ids, initiated_by=initiated_by,
                    )
                    template_log = await self.push_templates_to_device(
                        device.id, employee_ids=employee_ids, initiated_by=initiated_by,
                    )
                results.append({
                    "device_id": did,
                    "device_name": dname,
                    "status": "completed",
                    "users_synced": user_log.users_affected,
                    "templates_synced": template_log.templates_affected,
                })
            except Exception as e:
                results.append({
                    "device_id": did,
                    "device_name": dname,
                    "status": "failed",
                    "error": str(e),
                })

        await self.session.flush()
        return {
            "employee_count": len(employee_ids),
            "total_devices": len(devices),
            "completed": sum(1 for r in results if r["status"] == "completed"),
            "failed": sum(1 for r in results if r["status"] == "failed"),
            "results": results,
        }

    async def get_pending_syncs(self) -> dict:
        """List all pending/failed sync operations across devices."""
        result = await self.session.execute(
            select(DeviceSyncStatus).where(
                (DeviceSyncStatus.pending_push_users > 0) |
                (DeviceSyncStatus.pending_push_templates > 0) |
                (DeviceSyncStatus.failed_syncs > 0)
            )
        )
        statuses = result.scalars().all()

        pending_devices = []
        for s in statuses:
            device = await self.session.get(Device, s.device_id)
            if device:
                pending_devices.append({
                    "device_id": str(s.device_id),
                    "device_name": device.name,
                    "serial_number": device.serial_number,
                    "is_online": device.is_online,
                    "pending_users": s.pending_push_users,
                    "pending_templates": s.pending_push_templates,
                    "failed_syncs": s.failed_syncs,
                    "last_error": s.last_error,
                    "sync_health": s.sync_health,
                })

        return {
            "total_pending_devices": len(pending_devices),
            "devices": pending_devices,
        }

    async def retry_failed_syncs(
        self,
        initiated_by: str = "system",
    ) -> dict:
        """Retry all failed sync operations."""
        result = await self.session.execute(
            select(DeviceSyncStatus).where(DeviceSyncStatus.failed_syncs > 0)
        )
        statuses = result.scalars().all()

        results = []
        for s in statuses:
            device = await self.session.get(Device, s.device_id)
            if not device or not device.is_online:
                continue
            try:
                await self.push_templates_to_device(device.id, initiated_by=initiated_by)
                s.failed_syncs = 0
                s.last_error = None
                results.append({
                    "device_id": str(device.id),
                    "device_name": device.name,
                    "status": "retried",
                })
            except Exception as e:
                results.append({
                    "device_id": str(device.id),
                    "device_name": device.name,
                    "status": "failed",
                    "error": str(e),
                })

        await self.session.flush()
        return {
            "total_retried": len(results),
            "results": results,
        }

    async def get_employee_sync_matrix(self) -> dict:
        """Get full employee×device sync status matrix."""
        emp_result = await self.session.execute(
            select(Employee).where(Employee.status == "active").order_by(Employee.full_name)
        )
        employees = emp_result.scalars().all()

        device_result = await self.session.execute(
            select(Device).where(Device.is_active == True).order_by(Device.name)
        )
        devices = device_result.scalars().all()

        # Get all device users (employees synced to devices)
        du_result = await self.session.execute(
            select(DeviceUser).where(DeviceUser.employee_id.isnot(None))
        )
        all_device_users = du_result.scalars().all()

        # Build matrix: employee_id -> set of device_ids synced to
        emp_device_map: dict[UUID, set[UUID]] = {}
        for du in all_device_users:
            if du.employee_id not in emp_device_map:
                emp_device_map[du.employee_id] = set()
            emp_device_map[du.employee_id].add(du.device_id)

        # Also include devices where template was enrolled (e.g. before DeviceUser was created)
        template_devices = await self.session.execute(
            select(FingerprintTemplate.device_id, FingerprintTemplate.employee_id)
            .where(FingerprintTemplate.is_active == True)
            .distinct()
        )
        for device_id, emp_id in template_devices:
            if emp_id not in emp_device_map:
                emp_device_map[emp_id] = set()
            emp_device_map[emp_id].add(device_id)

        # Count total templates per employee (any device)
        template_result = await self.session.execute(
            select(FingerprintTemplate.employee_id, func.count(FingerprintTemplate.id).label("count"))
            .where(FingerprintTemplate.is_active == True)
            .group_by(FingerprintTemplate.employee_id)
        )
        template_counts = dict(template_result.all())

        matrix = []
        for emp in employees:
            emp_devices = emp_device_map.get(emp.id, set())
            device_status = []
            for dev in devices:
                if dev.id in emp_devices:
                    device_status.append({
                        "device_id": str(dev.id),
                        "device_name": dev.name,
                        "status": "synced",
                    })
                else:
                    device_status.append({
                        "device_id": str(dev.id),
                        "device_name": dev.name,
                        "status": "not_synced",
                    })

            synced_count = len(emp_devices)
            total_devices = len(devices)
            template_count = template_counts.get(emp.id, 0)

            matrix.append({
                "employee_id": str(emp.id),
                "employee_name": emp.full_name,
                "employee_code": emp.employee_code,
                "department_id": str(emp.department_id) if emp.department_id else None,
                "template_count": template_count,
                "devices_synced": synced_count,
                "total_devices": total_devices,
                "sync_health": (
                    "healthy" if synced_count == total_devices
                    else "degraded" if synced_count > 0
                    else "critical"
                ),
                "device_status": device_status,
            })

        return {
            "employees": matrix,
            "devices": [
                {"device_id": str(d.id), "device_name": d.name, "is_online": d.is_online}
                for d in devices
            ],
            "total_employees": len(employees),
            "total_devices": len(devices),
        }

    async def retry_employee_sync(
        self,
        employee_id: UUID,
        initiated_by: str = "system",
    ) -> dict:
        """Retry sync for a specific employee across all devices."""
        results = await self.push_employee_to_all_devices(employee_id, initiated_by=initiated_by)
        return {
            "employee_id": str(employee_id),
            "results": results,
        }

    async def _broadcast_sync_event(
        self,
        employee_id: Optional[UUID],
        device_id: UUID,
        device_name: str,
        employee_name: str,
        action: str,
        status: str,
    ) -> None:
        """Broadcast a sync event via WebSocket (best-effort)."""
        try:
            from app.services.websocket_service import ws_manager
            await ws_manager.broadcast("sync.event", {
                "employee_id": str(employee_id) if employee_id else None,
                "employee_name": employee_name,
                "device_id": str(device_id),
                "device_name": device_name,
                "action": action,
                "status": status,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass

    # ── SYNC STATUS ───────────────────────────────────────────

    async def get_sync_overview(self) -> dict:
        """Get overall sync status for the dashboard."""
        # Device sync statuses
        result = await self.session.execute(
            select(DeviceSyncStatus).order_by(DeviceSyncStatus.sync_health)
        )
        statuses = result.scalars().all()

        total_devices = len(statuses)
        total_provisioned = sum(1 for s in statuses if s.is_provisioned)
        total_templates = sum(s.total_templates_stored for s in statuses)
        total_pending = sum(s.pending_push_users + s.pending_push_templates for s in statuses)
        total_failed = sum(s.failed_syncs for s in statuses)

        # Recent sync logs
        recent_result = await self.session.execute(
            select(DeviceSyncLog)
            .order_by(DeviceSyncLog.created_at.desc())
            .limit(20)
        )
        recent_logs = recent_result.scalars().all()

        return {
            "total_devices": total_devices,
            "total_provisioned": total_provisioned,
            "total_templates_stored": total_templates,
            "total_pending_sync": total_pending,
            "total_failed_syncs": total_failed,
            "recent_logs": [
                {
                    "id": str(log.id),
                    "device_id": str(log.device_id),
                    "sync_type": log.sync_type,
                    "direction": log.direction,
                    "status": log.status,
                    "duration_ms": log.duration_ms,
                    "users_affected": log.users_affected,
                    "templates_affected": log.templates_affected,
                    "errors_count": log.errors_count,
                    "initiated_by": log.initiated_by,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
                for log in recent_logs
            ],
        }

    async def get_device_sync_status(self, device_id: UUID) -> dict:
        """Get sync status for a single device."""
        result = await self.session.execute(
            select(DeviceSyncStatus).where(DeviceSyncStatus.device_id == device_id)
        )
        status = result.scalar_one_or_none()

        if not status:
            # Create default status
            status = DeviceSyncStatus(device_id=device_id)
            self.session.add(status)
            await self.session.flush()

        return {
            "device_id": str(status.device_id),
            "total_users_on_device": status.total_users_on_device,
            "total_users_synced": status.total_users_synced,
            "total_templates_stored": status.total_templates_stored,
            "total_templates_pushed": status.total_templates_pushed,
            "pending_push_users": status.pending_push_users,
            "pending_push_templates": status.pending_push_templates,
            "failed_syncs": status.failed_syncs,
            "last_full_sync_at": status.last_full_sync_at.isoformat() if status.last_full_sync_at else None,
            "last_push_at": status.last_push_at.isoformat() if status.last_push_at else None,
            "last_pull_at": status.last_pull_at.isoformat() if status.last_pull_at else None,
            "last_error": status.last_error,
            "is_provisioned": status.is_provisioned,
            "provisioned_at": status.provisioned_at.isoformat() if status.provisioned_at else None,
            "sync_health": status.sync_health,
        }

    async def get_employee_sync_status(self, employee_id: UUID) -> dict:
        """Get biometric sync status for a single employee."""
        # Get all templates for this employee
        result = await self.session.execute(
            select(FingerprintTemplate).where(
                and_(
                    FingerprintTemplate.employee_id == employee_id,
                    FingerprintTemplate.is_active == True,
                )
            )
        )
        templates = result.scalars().all()

        # Get device mappings
        mapping_result = await self.session.execute(
            select(EmployeeDeviceMapping).where(
                EmployeeDeviceMapping.employee_id == employee_id
            )
        )
        mappings = mapping_result.scalars().all()

        # Get devices this employee is synced to
        device_ids = set()
        for t in templates:
            device_ids.add(t.device_id)

        # Get all active devices
        device_result = await self.session.execute(
            select(Device).where(Device.is_active == True)
        )
        all_devices = device_result.scalars().all()

        synced_devices = []
        unsynced_devices = []
        for d in all_devices:
            if d.id in device_ids:
                synced_devices.append({
                    "device_id": str(d.id),
                    "name": d.name,
                    "serial_number": d.serial_number,
                })
            else:
                unsynced_devices.append({
                    "device_id": str(d.id),
                    "name": d.name,
                    "serial_number": d.serial_number,
                })

        # Template summary
        template_summary = {}
        for t in templates:
            key = t.biometric_type
            if key not in template_summary:
                template_summary[key] = {"count": 0, "indices": []}
            template_summary[key]["count"] += 1
            template_summary[key]["indices"].append(t.finger_index)

        # Determine sync health
        total_devices = len(all_devices)
        synced_count = len(synced_devices)
        if total_devices == 0:
            sync_health = "unknown"
        elif synced_count == total_devices:
            sync_health = "healthy"
        elif synced_count > 0:
            sync_health = "degraded"
        else:
            sync_health = "critical"

        # Last sync time
        last_sync = None
        for t in templates:
            if t.last_synced_at:
                if last_sync is None or t.last_synced_at > last_sync:
                    last_sync = t.last_synced_at

        return {
            "employee_id": str(employee_id),
            "total_fingerprints": sum(1 for t in templates if t.biometric_type == "fingerprint"),
            "total_templates": len(templates),
            "biometric_summary": template_summary,
            "devices_available_on": synced_devices,
            "devices_not_synced_to": unsynced_devices,
            "total_devices": total_devices,
            "synced_device_count": synced_count,
            "unsynced_device_count": total_devices - synced_count,
            "sync_health": sync_health,
            "last_sync_at": last_sync.isoformat() if last_sync else None,
            "device_mappings": [
                {
                    "device_id": str(m.device_id),
                    "device_user_id": m.device_user_id,
                }
                for m in mappings
            ],
        }

    # ── PRIVATE HELPERS ───────────────────────────────────────

    async def _get_device(self, device_id: UUID) -> Device:
        """Get device by ID or raise."""
        device = await self.session.get(Device, device_id)
        if not device:
            raise ValueError(f"Device {device_id} not found")
        if not device.ip_address:
            raise ValueError(f"Device {device.name} has no IP address")
        return device

    async def _create_sync_log(
        self,
        device_id: UUID,
        sync_type: str,
        direction: str,
        initiated_by: str,
    ) -> DeviceSyncLog:
        """Create a new sync log entry."""
        log = DeviceSyncLog(
            device_id=device_id,
            sync_type=sync_type,
            direction=direction,
            status=SyncStatusValue.RUNNING,
            started_at=datetime.now(timezone.utc).replace(tzinfo=None),
            initiated_by=initiated_by,
        )
        self.session.add(log)
        await self.session.flush()
        return log

    async def _find_existing_template(
        self,
        device_id: UUID,
        device_user_id: str,
        finger_index: int,
        employee_id: Optional[UUID] = None,
    ) -> Optional[FingerprintTemplate]:
        """Find an existing template in the central repository.
        Checks by device_user_id first, then falls back to employee_id match.
        """
        # Primary lookup: by device_user_id
        result = await self.session.execute(
            select(FingerprintTemplate).where(
                and_(
                    FingerprintTemplate.device_id == device_id,
                    FingerprintTemplate.device_user_id == device_user_id,
                    FingerprintTemplate.finger_index == finger_index,
                    FingerprintTemplate.biometric_type == BiometricType.FINGERPRINT.value,
                    FingerprintTemplate.is_active == True,
                )
            ).limit(1)
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        # Fallback: by employee_id (matches the unique constraint)
        # NOTE: device_id intentionally omitted — the unique constraint is
        # on (employee_id, finger_index, biometric_type), so the template
        # may have been synced from a different device.
        if employee_id:
            result = await self.session.execute(
                select(FingerprintTemplate).where(
                    and_(
                        FingerprintTemplate.employee_id == employee_id,
                        FingerprintTemplate.finger_index == finger_index,
                        FingerprintTemplate.biometric_type == BiometricType.FINGERPRINT.value,
                        FingerprintTemplate.is_active == True,
                    )
                ).limit(1)
            )
            return result.scalar_one_or_none()

        return None

    async def _resolve_employee_id(
        self,
        device_id: UUID,
        device_user_id: str,
    ) -> Optional[UUID]:
        """Resolve a device_user_id to an employee_id via mappings."""
        result = await self.session.execute(
            select(EmployeeDeviceMapping.employee_id).where(
                and_(
                    EmployeeDeviceMapping.device_id == device_id,
                    EmployeeDeviceMapping.device_user_id == device_user_id,
                )
            ).limit(1)
        )
        row = result.scalar_one_or_none()
        return row

    async def _get_or_create_device_mapping(
        self,
        employee_id: UUID,
        device_id: UUID,
        device_user_id: str,
    ) -> EmployeeDeviceMapping:
        """Get or create an employee-device mapping."""
        result = await self.session.execute(
            select(EmployeeDeviceMapping).where(
                and_(
                    EmployeeDeviceMapping.employee_id == employee_id,
                    EmployeeDeviceMapping.device_id == device_id,
                )
            ).limit(1)
        )
        mapping = result.scalar_one_or_none()

        if not mapping:
            mapping = EmployeeDeviceMapping(
                employee_id=employee_id,
                device_id=device_id,
                device_user_id=device_user_id,
            )
            self.session.add(mapping)
            await self.session.flush()

        return mapping

    async def _get_templates_to_push(
        self,
        device_id: UUID,
        employee_ids: Optional[list[UUID]] = None,
    ) -> list[FingerprintTemplate]:
        """Get templates that need to be pushed to a device."""
        query = select(FingerprintTemplate).where(
            and_(
                FingerprintTemplate.is_active == True,
                FingerprintTemplate.template_data.isnot(None),
                FingerprintTemplate.template_size > 0,
            )
        )

        if employee_ids:
            query = query.where(FingerprintTemplate.employee_id.in_(employee_ids))

        result = await self.session.execute(query)
        return result.scalars().all()

    async def _get_employees_to_push(
        self,
        device_id: UUID,
        employee_ids: Optional[list[UUID]] = None,
    ) -> list[Employee]:
        """Get employees that need to be pushed to a device."""
        query = select(Employee).where(Employee.status == "active")

        if employee_ids:
            query = query.where(Employee.id.in_(employee_ids))

        result = await self.session.execute(query)
        return result.scalars().all()

    async def _count_pending_templates(self, device_id: UUID) -> int:
        """Count templates pending push to a device."""
        result = await self.session.execute(
            select(func.count()).select_from(FingerprintTemplate).where(
                and_(
                    FingerprintTemplate.is_active == True,
                    FingerprintTemplate.sync_status == SyncStatus.PENDING.value,
                )
            )
        )
        return result.scalar_one() or 0

    async def _update_sync_status(
        self,
        device_id: UUID,
        last_full_sync_at: Optional[datetime] = None,
        last_push_at: Optional[datetime] = None,
        last_pull_at: Optional[datetime] = None,
        total_templates_stored: Optional[int] = None,
        total_templates_pushed: Optional[int] = None,
        total_users_synced: Optional[int] = None,
        total_users_on_device: Optional[int] = None,
    ):
        """Update or create device sync status."""
        # Strip timezone from all datetime values — columns are TIMESTAMP WITHOUT TIME ZONE
        def _strip_tz(dt: Optional[datetime]) -> Optional[datetime]:
            if dt is not None and dt.tzinfo is not None:
                return dt.replace(tzinfo=None)
            return dt

        result = await self.session.execute(
            select(DeviceSyncStatus).where(DeviceSyncStatus.device_id == device_id)
        )
        status = result.scalar_one_or_none()

        if not status:
            status = DeviceSyncStatus(device_id=device_id)
            self.session.add(status)

        if last_full_sync_at:
            status.last_full_sync_at = _strip_tz(last_full_sync_at)
        if last_push_at:
            status.last_push_at = _strip_tz(last_push_at)
        if last_pull_at:
            status.last_pull_at = _strip_tz(last_pull_at)
        if total_templates_stored is not None:
            status.total_templates_stored = total_templates_stored
        if total_templates_pushed is not None:
            status.total_templates_pushed = total_templates_pushed
        if total_users_synced is not None:
            status.total_users_synced = total_users_synced
        if total_users_on_device is not None:
            status.total_users_on_device = total_users_on_device

        # Update sync health
        pending_users = status.pending_push_users or 0
        pending_templates = status.pending_push_templates or 0
        if pending_users > 10 or pending_templates > 10:
            status.sync_health = "critical"
        elif pending_users > 0 or pending_templates > 0:
            status.sync_health = "degraded"
        else:
            status.sync_health = "healthy"

        await self.session.flush()
