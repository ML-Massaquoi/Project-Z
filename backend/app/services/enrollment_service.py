"""
Project Z - Enrollment Service
Manages biometric enrollment sessions for employees.
Auto-syncs to all devices after enrollment completion.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.device_user import DeviceUser
from app.models.employee import Employee, EmployeeStatus
from app.models.enrollment_event import EnrollmentEvent
from app.models.enrollment_session import (
    BiometricStatus,
    EnrollmentSession,
    EnrollmentStatus,
)
from app.models.face_template import FaceTemplate
from app.models.fingerprint_template import (
    BiometricType,
    FingerprintTemplate,
    SyncStatus,
)

logger = logging.getLogger(__name__)

SDK_TIMEOUT_SECONDS = 5
TCP_PROBE_TIMEOUT = 3


def _check_sdk_port(ip: str, port: int) -> bool:
    """Synchronous TCP port probe."""
    try:
        with __import__("socket").create_connection((ip, port), timeout=TCP_PROBE_TIMEOUT):
            return True
    except (ConnectionRefusedError, TimeoutError, OSError):
        return False


class EnrollmentService:
    """
    Manages biometric enrollment sessions.

    Flow:
    1. HR creates employee with status PENDING_ENROLLMENT
    2. HR selects online device
    3. HR clicks "Begin Enrollment" -> creates session
    4. Server sends enrollment command to device via SDK TCP
    5. Device enters enrollment mode, employee places finger
    6. Device captures fingerprint, sends via ADMS or SDK callback
    7. Server stores template, updates session status
    8. Process repeats for face
    9. Enrollment complete -> employee becomes ACTIVE
    10. Auto-sync to all authorized devices
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_session(
        self,
        employee_id: UUID,
        device_id: UUID,
        user_id: Optional[UUID] = None,
        username: Optional[str] = None,
    ) -> EnrollmentSession:
        """Create a new enrollment session."""
        employee = await self.session.get(Employee, employee_id)
        if not employee:
            raise ValueError(f"Employee {employee_id} not found")

        device = await self.session.get(Device, device_id)
        if not device:
            raise ValueError(f"Device {device_id} not found")

        if not device.is_online:
            raise ValueError(f"Device {device.name} is not online")

        existing = await self.session.execute(
            select(EnrollmentSession).where(
                and_(
                    EnrollmentSession.employee_id == employee_id,
                    EnrollmentSession.status.notin_([
                        EnrollmentStatus.ENROLLMENT_COMPLETE,
                        EnrollmentStatus.CANCELLED,
                        EnrollmentStatus.FAILED,
                    ]),
                )
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError(
                f"Employee {employee.employee_code} already has an active enrollment session"
            )

        session = EnrollmentSession(
            employee_id=employee_id,
            device_id=device_id,
            status=EnrollmentStatus.WAITING_FOR_FINGERPRINT,
            fingerprint_status=BiometricStatus.PENDING,
            face_status=BiometricStatus.PENDING,
            started_by_user_id=user_id,
            started_by_username=username,
            started_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        self.session.add(session)
        await self.session.flush()

        event = EnrollmentEvent(
            session_id=session.id,
            employee_id=employee_id,
            device_id=device_id,
            event_type="started",
            biometric_type="fingerprint",
            details={"device_name": device.name, "device_ip": device.ip_address},
        )
        self.session.add(event)
        await self.session.flush()

        logger.info(
            f"[Enrollment] Session created: employee={employee.employee_code} "
            f"device={device.name} ({device.ip_address})"
        )

        return session

    async def begin_enrollment_on_device(
        self, session_id: UUID
    ) -> dict:
        """
        Send enrollment command to device via SDK TCP.
        Returns connection status.
        """
        session = await self.session.get(EnrollmentSession, session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        device = await self.session.get(Device, session.device_id)
        if not device:
            raise ValueError("Device not found")

        ip = device.ip_address
        port = device.sdk_port or 4370

        # Mark enrollment active to prevent DeviceQueueManager workers from connecting
        from app.services.sdk_service import ZKSDKService
        ZKSDKService.mark_enrollment_active(ip)

        loop = asyncio.get_event_loop()
        sdk_reachable = await loop.run_in_executor(
            None, _check_sdk_port, ip, port
        )
        if not sdk_reachable:
            ZKSDKService.mark_enrollment_inactive(ip)
            session.status = EnrollmentStatus.FAILED
            session.error_message = f"SDK port {port} not reachable on {device.name}"
            await self.session.flush()
            return {"success": False, "error": session.error_message}

        session.status = EnrollmentStatus.FINGERPRINT_IN_PROGRESS
        session.fingerprint_status = BiometricStatus.IN_PROGRESS
        await self.session.flush()

        logger.info(
            f"[Enrollment] Enrollment started on device {device.name} "
            f"for session {session_id}"
        )

        return {
            "success": True,
            "session_id": str(session_id),
            "device_ip": ip,
            "device_name": device.name,
            "status": session.status,
        }

    async def receive_fingerprint_template(
        self,
        session_id: UUID,
        template_data: bytes,
        finger_index: int = 0,
        quality: float = 0.0,
    ) -> EnrollmentSession:
        """Store a captured fingerprint template from the device."""
        session = await self.session.get(EnrollmentSession, session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        employee = await self.session.get(Employee, session.employee_id)

        template = FingerprintTemplate(
            employee_id=session.employee_id,
            device_id=session.device_id,
            device_user_id=employee.employee_code if employee else "",
            finger_index=finger_index,
            template_data=template_data,
            template_size=len(template_data),
            biometric_type=BiometricType.FINGERPRINT.value,
            quality=int(quality),
            sync_status=SyncStatus.PENDING.value,
        )
        self.session.add(template)

        session.fingerprint_template_count += 1
        session.fingerprint_status = BiometricStatus.CAPTURED
        session.fingerprint_captured_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.status = EnrollmentStatus.FINGERPRINT_CAPTURED

        event = EnrollmentEvent(
            session_id=session_id,
            employee_id=session.employee_id,
            device_id=session.device_id,
            event_type="fingerprint_captured",
            biometric_type="fingerprint",
            details={
                "finger_index": finger_index,
                "quality": quality,
                "template_size": len(template_data),
                "total_fingers": session.fingerprint_template_count,
            },
        )
        self.session.add(event)
        await self.session.flush()

        logger.info(
            f"[Enrollment] Fingerprint captured: session={session_id} "
            f"finger={finger_index} quality={quality:.1f}"
        )

        return session

    async def begin_face_enrollment(
        self, session_id: UUID
    ) -> EnrollmentSession:
        """Transition session to face enrollment phase."""
        session = await self.session.get(EnrollmentSession, session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        session.status = EnrollmentStatus.WAITING_FOR_FACE
        session.face_status = BiometricStatus.IN_PROGRESS
        await self.session.flush()

        logger.info(f"[Enrollment] Face enrollment started: session={session_id}")
        return session

    async def receive_face_template(
        self,
        session_id: UUID,
        template_data: bytes,
        face_image: Optional[bytes] = None,
        quality: float = 0.0,
    ) -> EnrollmentSession:
        """Store a captured face template from the device."""
        session = await self.session.get(EnrollmentSession, session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        face_template = FaceTemplate(
            employee_id=session.employee_id,
            device_id=session.device_id,
            enrollment_session_id=session_id,
            template_data=template_data,
            template_size=len(template_data),
            face_image=face_image,
            quality_score=quality,
            sync_status="pending",
        )
        self.session.add(face_template)

        session.face_template_count += 1
        session.face_status = BiometricStatus.CAPTURED
        session.face_captured_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.status = EnrollmentStatus.FACE_CAPTURED

        event = EnrollmentEvent(
            session_id=session_id,
            employee_id=session.employee_id,
            device_id=session.device_id,
            event_type="face_captured",
            biometric_type="face",
            details={
                "quality": quality,
                "template_size": len(template_data),
                "has_image": face_image is not None,
            },
        )
        self.session.add(event)
        await self.session.flush()

        logger.info(f"[Enrollment] Face captured: session={session_id}")
        return session

    async def complete_enrollment(
        self, session_id: UUID
    ) -> EnrollmentSession:
        """Mark enrollment as complete, activate employee, and auto-sync to all devices."""
        session = await self.session.get(EnrollmentSession, session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Clear enrollment-active flag
        if session.device_id:
            device = await self.session.get(Device, session.device_id)
            if device and device.ip_address:
                from app.services.sdk_service import ZKSDKService
                ZKSDKService.mark_enrollment_inactive(device.ip_address)

        session.status = EnrollmentStatus.ENROLLMENT_COMPLETE
        session.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await self.session.flush()

        employee = await self.session.get(Employee, session.employee_id)
        if employee and employee.status.value in (
            EmployeeStatus.PENDING_ENROLLMENT.value,
            EmployeeStatus.ENROLLED.value,
        ):
            from app.services.employee_status_service import EmployeeStatusService
            status_svc = EmployeeStatusService(self.session)
            await status_svc.transition(
                employee_id=employee.id,
                new_status=EmployeeStatus.ACTIVE.value,
                reason="Enrollment completed",
                changed_by_user_id=session.started_by_user_id,
                changed_by_username=session.started_by_username,
            )

        event = EnrollmentEvent(
            session_id=session_id,
            employee_id=session.employee_id,
            device_id=session.device_id,
            event_type="completed",
            biometric_type="full_profile",
            details={
                "fingerprint_templates": session.fingerprint_template_count,
                "face_templates": session.face_template_count,
            },
        )
        self.session.add(event)
        await self.session.flush()

        logger.info(
            f"[Enrollment] Completed: session={session_id} "
            f"employee={session.employee_id} "
            f"fingerprints={session.fingerprint_template_count} "
            f"faces={session.face_template_count}"
        )

        # Phase 7: Auto-sync to all active online devices in background
        employee_id = session.employee_id
        asyncio.create_task(
            self._auto_sync_enrolled_employee(employee_id, session.started_by_username or "enrollment_system")
        )

        return session

    async def _auto_sync_enrolled_employee(
        self, employee_id: UUID, initiated_by: str = "enrollment_system"
    ):
        """
        Background task: push newly enrolled employee to all active online devices.
        Runs outside the current session to avoid holding DB connections.
        """
        from app.database.session import async_session_factory
        from app.services.device_sync_service import DeviceSyncService

        try:
            async with async_session_factory() as db:
                svc = DeviceSyncService(db)
                result = await svc.bulk_sync_employees(
                    employee_ids=[employee_id],
                    initiated_by=initiated_by,
                )
                logger.info(
                    f"[Enrollment] Auto-sync complete for employee {employee_id}: "
                    f"{result['completed']}/{result['total_devices']} devices synced, "
                    f"{result['failed']} failed"
                )
        except Exception as e:
            logger.error(
                f"[Enrollment] Auto-sync failed for employee {employee_id}: {e}",
                exc_info=True,
            )

    async def cancel_enrollment(
        self, session_id: UUID, reason: Optional[str] = None
    ) -> EnrollmentSession:
        """Cancel an in-progress enrollment session."""
        session = await self.session.get(EnrollmentSession, session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Clear enrollment-active flag
        if session.device_id:
            device = await self.session.get(Device, session.device_id)
            if device and device.ip_address:
                from app.services.sdk_service import ZKSDKService
                ZKSDKService.mark_enrollment_inactive(device.ip_address)

        session.status = EnrollmentStatus.CANCELLED
        session.cancelled_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.error_message = reason

        event = EnrollmentEvent(
            session_id=session_id,
            employee_id=session.employee_id,
            device_id=session.device_id,
            event_type="cancelled",
            biometric_type="full_profile",
            details={"reason": reason},
        )
        self.session.add(event)
        await self.session.flush()

        logger.info(f"[Enrollment] Cancelled: session={session_id} reason={reason}")
        return session

    async def get_active_sessions(
        self, device_id: Optional[UUID] = None
    ) -> list[EnrollmentSession]:
        """Get all active (in-progress) enrollment sessions."""
        query = select(EnrollmentSession).where(
            EnrollmentSession.status.notin_([
                EnrollmentStatus.ENROLLMENT_COMPLETE,
                EnrollmentStatus.CANCELLED,
                EnrollmentStatus.FAILED,
            ])
        )
        if device_id:
            query = query.where(EnrollmentSession.device_id == device_id)

        result = await self.session.execute(
            query.order_by(EnrollmentSession.started_at.desc())
        )
        return list(result.scalars().all())

    async def get_session_with_details(
        self, session_id: UUID
    ) -> Optional[dict]:
        """Get enrollment session with employee and device details."""
        session = await self.session.get(EnrollmentSession, session_id)
        if not session:
            return None

        employee = await self.session.get(Employee, session.employee_id)
        device = await self.session.get(Device, session.device_id) if session.device_id else None

        return {
            "session": session,
            "employee": employee,
            "device": device,
        }

    async def get_employee_templates(self, employee_id: UUID) -> list[dict]:
        """Get all fingerprint templates for an employee from the database."""
        from app.models.fingerprint_template import FingerprintTemplate

        result = await self.session.execute(
            select(FingerprintTemplate).where(
                FingerprintTemplate.employee_id == employee_id
            ).order_by(FingerprintTemplate.finger_index)
        )
        templates = result.scalars().all()

        return [
            {
                "id": str(t.id),
                "device_id": str(t.device_id),
                "device_user_id": t.device_user_id,
                "finger_index": t.finger_index,
                "template_size": t.template_size,
                "quality": t.quality,
                "sync_status": t.sync_status,
                "created_at": str(t.created_at) if t.created_at else None,
            }
            for t in templates
        ]
