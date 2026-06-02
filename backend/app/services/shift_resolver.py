"""
Project Z - ShiftResolver Service
4-level shift resolution with rotating shift and cross-midnight support.

Precedence chain (highest to lowest):
  1. EmployeeShiftOverride  — time-bounded per-employee override
  2. EmployeeShiftAssignment — direct or rotating assignment
  3. DepartmentShiftRule    — department-level rule with weekend_days
  4. Unscheduled            — returns None

Grace period precedence (most specific wins):
  Employee assignment override → Department rule override → Shift template default
"""
import logging
from dataclasses import dataclass
from datetime import date
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dept_shift_rule import DepartmentShiftRule
from app.models.employee import Employee
from app.models.shift_assignment import EmployeeShiftAssignment
from app.models.shift_override import EmployeeShiftOverride
from app.models.shift_template import ShiftTemplate

logger = logging.getLogger(__name__)

# Sentinel returned when the resolved shift is a non-working day
WEEKEND_OFF = "WEEKEND_OFF"
OFF_TEMPLATE_CODE = "OFF"


@dataclass
class ResolvedShift:
    """Result of shift resolution for a given employee and date."""
    template: ShiftTemplate
    grace_period_minutes: int
    source: str  # 'override' | 'assignment' | 'department_rule'
    is_weekend_off: bool = False


class ShiftResolver:
    """
    Resolves the active shift for an employee on a given date.

    Usage:
        resolver = ShiftResolver(session)
        result = await resolver.resolve(employee_id, target_date)
        if result is None:
            # unscheduled
        elif result.is_weekend_off:
            # weekend off day
        else:
            # use result.template and result.grace_period_minutes
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def resolve(
        self, employee_id: UUID, target_date: date
    ) -> Optional[ResolvedShift]:
        """
        Resolve the active shift for an employee on a given date.

        Returns:
            ResolvedShift with is_weekend_off=True for weekend/off days
            ResolvedShift with template for scheduled days
            None for unscheduled employees
        """
        # ── Level 1: Employee_Shift_Override ─────────────────
        override = await self._get_active_override(employee_id, target_date)
        if override is not None:
            template = await self._get_template(override.shift_template_id)
            if template is None:
                logger.warning(
                    f"[ShiftResolver] Override {override.id} references missing "
                    f"template {override.shift_template_id}"
                )
                return None
            if template.code == OFF_TEMPLATE_CODE:
                return ResolvedShift(
                    template=template,
                    grace_period_minutes=template.grace_period_minutes,
                    source="override",
                    is_weekend_off=True,
                )
            grace = self._resolve_grace_period(template, None, None)
            return ResolvedShift(
                template=template,
                grace_period_minutes=grace,
                source="override",
            )

        # ── Level 2: Employee_Shift_Assignment ────────────────
        assignment = await self._get_assignment(employee_id)
        if assignment is not None:
            template_id = assignment.resolve_template_id_for_date(target_date)
            if template_id is None:
                return None
            template = await self._get_template(template_id)
            if template is None:
                logger.warning(
                    f"[ShiftResolver] Assignment {assignment.id} resolved to "
                    f"missing template {template_id}"
                )
                return None
            if template.code == OFF_TEMPLATE_CODE:
                return ResolvedShift(
                    template=template,
                    grace_period_minutes=template.grace_period_minutes,
                    source="assignment",
                    is_weekend_off=True,
                )
            grace = self._resolve_grace_period(template, None, assignment)
            return ResolvedShift(
                template=template,
                grace_period_minutes=grace,
                source="assignment",
            )

        # ── Level 3: Department_Shift_Rule ────────────────────
        employee = await self._get_employee(employee_id)
        if employee is None or employee.department_id is None:
            return None

        dept_rule = await self._get_dept_rule(employee.department_id, target_date)
        if dept_rule is None:
            return None

        # Check weekend days
        if dept_rule.is_weekend(target_date):
            template = await self._get_template(dept_rule.shift_template_id)
            return ResolvedShift(
                template=template,
                grace_period_minutes=dept_rule.grace_period_override or (
                    template.grace_period_minutes if template else 15
                ),
                source="department_rule",
                is_weekend_off=True,
            )

        template = await self._get_template(dept_rule.shift_template_id)
        if template is None:
            logger.warning(
                f"[ShiftResolver] DeptRule {dept_rule.id} references missing "
                f"template {dept_rule.shift_template_id}"
            )
            return None

        grace = self._resolve_grace_period(template, dept_rule, None)
        return ResolvedShift(
            template=template,
            grace_period_minutes=grace,
            source="department_rule",
        )

        # ── Level 4: Unscheduled ──────────────────────────────
        # Falls through to None

    # ── Private helpers ───────────────────────────────────────

    async def _get_active_override(
        self, employee_id: UUID, target_date: date
    ) -> Optional[EmployeeShiftOverride]:
        result = await self.session.execute(
            select(EmployeeShiftOverride)
            .where(
                and_(
                    EmployeeShiftOverride.employee_id == employee_id,
                    EmployeeShiftOverride.start_date <= target_date,
                    EmployeeShiftOverride.end_date >= target_date,
                )
            )
            .order_by(EmployeeShiftOverride.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_assignment(
        self, employee_id: UUID
    ) -> Optional[EmployeeShiftAssignment]:
        result = await self.session.execute(
            select(EmployeeShiftAssignment)
            .where(EmployeeShiftAssignment.employee_id == employee_id)
            .order_by(EmployeeShiftAssignment.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_dept_rule(
        self, department_id: UUID, target_date: date
    ) -> Optional[DepartmentShiftRule]:
        result = await self.session.execute(
            select(DepartmentShiftRule)
            .where(
                and_(
                    DepartmentShiftRule.department_id == department_id,
                    DepartmentShiftRule.effective_from <= target_date,
                    (
                        DepartmentShiftRule.effective_to.is_(None)
                        | (DepartmentShiftRule.effective_to >= target_date)
                    ),
                )
            )
            .order_by(DepartmentShiftRule.effective_from.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_template(
        self, template_id: UUID
    ) -> Optional[ShiftTemplate]:
        result = await self.session.execute(
            select(ShiftTemplate).where(ShiftTemplate.id == template_id)
        )
        return result.scalar_one_or_none()

    async def _get_employee(self, employee_id: UUID) -> Optional[Employee]:
        result = await self.session.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _resolve_grace_period(
        template: ShiftTemplate,
        dept_rule: Optional[DepartmentShiftRule],
        assignment: Optional[EmployeeShiftAssignment],
    ) -> int:
        """
        3-level grace period precedence.
        Most specific configured value wins:
          Employee assignment override → Department rule override → Shift template default
        """
        if assignment and assignment.grace_period_override is not None:
            return assignment.grace_period_override
        if dept_rule and dept_rule.grace_period_override is not None:
            return dept_rule.grace_period_override
        return template.grace_period_minutes
