"""
Project Z - Enrollment API Routes
Manages biometric enrollment sessions with real-time WebSocket events and audit trail.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database.session import get_db, async_session_factory
from app.models.enrollment_session import EnrollmentSession
from app.services.audit_service import log_audit
from app.services.enrollment_service import EnrollmentService
from app.services.websocket_service import ws_manager
from app.utils.audit_context import get_audit_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/enrollment", tags=["Enrollment"])


# ── Request/Response Schemas ──────────────────────────────────

class EnrollmentSessionCreate(BaseModel):
    employee_id: UUID
    device_id: UUID


class EnrollmentSessionResponse(BaseModel):
    id: UUID
    employee_id: UUID
    device_id: Optional[UUID]
    status: str
    fingerprint_status: str
    face_status: str
    fingerprint_template_count: int
    face_template_count: int
    error_message: Optional[str]
    started_by_username: Optional[str]
    started_at: Optional[str]
    fingerprint_captured_at: Optional[str]
    face_captured_at: Optional[str]
    completed_at: Optional[str]

    class Config:
        from_attributes = True


class FingerprintCaptureRequest(BaseModel):
    session_id: UUID
    template_data: str = Field(..., description="Base64-encoded fingerprint template")
    finger_index: int = Field(default=0, ge=0, le=9)
    quality: float = Field(default=0.0, ge=0.0, le=100.0)


class FaceCaptureRequest(BaseModel):
    session_id: UUID
    template_data: str = Field(..., description="Base64-encoded face template")
    face_image: Optional[str] = Field(None, description="Base64-encoded face image")
    quality: float = Field(default=0.0, ge=0.0, le=100.0)


class EnrollmentCompleteRequest(BaseModel):
    session_id: UUID


class EnrollmentCancelRequest(BaseModel):
    session_id: UUID
    reason: Optional[str] = None


class WizardCreateRequest(BaseModel):
    employee_code: str
    full_name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    gender: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    department_id: Optional[UUID] = None
    employment_type: Optional[str] = None
    shift_id: Optional[UUID] = None
    device_id: UUID


def _session_response(session: EnrollmentSession) -> EnrollmentSessionResponse:
    return EnrollmentSessionResponse(
        id=session.id,
        employee_id=session.employee_id,
        device_id=session.device_id,
        status=session.status,
        fingerprint_status=session.fingerprint_status,
        face_status=session.face_status,
        fingerprint_template_count=session.fingerprint_template_count,
        face_template_count=session.face_template_count,
        error_message=session.error_message,
        started_by_username=session.started_by_username,
        started_at=str(session.started_at) if session.started_at else None,
        fingerprint_captured_at=str(session.fingerprint_captured_at) if session.fingerprint_captured_at else None,
        face_captured_at=str(session.face_captured_at) if session.face_captured_at else None,
        completed_at=str(session.completed_at) if session.completed_at else None,
    )


async def _broadcast_enrollment_event(event_type: str, session: EnrollmentSession, employee_name: str = None, device_name: str = None):
    """Broadcast enrollment lifecycle event to all WebSocket clients."""
    await ws_manager.broadcast("enrollment.event", {
        "type": event_type,
        "session_id": str(session.id),
        "employee_id": str(session.employee_id),
        "employee_name": employee_name,
        "device_id": str(session.device_id) if session.device_id else None,
        "device_name": device_name,
        "status": session.status,
        "fingerprint_count": session.fingerprint_template_count,
        "face_count": session.face_template_count,
        "started_by": session.started_by_username,
    })


# ── Endpoints ─────────────────────────────────────────────────

@router.post("/sessions", response_model=EnrollmentSessionResponse)
async def create_enrollment_session(
    request: Request,
    body: EnrollmentSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create a new enrollment session for an employee on a device."""
    svc = EnrollmentService(db)
    try:
        session = await svc.create_session(
            employee_id=body.employee_id,
            device_id=body.device_id,
            user_id=current_user.id,
            username=current_user.username,
        )
        # Fetch employee/device names for broadcast and audit
        from app.models.employee import Employee
        from app.models.device import Device
        emp = await db.get(Employee, body.employee_id)
        dev = await db.get(Device, body.device_id)
        await _broadcast_enrollment_event(
            "session_created", session,
            employee_name=emp.full_name if emp else None,
            device_name=dev.name if dev else None,
        )
        audit_ctx = get_audit_context(request, current_user)
        await log_audit(
            db, action="enrollment_started", entity_type="enrollment_session",
            entity_id=str(session.id),
            details={
                "employee_id": str(body.employee_id),
                "employee_name": emp.full_name if emp else None,
                "device_id": str(body.device_id),
                "device_name": dev.name if dev else None,
            },
            **audit_ctx,
        )
        return _session_response(session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sessions/{session_id}/begin")
async def begin_enrollment(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Send enrollment command to device via SDK TCP."""
    svc = EnrollmentService(db)
    try:
        result = await svc.begin_enrollment_on_device(session_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sessions/fingerprint")
async def receive_fingerprint(
    body: FingerprintCaptureRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Store a captured fingerprint template and trigger auto-sync to all devices."""
    import base64
    svc = EnrollmentService(db)
    try:
        template_bytes = base64.b64decode(body.template_data)
        session = await svc.receive_fingerprint_template(
            session_id=body.session_id,
            template_data=template_bytes,
            finger_index=body.finger_index,
            quality=body.quality,
        )

        # Fetch employee and device names for broadcast
        from app.models.employee import Employee
        from app.models.device import Device
        emp = await db.get(Employee, session.employee_id)
        dev = await db.get(Device, session.device_id) if session.device_id else None

        # Broadcast fingerprint captured event
        await ws_manager.broadcast("enrollment.fingerprint_captured", {
            "session_id": str(session.id),
            "employee_id": str(session.employee_id),
            "employee_name": emp.full_name if emp else None,
            "device_id": str(session.device_id) if session.device_id else None,
            "device_name": dev.name if dev else None,
            "finger_index": body.finger_index,
            "quality": body.quality,
            "fingerprint_count": session.fingerprint_template_count,
        })

        # Trigger immediate auto-sync to all other devices
        # This runs in background so enrollment response is fast
        audit_ctx = get_audit_context(request, current_user)
        asyncio.create_task(
            _auto_sync_after_fingerprint(
                employee_id=session.employee_id,
                source_device_id=session.device_id,
                employee_name=emp.full_name if emp else None,
                initiated_by=current_user.username,
                db=db,
            )
        )

        # Audit log
        await log_audit(
            db, action="fingerprint_captured", entity_type="enrollment_session",
            entity_id=str(session.id),
            details={
                "employee_id": str(session.employee_id),
                "employee_name": emp.full_name if emp else None,
                "device_name": dev.name if dev else None,
                "finger_index": body.finger_index,
                "quality": body.quality,
                "total_fingers": session.fingerprint_template_count,
            },
            **audit_ctx,
        )

        return {
            "status": "ok",
            "session_status": session.status,
            "fingerprint_count": session.fingerprint_template_count,
            "sync_triggered": True,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sessions/face")
async def receive_face(
    body: FaceCaptureRequest,
    db: AsyncSession = Depends(get_db),
):
    """Store a captured face template (called by enrollment worker)."""
    import base64
    svc = EnrollmentService(db)
    try:
        template_bytes = base64.b64decode(body.template_data)
        face_image = base64.b64decode(body.face_image) if body.face_image else None
        session = await svc.receive_face_template(
            session_id=body.session_id,
            template_data=template_bytes,
            face_image=face_image,
            quality=body.quality,
        )
        await ws_manager.broadcast("enrollment.face_captured", {
            "session_id": str(session.id),
            "employee_id": str(session.employee_id),
            "quality": body.quality,
            "face_count": session.face_template_count,
        })
        return {
            "status": "ok",
            "session_status": session.status,
            "face_count": session.face_template_count,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sessions/complete")
async def complete_enrollment(
    body: EnrollmentCompleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark enrollment as complete, activate employee, and auto-sync to all devices."""
    svc = EnrollmentService(db)
    try:
        session = await svc.complete_enrollment(body.session_id)

        # Fetch names for broadcast and audit
        from app.models.employee import Employee
        from app.models.device import Device
        emp = await db.get(Employee, session.employee_id)
        dev = await db.get(Device, session.device_id) if session.device_id else None

        await _broadcast_enrollment_event(
            "enrollment_completed", session,
            employee_name=emp.full_name if emp else None,
            device_name=dev.name if dev else None,
        )

        audit_ctx = get_audit_context(request, current_user)
        await log_audit(
            db, action="enrollment_completed", entity_type="enrollment_session",
            entity_id=str(session.id),
            details={
                "employee_id": str(session.employee_id),
                "employee_name": emp.full_name if emp else None,
                "device_name": dev.name if dev else None,
                "fingerprint_count": session.fingerprint_template_count,
                "face_count": session.face_template_count,
            },
            **audit_ctx,
        )

        return {
            "status": "ok",
            "session_status": session.status,
            "completed_at": str(session.completed_at) if session.completed_at else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sessions/cancel")
async def cancel_enrollment(
    body: EnrollmentCancelRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Cancel an in-progress enrollment session."""
    svc = EnrollmentService(db)
    try:
        session = await svc.cancel_enrollment(body.session_id, body.reason)
        await _broadcast_enrollment_event("enrollment_cancelled", session)

        audit_ctx = get_audit_context(request, current_user)
        await log_audit(
            db, action="enrollment_cancelled", entity_type="enrollment_session",
            entity_id=str(session.id),
            details={
                "employee_id": str(session.employee_id),
                "reason": body.reason,
            },
            **audit_ctx,
        )

        return {"status": "ok", "session_status": session.status}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/sessions/active")
async def get_active_sessions(
    device_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get all active enrollment sessions."""
    svc = EnrollmentService(db)
    sessions = await svc.get_active_sessions(device_id)
    result = []
    for s in sessions:
        details = await svc.get_session_with_details(s.id)
        if details:
            result.append({
                "session_id": str(s.id),
                "employee_code": details["employee"].employee_code if details["employee"] else None,
                "employee_name": details["employee"].full_name if details["employee"] else None,
                "device_name": details["device"].name if details["device"] else None,
                "device_ip": details["device"].ip_address if details["device"] else None,
                "status": s.status,
                "fingerprint_status": s.fingerprint_status,
                "face_status": s.face_status,
                "fingerprint_count": s.fingerprint_template_count,
                "face_count": s.face_template_count,
                "started_at": str(s.started_at) if s.started_at else None,
            })
    return {"sessions": result, "total": len(result)}


@router.get("/templates/{employee_id}")
async def get_employee_templates(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get all fingerprint templates for an employee."""
    svc = EnrollmentService(db)
    templates = await svc.get_employee_templates(employee_id)
    return {"templates": templates, "total": len(templates)}


# ── Wizard Endpoints (Combined Create + Enroll) ──────────────

@router.get("/devices/online")
async def get_online_devices(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get all online active devices for enrollment wizard."""
    from app.models.device import Device
    from sqlalchemy import select
    result = await db.execute(
        select(Device).where(Device.is_online == True, Device.is_active == True)
    )
    devices = result.scalars().all()
    return {
        "devices": [
            {
                "id": str(d.id),
                "name": d.name,
                "ip_address": d.ip_address,
                "serial_number": d.serial_number,
                "model": d.model,
                "office_name": d.office.name if d.office else None,
            }
            for d in devices
        ],
        "total": len(devices),
    }


@router.post("/wizard/create-and-enroll")
async def wizard_create_and_enroll(
    body: WizardCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Wizard endpoint: Create employee + enrollment session in one step.
    Returns employee_id and session_id for the wizard to proceed with biometric capture.

    If an employee with the given code already exists and has PENDING_ENROLLMENT
    status (from a previous failed attempt), re-use the existing employee and
    create a new session instead of rejecting.
    """
    from app.models.employee import Employee, EmployeeStatus, EmploymentType
    from app.models.device import Device
    import sqlalchemy as sa
    from sqlalchemy import and_, select, func
    from sqlalchemy.exc import IntegrityError

    # Validate device is online
    device = await db.get(Device, body.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not device.is_online:
        raise HTTPException(status_code=400, detail=f"Device '{device.name}' is not online")

    # Check for existing employee with this code
    existing_emp = await db.execute(
        select(Employee).where(Employee.employee_code == body.employee_code)
    )
    existing_emp = existing_emp.scalar_one_or_none()

    if existing_emp:
        if existing_emp.status != EmployeeStatus.PENDING_ENROLLMENT:
            raise HTTPException(
                status_code=400,
                detail=f"Employee code '{body.employee_code}' belongs to an {existing_emp.status.value} employee. Use a different code."
            )
        # Re-enrollment: cancel any active sessions, then create a new one
        from app.models.enrollment_session import EnrollmentSession, EnrollmentStatus, BiometricStatus
        active_sessions = await db.execute(
            select(EnrollmentSession).where(
                and_(
                    EnrollmentSession.employee_id == existing_emp.id,
                    EnrollmentSession.status.notin_([
                        EnrollmentStatus.ENROLLMENT_COMPLETE,
                        EnrollmentStatus.CANCELLED,
                        EnrollmentStatus.FAILED,
                    ]),
                )
            )
        )
        for s in active_sessions.scalars().all():
            s.status = EnrollmentStatus.CANCELLED
            s.cancelled_at = datetime.now(timezone.utc).replace(tzinfo=None)
            s.error_message = "Superseded by new enrollment wizard session"

        session = EnrollmentSession(
            employee_id=existing_emp.id,
            device_id=body.device_id,
            status=EnrollmentStatus.WAITING_FOR_FINGERPRINT,
            fingerprint_status=BiometricStatus.PENDING,
            face_status=BiometricStatus.PENDING,
            started_by_user_id=current_user.id,
            started_by_username=current_user.username,
            started_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(session)
        await db.flush()

        audit_ctx = get_audit_context(request, current_user)
        await log_audit(
            db, action="wizard_re_enroll", entity_type="employee",
            entity_id=str(existing_emp.id),
            details={
                "employee_code": existing_emp.employee_code,
                "device_id": str(body.device_id),
                "device_name": device.name,
                "session_id": str(session.id),
                "reason": "Re-enrollment after previous failed attempt",
            },
            **audit_ctx,
        )

        await db.commit()

        logger.info(
            f"[EnrollmentWizard] Re-enrolling employee {existing_emp.employee_code} "
            f"({existing_emp.full_name}) + session {session.id} on device {device.name}"
        )

        return {
            "employee_id": str(existing_emp.id),
            "employee_code": existing_emp.employee_code,
            "employee_number": existing_emp.employee_number,
            "session_id": str(session.id),
            "device_name": device.name,
            "device_ip": device.ip_address,
        }

    # Parse employment_type
    emp_type = None
    if body.employment_type:
        try:
            emp_type = EmploymentType(body.employment_type)
        except ValueError:
            emp_type = EmploymentType.FULL_TIME

    # Validate department_id exists if provided
    validated_dept_id = None
    if body.department_id:
        dept_check = await db.execute(sa.text(
            "SELECT id FROM departments WHERE id = :dept_id"
        ), {"dept_id": body.department_id})
        if dept_check.first():
            validated_dept_id = body.department_id

    # Auto-generate employee_number from max existing number (thread-safe via flush)
    max_num_result = await db.execute(sa.text(
        "SELECT COALESCE(MAX(CAST(employee_number AS INTEGER)), 0) FROM employees "
        "WHERE employee_number ~ '^[0-9]+$'"
    ))
    next_number = (max_num_result.scalar() or 0) + 1
    employee_number = f"{next_number:04d}"
    employee = Employee(
        employee_code=body.employee_code,
        employee_number=employee_number,
        full_name=body.full_name,
        first_name=body.first_name,
        last_name=body.last_name,
        middle_name=body.middle_name,
        gender=body.gender,
        email=body.email or None,
        phone=body.phone or None,
        position=body.position or None,
        department_id=validated_dept_id,
        shift_id=None,
        employment_type=emp_type.value if emp_type else None,
        status=EmployeeStatus.PENDING_ENROLLMENT,
    )
    db.add(employee)
    await db.flush()

    # Create enrollment session
    from app.models.enrollment_session import EnrollmentSession, EnrollmentStatus, BiometricStatus
    session = EnrollmentSession(
        employee_id=employee.id,
        device_id=body.device_id,
        status=EnrollmentStatus.WAITING_FOR_FINGERPRINT,
        fingerprint_status=BiometricStatus.PENDING,
        face_status=BiometricStatus.PENDING,
        started_by_user_id=current_user.id,
        started_by_username=current_user.username,
        started_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(session)
    await db.flush()

    # Audit log
    audit_ctx = get_audit_context(request, current_user)
    await log_audit(
        db, action="wizard_create_and_enroll", entity_type="employee",
        entity_id=str(employee.id),
        details={
            "employee_code": employee.employee_code,
            "employee_number": employee_number,
            "full_name": employee.full_name,
            "device_id": str(body.device_id),
            "device_name": device.name,
            "session_id": str(session.id),
        },
        **audit_ctx,
    )

    await db.commit()

    logger.info(
        f"[EnrollmentWizard] Created employee {employee.employee_code} "
        f"(#{employee_number}) + session {session.id} on device {device.name}"
    )

    return {
        "employee_id": str(employee.id),
        "employee_code": employee.employee_code,
        "employee_number": employee_number,
        "session_id": str(session.id),
        "device_name": device.name,
        "device_ip": device.ip_address,
    }


@router.post("/wizard/poll-fingerprint/{session_id}")
async def wizard_poll_fingerprint(
    session_id: UUID,
    timeout: int = Query(default=60, ge=5, le=120),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Command the device to open its fingerprint scan window and capture a template.
    1. Registers the employee on the device (if not already)
    2. Sends enroll_user command which opens the scan window on the device
    3. Waits for the physical fingerprint scan
    4. Returns the captured template

    Uses per-device locking to prevent conflicts with SDK polling worker.
    """
    import asyncio
    import base64

    from app.models.enrollment_session import EnrollmentSession
    from app.models.device import Device
    from app.models.employee import Employee
    from app.models.employee_device_mapping import EmployeeDeviceMapping
    from app.services.sdk_service import ZKSDKService, get_device_lock
    from sqlalchemy import select, and_

    session = await db.get(EnrollmentSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    device = await db.get(Device, session.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not device.is_online:
        raise HTTPException(status_code=400, detail=f"Device '{device.name}' is not online. The dashboard shows it as degraded — check network connectivity and restart the device.")

    employee = await db.get(Employee, session.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    device_ip = device.ip_address
    device_port = device.sdk_port or 4370

    # Quick TCP probe before full enrollment — gives immediate feedback if device is unreachable
    import socket
    try:
        with socket.create_connection((device_ip, device_port), timeout=5):
            pass
    except (ConnectionRefusedError, TimeoutError, OSError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"Device {device.name} ({device_ip}:{device_port}) is not reachable. Check if the device is powered on and connected to the network. Error: {e}"
        )

    # Mark enrollment active FIRST — workers check this flag and skip the device.
    ZKSDKService.mark_enrollment_active(device_ip)

    # MUST acquire the device lock — ZKTeco devices only support ONE TCP session.
    # Workers check enrollment_active INSIDE their lock blocks before SDK operations,
    # so they yield within milliseconds of the flag being set. Worst-case wait is
    # bounded by a single in-flight SDK operation (~30s for pull_templates).
    device_lock = get_device_lock(device_ip)
    lock_acquired = False
    try:
        await asyncio.wait_for(device_lock.acquire(), timeout=90.0)
        lock_acquired = True
    except asyncio.TimeoutError:
        ZKSDKService.mark_enrollment_inactive(device_ip)
        raise HTTPException(
            status_code=409,
            detail=(
                f"Device {device.name} is busy with a long-running background sync. "
                "Please wait 1-2 minutes for the sync to complete, then try again."
            ),
        )

    try:
        result = await _execute_fingerprint_enrollment(
            session, device, employee, device_ip, device_port, timeout, db
        )
        return result
    finally:
        ZKSDKService.mark_enrollment_inactive(device_ip)
        if lock_acquired:
            device_lock.release()


async def _auto_sync_after_fingerprint(
    employee_id: UUID,
    source_device_id: Optional[UUID],
    employee_name: Optional[str],
    initiated_by: str,
    db: AsyncSession,
):
    """
    Background task: Immediately sync newly captured fingerprint to all other devices.
    Runs outside the current request to avoid blocking the enrollment response.
    """
    try:
        # Broadcast sync started event
        await ws_manager.broadcast("enrollment.sync.started", {
            "employee_id": str(employee_id),
            "employee_name": employee_name,
            "message": f"Syncing fingerprint to all devices...",
        })

        # Use a fresh DB session for background task
        async with async_session_factory() as bg_db:
            # Get all active online devices except the source device
            from app.models.device import Device
            from sqlalchemy import select, and_

            result = await bg_db.execute(
                select(Device).where(
                    and_(
                        Device.is_active == True,
                        Device.is_online == True,
                        Device.id != source_device_id if source_device_id else True,
                    )
                )
            )
            devices = result.scalars().all()

            if not devices:
                logger.info(f"[EnrollmentSync] No other devices to sync to for employee {employee_id}")
                await ws_manager.broadcast("enrollment.sync.completed", {
                    "employee_id": str(employee_id),
                    "employee_name": employee_name,
                    "devices_synced": 0,
                    "message": "No other devices available for sync.",
                })
                return

            from app.services.device_sync_service import DeviceSyncService
            sync_svc = DeviceSyncService(bg_db)

            logger.info(
                f"[EnrollmentSync] Syncing employee {employee_name} to {len(devices)} devices..."
            )

            # Push employee to all devices (users + templates)
            sync_result = await sync_svc.bulk_sync_employees(
                employee_ids=[employee_id],
                initiated_by=f"enrollment_{initiated_by}",
            )

            # Broadcast sync completed event
            await ws_manager.broadcast("enrollment.sync.completed", {
                "employee_id": str(employee_id),
                "employee_name": employee_name,
                "total_devices": sync_result["total_devices"],
                "devices_synced": sync_result["completed"],
                "devices_failed": sync_result["failed"],
                "message": f"Synced to {sync_result['completed']}/{sync_result['total_devices']} devices.",
            })

            # Broadcast individual device results
            for device_result in sync_result.get("results", []):
                await ws_manager.broadcast("enrollment.sync.device", {
                    "employee_id": str(employee_id),
                    "employee_name": employee_name,
                    "device_id": device_result["device_id"],
                    "device_name": device_result["device_name"],
                    "status": device_result["status"],
                    "users_synced": device_result.get("users_synced", 0),
                    "templates_synced": device_result.get("templates_synced", 0),
                    "error": device_result.get("error"),
                })

            logger.info(
                f"[EnrollmentSync] Sync complete for {employee_name}: "
                f"{sync_result['completed']}/{sync_result['total_devices']} devices synced"
            )

    except Exception as e:
        logger.error(f"[EnrollmentSync] Auto-sync failed for employee {employee_id}: {e}", exc_info=True)
        await ws_manager.broadcast("enrollment.sync.failed", {
            "employee_id": str(employee_id),
            "employee_name": employee_name,
            "error": str(e),
            "message": f"Sync failed: {str(e)}",
        })


async def _execute_fingerprint_enrollment(
    session, device, employee, device_ip: str, device_port: int, timeout: int, db
) -> dict:
    """
    Active fingerprint enrollment using CMD_STARTENROLL (verified on ZMM220_TFT).

    Based on verified testing with RONASOFT MX-710 (ZMM220_TFT):
      - CMD_STARTENROLL IS supported
      - enroll_user() returns False when session ends (not reliable for success detection)
      - Templates ARE captured on the device even when return is False
      - Must verify enrollment by checking templates afterward

    Flow:
      1. Register the user on the device
      2. Record baseline template count
      3. Send enroll_user() command (blocks until finger scanned or timeout)
      4. Verify by checking templates after command returns
    """
    import asyncio
    import base64
    import hashlib
    import time

    from app.models.employee_device_mapping import EmployeeDeviceMapping
    from app.services.sdk_service import ZKSDKService
    from sqlalchemy import select, and_

    sdk = ZKSDKService(device_ip, device_port, timeout=120)

    try:
      return await _execute_fingerprint_enrollment_inner(sdk, session, device, employee, device_ip, device_port, timeout, db)
    finally:
      try:
          sdk.disconnect()
      except Exception:
          pass


async def _execute_fingerprint_enrollment_inner(
    sdk, session, device, employee, device_ip: str, device_port: int, timeout: int, db
) -> dict:
    import asyncio
    import base64
    import hashlib
    import time

    from app.models.employee_device_mapping import EmployeeDeviceMapping
    from app.services.sdk_service import ZKSDKService
    from sqlalchemy import select, and_

    device_uid = None
    device_user_id = employee.employee_code

    mapping_result = await db.execute(
        select(EmployeeDeviceMapping).where(
            and_(
                EmployeeDeviceMapping.employee_id == employee.id,
                EmployeeDeviceMapping.device_id == device.id,
            )
        )
    )
    mapping = mapping_result.scalar_one_or_none()
    if mapping:
        device_user_id = mapping.device_user_id or employee.employee_code

    loop = asyncio.get_event_loop()

    # Phase 1: Connect, find/register user on device
    # Data operations (get_users, set_user, get_templates) use disable_device
    # to prevent real-time events from interfering. enroll_user ALSO needs
    # disable_device on ZMM220_TFT — without it the device rejects CMD_STARTENROLL.
    try:
        conn = await loop.run_in_executor(None, sdk._connect_with_retry, 3, 1.5)
        existing_users = await loop.run_in_executor(None, conn.get_users)

        for u in existing_users:
            if u.user_id == device_user_id:
                device_uid = u.uid
                break

        if device_uid is None:
            existing_uids = {u.uid for u in existing_users}
            device_uid = max(existing_uids) + 1 if existing_uids else 1

            def _create_user():
                conn.disable_device()
                conn.set_user(
                    uid=device_uid,
                    name=employee.full_name[:8],
                    privilege=0,
                    password="",
                    group_id="",
                    user_id=device_user_id,
                    card=0,
                )
                conn.enable_device()

            await loop.run_in_executor(None, _create_user)
            logger.info(
                f"[EnrollmentWizard] Registered employee {employee.employee_code} "
                f"on device as uid={device_uid}"
            )

        # Record baseline templates BEFORE enrollment to detect new ones.
        all_templates = await loop.run_in_executor(None, sdk.get_templates)
        baseline_hashes = {}
        baseline_count = 0
        for t in all_templates:
            if t["uid"] == device_uid and t["valid"] and t["template"]:
                key = (t["uid"], t["fid"])
                baseline_hashes[key] = hashlib.md5(t["template"]).hexdigest()
                baseline_count += 1
        logger.info(
            f"[EnrollmentWizard] Baseline templates for uid={device_uid}: "
            f"{baseline_count} templates"
        )

        # Disconnect and reconnect fresh before enrollment
        # to ensure a clean TCP session for CMD_STARTENROLL.
        await loop.run_in_executor(None, sdk.disconnect)
        await asyncio.sleep(0.5)
        conn = await loop.run_in_executor(None, sdk._connect_with_retry, 2, 1.0)

        # Re-register user on fresh connection with proper disable/enable wrapping
        def _re_set_user():
            conn.disable_device()
            conn.set_user(
                uid=device_uid,
                name=employee.full_name[:8],
                privilege=0,
                password="",
                group_id="",
                user_id=device_user_id,
                card=0,
            )
            conn.enable_device()

        await loop.run_in_executor(None, _re_set_user)

    except Exception as e:
        sdk.disconnect()
        logger.error(f"[EnrollmentWizard] Failed to setup user on device: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to setup user on device: {e}")

    # Phase 2: Send enrollment command (active enrollment)
    # Broadcast enrollment started event
    await ws_manager.broadcast("enrollment.fingerprint.started", {
        "session_id": str(session.id),
        "employee_id": str(session.employee_id),
        "device_ip": device_ip,
        "device_uid": device_uid,
        "message": "Device entered enrollment mode. Please place your finger on the scanner.",
    })

    logger.info(
        f"[EnrollmentWizard] Sending enrollment command to {device_ip} "
        f"uid={device_uid}, user_id={device_user_id} (timeout={timeout}s)"
    )

    # Determine which finger indexes are already taken to avoid conflicts
    existing_fids = {t["fid"] for t in all_templates if t["uid"] == device_uid and t["valid"]}
    finger_index = 0
    while finger_index in existing_fids and finger_index < 10:
        finger_index += 1
    if finger_index >= 10:
        finger_index = 0  # All fingers taken, try 0 anyway (device may overwrite)
    logger.info(
        f"[EnrollmentWizard] Using finger_index={finger_index} for enrollment "
        f"(existing fids on device: {sorted(existing_fids)})"
    )

    # Send enrollment command in a thread (it blocks waiting for finger scan).
    # CRITICAL: We must WAIT for the thread to finish before creating any new
    # SDK connections for verification. ZKTeco devices only support ONE TCP
    # session — a second connection would kick the first, causing "timed out".
    #
    # ZMM220_TFT requires disable_device before enroll_user. Despite the name,
    # disable_device on this firmware does NOT prevent the enrollment prompt —
    # it stops real-time event polling which would otherwise interfere with the
    # CMD_STARTENROLL command. Without disable_device, the device rejects the
    # enrollment command with "Cant Enroll user".
    import threading
    enrollment_result = {"completed": False, "error": None}
    enrollment_done = threading.Event()

    def do_enrollment(fid: int):
        try:
            conn = sdk._get_connection()
            conn.disable_device()
            try:
                result = conn.enroll_user(uid=device_uid, temp_id=fid, user_id=device_user_id)
                enrollment_result["completed"] = True
                logger.info(f"[EnrollmentWizard] enroll_user(fid={fid}) returned: {result}")
            finally:
                try:
                    conn.enable_device()
                except Exception:
                    pass
        except Exception as e:
            enrollment_result["error"] = str(e)
            logger.error(f"[EnrollmentWizard] Enrollment command error: {e}")
        finally:
            enrollment_done.set()

    # Start enrollment thread, then wait for it to COMPLETE (not just timeout).
    # enroll_user() blocks on device until finger scanned or device-side timeout.
    # CRITICAL: We MUST wait for the thread to fully finish before creating any new
    # SDK connections for verification. ZKTeco devices only support ONE TCP
    # session — a second connection would kick the first, causing "timed out".
    thread = threading.Thread(target=do_enrollment, args=(finger_index,), daemon=True)
    thread.start()

    # Wait generously — enroll_user blocks until device timeout (~60s).
    # Add large buffer so we never proceed to verification while enrollment thread is alive.
    await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: enrollment_done.wait(timeout=timeout + 60)
    )

    # Double-check: if thread is still alive, wait a bit more
    if thread.is_alive():
        logger.warning("[EnrollmentWizard] Enrollment thread still alive after wait, waiting 5s more")
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: enrollment_done.wait(timeout=5)
        )

    # Thread has finished. Disconnect the enrollment SDK to free the TCP session
    # before creating a new connection for verification.
    try:
        sdk.disconnect()
    except Exception:
        pass
    await asyncio.sleep(0.5)

    if enrollment_result["error"]:
        logger.warning(
            f"[EnrollmentWizard] Enrollment command reported error: {enrollment_result['error']}, "
            f"but continuing to verification phase — templates may still have been captured"
        )

    # Phase 3: Verify enrollment by checking templates with retry
    # The device needs time to finalize template storage after the scan.
    MAX_VERIFY_RETRIES = 5
    VERIFY_DELAY_SECONDS = 2

    for attempt in range(1, MAX_VERIFY_RETRIES + 1):
        await asyncio.sleep(VERIFY_DELAY_SECONDS)

        try:
            # Reconnect to verify templates
            verify_sdk = ZKSDKService(device_ip, device_port, timeout=15)
            await loop.run_in_executor(None, verify_sdk._connect_with_retry, 2, 1.0)

            all_templates = await loop.run_in_executor(None, verify_sdk.get_templates)
            user_templates = [t for t in all_templates if t["uid"] == device_uid and t["valid"] and t["template"]]

            # Find new or changed templates
            captured_templates = []
            for t in user_templates:
                key = (t["uid"], t["fid"])
                current_hash = hashlib.md5(t["template"]).hexdigest()
                if key not in baseline_hashes or baseline_hashes[key] != current_hash:
                    template_bytes = t["template"]
                    template_b64 = base64.b64encode(template_bytes).decode() if isinstance(template_bytes, bytes) else str(template_bytes)
                    captured_templates.append({
                        "template_data": template_b64,
                        "finger_index": t["fid"],
                        "quality": 0,
                    })

            verify_sdk.disconnect()

            if captured_templates:
                template = captured_templates[0]
                logger.info(
                    f"[EnrollmentWizard] Fingerprint verified on attempt {attempt}: "
                    f"uid={device_uid}, fid={template['finger_index']}, "
                    f"new_templates={len(captured_templates)}"
                )

                await ws_manager.broadcast("enrollment.fingerprint.saved", {
                    "session_id": str(session.id),
                    "employee_id": str(session.employee_id),
                    "finger_index": template["finger_index"],
                    "template_count": len(user_templates),
                    "message": "Fingerprint captured and verified successfully.",
                })

                return {
                    "status": "captured",
                    "template_data": template["template_data"],
                    "finger_index": template["finger_index"],
                    "quality": template["quality"],
                    "device_user_id": device_user_id,
                    "device_uid": device_uid,
                }
            else:
                logger.info(
                    f"[EnrollmentWizard] Verification attempt {attempt}/{MAX_VERIFY_RETRIES}: "
                    f"no new templates yet (found {len(user_templates)} existing)"
                )

        except Exception as e:
            logger.warning(
                f"[EnrollmentWizard] Verification attempt {attempt} error: {e}"
            )

    # All retries exhausted — no template detected
    logger.warning(
        f"[EnrollmentWizard] No new templates detected after {MAX_VERIFY_RETRIES} attempts "
        f"for uid={device_uid}."
    )

    # Broadcast timeout event
    await ws_manager.broadcast("enrollment.fingerprint.timeout", {
        "session_id": str(session.id),
        "employee_id": str(session.employee_id),
        "device_ip": device_ip,
        "message": "No fingerprint detected. Please try again.",
    })

    return {
        "status": "timeout",
        "message": "No fingerprint detected. Please place your finger on the device scanner and try again.",
    }
