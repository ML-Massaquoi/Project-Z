"""
Project Z - Device API Routes
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.device import Device
from app.schemas.device import DeviceListResponse, DeviceResponse, DeviceUpdate
from app.repositories.device import DeviceRepository
from app.services.audit_service import log_audit
from app.utils.audit_context import get_audit_context

router = APIRouter(prefix="/devices", tags=["Devices"])


# ── List & static routes FIRST (before /{device_id}) ────

@router.get("", response_model=DeviceListResponse, dependencies=[Depends(PermissionChecker("device:view"))])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Device)
        .options(joinedload(Device.office), joinedload(Device.department))
        .where(Device.is_provisioned == True)
        .order_by(Device.created_at.desc())
    )
    devices = result.unique().scalars().all()
    return DeviceListResponse(
        items=[
            DeviceResponse(
                id=d.id, serial_number=d.serial_number, name=d.name,
                ip_address=d.ip_address, model=d.model, platform=d.platform,
                is_online=d.is_online, is_active=d.is_active,
                last_seen=d.last_seen, last_activity=d.last_activity,
                office_id=d.office_id, office_name=d.office.name if d.office else None,
                department_id=d.department_id,
                department_name=d.department.name if d.department else None,
                created_at=d.created_at, updated_at=d.updated_at,
            )
            for d in devices
        ],
        total=len(devices),
    )


# ── Unrecognized users (MUST be before /{device_id}) ────

@router.get("/unrecognized-users/all", dependencies=[Depends(PermissionChecker("device:view"))])
async def get_unrecognized_users(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Return all device_user_ids that scanned but aren't mapped to any employee."""
    query = text("""
        SELECT
            al.device_user_id,
            al.device_id,
            d.serial_number,
            d.name as device_name,
            d.ip_address,
            COUNT(al.id) as scan_count,
            MAX(al.timestamp) as last_seen
        FROM attendance_logs al
        JOIN devices d ON d.id = al.device_id
        WHERE al.device_user_id IS NOT NULL
          AND al.device_user_id != ''
          AND NOT EXISTS (
              SELECT 1 FROM employee_device_mappings edm
              WHERE edm.device_user_id = al.device_user_id
                AND edm.device_id = al.device_id
          )
        GROUP BY al.device_user_id, al.device_id, d.serial_number, d.name, d.ip_address
        ORDER BY last_seen DESC
    """)
    result = await db.execute(query)
    rows = result.fetchall()
    return {
        "total": len(rows),
        "users": [
            {
                "device_user_id": row.device_user_id,
                "device_id": str(row.device_id),
                "device_serial": row.serial_number,
                "device_name": row.device_name,
                "device_ip": row.ip_address,
                "scan_count": row.scan_count,
                "last_seen": row.last_seen.isoformat() if row.last_seen else None,
            }
            for row in rows
        ],
    }


