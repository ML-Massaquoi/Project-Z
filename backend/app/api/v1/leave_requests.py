"""
Project Z - Leave Requests API
POST   /api/v1/leave-requests
GET    /api/v1/leave-requests
GET    /api/v1/leave-requests/{id}
PUT    /api/v1/leave-requests/{id}/approve
PUT    /api/v1/leave-requests/{id}/reject
"""
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.leave_request import LeaveRequest, LeaveStatus, LeaveType

router = APIRouter(prefix="/leave-requests", tags=["Leave Requests"])


class LeaveRequestCreate(BaseModel):
    employee_id: UUID
    leave_type: str
    start_date: date
    end_date: date
    reason: Optional[str] = None


def _serialize(r: LeaveRequest) -> dict:
    return {
        "id": str(r.id),
        "employee_id": str(r.employee_id),
        "leave_type": r.leave_type.value if hasattr(r.leave_type, "value") else str(r.leave_type),
        "start_date": str(r.start_date),
        "end_date": str(r.end_date),
        "status": r.status.value if hasattr(r.status, "value") else str(r.status),
        "approver_id": str(r.approver_id) if r.approver_id else None,
        "reason": r.reason,
        "created_at": r.created_at.isoformat(),
        "updated_at": r.updated_at.isoformat(),
    }


@router.post("", status_code=201, dependencies=[Depends(PermissionChecker("attendance:view"))])
async def create_leave_request(
    data: LeaveRequestCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Create a new leave request. Returns HTTP 422 for invalid leave_type."""
    try:
        leave_type = LeaveType(data.leave_type)
    except ValueError:
        valid = [e.value for e in LeaveType]
        raise HTTPException(422, f"Invalid leave_type. Must be one of: {valid}")

    if data.end_date < data.start_date:
        raise HTTPException(422, "end_date must be >= start_date")

    req = LeaveRequest(
        employee_id=data.employee_id,
        leave_type=leave_type,
        start_date=data.start_date,
        end_date=data.end_date,
        status=LeaveStatus.PENDING,
        reason=data.reason,
    )
    db.add(req)
    await db.flush()
    await db.refresh(req)
    return _serialize(req)


@router.get("", dependencies=[Depends(PermissionChecker("attendance:view"))])
async def list_leave_requests(
    employee_id: Optional[UUID] = None,
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List leave requests with optional filters."""
    filters = []
    if employee_id:
        filters.append(LeaveRequest.employee_id == employee_id)
    if status:
        try:
            filters.append(LeaveRequest.status == LeaveStatus(status))
        except ValueError:
            raise HTTPException(422, f"Invalid status: {status}")
    if start_date:
        filters.append(LeaveRequest.start_date >= date.fromisoformat(start_date))
    if end_date:
        filters.append(LeaveRequest.end_date <= date.fromisoformat(end_date))

    query = select(LeaveRequest).order_by(LeaveRequest.created_at.desc())
    if filters:
        query = query.where(and_(*filters))

    result = await db.execute(query)
    return [_serialize(r) for r in result.scalars().all()]


@router.get("/{request_id}", dependencies=[Depends(PermissionChecker("attendance:view"))])
async def get_leave_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(LeaveRequest).where(LeaveRequest.id == request_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Leave request not found")
    return _serialize(req)


@router.put("/{request_id}/approve", dependencies=[Depends(PermissionChecker("attendance:modify"))])
async def approve_leave_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Approve a leave request.
    Triggers retroactive update of 'absent' sessions within the leave date range.
    """
    result = await db.execute(select(LeaveRequest).where(LeaveRequest.id == request_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Leave request not found")
    if req.status == LeaveStatus.APPROVED:
        return _serialize(req)

    await db.execute(
        update(LeaveRequest)
        .where(LeaveRequest.id == request_id)
        .values(status=LeaveStatus.APPROVED, approver_id=current_user.id)
    )
    await db.flush()

    # Retroactive update: change 'absent' sessions to 'on_leave' or 'vacation'
    await _retroactive_leave_update(db, req)

    result = await db.execute(select(LeaveRequest).where(LeaveRequest.id == request_id))
    return _serialize(result.scalar_one())


@router.put("/{request_id}/reject", dependencies=[Depends(PermissionChecker("attendance:modify"))])
async def reject_leave_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(LeaveRequest).where(LeaveRequest.id == request_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Leave request not found")

    await db.execute(
        update(LeaveRequest)
        .where(LeaveRequest.id == request_id)
        .values(status=LeaveStatus.REJECTED, approver_id=current_user.id)
    )
    await db.flush()
    result = await db.execute(select(LeaveRequest).where(LeaveRequest.id == request_id))
    return _serialize(result.scalar_one())


async def _retroactive_leave_update(db: AsyncSession, req: LeaveRequest) -> None:
    """Update existing 'absent' sessions within the leave date range to on_leave/vacation."""
    from app.models.attendance import AttendanceSession
    new_status = "vacation" if req.leave_type == LeaveType.ANNUAL else "on_leave"
    try:
        await db.execute(
            update(AttendanceSession)
            .where(
                and_(
                    AttendanceSession.employee_id == req.employee_id,
                    AttendanceSession.date >= req.start_date,
                    AttendanceSession.date <= req.end_date,
                    AttendanceSession.status.in_(["absent", "missed_checkin"]),
                )
            )
            .values(status=new_status)
        )
        await db.flush()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Retroactive leave update failed: {e}")
