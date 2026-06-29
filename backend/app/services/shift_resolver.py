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
from app.models.shift_protocol import ShiftProtocol
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
            # Protocol-based assignment — resolve in resolver (async-safe)
            if assignment.shift_protocol_id:
                return await self._resolve_protocol_assignment(
                    assignment, target_date
                )

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

        # ── Level 2b: Employee.shift_protocol_id (direct) ─────
        employee = await self._get_employee(employee_id)
        if employee is not None and employee.shift_protocol_id is not None:
            return await self._resolve_employee_protocol(employee, target_date)

        # ── Level 3: Department_Shift_Rule ────────────────────
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

    async def _resolve_employee_protocol(
        self, employee: Employee, target_date: date
    ) -> Optional[ResolvedShift]:
        """
        Resolve shift from Employee.shift_protocol_id (direct assignment).
        This handles bulk protocol assignments that bypass EmployeeShiftAssignment.
        """
        result = await self.session.execute(
            select(ShiftProtocol).where(ShiftProtocol.id == employee.shift_protocol_id)
        )
        protocol = result.scalar_one_or_none()
        if protocol is None:
            logger.warning(
                f"[ShiftResolver] Employee {employee.id} references missing "
                f"protocol {employee.shift_protocol_id}"
            )
            return None

        # Check working days
        if protocol.working_days:
            iso_wd = target_date.isoweekday()
            if iso_wd not in protocol.working_days:
                return None

        if protocol.protocol_type.value == "fixed":
            tpl = await self._find_template(protocol.working_hours_start, protocol.working_hours_end)
            if tpl is None:
                return None
            grace = self._resolve_grace_period(tpl, None, None)
            return ResolvedShift(
                template=tpl,
                grace_period_minutes=grace,
                source="employee_protocol",
            )

        if protocol.protocol_type.value == "rotating":
            # For rotating, compute day index from protocol start
            if protocol.rotation_start_date:
                day_index = (target_date - protocol.rotation_start_date).days
            else:
                day_index = (target_date - date(2024, 1, 1)).days

            shifts = protocol.rotation_shifts or []
            if not shifts:
                return None

            idx = day_index % len(shifts)
            shift_entry = shifts[idx]

            start_time = shift_entry.get("start", protocol.working_hours_start)
            end_time = shift_entry.get("end", protocol.working_hours_end)

            tpl = await self._find_template(start_time, end_time)
            if tpl is None:
                return None

            grace = self._resolve_grace_period(tpl, None, None)
            return ResolvedShift(
                template=tpl,
                grace_period_minutes=grace,
                source="employee_protocol",
            )

        return None

    async def _resolve_protocol_assignment(
        self, assignment: EmployeeShiftAssignment, target_date: date
    ) -> Optional[ResolvedShift]:
        """Resolve a protocol-based assignment."""
        result = await self.session.execute(
            select(ShiftProtocol).where(ShiftProtocol.id == assignment.shift_protocol_id)
        )
        protocol = result.scalar_one_or_none()
        if protocol is None:
            logger.warning(
                f"[ShiftResolver] Assignment {assignment.id} references missing "
                f"protocol {assignment.shift_protocol_id}"
            )
            return None

        # Check working days if not a working day
        if not assignment.is_working_day(target_date):
            return None

        if protocol.protocol_type.value == "fixed":
            return await self._resolve_fixed_protocol(protocol, assignment, target_date)

        if protocol.protocol_type.value == "rotating":
            return await self._resolve_rotating_protocol(protocol, assignment, target_date)

        return None

    async def _resolve_fixed_protocol(
        self, protocol: ShiftProtocol, assignment: EmployeeShiftAssignment, target_date: date
    ) -> Optional[ResolvedShift]:
        """Resolve a fixed protocol for a given date."""
        if protocol.working_days:
            iso_wd = target_date.isoweekday()
            if iso_wd not in protocol.working_days:
                return None

        tpl = await self._find_template(protocol.working_hours_start, protocol.working_hours_end)
        if tpl is None:
            return None

        grace = self._resolve_grace_period(tpl, None, assignment)
        return ResolvedShift(template=tpl, grace_period_minutes=grace, source="assignment")

    async def _resolve_rotating_protocol(
        self, protocol: ShiftProtocol, assignment: EmployeeShiftAssignment, target_date: date
    ) -> Optional[ResolvedShift]:
        """Resolve a rotating protocol for a given date."""
        if not protocol.rotation_shifts:
            return None

        ref_date = date(2024, 1, 1)
        days_from_ref = (target_date - ref_date).days
        shift_label = protocol.rotation_shifts[days_from_ref % len(protocol.rotation_shifts)]

        if shift_label == "off":
            return None

        if shift_label == "day":
            tpl = await self._find_template(protocol.day_shift_start, protocol.day_shift_end)
        elif shift_label == "night":
            tpl = await self._find_template(protocol.night_shift_start, protocol.night_shift_end)
        else:
            return None

        if tpl is None:
            return None

        grace = self._resolve_grace_period(tpl, None, assignment)
        return ResolvedShift(template=tpl, grace_period_minutes=grace, source="assignment")

    async def _find_template(self, start_time: Optional[str], end_time: Optional[str]) -> Optional[ShiftTemplate]:
        """Find a ShiftTemplate by start/end time strings (e.g. '20:00', '08:00')."""
        if not start_time or not end_time:
            return None

        # Convert "HH:MM" strings to datetime.time objects for asyncpg
        from datetime import time as dt_time
        try:
            sh, sm = start_time.split(":")
            eh, em = end_time.split(":")
            start = dt_time(int(sh), int(sm))
            end   = dt_time(int(eh), int(em))
        except (ValueError, AttributeError):
            logger.warning(f"[ShiftResolver] Invalid time strings: start={start_time!r} end={end_time!r}")
            return None

        result = await self.session.execute(
            select(ShiftTemplate).where(
                ShiftTemplate.start_time == start,
                ShiftTemplate.end_time == end,
            )
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
