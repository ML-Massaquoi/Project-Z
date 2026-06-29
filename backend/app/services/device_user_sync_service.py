"""
Project Z - Device User Sync Service
Synchronizes user records from biometric devices via TCP SDK.

Operations:
  - Read users from device via pyzk
  - Store/update/delete in device_users table
  - Detect new users, deleted users, updated users
  - Auto-map to existing employees when possible
  - Publish WebSocket events for changes
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.device_user import DeviceUser
from app.models.employee import Employee
from app.models.employee_device_mapping import EmployeeDeviceMapping

logger = logging.getLogger(__name__)


class DeviceUserSyncResult:
    """Result of a device user sync operation."""

    def __init__(self):
        self.added: list[dict] = []
        self.updated: list[dict] = []
        self.removed: list[dict] = []
        self.mapped: list[dict] = []
        self.errors: list[str] = []
        self.total_on_device: int = 0
        self.total_in_db: int = 0


class DeviceUserSyncService:
    """
    Syncs user records from biometric devices.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def sync_device_users(
        self,
        device_id: UUID,
        device_users_from_sdk: list[dict],
    ) -> DeviceUserSyncResult:
        """
        Sync users from a device into the device_users table.

        Args:
            device_id: The device UUID
            device_users_from_sdk: List of user dicts from pyzk SDK
                Each dict has: user_id, name, privilege, uid

        Returns:
            DeviceUserSyncResult with changes
        """
        result = DeviceUserSyncResult()
        result.total_on_device = len(device_users_from_sdk)
        now = datetime.now(timezone.utc)

        # Get existing device users from DB
        existing_result = await self.session.execute(
            select(DeviceUser).where(DeviceUser.device_id == device_id)
        )
        existing_users = {
            du.device_user_id: du
            for du in existing_result.scalars().all()
        }
        result.total_in_db = len(existing_users)

        device_user_ids_on_device = set()

        for sdk_user in device_users_from_sdk:
            uid = str(sdk_user.get("user_id", ""))
            name = sdk_user.get("name", "")
            privilege = sdk_user.get("privilege", 0)

            if not uid:
                continue

            device_user_ids_on_device.add(uid)

            existing = existing_users.get(uid)

            if existing is None:
                # NEW user on device
                new_du = DeviceUser(
                    device_id=device_id,
                    device_user_id=uid,
                    name=name,
                    privilege=privilege,
                    last_synced_at=now,
                    first_seen_at=now,
                    raw_data=sdk_user,
                )
                self.session.add(new_du)
                await self.session.flush()

                result.added.append({
                    "device_user_id": uid,
                    "name": name,
                })

                logger.info(
                    f"[DeviceSync] NEW user | device={device_id} "
                    f"user_id={uid} name={name}"
                )

            else:
                # EXISTING user — check for changes
                needs_update = False
                updates = {}

                if existing.name != name:
                    updates["name"] = name
                    needs_update = True

                if existing.privilege != privilege:
                    updates["privilege"] = privilege
                    needs_update = True

                if needs_update:
                    updates["last_synced_at"] = now
                    updates["raw_data"] = sdk_user
                    await self.session.execute(
                        select(DeviceUser)
                        .where(DeviceUser.id == existing.id)
                        .with_for_update()
                    )
                    for key, value in updates.items():
                        setattr(existing, key, value)
                    await self.session.flush()

                    result.updated.append({
                        "device_user_id": uid,
                        "name": name,
                        "changes": list(updates.keys()),
                    })

                    logger.info(
                        f"[DeviceSync] UPDATED user | device={device_id} "
                        f"user_id={uid} changes={list(updates.keys())}"
                    )
                else:
                    # Just update last_synced_at
                    existing.last_synced_at = now
                    await self.session.flush()

        # Detect removed users (on DB but not on device)
        for uid, existing in existing_users.items():
            if uid not in device_user_ids_on_device:
                # Try to auto-map to employee before removing
                employee = await self._try_auto_map(existing)

                result.removed.append({
                    "device_user_id": uid,
                    "name": existing.name,
                    "mapped_to_employee": str(employee.full_name) if employee else None,
                })

                logger.info(
                    f"[DeviceSync] REMOVED user | device={device_id} "
                    f"user_id={uid} name={existing.name}"
                )

                # Delete the device user record
                await self.session.delete(existing)
                await self.session.flush()

        # Try to auto-map new unmapped users to existing employees
        for sdk_user in device_users_from_sdk:
            uid = str(sdk_user.get("user_id", ""))
            if not uid:
                continue

            # Check if already mapped
            existing_du_result = await self.session.execute(
                select(DeviceUser).where(
                    and_(
                        DeviceUser.device_id == device_id,
                        DeviceUser.device_user_id == uid,
                    )
                )
            )
            existing_du = existing_du_result.scalar_one_or_none()
            if existing_du and existing_du.employee_id is None:
                employee = await self._try_auto_map(existing_du)
                if employee:
                    result.mapped.append({
                        "device_user_id": uid,
                        "employee_name": employee.full_name,
                        "employee_code": employee.employee_code,
                    })

        await self.session.flush()

        logger.info(
            f"\n"
            f"[DEVICE SYNC COMPLETE]\n"
            f"  Device: {device_id}\n"
            f"  Total on Device: {result.total_on_device}\n"
            f"  Total in DB: {result.total_in_db}\n"
            f"  Added: {len(result.added)}\n"
            f"  Updated: {len(result.updated)}\n"
            f"  Removed: {len(result.removed)}\n"
            f"  Auto-Mapped: {len(result.mapped)}\n"
            f"{'='*60}"
        )

        return result

    async def _try_auto_map(self, device_user: DeviceUser) -> Optional[Employee]:
        """
        Try to auto-map a device user to an existing employee.
        Matching strategy: exact name match (case-insensitive).
        """
        if not device_user.name:
            return None

        result = await self.session.execute(
            select(Employee).where(
                and_(
                    Employee.status == "active",
                    Employee.full_name.ilike(device_user.name.strip()),
                )
            ).limit(1)
        )
        employee = result.scalar_one_or_none()

        if employee:
            # Check if mapping already exists
            existing_mapping = await self.session.execute(
                select(EmployeeDeviceMapping).where(
                    and_(
                        EmployeeDeviceMapping.employee_id == employee.id,
                        EmployeeDeviceMapping.device_id == device_user.device_id,
                    )
                )
            )
            if existing_mapping.scalar_one_or_none():
                return employee

            # Create mapping
            mapping = EmployeeDeviceMapping(
                employee_id=employee.id,
                device_id=device_user.device_id,
                device_user_id=device_user.device_user_id,
            )
            self.session.add(mapping)
            device_user.employee_id = employee.id
            await self.session.flush()

            logger.info(
                f"[DeviceSync] AUTO-MAPPED | "
                f"user_id={device_user.device_user_id} "
                f"name={device_user.name} → "
                f"employee={employee.full_name} ({employee.employee_code})"
            )

            return employee

        return None

    async def get_device_users(
        self,
        device_id: Optional[UUID] = None,
        department_id: Optional[UUID] = None,
        mapped_only: Optional[bool] = None,
        search: Optional[str] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> dict:
        """
        Get device users with filters.
        Returns dict with items, total, page, per_page, pages.
        """
        query = select(DeviceUser).options(
            # Avoid lazy loading issues
        )

        if device_id:
            query = query.where(DeviceUser.device_id == device_id)

        if mapped_only is True:
            query = query.where(DeviceUser.employee_id.isnot(None))
        elif mapped_only is False:
            query = query.where(DeviceUser.employee_id.is_(None))

        if search:
            search_term = f"%{search}%"
            query = query.where(
                DeviceUser.name.ilike(search_term) |
                DeviceUser.device_user_id.ilike(search_term)
            )

        # Count total
        from sqlalchemy import func
        count_query = select(func.count()).select_from(DeviceUser)
        if device_id:
            count_query = count_query.where(DeviceUser.device_id == device_id)
        if mapped_only is True:
            count_query = count_query.where(DeviceUser.employee_id.isnot(None))
        elif mapped_only is False:
            count_query = count_query.where(DeviceUser.employee_id.is_(None))
        if search:
            count_query = count_query.where(
                DeviceUser.name.ilike(search_term) |
                DeviceUser.device_user_id.ilike(search_term)
            )

        total = (await self.session.execute(count_query)).scalar_one()

        # Paginate
        skip = (page - 1) * per_page
        query = query.order_by(DeviceUser.name.asc()).offset(skip).limit(per_page)

        result = await self.session.execute(query)
        items = result.scalars().all()

        import math
        return {
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": math.ceil(total / per_page) if total > 0 else 1,
        }

    async def get_sync_changes(
        self,
        device_id: UUID,
        since: Optional[datetime] = None,
    ) -> dict:
        """
        Get sync changes for a device since a given timestamp.
        Used for incremental sync / realtime discovery.
        """
        query = select(DeviceUser).where(DeviceUser.device_id == device_id)

        if since:
            query = query.where(DeviceUser.last_synced_at > since)

        query = query.order_by(DeviceUser.last_synced_at.desc())
        result = await self.session.execute(query)
        users = result.scalars().all()

        return {
            "device_id": str(device_id),
            "changes": [
                {
                    "device_user_id": du.device_user_id,
                    "name": du.name,
                    "employee_id": str(du.employee_id) if du.employee_id else None,
                    "last_synced_at": du.last_synced_at.isoformat() if du.last_synced_at else None,
                }
                for du in users
            ],
            "total": len(users),
        }
