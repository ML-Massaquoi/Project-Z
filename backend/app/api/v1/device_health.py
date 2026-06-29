"""
Project Z - Device Health API
Health monitoring endpoints for device fleet management.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.device import Device
from app.models.fingerprint_template import FingerprintTemplate
from app.services.device_health_service import DeviceHealthService

router = APIRouter(prefix="/devices", tags=["Device Health"])


@router.get("/health/overview", dependencies=[Depends(PermissionChecker("device:view"))])
async def get_health_overview(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get fleet-wide device health overview: online counts, status distribution, avg latency."""
    service = DeviceHealthService(db)
    return await service.get_system_health_overview()


@router.get("/health/summary", dependencies=[Depends(PermissionChecker("device:view"))])
async def get_all_devices_health(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get health summary for all active devices."""
    service = DeviceHealthService(db)
    return await service.get_all_devices_health_summary()


@router.get(
    "/{device_id}/health",
    dependencies=[Depends(PermissionChecker("device:view"))],
)
async def get_device_health(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get detailed health summary for a single device."""
    service = DeviceHealthService(db)
    try:
        return await service.get_device_health_summary(device_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get(
    "/{device_id}/health/history",
    dependencies=[Depends(PermissionChecker("device:view"))],
)
async def get_device_health_history(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(200, ge=1, le=1000),
):
    """Get health check history for a device (last N hours)."""
    service = DeviceHealthService(db)
    return await service.get_health_history(device_id, hours=hours, limit=limit)


@router.post(
    "/{device_id}/health/probe",
    dependencies=[Depends(PermissionChecker("device:update"))],
)
async def probe_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Manually trigger a health probe on a specific device."""
    service = DeviceHealthService(db)
    try:
        log = await service.probe_device(device_id, checked_by="manual")
        return {
            "check_result": log.check_result.value,
            "response_time_ms": log.response_time_ms,
            "error_message": log.error_message,
            "device_online": log.device_online,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "/health/probe-all",
    dependencies=[Depends(PermissionChecker("device:update"))],
)
async def probe_all_devices(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Manually trigger health probes on all active devices."""
    service = DeviceHealthService(db)
    logs = await service.probe_all_active_devices()
    return {
        "probed_count": len(logs),
        "results": [
            {
                "device_id": str(log.device_id),
                "check_result": log.check_result.value,
                "response_time_ms": log.response_time_ms,
            }
            for log in logs
        ],
    }


@router.get(
    "/health/biometric-counts",
    dependencies=[Depends(PermissionChecker("device:view"))],
)
async def get_biometric_counts(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get biometric template counts per device, grouped by biometric type."""
    result = await db.execute(
        select(
            FingerprintTemplate.device_id,
            FingerprintTemplate.biometric_type,
            func.count(FingerprintTemplate.id).label("count"),
        )
        .where(FingerprintTemplate.is_active == True)
        .group_by(FingerprintTemplate.device_id, FingerprintTemplate.biometric_type)
    )
    rows = result.all()

    counts: dict[str, dict] = {}
    for row in rows:
        device_id = str(row.device_id)
        if device_id not in counts:
            counts[device_id] = {"fingerprint": 0, "face": 0, "card": 0, "pin": 0, "total": 0}
        counts[device_id][row.biometric_type] = row.count
        counts[device_id]["total"] += row.count

    return counts


@router.get(
    "/{device_id}/biometric-counts",
    dependencies=[Depends(PermissionChecker("device:view"))],
)
async def get_device_biometric_counts(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get biometric template counts for a specific device."""
    result = await db.execute(
        select(
            FingerprintTemplate.biometric_type,
            func.count(FingerprintTemplate.id).label("count"),
        )
        .where(
            FingerprintTemplate.device_id == device_id,
            FingerprintTemplate.is_active == True,
        )
        .group_by(FingerprintTemplate.biometric_type)
    )
    rows = result.all()

    counts = {"fingerprint": 0, "face": 0, "card": 0, "pin": 0, "total": 0}
    for row in rows:
        counts[row.biometric_type] = row.count
        counts["total"] += row.count

    return counts