@router.post("/unrecognized-users/map-existing", dependencies=[Depends(PermissionChecker("device:update"))])
async def map_to_existing_employee(
    device_id: str,
    device_user_id: str,
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Map a device user ID to an existing employee."""
    from app.repositories.base import BaseRepository
    from app.models.employee_device_mapping import EmployeeDeviceMapping
    from app.repositories.employee import EmployeeRepository

    emp_repo = EmployeeRepository(db)
    emp = await emp_repo.get_by_id(UUID(employee_id))
    if not emp:
        raise HTTPException(404, "Employee not found")

    existing = await emp_repo.get_by_device_user_id(device_user_id, UUID(device_id))
    if existing:
        raise HTTPException(409, f"Device user '{device_user_id}' already mapped to {existing.full_name}")

    mapping_repo = BaseRepository(EmployeeDeviceMapping, db)
    await mapping_repo.create({
        "employee_id": UUID(employee_id),
        "device_id": UUID(device_id),
        "device_user_id": device_user_id,
    })
    return {"message": f"Mapped device user {device_user_id} to {emp.full_name}"}


@router.post("/unrecognized-users/map-new", dependencies=[Depends(PermissionChecker("device:update"))])
async def map_to_new_employee(
    device_id: str,
    device_user_id: str,
    full_name: str,
    employee_code: str,
    department_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Create a new employee and map the device user ID to them."""
    from app.repositories.base import BaseRepository
    from app.models.employee import EmployeeStatus
    from app.models.employee_device_mapping import EmployeeDeviceMapping
    from app.repositories.employee import EmployeeRepository

    emp_repo = EmployeeRepository(db)
    existing = await emp_repo.get_by_field("employee_code", employee_code)
    if existing:
        raise HTTPException(409, f"Employee code '{employee_code}' already exists")

    emp_data: dict = {
        "employee_code": employee_code,
        "full_name": full_name,
        "status": EmployeeStatus.ACTIVE,
    }
    if department_id:
        emp_data["department_id"] = UUID(department_id)

    employee = await emp_repo.create(emp_data)

    mapping_repo = BaseRepository(EmployeeDeviceMapping, db)
    await mapping_repo.create({
        "employee_id": employee.id,
        "device_id": UUID(device_id),
        "device_user_id": device_user_id,
    })
    return {
        "message": f"Created {full_name} and mapped device user {device_user_id}",
        "employee_id": str(employee.id),
        "employee_code": employee_code,
    }


# ── Dynamic /{device_id} routes ──────────────────────────

@router.get("/{device_id}", response_model=DeviceResponse, dependencies=[Depends(PermissionChecker("device:view"))])
async def get_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    repo = DeviceRepository(db)
    device = await repo.get_by_id(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    return DeviceResponse(
        id=device.id, serial_number=device.serial_number, name=device.name,
        ip_address=device.ip_address, model=device.model, platform=device.platform,
        is_online=device.is_online, is_active=device.is_active,
        last_seen=device.last_seen, last_activity=device.last_activity,
        office_id=device.office_id, department_id=device.department_id,
        created_at=device.created_at, updated_at=device.updated_at,
    )


@router.put("/{device_id}", response_model=DeviceResponse, dependencies=[Depends(PermissionChecker("device:update"))])
async def update_device(
    device_id: UUID,
    data: DeviceUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    repo = DeviceRepository(db)
    old_device = await repo.get_by_id(device_id)
    if not old_device:
        raise HTTPException(404, "Device not found")
    device = await repo.update(device_id, data.model_dump(exclude_unset=True))
    audit_ctx = get_audit_context(request, _user)
    await log_audit(
        db, action="update", entity_type="device",
        entity_id=str(device_id),
        details={"changed_fields": list(data.model_dump(exclude_unset=True).keys())},
        previous_value=old_device, new_value=device, **audit_ctx,
    )
    return DeviceResponse(
        id=device.id, serial_number=device.serial_number, name=device.name,
        ip_address=device.ip_address, model=device.model, platform=device.platform,
        is_online=device.is_online, is_active=device.is_active,
        last_seen=device.last_seen, last_activity=device.last_activity,
        office_id=device.office_id, department_id=device.department_id,
        created_at=device.created_at, updated_at=device.updated_at,
    )


@router.get("/{device_id}/sdk/users", dependencies=[Depends(PermissionChecker("device:view"))])
async def get_sdk_users(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from app.services.sdk_service import ZKSDKService
    repo = DeviceRepository(db)
    device = await repo.get_by_id(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    if not device.ip_address:
        raise HTTPException(400, "Device has no IP address")
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
        sdk = ZKSDKService(ip=ip, port=port, timeout=5)
        users = await loop.run_in_executor(None, sdk.get_users)
        return {"device_id": str(device_id), "total_users": len(users), "users": users}
    except RuntimeError as e:
        raise HTTPException(502, str(e))


@router.post("/{device_id}/sdk/import-users", dependencies=[Depends(PermissionChecker("device:sync"))])
async def import_sdk_users(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from app.services.sdk_service import ZKSDKService
    from app.repositories.employee import EmployeeRepository
    from app.repositories.base import BaseRepository
    from app.models.employee import EmployeeStatus
    from app.models.employee_device_mapping import EmployeeDeviceMapping

    repo = DeviceRepository(db)
    device = await repo.get_by_id(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    if not device.ip_address:
        raise HTTPException(400, "Device has no IP address")

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
        sdk = ZKSDKService(ip=ip, port=port, timeout=5)
        users = await loop.run_in_executor(None, sdk.get_users)
    except RuntimeError as e:
        raise HTTPException(502, str(e))

    emp_repo = EmployeeRepository(db)
    mapping_repo = BaseRepository(EmployeeDeviceMapping, db)
    created = 0
    skipped = 0
    results = []

    for u in users:
        uid = str(u["user_id"])
        existing_emp = await emp_repo.get_by_device_user_id(uid, device_id)
        if existing_emp:
            skipped += 1
            results.append({"user_id": uid, "name": u["name"], "status": "already_mapped"})
            continue

        emp_code = f"DEV-{device.serial_number[-4:]}-{uid}"
        if await emp_repo.get_by_field("employee_code", emp_code):
            emp_code = f"DEV-{uid}-{device.serial_number[-6:]}"

        employee = await emp_repo.create({
            "employee_code": emp_code,
            "full_name": u["name"] or f"Employee {uid}",
            "status": EmployeeStatus.ACTIVE,
        })
        await mapping_repo.create({
            "employee_id": employee.id,
            "device_id": device_id,
            "device_user_id": uid,
        })
        created += 1
        results.append({"user_id": uid, "name": u["name"], "status": "imported", "employee_code": emp_code})

    await db.commit()
    return {"total_on_device": len(users), "imported": created, "skipped": skipped, "results": results}


@router.get("/{device_id}/sdk/test-connection", dependencies=[Depends(PermissionChecker("device:view"))])
async def test_device_connection(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Test TCP connectivity to a device. Returns diagnostic info for troubleshooting."""
    import asyncio
    repo = DeviceRepository(db)
    device = await repo.get_by_id(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    if not device.ip_address:
        raise HTTPException(400, "Device has no IP address")

    from app.services.sdk_service import ZKSDKService
    from app.services.device_queue_manager import DeviceQueueManager

    # Check if DeviceQueueManager worker is active
    manager = await DeviceQueueManager.get_instance()
    worker = manager._workers.get(device.ip_address)
    if worker and worker.state.value == "busy":
        raise HTTPException(
            409,
            f"Device {device.name} is busy with {worker.current_job.job_type}. Wait and retry."
        )

    # Use run_sdk_operations for exclusive access
    def _test_connection(sdk):
        return sdk.test_connection()

    try:
        result = await manager.run_sdk_operations(
            device_ip=device.ip_address,
            handler=_test_connection,
            timeout=15,
        )
        result["device_name"] = device.name
        result["serial_number"] = device.serial_number
        result["enrollment_active"] = ZKSDKService.is_enrollment_active(device.ip_address)
        return result
    except Exception as e:
        raise HTTPException(
            502,
            f"Connection test failed: {e}"
        )
