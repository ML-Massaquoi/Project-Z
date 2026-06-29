"""
Project Z - Device Users API
Endpoints for managing biometric device user registry.

Route order matters: static paths MUST come before parameterized paths.

GET  /device-users              — list with filters
POST /device-users/bulk-create-employees — auto-create employees from unmapped device users
GET  /device-users/{id}         — single device user
POST /device-users/sync/{device_id}  — trigger sync from device
GET  /device-users/changes/{device_id} — get sync changes
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.device import Device
from app.models.device_user import DeviceUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/device-users", tags=["Device Users"])


@router.get("", dependencies=[Depends(PermissionChecker("device:view"))])
async def list_device_users(
    device_id: Optional[UUID] = None,
    department_id: Optional[UUID] = None,
    mapped_only: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List device users with filters and pagination."""
    from app.services.device_user_sync_service import DeviceUserSyncService
    svc = DeviceUserSyncService(db)
    result = await svc.get_device_users(
        device_id=device_id,
        department_id=department_id,
        mapped_only=mapped_only,
        search=search,
        page=page,
        per_page=per_page,
    )

    items = []
    for du in result["items"]:
        items.append({
            "id": str(du.id),
            "device_id": str(du.device_id),
            "device_user_id": du.device_user_id,
            "name": du.name,
            "privilege": du.privilege,
            "card_number": du.card_number,
            "group_id": du.group_id,
            "fingerprint_count": du.fingerprint_count,
            "face_registered": du.face_registered,
            "password_set": du.password_set,
            "employee_id": str(du.employee_id) if du.employee_id else None,
            "last_synced_at": du.last_synced_at.isoformat() if du.last_synced_at else None,
            "first_seen_at": du.first_seen_at.isoformat() if du.first_seen_at else None,
        })

    return {
        "items": items,
        "total": result["total"],
        "page": result["page"],
        "per_page": result["per_page"],
        "pages": result["pages"],
    }


