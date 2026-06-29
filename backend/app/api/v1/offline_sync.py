"""
Offline Sync Queue API.

Endpoints for managing the offline sync queue and
replication engine operations.
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/offline-sync", tags=["Offline Sync Queue"])


class QueueOperationRequest(BaseModel):
    device_id: UUID
    employee_id: Optional[UUID] = None
    operation: str  # push_user, push_template, push_all, full_sync


class ReplicateRequest(BaseModel):
    source_device_id: UUID
    employee_code: str
    fingerprint_id: int


class BulkReplicateRequest(BaseModel):
    employee_code: str
    target_device_ids: list[UUID]


@router.get("/status", dependencies=[Depends(PermissionChecker("device:view"))])
async def get_queue_status(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get overall offline sync queue status."""
    from app.services.offline_sync_service import OfflineSyncService

    svc = OfflineSyncService(db)
    status = await svc.get_queue_status()
    return status


@router.post("/queue", dependencies=[Depends(PermissionChecker("device:manage"))])
async def queue_operation(
    data: QueueOperationRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Queue a sync operation for an offline device."""
    from app.services.offline_sync_service import OfflineSyncService

    svc = OfflineSyncService(db)
    item = await svc.queue_operation(
        device_id=data.device_id,
        operation=data.operation,
        employee_id=data.employee_id,
        initiated_by=str(user.id),
    )
    await db.commit()

    return {
        "id": str(item.id),
        "status": item.status,
        "operation": item.operation,
    }


@router.post("/process/{device_id}", dependencies=[Depends(PermissionChecker("device:manage"))])
async def process_pending_for_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Process all pending sync operations for a device (when it comes online)."""
    from app.services.offline_sync_service import OfflineSyncService

    svc = OfflineSyncService(db)
    result = await svc.process_pending_for_device(device_id)
    await db.commit()
    return result


# ── Replication Engine ──────────────────────────────────────

@router.post("/replicate", dependencies=[Depends(PermissionChecker("device:manage"))])
async def detect_and_replicate(
    data: ReplicateRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Detect a new enrollment on a device and replicate it
    to the central database and other assigned devices.
    """
    from app.services.replication_engine import FingerprintReplicationEngine

    engine = FingerprintReplicationEngine(db)
    result = await engine.detect_and_replicate(
        source_device_id=data.source_device_id,
        employee_code=data.employee_code,
        fingerprint_id=data.fingerprint_id,
        initiated_by=str(user.id),
    )
    await db.commit()
    return result


@router.post("/replicate/bulk", dependencies=[Depends(PermissionChecker("device:manage"))])
async def bulk_replicate(
    data: BulkReplicateRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Replicate all fingerprints for an employee to specified devices.
    Used during initial device provisioning.
    """
    from app.services.replication_engine import FingerprintReplicationEngine

    engine = FingerprintReplicationEngine(db)
    result = await engine.replicate_all_for_employee(
        employee_code=data.employee_code,
        target_device_ids=data.target_device_ids,
        initiated_by=str(user.id),
    )
    await db.commit()
    return result


@router.post("/sync-device/{device_id}", dependencies=[Depends(PermissionChecker("device:manage"))])
async def sync_device_to_central(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Pull all templates from a device and store in central database.
    Used during initial device provisioning.
    """
    from app.services.replication_engine import FingerprintReplicationEngine

    engine = FingerprintReplicationEngine(db)
    result = await engine.sync_device_to_central(
        device_id=device_id,
        initiated_by=str(user.id),
    )
    await db.commit()
    return result
