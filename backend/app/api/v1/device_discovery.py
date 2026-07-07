"""
Network Discovery API endpoints.

Provides network scanning to detect ZKTeco biometric devices,
and device registration from discovered devices.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.models.device import Device
from app.core.dependencies import get_current_user, PermissionChecker
from app.services.network_discovery_service import scan_network_range, quick_scan

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/devices/discovery", tags=["Device Discovery"])


# ── Request/Response Schemas ──────────────────────────────────────

class ScanRequest(BaseModel):
    cidr: str = Field("172.16.40.0/24", description="Network range in CIDR notation")
    port: int = Field(4370, description="SDK port to scan")

class QuickScanRequest(BaseModel):
    cidr: str = Field("172.16.40.0/24", description="Network range in CIDR notation")
    port: int = Field(4370, description="SDK port to scan")

class RegisterDeviceRequest(BaseModel):
    ip_address: str
    serial_number: str
    name: str = Field(..., min_length=1, max_length=255, description="Friendly device name")
    model: Optional[str] = None
    firmware_version: Optional[str] = None
    platform: Optional[str] = None
    mac_address: Optional[str] = None
    department_id: Optional[UUID] = None
    office_id: Optional[UUID] = None
    port: int = 4370

class UpdateDeviceRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    department_id: Optional[UUID] = None
    office_id: Optional[UUID] = None
    location_description: Optional[str] = None
    is_active: Optional[bool] = None
    sync_enabled: Optional[bool] = None


# ── Full Network Scan ─────────────────────────────────────────────

@router.post("/scan", dependencies=[Depends(PermissionChecker("device:manage"))])
async def full_scan(
    req: ScanRequest,
    _user=Depends(get_current_user),
):
    """
    Full network scan — TCP connect + SDK info query.
    Detects all ZKTeco devices in the given CIDR range.
    """
    result = await scan_network_range(cidr=req.cidr, port=req.port)
    if "error" in result:
        raise HTTPException(422, result["error"])
    return result


@router.post("/quick-scan", dependencies=[Depends(PermissionChecker("device:manage"))])
async def api_quick_scan(
    req: QuickScanRequest,
    _user=Depends(get_current_user),
):
    """
    Quick scan — TCP connect only (no SDK query).
    Fast detection of responsive hosts on port 4370.
    """
    result = await quick_scan(ip_range=req.cidr, port=req.port)
    return result


# ── Register Discovered Device ────────────────────────────────────

@router.post("/register", status_code=201, dependencies=[Depends(PermissionChecker("device:manage"))])
async def register_discovered_device(
    req: RegisterDeviceRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Register a discovered device into the system.
    Creates a new device record with the provided info.
    """
    # Check if serial already exists
    existing = (await db.execute(
        select(Device).where(Device.serial_number == req.serial_number)
    )).scalar_one_or_none()
    if existing:
        if existing.is_provisioned:
            raise HTTPException(409, f"Device with serial {req.serial_number} already registered")
        # Update the auto-registered device with real data
        existing.name = req.name
        existing.ip_address = req.ip_address
        existing.model = req.model
        existing.firmware_version = req.firmware_version
        existing.platform = req.platform or "ZMM220_TFT"
        existing.sdk_port = req.port
        existing.adms_port = 8081
        existing.is_online = True
        existing.is_active = True
        existing.health_status = "unknown"
        existing.is_provisioned = True
        existing.last_seen = datetime.now(timezone.utc)
        existing.last_activity = "Provisioned via Discovery"
        existing.department_id = req.department_id
        existing.office_id = req.office_id
        await db.flush()
        await db.refresh(existing)
        logger.info(f"Device provisioned: {existing.name} ({existing.serial_number}) at {existing.ip_address}")
        background_tasks.add_task(sync_device_after_provisioning_background, device_id=existing.id, device_name=existing.name)
        return {
            "id": str(existing.id),
            "serial_number": existing.serial_number,
            "name": existing.name,
            "ip_address": existing.ip_address,
            "model": existing.model,
            "status": "provisioned",
        }

    device = Device(
        serial_number=req.serial_number,
        name=req.name,
        ip_address=req.ip_address,
        model=req.model,
        firmware_version=req.firmware_version,
        platform=req.platform or "ZMM220_TFT",
        sdk_port=req.port,
        adms_port=8081,
        is_online=True,
        is_active=True,
        is_provisioned=True,
        health_status="unknown",
        last_seen=datetime.now(timezone.utc),
        department_id=req.department_id,
        office_id=req.office_id,
    )
    db.add(device)
    await db.flush()
    await db.refresh(device)

    logger.info(f"Device registered: {device.name} ({device.serial_number}) at {device.ip_address}")
    background_tasks.add_task(sync_device_after_provisioning_background, device_id=device.id, device_name=device.name)

    return {
        "id": str(device.id),
        "serial_number": device.serial_number,
        "name": device.name,
        "ip_address": device.ip_address,
        "model": device.model,
        "status": "registered",
    }


