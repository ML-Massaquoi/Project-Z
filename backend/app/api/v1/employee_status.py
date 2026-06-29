"""
Project Z - Employee Status API Routes
Status lifecycle management with state machine enforcement and audit trail.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database.session import get_db
from app.models.employee import EmployeeStatus
from app.services.audit_service import log_audit
from app.services.employee_status_service import (
    EmployeeStatusService,
    InvalidTransitionError,
)
from app.utils.audit_context import get_audit_context

router = APIRouter(prefix="/employees", tags=["Employee Status"])


class StatusTransitionRequest(BaseModel):
    new_status: str
    reason: Optional[str] = None


class StatusTransitionResponse(BaseModel):
    employee_id: str
    old_status: str
    new_status: str
    message: str


@router.patch("/{employee_id}/status", response_model=StatusTransitionResponse)
async def transition_employee_status(
    employee_id: UUID,
    body: StatusTransitionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Transition an employee to a new status.
    Enforces strict state machine rules.
    """
    svc = EmployeeStatusService(db)
    try:
        # Get old status for audit
        from app.models.employee import Employee
        from sqlalchemy import select
        result = await db.execute(select(Employee).where(Employee.id == employee_id))
        employee_obj = result.scalar_one_or_none()
        old_status = employee_obj.status.value if employee_obj and hasattr(employee_obj.status, 'value') else str(employee_obj.status) if employee_obj else "unknown"

        employee = await svc.transition(
            employee_id=employee_id,
            new_status=body.new_status,
            reason=body.reason,
            changed_by_user_id=current_user.id,
            changed_by_username=current_user.username,
            ip_address=request.client.host if request.client else None,
        )

        # Audit log for status change
        audit_ctx = get_audit_context(request, current_user)
        await log_audit(
            db, action="status_changed", entity_type="employee",
            entity_id=str(employee_id),
            details={
                "old_status": old_status,
                "new_status": body.new_status,
                "reason": body.reason,
                "employee_code": employee_obj.employee_code if employee_obj else None,
                "employee_name": employee_obj.full_name if employee_obj else None,
            },
            previous_value={"status": old_status},
            new_value={"status": body.new_status},
            **audit_ctx,
        )

        return StatusTransitionResponse(
            employee_id=str(employee.id),
            old_status=old_status,
            new_status=body.new_status,
            message=f"Employee status updated to {body.new_status}",
        )
    except InvalidTransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{employee_id}/status/transitions")
async def get_status_transitions(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get full status transition history for an employee."""
    svc = EmployeeStatusService(db)
    transitions = await svc.get_transition_history(employee_id)
    return {
        "transitions": [
            {
                "id": str(t.id),
                "from_status": t.from_status,
                "to_status": t.to_status,
                "reason": t.reason,
                "changed_by": t.changed_by_username,
                "ip_address": t.ip_address,
                "created_at": str(t.created_at) if t.created_at else None,
            }
            for t in transitions
        ]
    }


@router.get("/status/transitions/{current_status}")
async def get_allowed_transitions(
    current_status: str,
):
    """Get allowed status transitions from a given status."""
    svc = EmployeeStatusService.__new__(EmployeeStatusService)
    allowed = svc.get_allowed_transitions(current_status)
    return {
        "current_status": current_status,
        "allowed_transitions": list(allowed),
        "is_terminal": len(allowed) == 0,
    }
