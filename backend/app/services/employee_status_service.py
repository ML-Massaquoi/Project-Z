"""
Project Z - Employee Status Service
Enforces strict state machine transitions for employee lifecycle.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import (
    Employee,
    EmployeeStatus,
    STATUS_TRANSITIONS,
    can_transition,
)
from app.models.status_transition import EmployeeStatusTransition

logger = logging.getLogger(__name__)


class InvalidTransitionError(Exception):
    """Raised when an invalid status transition is attempted."""
    pass


class EmployeeStatusService:
    """
    Enforces strict state machine for employee status lifecycle.

    Valid transitions:
        PENDING_ENROLLMENT -> ENROLLED, INACTIVE, TERMINATED
        ENROLLED -> ACTIVE, INACTIVE, TERMINATED
        ACTIVE -> INACTIVE, SUSPENDED, TRANSFERRED, TERMINATED, RETIRED
        INACTIVE -> ACTIVE, TERMINATED
        SUSPENDED -> ACTIVE, TERMINATED
        TRANSFERRED -> ACTIVE, TERMINATED
        TERMINATED -> (terminal, no transitions)
        RETIRED -> (terminal, no transitions)
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def transition(
        self,
        employee_id: UUID,
        new_status: str,
        reason: Optional[str] = None,
        changed_by_user_id: Optional[UUID] = None,
        changed_by_username: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Employee:
        """
        Transition an employee to a new status.

        Raises InvalidTransitionError if the transition is not allowed.
        """
        employee = await self.session.get(Employee, employee_id)
        if not employee:
            raise ValueError(f"Employee {employee_id} not found")

        current_status = employee.status.value

        if not can_transition(current_status, new_status):
            allowed = STATUS_TRANSITIONS.get(current_status, set())
            raise InvalidTransitionError(
                f"Cannot transition from '{current_status}' to '{new_status}'. "
                f"Allowed transitions: {allowed or 'none (terminal state)'}"
            )

        old_status = current_status
        employee.status = EmployeeStatus(new_status)
        employee.status_changed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        employee.status_changed_by = changed_by_user_id

        if new_status == EmployeeStatus.TERMINATED.value:
            from datetime import date as date_type
            employee.termination_date = date_type.today()

        transition_log = EmployeeStatusTransition(
            employee_id=employee_id,
            from_status=old_status,
            to_status=new_status,
            reason=reason,
            changed_by_user_id=changed_by_user_id,
            changed_by_username=changed_by_username,
            ip_address=ip_address,
        )
        self.session.add(transition_log)

        await self.session.flush()

        logger.info(
            f"[StatusTransition] {employee.employee_code}: "
            f"{old_status} -> {new_status} by {changed_by_username or 'system'}"
        )

        if new_status == EmployeeStatus.TERMINATED.value:
            await self._handle_termination(employee)

        return employee

    async def _handle_termination(self, employee: Employee) -> None:
        """Auto-cleanup when employee is terminated."""
        from app.models.employee_device_mapping import EmployeeDeviceMapping

        result = await self.session.execute(
            select(EmployeeDeviceMapping).where(
                EmployeeDeviceMapping.employee_id == employee.id
            )
        )
        mappings = result.scalars().all()
        for mapping in mappings:
            await self.session.delete(mapping)

        logger.info(
            f"[Termination] Removed {len(mappings)} device mappings "
            f"for terminated employee {employee.employee_code}"
        )

    async def get_transition_history(
        self, employee_id: UUID
    ) -> list[EmployeeStatusTransition]:
        """Get full status transition history for an employee."""
        result = await self.session.execute(
            select(EmployeeStatusTransition)
            .where(EmployeeStatusTransition.employee_id == employee_id)
            .order_by(EmployeeStatusTransition.created_at.desc())
        )
        return list(result.scalars().all())

    def get_allowed_transitions(self, current_status: str) -> set[str]:
        """Get set of allowed status transitions from current status."""
        return STATUS_TRANSITIONS.get(current_status, set())
