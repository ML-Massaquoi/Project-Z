"""
Employee Enrollment Detection Service.

Detects when employees are enrolled on devices (via SDK polling),
creates enrollment audit trail records, and handles biometric-type detection.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import async_session_factory
from app.models.employee_enrollment_history import EmployeeEnrollmentHistory
from app.models.device_user import DeviceUser
from app.models.employee import Employee

logger = logging.getLogger(__name__)


async def record_enrollment_event(
    employee_id: UUID,
    device_id: UUID,
    device_user_id: str,
    action: str,
    enrollment_type: str = "fingerprint",
    details: Optional[dict] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """Record an enrollment event (enrolled, updated, removed, synced)."""
    event = EmployeeEnrollmentHistory(
        employee_id=employee_id,
        device_id=device_id,
        device_user_id=device_user_id,
        action=action,
        enrollment_type=enrollment_type,
        details=details,
        created_at=datetime.now(timezone.utc),
    )

    if db:
        db.add(event)
    else:
        async with async_session_factory() as session:
            session.add(event)
            await session.commit()

    logger.info(
        f"[Enrollment] {action} | employee={employee_id} device={device_id} "
        f"device_user_id={device_user_id} type={enrollment_type}"
    )


async def detect_enrollments_from_sync(
    device_id: UUID,
    sync_result,
    db: AsyncSession,
) -> int:
    """
    After a user sync operation, record enrollment history for new users.
    Returns count of enrollment events created.
    """
    count = 0

    for added in getattr(sync_result, "added", []):
        device_user_id = added.get("device_user_id")
        if not device_user_id:
            continue

        # Try to find the employee mapped to this device user
        du_result = await db.execute(
            select(DeviceUser).where(
                and_(
                    DeviceUser.device_id == device_id,
                    DeviceUser.device_user_id == device_user_id,
                )
            )
        )
        device_user = du_result.scalar_one_or_none()

        if device_user and device_user.employee_id:
            await record_enrollment_event(
                employee_id=device_user.employee_id,
                device_id=device_id,
                device_user_id=device_user_id,
                action="enrolled",
                enrollment_type="fingerprint",
                details={"name": added.get("name"), "source": "device_sync"},
                db=db,
            )
            count += 1

    for removed in getattr(sync_result, "removed", []):
        device_user_id = removed.get("device_user_id")
        if not device_user_id:
            continue

        employee_id = removed.get("mapped_to_employee_id")
        if employee_id:
            await record_enrollment_event(
                employee_id=UUID(employee_id) if isinstance(employee_id, str) else employee_id,
                device_id=device_id,
                device_user_id=device_user_id,
                action="removed",
                enrollment_type="fingerprint",
                details={"name": removed.get("name"), "source": "device_sync"},
                db=db,
            )
            count += 1

    return count


async def get_employee_enrollment_history(
    employee_id: UUID,
    limit: int = 50,
) -> list[dict]:
    """Get enrollment history for an employee."""
    async with async_session_factory() as session:
        result = await session.execute(
            select(EmployeeEnrollmentHistory)
            .where(EmployeeEnrollmentHistory.employee_id == employee_id)
            .order_by(EmployeeEnrollmentHistory.created_at.desc())
            .limit(limit)
        )
        return [
            {
                "id": str(r.id),
                "device_id": str(r.device_id),
                "device_user_id": r.device_user_id,
                "action": r.action,
                "enrollment_type": r.enrollment_type,
                "details": r.details,
                "created_at": r.created_at.isoformat(),
            }
            for r in result.scalars().all()
        ]


async def get_device_enrollment_history(
    device_id: UUID,
    limit: int = 50,
) -> list[dict]:
    """Get enrollment history for a device."""
    async with async_session_factory() as session:
        result = await session.execute(
            select(EmployeeEnrollmentHistory)
            .where(EmployeeEnrollmentHistory.device_id == device_id)
            .order_by(EmployeeEnrollmentHistory.created_at.desc())
            .limit(limit)
        )
        return [
            {
                "id": str(r.id),
                "employee_id": str(r.employee_id),
                "device_user_id": r.device_user_id,
                "action": r.action,
                "enrollment_type": r.enrollment_type,
                "details": r.details,
                "created_at": r.created_at.isoformat(),
            }
            for r in result.scalars().all()
        ]


async def get_recent_enrollment_events(limit: int = 20) -> list[dict]:
    """Get recent enrollment events across all devices."""
    async with async_session_factory() as session:
        result = await session.execute(
            select(EmployeeEnrollmentHistory)
            .order_by(EmployeeEnrollmentHistory.created_at.desc())
            .limit(limit)
        )
        return [
            {
                "id": str(r.id),
                "employee_id": str(r.employee_id),
                "device_id": str(r.device_id),
                "device_user_id": r.device_user_id,
                "action": r.action,
                "enrollment_type": r.enrollment_type,
                "details": r.details,
                "created_at": r.created_at.isoformat(),
            }
            for r in result.scalars().all()
        ]
