"""
Offline Sync Queue Service.

Manages queued sync operations for offline devices.
Automatically retries when devices come back online.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.offline_sync_queue import OfflineSyncQueue, QueueStatus, SyncOperation

logger = logging.getLogger(__name__)


class OfflineSyncService:
    """Service for managing offline sync queues and retry logic."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def queue_operation(
        self,
        device_id: UUID,
        operation: str,
        employee_id: Optional[UUID] = None,
        payload: Optional[dict] = None,
        initiated_by: str = "system",
    ) -> OfflineSyncQueue:
        """Queue a sync operation for an offline device."""
        queue_item = OfflineSyncQueue(
            device_id=device_id,
            employee_id=employee_id,
            operation=operation,
            status=QueueStatus.PENDING.value,
            payload=payload,
            initiated_by=initiated_by,
        )
        self.session.add(queue_item)
        await self.session.flush()

        logger.info(
            f"[OfflineSync] Queued {operation} for device {device_id}"
            f"{f' employee={employee_id}' if employee_id else ''}"
        )
        return queue_item

    async def process_pending_for_device(
        self,
        device_id: UUID,
    ) -> dict:
        """
        Process all pending sync operations for a device that just came online.
        Returns summary of results.
        """
        device = await self.session.get(Device, device_id)
        if not device or not device.is_online:
            return {"processed": 0, "message": "Device not online"}

        # Get all pending operations for this device, ordered by queued_at
        result = await self.session.execute(
            select(OfflineSyncQueue).where(
                and_(
                    OfflineSyncQueue.device_id == device_id,
                    OfflineSyncQueue.status == QueueStatus.PENDING.value,
                )
            ).order_by(OfflineSyncQueue.queued_at)
        )
        pending_items = result.scalars().all()

        if not pending_items:
            return {"processed": 0, "message": "No pending operations"}

        processed = 0
        succeeded = 0
        failed = 0

        from app.services.device_sync_service import DeviceSyncService
        from app.services.device_provisioning_service import DeviceProvisioningService

        sync_svc = DeviceSyncService(self.session)
        prov_svc = DeviceProvisioningService(self.session)

        for item in pending_items:
            item.status = QueueStatus.PROCESSING.value
            item.last_retry_at = datetime.now(timezone.utc)
            await self.session.flush()

            try:
                if item.operation == SyncOperation.PUSH_USER.value:
                    if item.employee_id:
                        await prov_svc.push_employee_to_device(
                            item.employee_id, device_id, initiated_by="offline_recovery"
                        )
                    else:
                        await sync_svc.push_users_to_device(
                            device_id, initiated_by="offline_recovery"
                        )

                elif item.operation == SyncOperation.PUSH_TEMPLATE.value:
                    if item.employee_id:
                        await prov_svc.push_employee_to_device(
                            item.employee_id, device_id, initiated_by="offline_recovery"
                        )
                    else:
                        await sync_svc.push_templates_to_device(
                            device_id, initiated_by="offline_recovery"
                        )

                elif item.operation == SyncOperation.PUSH_ALL.value:
                    await prov_svc.provision_device(
                        device_id, initiated_by="offline_recovery"
                    )

                elif item.operation == SyncOperation.FULL_SYNC.value:
                    await sync_svc.full_sync_device(
                        device_id, initiated_by="offline_recovery"
                    )

                item.status = QueueStatus.COMPLETED.value
                item.completed_at = datetime.now(timezone.utc)
                succeeded += 1

            except Exception as e:
                item.retry_count += 1
                item.error_message = str(e)[:500]

                if item.retry_count >= item.max_retries:
                    item.status = QueueStatus.FAILED.value
                    failed += 1
                    logger.warning(
                        f"[OfflineSync] Operation {item.operation} failed permanently "
                        f"for device {device_id}: {e}"
                    )
                else:
                    item.status = QueueStatus.PENDING.value
                    logger.warning(
                        f"[OfflineSync] Operation {item.operation} failed, "
                        f"retry {item.retry_count}/{item.max_retries}: {e}"
                    )

            processed += 1
            await self.session.flush()

        logger.info(
            f"[OfflineSync] Processed {processed} operations for device {device_id}: "
            f"{succeeded} succeeded, {failed} failed"
        )

        return {
            "processed": processed,
            "succeeded": succeeded,
            "failed": failed,
        }

    async def get_pending_count(self, device_id: Optional[UUID] = None) -> int:
        """Get count of pending operations, optionally for a specific device."""
        query = select(OfflineSyncQueue).where(
            OfflineSyncQueue.status == QueueStatus.PENDING.value
        )
        if device_id:
            query = query.where(OfflineSyncQueue.device_id == device_id)

        result = await self.session.execute(query)
        return len(result.scalars().all())

    async def get_queue_status(self) -> dict:
        """Get overall queue status."""
        from sqlalchemy import func

        # Count by status
        result = await self.session.execute(
            select(
                OfflineSyncQueue.status,
                func.count(OfflineSyncQueue.id),
            ).group_by(OfflineSyncQueue.status)
        )
        status_counts = {row[0]: row[1] for row in result.all()}

        # Get recent items
        recent = await self.session.execute(
            select(OfflineSyncQueue)
            .order_by(OfflineSyncQueue.queued_at.desc())
            .limit(20)
        )

        return {
            "pending": status_counts.get("pending", 0),
            "processing": status_counts.get("processing", 0),
            "completed": status_counts.get("completed", 0),
            "failed": status_counts.get("failed", 0),
            "recent_items": [
                {
                    "id": str(item.id),
                    "device_id": str(item.device_id),
                    "employee_id": str(item.employee_id) if item.employee_id else None,
                    "operation": item.operation,
                    "status": item.status,
                    "retry_count": item.retry_count,
                    "error_message": item.error_message,
                    "queued_at": item.queued_at.isoformat() if item.queued_at else None,
                    "completed_at": item.completed_at.isoformat() if item.completed_at else None,
                }
                for item in recent.scalars().all()
            ],
        }

    async def expire_old_items(self, max_age_hours: int = 48) -> int:
        """Expire items that have been pending for too long."""
        from datetime import timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
        result = await self.session.execute(
            select(OfflineSyncQueue).where(
                and_(
                    OfflineSyncQueue.status == QueueStatus.PENDING.value,
                    OfflineSyncQueue.queued_at < cutoff,
                )
            )
        )
        items = result.scalars().all()

        for item in items:
            item.status = QueueStatus.EXPIRED.value

        await self.session.flush()
        return len(items)