@router.post("/bulk-create-employees", dependencies=[Depends(PermissionChecker("employee:create"))])
async def bulk_create_employees_from_device_users(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Create employee records for all unmapped device users across all devices.
    For each unmapped device user:
    1. Try to match by name to an existing employee
    2. If no match, create a new employee record
    3. Create the device mapping
    """
    from sqlalchemy import select, func
    from app.models.employee import Employee
    from app.models.employee_device_mapping import EmployeeDeviceMapping

    result = await db.execute(
        select(DeviceUser).where(DeviceUser.employee_id == None)
    )
    unmapped = result.scalars().all()

    if not unmapped:
        return {"created": 0, "mapped": 0, "skipped": 0, "message": "No unmapped device users found"}

    created_count = 0
    mapped_count = 0
    skipped_count = 0
    errors = []

    max_code_result = await db.execute(
        select(func.max(Employee.employee_code))
    )
    max_code = max_code_result.scalar_one() or "EMP-0000"
    try:
        next_num = int(max_code.split("-")[1]) + 1
    except (IndexError, ValueError):
        next_num = 1

    for du in unmapped:
        try:
            if not du.name or not du.name.strip():
                skipped_count += 1
                continue

            clean_name = du.name.strip()

            existing_result = await db.execute(
                select(Employee).where(
                    Employee.full_name.ilike(clean_name),
                    Employee.status == "active",
                ).limit(1)
            )
            employee = existing_result.scalar_one_or_none()

            if not employee:
                employee_code = f"EMP-{next_num:04d}"
                next_num += 1

                employee = Employee(
                    employee_code=employee_code,
                    full_name=clean_name,
                    status="active",
                )
                db.add(employee)
                await db.flush()
                created_count += 1

            existing_mapping = await db.execute(
                select(EmployeeDeviceMapping).where(
                    EmployeeDeviceMapping.employee_id == employee.id,
                    EmployeeDeviceMapping.device_id == du.device_id,
                )
            )
            if existing_mapping.scalar_one_or_none():
                skipped_count += 1
                continue

            mapping = EmployeeDeviceMapping(
                employee_id=employee.id,
                device_id=du.device_id,
                device_user_id=du.device_user_id,
            )
            db.add(mapping)
            du.employee_id = employee.id
            await db.flush()
            mapped_count += 1

        except Exception as e:
            errors.append(f"Device user {du.device_user_id}: {str(e)}")
            logger.warning(f"[BulkCreate] Error processing device user {du.device_user_id}: {e}")

    await db.commit()

    logger.info(
        f"[BulkCreate] Completed: {created_count} created, {mapped_count} mapped, "
        f"{skipped_count} skipped, {len(errors)} errors"
    )

    return {
        "created": created_count,
        "mapped": mapped_count,
        "skipped": skipped_count,
        "errors": len(errors),
        "error_details": errors[:20],
    }


@router.get("/import-preview", dependencies=[Depends(PermissionChecker("device:view"))])
async def import_preview(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Preview device import: detect duplicates, orphans, and matchable users.
    Returns categorized lists for the import wizard.
    """
    from sqlalchemy import select, func
    from app.models.employee import Employee

    result = await db.execute(
        select(DeviceUser).where(DeviceUser.employee_id == None)
    )
    unmapped = result.scalars().all()

    duplicates = []
    orphans = []
    matchable = []
    no_name = []

    for du in unmapped:
        clean_name = (du.name or "").strip()
        if not clean_name:
            no_name.append({
                "device_user_id": du.device_user_id,
                "device_id": str(du.device_id),
                "device_name": du.device.name if du.device else None,
                "reason": "No name on device",
            })
            continue

        existing_result = await db.execute(
            select(Employee).where(
                Employee.full_name.ilike(clean_name),
            ).limit(2)
        )
        matches = existing_result.scalars().all()

        if len(matches) > 1:
            duplicates.append({
                "device_user_id": du.device_user_id,
                "device_name": du.device.name if du.device else None,
                "device_user_name": clean_name,
                "matching_employees": [
                    {"id": str(e.id), "code": e.employee_code, "name": e.full_name, "status": e.status.value if hasattr(e.status, 'value') else str(e.status)}
                    for e in matches
                ],
            })
        elif len(matches) == 1:
            emp = matches[0]
            emp_status = emp.status.value if hasattr(emp.status, 'value') else str(emp.status)
            if emp_status == "terminated":
                orphans.append({
                    "device_user_id": du.device_user_id,
                    "device_name": du.device.name if du.device else None,
                    "device_user_name": clean_name,
                    "reason": f"Matches terminated employee {emp.employee_code}",
                    "suggested_action": "ignore",
                })
            else:
                matchable.append({
                    "device_user_id": du.device_user_id,
                    "device_name": du.device.name if du.device else None,
                    "device_user_name": clean_name,
                    "suggested_employee": {
                        "id": str(emp.id),
                        "code": emp.employee_code,
                        "name": emp.full_name,
                        "status": emp_status,
                    },
                    "confidence": "high",
                })
        else:
            orphans.append({
                "device_user_id": du.device_user_id,
                "device_name": du.device.name if du.device else None,
                "device_user_name": clean_name,
                "reason": "No matching employee found",
                "suggested_action": "create",
            })

    return {
        "total_unmapped": len(unmapped),
        "duplicates": {
            "count": len(duplicates),
            "items": duplicates,
        },
        "matchable": {
            "count": len(matchable),
            "items": matchable,
        },
        "orphans": {
            "count": len(orphans),
            "items": orphans,
        },
        "no_name": {
            "count": len(no_name),
            "items": no_name,
        },
        "summary": {
            "can_auto_link": len(matchable),
            "need_review": len(duplicates),
            "can_create": len([o for o in orphans if o.get("suggested_action") == "create"]),
            "should_ignore": len([o for o in orphans if o.get("suggested_action") == "ignore"]) + len(no_name),
        },
    }


@router.get("/{device_user_id}", dependencies=[Depends(PermissionChecker("device:view"))])
async def get_device_user(
    device_user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get a single device user by ID."""
    from sqlalchemy import select as sa_select
    result = await db.execute(
        sa_select(DeviceUser).where(DeviceUser.id == device_user_id)
    )
    du = result.scalar_one_or_none()
    if not du:
        raise HTTPException(404, "Device user not found")

    return {
        "id": str(du.id),
        "device_id": str(du.device_id),
        "device_user_id": du.device_user_id,
        "name": du.name,
        "privilege": du.privilege,
        "card_number": du.card_number,
        "group_id": du.group_id,
        "fingerprint_count": du.fingerprint_count,
        "face_registered": du.face_registered,
        "password_set": du.password_set,
        "employee_id": str(du.employee_id) if du.employee_id else None,
        "last_synced_at": du.last_synced_at.isoformat() if du.last_synced_at else None,
        "first_seen_at": du.first_seen_at.isoformat() if du.first_seen_at else None,
        "raw_data": du.raw_data,
    }


@router.post("/sync/{device_id}", dependencies=[Depends(PermissionChecker("device:sync"))])
async def sync_device_users(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Trigger a sync of users from a biometric device.
    Connects via TCP SDK (pyzk), reads all enrolled users,
    and upserts them into the device_users table.
    """
    from sqlalchemy import select as sa_select
    from app.services.device_user_sync_service import DeviceUserSyncService

    device_result = await db.execute(
        sa_select(Device).where(Device.id == device_id)
    )
    device = device_result.scalar_one_or_none()
    if not device:
        raise HTTPException(404, "Device not found")
    if not device.ip_address:
        raise HTTPException(400, "Device has no IP address configured")

    try:
        import asyncio, socket
        ip = device.ip_address
        port = device.sdk_port or 4370
        def _check():
            try:
                with socket.create_connection((ip, port), timeout=3):
                    return True
            except (ConnectionRefusedError, TimeoutError, OSError):
                return False
        loop = asyncio.get_event_loop()
        if not await loop.run_in_executor(None, _check):
            raise HTTPException(502, f"SDK port {port} not reachable on {device.name}")
        from app.services.sdk_service import ZKSDKService
        sdk = ZKSDKService(ip=ip, port=port, timeout=5)
        device_users = await loop.run_in_executor(None, sdk.get_users)
    except RuntimeError as e:
        raise HTTPException(502, f"Failed to connect to device: {e}")

    svc = DeviceUserSyncService(db)
    sync_result = await svc.sync_device_users(device_id, device_users)

    await db.commit()

    from app.services.websocket_service import ws_manager
    await ws_manager.broadcast("device_users_synced", {
        "device_id": str(device_id),
        "device_name": device.name,
        "added": len(sync_result.added),
        "updated": len(sync_result.updated),
        "removed": len(sync_result.removed),
        "mapped": len(sync_result.mapped),
        "total": sync_result.total_on_device,
    })

    return {
        "device_id": str(device_id),
        "device_name": device.name,
        "total_on_device": sync_result.total_on_device,
        "added": sync_result.added,
        "updated": sync_result.updated,
        "removed": sync_result.removed,
        "mapped": sync_result.mapped,
        "errors": sync_result.errors,
    }


@router.get("/changes/{device_id}", dependencies=[Depends(PermissionChecker("device:view"))])
async def get_sync_changes(
    device_id: UUID,
    since: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get sync changes for a device since a given timestamp."""
    from datetime import datetime
    from app.services.device_user_sync_service import DeviceUserSyncService

    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
        except ValueError:
            raise HTTPException(400, "Invalid 'since' timestamp format. Use ISO 8601.")

    svc = DeviceUserSyncService(db)
    result = await svc.get_sync_changes(device_id, since_dt)
    return result
