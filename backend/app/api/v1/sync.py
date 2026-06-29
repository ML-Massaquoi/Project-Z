"""
Project Z - Device Sync API
Endpoints for device synchronization management.

Route order matters: static paths MUST come before parameterized paths
to prevent FastAPI from matching "pending"/"matrix" as {device_id}.

GET  /sync/overview          -- sync dashboard overview
GET  /sync/logs              -- sync audit logs
GET  /sync/pending           -- pending/failed syncs
GET  /sync/matrix            -- employee×device sync matrix
POST /sync/bulk/all          -- sync all employees to all devices
POST /sync/bulk/department/{dept_id} -- sync department
POST /sync/bulk/employees    -- sync selected employees
POST /sync/retry-all         -- retry all failed syncs
GET  /sync/employee/{employee_id} -- employee sync status
POST /sync/employee/{employee_id}/push-all -- push to all devices
POST /sync/employee/{employee_id}/push/{device_id} -- push to specific device
POST /sync/employee/{employee_id}/retry -- retry employee sync
GET  /sync/{device_id}       -- device sync status
POST /sync/{device_id}/pull-users     -- pull users from device
POST /sync/{device_id}/pull-templates -- pull templates from device
POST /sync/{device_id}/push-users     -- push users to device
POST /sync/{device_id}/push-templates -- push templates to device
POST /sync/{device_id}/full           -- full bidirectional sync
POST /sync/{device_id}/provision      -- auto-provision device
POST /sync/{device_id}/re-provision   -- force re-provision
POST /sync/{device_id}/initial-sync   -- initial sync for new device
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sync", tags=["Device Synchronization"])


# ════════════════════════════════════════════════════════════
# Static GET routes (must come before /{device_id})
# ════════════════════════════════════════════════════════════

# ── Dashboard Overview ────────────────────────────────────────

@router.get(
    "/overview",
    dependencies=[Depends(PermissionChecker("device:view"))],
)
async def get_sync_overview(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get overall sync status for the dashboard."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    return await svc.get_sync_overview()


@router.get(
    "/logs",
    dependencies=[Depends(PermissionChecker("device:view"))],
)
async def get_sync_logs(
    device_id: Optional[UUID] = None,
    sync_type: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get sync audit logs with filters."""
    from sqlalchemy import func, select
    from app.models.device_sync_log import DeviceSyncLog

    query = select(DeviceSyncLog)
    count_query = select(func.count()).select_from(DeviceSyncLog)

    if device_id:
        query = query.where(DeviceSyncLog.device_id == device_id)
        count_query = count_query.where(DeviceSyncLog.device_id == device_id)
    if sync_type:
        query = query.where(DeviceSyncLog.sync_type == sync_type)
        count_query = count_query.where(DeviceSyncLog.sync_type == sync_type)
    if status:
        query = query.where(DeviceSyncLog.status == status)
        count_query = count_query.where(DeviceSyncLog.status == status)
    if date_from:
        query = query.where(DeviceSyncLog.created_at >= date_from)
        count_query = count_query.where(DeviceSyncLog.created_at >= date_from)
    if date_to:
        query = query.where(DeviceSyncLog.created_at <= date_to)
        count_query = count_query.where(DeviceSyncLog.created_at <= date_to)

    total = (await db.execute(count_query)).scalar_one()

    skip = (page - 1) * per_page
    query = query.order_by(DeviceSyncLog.created_at.desc()).offset(skip).limit(per_page)

    result = await db.execute(query)
    logs = result.scalars().all()

    return {
        "items": [
            {
                "id": str(log.id),
                "device_id": str(log.device_id),
                "sync_type": log.sync_type,
                "direction": log.direction,
                "status": log.status,
                "started_at": log.started_at.isoformat() if log.started_at else None,
                "completed_at": log.completed_at.isoformat() if log.completed_at else None,
                "duration_ms": log.duration_ms,
                "users_affected": log.users_affected,
                "templates_affected": log.templates_affected,
                "errors_count": log.errors_count,
                "initiated_by": log.initiated_by,
                "error_details": log.error_details,
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page if total > 0 else 1,
    }


@router.get(
    "/pending",
    dependencies=[Depends(PermissionChecker("device:view"))],
)
async def get_pending_syncs(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List all pending/failed sync operations."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    return await svc.get_pending_syncs()


@router.get(
    "/matrix",
    dependencies=[Depends(PermissionChecker("device:view"))],
)
async def get_sync_matrix(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get employee×device sync status matrix."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    return await svc.get_employee_sync_matrix()


# ════════════════════════════════════════════════════════════
# Static POST routes
# ════════════════════════════════════════════════════════════

# ── Bulk Operations ─────────────────────────────────────────

@router.post(
    "/bulk/all",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def bulk_sync_all(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Push all active employees and templates to all active online devices."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    result = await svc.bulk_sync_all(initiated_by=str(user.id))
    await db.commit()
    return result


@router.post(
    "/bulk/department/{department_id}",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def bulk_sync_department(
    department_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Push all employees in a department to all active devices."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    result = await svc.bulk_sync_department(department_id, initiated_by=str(user.id))
    await db.commit()
    return result


@router.post(
    "/bulk/employees",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def bulk_sync_employees(
    employee_ids: list[UUID],
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Push selected employees to all active devices."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    result = await svc.bulk_sync_employees(employee_ids, initiated_by=str(user.id))
    await db.commit()
    return result


@router.post(
    "/retry-all",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def retry_all_failed_syncs(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Retry all failed sync operations across all devices."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    result = await svc.retry_failed_syncs(initiated_by=str(user.id))
    await db.commit()
    return result


# ════════════════════════════════════════════════════════════
# Employee routes (static prefix /employee/ before /{device_id})
# ════════════════════════════════════════════════════════════

@router.get(
    "/employee/{employee_id}",
    dependencies=[Depends(PermissionChecker("employee:view"))],
)
async def get_employee_sync_status(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get biometric sync status for a specific employee."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    return await svc.get_employee_sync_status(employee_id)


@router.post(
    "/employee/{employee_id}/push-all",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def push_employee_to_all_devices(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Push an employee's templates to ALL active devices."""
    from app.services.device_provisioning_service import DeviceProvisioningService
    svc = DeviceProvisioningService(db)
    results = await svc.push_employee_to_all_devices(employee_id, initiated_by=str(user.id))
    await db.commit()
    return {"results": results}


@router.post(
    "/employee/{employee_id}/push/{device_id}",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def push_employee_to_device(
    employee_id: UUID,
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Push an employee's templates to a specific device."""
    from app.services.device_provisioning_service import DeviceProvisioningService
    svc = DeviceProvisioningService(db)
    result = await svc.push_employee_to_device(
        employee_id, device_id, initiated_by=str(user.id),
    )
    await db.commit()
    return result


@router.post(
    "/employee/{employee_id}/retry",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def retry_employee_sync(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Retry sync for a specific employee across all devices."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    result = await svc.retry_employee_sync(employee_id, initiated_by=str(user.id))
    await db.commit()
    return result


# ════════════════════════════════════════════════════════════
# Device parameterized routes (MUST come last)
# ════════════════════════════════════════════════════════════

# ── Device Sync Status ────────────────────────────────────────

@router.get(
    "/{device_id}",
    dependencies=[Depends(PermissionChecker("device:view"))],
)
async def get_device_sync_status(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get sync status for a specific device."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    try:
        return await svc.get_device_sync_status(device_id)
    except Exception as e:
        raise HTTPException(400, str(e))


# ── Pull Operations ───────────────────────────────────────────

@router.post(
    "/{device_id}/pull-users",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def pull_users_from_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Pull all users from a device via TCP SDK."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    try:
        log = await svc.pull_users_from_device(device_id, initiated_by=str(user.id))
        await db.commit()
        return {
            "status": log.status,
            "users_affected": log.users_affected,
            "errors_count": log.errors_count,
            "duration_ms": log.duration_ms,
            "log_id": str(log.id),
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Sync failed: {str(e)}")


@router.post(
    "/{device_id}/pull-templates",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def pull_templates_from_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Pull all fingerprint templates from a device and store centrally."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    try:
        log = await svc.pull_templates_from_device(device_id, initiated_by=str(user.id))
        await db.commit()
        return {
            "status": log.status,
            "templates_affected": log.templates_affected,
            "errors_count": log.errors_count,
            "duration_ms": log.duration_ms,
            "log_id": str(log.id),
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Sync failed: {str(e)}")


# ── Push Operations ───────────────────────────────────────────

@router.post(
    "/{device_id}/push-users",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def push_users_to_device(
    device_id: UUID,
    employee_ids: Optional[list[UUID]] = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Push active employees to a device. If no employee_ids, pushes all."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    try:
        log = await svc.push_users_to_device(
            device_id, employee_ids=employee_ids, initiated_by=str(user.id),
        )
        await db.commit()
        return {
            "status": log.status,
            "users_affected": log.users_affected,
            "errors_count": log.errors_count,
            "duration_ms": log.duration_ms,
            "log_id": str(log.id),
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Sync failed: {str(e)}")


@router.post(
    "/{device_id}/push-templates",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def push_templates_to_device(
    device_id: UUID,
    employee_ids: Optional[list[UUID]] = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Push fingerprint templates to a device. If no employee_ids, pushes all."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    try:
        log = await svc.push_templates_to_device(
            device_id, employee_ids=employee_ids, initiated_by=str(user.id),
        )
        await db.commit()
        return {
            "status": log.status,
            "templates_affected": log.templates_affected,
            "errors_count": log.errors_count,
            "duration_ms": log.duration_ms,
            "log_id": str(log.id),
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Sync failed: {str(e)}")


# ── Full Sync & Provisioning ──────────────────────────────────

@router.post(
    "/{device_id}/full",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def full_sync_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Full bidirectional sync: pull from device, then push pending."""
    from app.services.device_sync_service import DeviceSyncService
    svc = DeviceSyncService(db)
    try:
        log = await svc.full_sync_device(device_id, initiated_by=str(user.id))
        await db.commit()
        return {
            "status": log.status,
            "users_affected": log.users_affected,
            "templates_affected": log.templates_affected,
            "errors_count": log.errors_count,
            "duration_ms": log.duration_ms,
            "log_id": str(log.id),
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Sync failed: {str(e)}")


@router.post(
    "/{device_id}/provision",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def provision_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Auto-provision a new device with all employees and templates."""
    from app.services.device_provisioning_service import DeviceProvisioningService
    svc = DeviceProvisioningService(db)
    try:
        result = await svc.provision_device(device_id, initiated_by=str(user.id))
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Provisioning failed: {str(e)}")


@router.post(
    "/{device_id}/re-provision",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def re_provision_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Force re-provision a device (clear state and re-sync)."""
    from app.services.device_provisioning_service import DeviceProvisioningService
    svc = DeviceProvisioningService(db)
    try:
        result = await svc.re_provision_device(device_id, initiated_by=str(user.id))
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Re-provisioning failed: {str(e)}")


@router.post(
    "/{device_id}/initial-sync",
    dependencies=[Depends(PermissionChecker("device:sync"))],
)
async def initial_sync_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Full initial sync for a new/replaced device: push all employees and templates."""
    from app.services.device_provisioning_service import DeviceProvisioningService
    svc = DeviceProvisioningService(db)
    try:
        result = await svc.re_provision_device(device_id, initiated_by=str(user.id))
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Initial sync failed: {str(e)}")