# ── Update Device ─────────────────────────────────────────────────

@router.put("/{device_id}", dependencies=[Depends(PermissionChecker("device:manage"))])
async def update_device(
    device_id: UUID,
    req: UpdateDeviceRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Update device settings (rename, reassign department/office, etc.)."""
    device = (await db.execute(
        select(Device).where(Device.id == device_id)
    )).scalar_one_or_none()
    if not device:
        raise HTTPException(404, "Device not found")

    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(device, key, value)

    await db.flush()
    await db.refresh(device)

    return {
        "id": str(device.id),
        "name": device.name,
        "ip_address": device.ip_address,
        "serial_number": device.serial_number,
    }


# ── Get Single Device ────────────────────────────────────────────

@router.get("/{device_id}", dependencies=[Depends(PermissionChecker("device:view"))])
async def get_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get device details including relationships."""
    device = (await db.execute(
        select(Device).where(Device.id == device_id)
    )).scalar_one_or_none()
    if not device:
        raise HTTPException(404, "Device not found")

    return {
        "id": str(device.id),
        "serial_number": device.serial_number,
        "name": device.name,
        "ip_address": device.ip_address,
        "model": device.model,
        "platform": device.platform,
        "firmware_version": device.firmware_version,
        "location_description": device.location_description,
        "is_online": device.is_online,
        "is_active": device.is_active,
        "health_status": device.health_status,
        "last_seen": device.last_seen.isoformat() if device.last_seen else None,
        "last_activity": device.last_activity,
        "consecutive_failures": device.consecutive_failures,
        "avg_response_time_ms": device.avg_response_time_ms,
        "total_scan_count": device.total_scan_count,
        "adms_port": device.adms_port,
        "sdk_port": device.sdk_port,
        "is_provisioned": device.is_provisioned,
        "sync_enabled": device.sync_enabled,
        "total_users_synced": device.total_users_synced,
        "total_templates_synced": device.total_templates_synced,
        "department_id": str(device.department_id) if device.department_id else None,
        "office_id": str(device.office_id) if device.office_id else None,
        "created_at": device.created_at.isoformat() if device.created_at else None,
        "updated_at": device.updated_at.isoformat() if device.updated_at else None,
    }


# ── Delete Device ─────────────────────────────────────────────────

@router.delete("/{device_id}", dependencies=[Depends(PermissionChecker("device:manage"))])
async def delete_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Remove a device from the registry."""
    device = (await db.execute(
        select(Device).where(Device.id == device_id)
    )).scalar_one_or_none()
    if not device:
        raise HTTPException(404, "Device not found")

    name = device.name or device.serial_number
    await db.delete(device)
    await db.flush()

    logger.info(f"Device removed: {name}")
    return {"deleted": True, "name": name}


# ── Background: Sync Employees to Newly Provisioned Device ──────

async def sync_device_after_provisioning_background(device_id: UUID, device_name: str):
    """Push all active employees and templates to a newly provisioned device."""
    from app.database.session import async_session_factory
    from app.models.employee import Employee
    from app.services.device_sync_service import DeviceSyncService

    logger.info(f"[Post-Provision] Starting sync to {device_name} ({device_id})")
    async with async_session_factory() as db:
        try:
            result = await db.execute(select(Employee.id).where(Employee.status == "active"))
            employee_ids = [row[0] for row in result.all()]
            if not employee_ids:
                logger.info(f"[Post-Provision] No active employees to sync to {device_name}")
                return

            sync_service = DeviceSyncService(db)
            user_log = await sync_service.push_users_to_device(
                device_id, employee_ids=employee_ids, initiated_by="provisioning",
            )
            template_log = await sync_service.push_templates_to_device(
                device_id, employee_ids=employee_ids, initiated_by="provisioning",
            )
            await db.commit()
            logger.info(
                f"[Post-Provision] Sync to {device_name} complete — "
                f"{user_log.users_affected} users, {template_log.templates_affected} templates"
            )
        except Exception as e:
            logger.error(f"[Post-Provision] Sync to {device_name} failed: {e}")
            await db.rollback()
