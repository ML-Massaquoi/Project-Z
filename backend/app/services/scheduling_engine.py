"""
Project Z - Scheduling Engine
Enterprise automatic roster generator with full resolution chain.

Resolution chain (highest precedence first):
  1. EmployeeShiftOverride       — temporary date-specific overrides
  2. ShiftSwapRequest (approved) — approved shift swaps
  3. Employee rotation           — protocol + rotation_offset
  4. DepartmentProtocol          — department's assigned protocol
  5. Leave integration           — auto-replace with LEAVE on approved leave dates
  6. Holiday integration         — auto-mark holidays for office protocols

All generation methods use bulk queries and batch inserts to avoid N+1.
"""

from __future__ import annotations

import calendar
import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.department import Department
from app.models.department_protocol import DepartmentProtocol
from app.models.employee import Employee, EmployeeStatus
from app.models.holiday_calendar import HolidayCalendar, HolidayScope
from app.models.leave_request import LeaveRequest, LeaveStatus
from app.models.roster import AssignmentType, RosterEntry, RosterSnapshot
from app.models.shift_pair import ShiftPair
from app.models.shift_override import EmployeeShiftOverride
from app.models.shift_protocol import ProtocolType, ShiftProtocol
from app.models.shift_protocol_step import ShiftProtocolStep
from app.models.shift_swap_request import ShiftSwapRequest
from app.models.shift_template import ShiftTemplate
from app.models.roster_publication import RosterPublication

logger = logging.getLogger(__name__)


# ── Data Contracts ─────────────────────────────────────────────

@dataclass
class ResolvedShift:
    """Result of resolving an employee's shift on a single date."""
    shift_template_id: UUID | None
    start_time: str | None
    end_time: str | None
    assignment_type: AssignmentType
    source: str  # override | swap | protocol | department_protocol | leave | holiday


@dataclass
class ProtocolCalendarEntry:
    """Single entry in a protocol calendar view."""
    date: date
    step_type: str
    label: str | None
    shift_template_id: UUID | None
    shift_start: str | None
    shift_end: str | None


@dataclass
class AttendanceComparison:
    """Scheduled vs. actual attendance for one employee on one date."""
    employee_id: UUID
    employee_code: str
    employee_name: str
    target_date: date
    scheduled: ResolvedShift | None
    actual: dict | None
    check_in: datetime | None
    check_out: datetime | None
    is_late: bool
    is_absent: bool
    is_overtime: bool
    early_departure: bool
    undertime: bool
    late_minutes: float
    overtime_minutes: float
    early_minutes: float
    undertime_minutes: float


@dataclass
class ExpandedStep:
    """A single day within a protocol cycle after expanding duration_days."""
    step_order: int
    step_type: str
    label: str | None
    shift_template_id: UUID | None


# ── Scheduling Engine ──────────────────────────────────────────

class SchedulingEngine:
    """
    Enterprise automatic roster generator.

    Usage:
        engine = SchedulingEngine(session)
        snapshot = await engine.generate_department_roster(
            db=session, department_id=..., year=2026, month=7
        )
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    # ── Public Generation Methods ──────────────────────────────

    async def generate_department_roster(
        self,
        db: AsyncSession,
        department_id: str | UUID,
        year: int,
        month: int,
        generated_by: str | UUID | None = None,
    ) -> RosterSnapshot:
        """
        Generate (or regenerate) the monthly roster for a department.

        Walks every (employee, day) pair and applies the full resolution chain.
        Uses bulk queries upfront, then batch-inserts all RosterEntry rows.
        """
        dept_id = UUID(department_id) if isinstance(department_id, str) else department_id
        gen_by = UUID(generated_by) if isinstance(generated_by, str) else generated_by

        # ── Load department ────────────────────────────────────
        dept = await self._get_department(db, dept_id)
        if not dept:
            raise ValueError(f"Department {dept_id} not found")

        first_day, last_day = _month_date_range(year, month)

        # ── Tear down existing snapshot ────────────────────────
        await self._delete_existing_snapshot(db, dept_id, year, month)

        # ── Create fresh snapshot ──────────────────────────────
        snapshot = RosterSnapshot(
            department_id=dept_id,
            department_name=dept.name,
            year=year,
            month=month,
            generated_at=datetime.now(timezone.utc),
            generated_by=gen_by,
        )
        db.add(snapshot)
        await db.flush()
        await db.refresh(snapshot)

        # ── Validate pairs exist for rotating protocols ────────
        if dept.shift_protocol_id:
            proto_result = await db.execute(
                select(ShiftProtocol).where(ShiftProtocol.id == dept.shift_protocol_id)
            )
            proto = proto_result.scalar_one_or_none()
            if proto and proto.protocol_type == ProtocolType.ROTATING:
                pair_exists = await db.scalar(
                    select(ShiftPair.id).where(
                        and_(
                            ShiftPair.department_id == dept_id,
                            ShiftPair.is_active == True,
                        )
                    ).limit(1)
                )
                if pair_exists is None:
                    raise ValueError(
                        f"Department '{dept.name}' uses a rotating protocol but has no active shift pairs. "
                        "Create at least one shift pair with two members before generating the roster."
                    )

        # ── Pre-fetch data used across all employees ───────────
        holidays = await self._fetch_holidays_for_month(db, dept_id, year, month)
        holiday_dates: set[date] = holidays

        # Active employees in the department
        employees = await self._fetch_active_employees(db, dept_id)
        if not employees:
            logger.info(f"[Scheduling] No active employees in dept {dept.name} for {year}-{month:02d}")
            return snapshot

        emp_ids = [e.id for e in employees]

        # Pre-fetch leaves, overrides, swaps for these employees
        leaves = await self._fetch_leaves_for_month(db, emp_ids, first_day, last_day)
        leave_map = _build_leave_date_set(leaves, first_day, last_day)

        overrides = await self._fetch_overrides_for_month(db, emp_ids, first_day, last_day)
        override_map = _build_override_map(overrides)

        swaps = await self._fetch_swaps_for_month(db, emp_ids, first_day, last_day)
        swap_map = _build_swap_map(swaps)

        # Pre-fetch protocols referenced by employees and department
        protocol_ids = set()
        for emp in employees:
            if emp.shift_protocol_id:
                protocol_ids.add(emp.shift_protocol_id)
        dept_protocol = await self._get_active_department_protocol(db, dept_id, first_day)
        if dept_protocol:
            protocol_ids.add(dept_protocol.protocol_id)
        protocols = await self._fetch_protocols_with_steps(db, list(protocol_ids))
        protocol_map = {p.id: p for p in protocols}

        # Pre-fetch shift templates referenced in protocol steps
        template_ids = set()
        for p in protocols:
            for step in p.steps:
                if step.shift_template_id:
                    template_ids.add(step.shift_template_id)
        templates = await self._fetch_templates_by_ids(db, list(template_ids))
        template_map = {t.id: t for t in templates}

        # ── Build all RosterEntry rows ─────────────────────────
        entries: list[RosterEntry] = []
        current = first_day
        while current <= last_day:
            for emp in employees:
                assignment = await self._resolve_roster_entry(
                    db=db,
                    emp=emp,
                    target_date=current,
                    holiday_dates=holiday_dates,
                    leave_map=leave_map,
                    override_map=override_map,
                    swap_map=swap_map,
                    dept_protocol=dept_protocol,
                    protocol_map=protocol_map,
                    template_map=template_map,
                )
                if assignment is None:
                    continue

                entry = RosterEntry(
                    snapshot_id=snapshot.id,
                    employee_id=emp.id,
                    employee_code=emp.employee_code,
                    employee_name=emp.full_name,
                    department_name=dept.name,
                    entry_date=current,
                    assignment=assignment.assignment_type,
                    shift_start=assignment.start_time,
                    shift_end=assignment.end_time,
                )
                entries.append(entry)
            current += timedelta(days=1)

        # ── Bulk persist ───────────────────────────────────────
        if entries:
            db.add_all(entries)
            await db.flush()

        logger.info(
            f"[Scheduling] Generated {len(entries)} roster entries for "
            f"{dept.name} {year}-{month:02d}"
        )
        return snapshot

    async def generate_multi_department_roster(
        self,
        db: AsyncSession,
        department_ids: list[str | UUID],
        year: int,
        month: int,
        generated_by: str | UUID | None = None,
    ) -> list[RosterSnapshot]:
        """Generate rosters for multiple departments sequentially."""
        gen_by = UUID(generated_by) if isinstance(generated_by, str) else generated_by
        snapshots: list[RosterSnapshot] = []
        for dept_id in department_ids:
            snap = await self.generate_department_roster(
                db=db,
                department_id=dept_id,
                year=year,
                month=month,
                generated_by=gen_by,
            )
            snapshots.append(snap)
        return snapshots

    async def generate_organization_roster(
        self,
        db: AsyncSession,
        year: int,
        month: int,
        generated_by: str | UUID | None = None,
    ) -> list[RosterSnapshot]:
        """Generate rosters for all active departments across the organization."""
        gen_by = UUID(generated_by) if isinstance(generated_by, str) else generated_by
        result = await db.execute(
            select(Department.id).where(Department.is_active == True)
        )
        dept_ids = result.scalars().all()
        return await self.generate_multi_department_roster(
            db=db, department_ids=dept_ids, year=year, month=month, generated_by=gen_by,
        )

    async def generate_multi_month_roster(
        self,
        db: AsyncSession,
        department_id: str | UUID,
        year: int,
        start_month: int,
        num_months: int,
        generated_by: str | UUID | None = None,
    ) -> list[RosterSnapshot]:
        """
        Generate rosters for multiple consecutive months for a single department.
        
        Supports 1, 3, 6, and 12-month generation.
        Skips months that are already published/locked.
        """
        dept_id = UUID(department_id) if isinstance(department_id, str) else department_id
        gen_by = UUID(generated_by) if isinstance(generated_by, str) else generated_by
        
        snapshots: list[RosterSnapshot] = []
        for i in range(num_months):
            m = start_month + i
            y = year
            if m > 12:
                m -= 12
                y += 1
            
            # Skip if already published/locked
            pub_check = await db.execute(
                select(RosterPublication).where(
                    and_(
                        RosterPublication.department_id == dept_id,
                        RosterPublication.year == y,
                        RosterPublication.month == m,
                        RosterPublication.status.in_(["published", "locked"]),
                    )
                )
            )
            if pub_check.scalar_one_or_none():
                logger.info(f"[Scheduling] Skipping {y}-{m:02d} for dept={dept_id} — already published/locked")
                continue
            
            snap = await self.generate_department_roster(
                db=db, department_id=dept_id, year=y, month=m, generated_by=gen_by,
            )
            snapshots.append(snap)
        
        return snapshots

    async def generate_organization_multi_month(
        self,
        db: AsyncSession,
        year: int,
        start_month: int,
        num_months: int,
        generated_by: str | UUID | None = None,
    ) -> list[RosterSnapshot]:
        """Generate rosters for all departments across multiple months."""
        gen_by = UUID(generated_by) if isinstance(generated_by, str) else generated_by
        result = await db.execute(
            select(Department.id).where(Department.is_active == True)
        )
        dept_ids = result.scalars().all()
        
        all_snapshots: list[RosterSnapshot] = []
        for dept_id in dept_ids:
            snaps = await self.generate_multi_month_roster(
                db=db, department_id=dept_id, year=year,
                start_month=start_month, num_months=num_months,
                generated_by=gen_by,
            )
            all_snapshots.extend(snaps)
        return all_snapshots

    # ── Single Resolution ──────────────────────────────────────

    async def resolve_shift_for_employee(
        self,
        db: AsyncSession,
        employee_id: str | UUID,
        target_date: date,
    ) -> ResolvedShift | None:
        """
        Resolve which shift applies to an employee on a given date.

        Walks the full resolution chain:
          1. EmployeeShiftOverride
          2. ShiftSwapRequest (approved)
          3. Employee protocol + rotation_offset
          4. DepartmentProtocol
          5. Approved leave
          6. Holiday (organization / department)

        Returns ResolvedShift or None (unscheduled / off day).
        """
        emp_id = UUID(employee_id) if isinstance(employee_id, str) else employee_id

        # 1. Override — highest precedence
        override = await self._get_single_override(db, emp_id, target_date)
        if override is not None:
            tpl = await self._get_template_by_id(db, override.shift_template_id)
            if tpl is not None:
                return ResolvedShift(
                    shift_template_id=tpl.id,
                    start_time=_time_to_str(tpl.start_time),
                    end_time=_time_to_str(tpl.end_time),
                    assignment_type=_template_to_assignment_type(tpl),
                    source="override",
                )
            return ResolvedShift(
                shift_template_id=override.shift_template_id,
                start_time=None,
                end_time=None,
                assignment_type=AssignmentType.ADMIN,
                source="override",
            )

        # 2. Swap
        swap = await self._get_single_swap(db, emp_id, target_date)
        if swap is not None:
            assigned_template_id = _resolve_swap_template_id(swap, emp_id)
            if assigned_template_id is not None:
                tpl = await self._get_template_by_id(db, assigned_template_id)
                if tpl is not None:
                    return ResolvedShift(
                        shift_template_id=tpl.id,
                        start_time=_time_to_str(tpl.start_time),
                        end_time=_time_to_str(tpl.end_time),
                        assignment_type=_template_to_assignment_type(tpl),
                        source="swap",
                    )

        # 3. Employee protocol + rotation_offset
        emp_result = await db.execute(
            select(Employee).where(Employee.id == emp_id)
        )
        emp = emp_result.scalar_one_or_none()
        if emp is None:
            return None

        if emp.shift_protocol_id:
            protocol = await self._get_protocol_by_id(db, emp.shift_protocol_id)
            if protocol is not None:
                result = await self._apply_protocol(
                    db=db,
                    protocol=protocol,
                    target_date=target_date,
                    rotation_offset=emp.rotation_offset or 0,
                )
                if result is not None:
                    return result

        # 4. Department protocol
        if emp.department_id is not None:
            dept_protocol = await self._get_active_department_protocol(
                db, emp.department_id, target_date
            )
            if dept_protocol is not None:
                protocol = await self._get_protocol_by_id(db, dept_protocol.protocol_id)
                if protocol is not None:
                    result = await self._apply_protocol(
                        db=db,
                        protocol=protocol,
                        target_date=target_date,
                        rotation_offset=0,
                    )
                    if result is not None:
                        return result

        # 5. Leave
        leave = await self._get_single_leave(db, emp_id, target_date)
        if leave is not None:
            return ResolvedShift(
                shift_template_id=None,
                start_time=None,
                end_time=None,
                assignment_type=AssignmentType.LEAVE,
                source="leave",
            )

        # 6. Holiday
        is_holiday = await self._is_holiday(db, emp.department_id, target_date)
        if is_holiday:
            return ResolvedShift(
                shift_template_id=None,
                start_time=None,
                end_time=None,
                assignment_type=AssignmentType.HOLIDAY,
                source="holiday",
            )

        return None

    async def generate_protocol_calendar(
        self,
        db: AsyncSession,
        protocol_id: str | UUID,
        start_date: date,
        num_days: int,
    ) -> list[ProtocolCalendarEntry]:
        """
        Generate a calendar view of a protocol.

        Expands protocol steps by their duration_days into a flat cycle,
        then maps each day from start_date to its corresponding step.
        Useful for the frontend calendar display.
        """
        proto_id = UUID(protocol_id) if isinstance(protocol_id, str) else protocol_id
        protocol = await self._get_protocol_by_id(db, proto_id)
        if protocol is None:
            raise ValueError(f"Protocol {proto_id} not found")

        expanded = await self._expand_protocol_steps(db, protocol)
        if not expanded:
            logger.warning(f"[Scheduling] Protocol {protocol.name} has no steps — empty calendar")
            return []

        cycle_length = len(expanded)
        entries: list[ProtocolCalendarEntry] = []
        for i in range(num_days):
            current = start_date + timedelta(days=i)
            step = expanded[(i) % cycle_length]

            shift_start: str | None = None
            shift_end: str | None = None
            if step.shift_template_id:
                tpl = await self._get_template_by_id(db, step.shift_template_id)
                if tpl is not None:
                    shift_start = _time_to_str(tpl.start_time)
                    shift_end = _time_to_str(tpl.end_time)

            entries.append(ProtocolCalendarEntry(
                date=current,
                step_type=step.step_type,
                label=step.label,
                shift_template_id=step.shift_template_id,
                shift_start=shift_start,
                shift_end=shift_end,
            ))

        return entries

    async def calculate_attendance_comparison(
        self,
        db: AsyncSession,
        employee_id: str | UUID,
        target_date: date,
    ) -> AttendanceComparison | None:
        """
        Compare scheduled shift with actual attendance.

        Returns a detailed comparison including lateness, overtime, etc.
        Returns None if the employee is not found.
        """
        from app.models.attendance import AttendanceSession

        emp_id = UUID(employee_id) if isinstance(employee_id, str) else employee_id

        emp_result = await db.execute(
            select(Employee).where(Employee.id == emp_id)
        )
        emp = emp_result.scalar_one_or_none()
        if emp is None:
            return None

        scheduled = await self.resolve_shift_for_employee(db, emp_id, target_date)

        session_result = await db.execute(
            select(AttendanceSession).where(
                and_(
                    AttendanceSession.employee_id == emp_id,
                    AttendanceSession.date == target_date,
                )
            )
        )
        session = session_result.scalar_one_or_none()

        if scheduled is None:
            return AttendanceComparison(
                employee_id=emp.id,
                employee_code=emp.employee_code,
                employee_name=emp.full_name,
                target_date=target_date,
                scheduled=None,
                actual=None,
                check_in=None,
                check_out=None,
                is_late=False,
                is_absent=False,
                is_overtime=False,
                early_departure=False,
                undertime=False,
                late_minutes=0.0,
                overtime_minutes=0.0,
                early_minutes=0.0,
                undertime_minutes=0.0,
            )

        if session is None:
            is_absent = scheduled.assignment_type not in (
                AssignmentType.OFF, AssignmentType.LEAVE, AssignmentType.HOLIDAY
            )
            return AttendanceComparison(
                employee_id=emp.id,
                employee_code=emp.employee_code,
                employee_name=emp.full_name,
                target_date=target_date,
                scheduled=scheduled,
                actual=None,
                check_in=None,
                check_out=None,
                is_late=False,
                is_absent=is_absent,
                is_overtime=False,
                early_departure=False,
                undertime=False,
                late_minutes=0.0,
                overtime_minutes=0.0,
                early_minutes=0.0,
                undertime_minutes=0.0,
            )

        late_min = session.late_minutes or 0.0
        early_min = session.early_minutes or 0.0
        overtime_min = session.overtime_minutes or 0.0

        return AttendanceComparison(
            employee_id=emp.id,
            employee_code=emp.employee_code,
            employee_name=emp.full_name,
            target_date=target_date,
            scheduled=scheduled,
            actual={
                "session_id": str(session.id),
                "status": session.status,
                "duration_minutes": session.duration_minutes,
            },
            check_in=session.check_in,
            check_out=session.check_out,
            is_late=session.status == "late",
            is_absent=session.status == "absent",
            is_overtime=overtime_min > 0,
            early_departure=early_min > 0,
            undertime=session.duration_minutes is not None
                      and scheduled.assignment_type in (
                          AssignmentType.DAY, AssignmentType.NIGHT, AssignmentType.ADMIN,
                      ),
            late_minutes=late_min,
            overtime_minutes=overtime_min,
            early_minutes=early_min,
            undertime_minutes=0.0,  # computed downstream from working_hours vs duration
        )

    # ── Internal Resolution for Roster Generation ──────────────

    async def _resolve_roster_entry(
        self,
        db: AsyncSession,
        emp: Employee,
        target_date: date,
        holiday_dates: set[date],
        leave_map: dict[str, set[date]],
        override_map: dict,
        swap_map: dict,
        dept_protocol: DepartmentProtocol | None,
        protocol_map: dict,
        template_map: dict,
    ) -> ResolvedShift | None:
        """
        Resolve one employee's assignment for one date during bulk generation.

        Resolution order for the roster builder:
          1. Holiday  (terminal — mark HOLIDAY and stop)
          2. Leave    (terminal — mark LEAVE and stop)
          3. Override (applied directly)
          4. Swap     (applied directly)
          5. Protocol (employee-level, then department-level)
          6. OFF (no assignment)

        This differs slightly from :meth:`resolve_shift_for_employee` because
        roster generation treats holiday/leave as terminal assignment types
        that don't get overridden by other rules.
        """
        emp_key = str(emp.id)

        # 1. Holiday — terminal
        if target_date in holiday_dates:
            return ResolvedShift(
                shift_template_id=None,
                start_time=None,
                end_time=None,
                assignment_type=AssignmentType.HOLIDAY,
                source="holiday",
            )

        # 2. Leave — terminal
        if emp_key in leave_map and target_date in leave_map[emp_key]:
            return ResolvedShift(
                shift_template_id=None,
                start_time=None,
                end_time=None,
                assignment_type=AssignmentType.LEAVE,
                source="leave",
            )

        # 3. Override
        if emp_key in override_map:
            override = override_map[emp_key].get(target_date)
            if override is not None:
                tpl = template_map.get(override.shift_template_id)
                if tpl is not None:
                    return ResolvedShift(
                        shift_template_id=tpl.id,
                        start_time=_time_to_str(tpl.start_time),
                        end_time=_time_to_str(tpl.end_time),
                        assignment_type=_template_to_assignment_type(tpl),
                        source="override",
                    )

        # 4. Swap
        if emp_key in swap_map:
            swap = swap_map[emp_key].get(target_date)
            if swap is not None:
                tmpl_id = _resolve_swap_template_id(swap, emp.id)
                if tmpl_id is not None:
                    tpl = template_map.get(tmpl_id)
                    if tpl is not None:
                        return ResolvedShift(
                            shift_template_id=tpl.id,
                            start_time=_time_to_str(tpl.start_time),
                            end_time=_time_to_str(tpl.end_time),
                            assignment_type=_template_to_assignment_type(tpl),
                            source="swap",
                        )

        # 5. Employee protocol
        if emp.shift_protocol_id and emp.shift_protocol_id in protocol_map:
            protocol = protocol_map[emp.shift_protocol_id]
            result = await self._apply_protocol(
                db=db,
                protocol=protocol,
                target_date=target_date,
                rotation_offset=emp.rotation_offset or 0,
                template_map=template_map,
            )
            if result is not None:
                return result

        # 6. Department protocol
        if dept_protocol is not None and dept_protocol.protocol_id in protocol_map:
            protocol = protocol_map[dept_protocol.protocol_id]
            result = await self._apply_protocol(
                db=db,
                protocol=protocol,
                target_date=target_date,
                rotation_offset=0,
                template_map=template_map,
            )
            if result is not None:
                return result

        # 7. Fallback: Default admin schedule (Mon-Fri 08:00-17:00)
        # This ensures departments without explicit protocol assignments still get a schedule
        iso_wd = target_date.isoweekday()
        if iso_wd in (1, 2, 3, 4, 5):  # Monday to Friday
            return ResolvedShift(
                shift_template_id=None,
                start_time="08:00",
                end_time="17:00",
                assignment_type=AssignmentType.ADMIN,
                source="default",
            )
        # Weekend — OFF
        return None

    async def _apply_protocol(
        self,
        db: AsyncSession,
        protocol: ShiftProtocol,
        target_date: date,
        rotation_offset: int = 0,
        template_map: dict | None = None,
    ) -> ResolvedShift | None:
        """
        Resolve what a protocol yields for a given date.

        Supports both:
        - New step-based protocols (ShiftProtocolStep with duration_days)
        - Legacy protocols (working_days for FIXED, rotation_shifts for ROTATING)
        """
        # Try step-based resolution first
        expanded = await self._expand_protocol_steps(db, protocol)
        if expanded:
            day_index = (target_date.day - 1 + rotation_offset) % len(expanded)
            step = expanded[day_index]

            if step.step_type == "off":
                return None

            if step.step_type in ("holiday", "leave"):
                assignment_map = {
                    "holiday": AssignmentType.HOLIDAY,
                    "leave": AssignmentType.LEAVE,
                }
                return ResolvedShift(
                    shift_template_id=step.shift_template_id,
                    start_time=None,
                    end_time=None,
                    assignment_type=assignment_map.get(step.step_type, AssignmentType.OFF),
                    source="protocol",
                )

            if step.shift_template_id is not None:
                tpl = None
                if template_map is not None:
                    tpl = template_map.get(step.shift_template_id)
                if tpl is None:
                    tpl = await self._get_template_by_id(db, step.shift_template_id)
                if tpl is not None:
                    return ResolvedShift(
                        shift_template_id=tpl.id,
                        start_time=_time_to_str(tpl.start_time),
                        end_time=_time_to_str(tpl.end_time),
                        assignment_type=_step_type_to_assignment(step.step_type, tpl),
                        source="protocol",
                    )

            return ResolvedShift(
                shift_template_id=step.shift_template_id,
                start_time=None,
                end_time=None,
                assignment_type=AssignmentType.ADMIN,
                source="protocol",
            )

        # Legacy FIXED protocol
        if protocol.protocol_type == ProtocolType.FIXED:
            return await self._resolve_fixed_protocol(protocol, target_date, template_map)

        # Legacy ROTATING protocol
        if protocol.protocol_type == ProtocolType.ROTATING:
            return await self._resolve_rotating_protocol(protocol, target_date, rotation_offset, template_map)

        return None

    async def _resolve_fixed_protocol(
        self,
        protocol: ShiftProtocol,
        target_date: date,
        template_map: dict | None = None,
    ) -> ResolvedShift | None:
        """Resolve a fixed (Mon-Fri style) protocol for a date."""
        if protocol.working_days:
            iso_wd = target_date.isoweekday()
            if iso_wd not in protocol.working_days:
                if not protocol.include_weekends:
                    return None

        if protocol.working_hours_start and protocol.working_hours_end:
            tpl = None
            if template_map:
                tpl = _find_template_by_times(
                    template_map, protocol.working_hours_start, protocol.working_hours_end
                )
            if tpl is None:
                tpl = await self._find_template_by_time_strings(
                    protocol.working_hours_start, protocol.working_hours_end
                )
            if tpl is not None:
                return ResolvedShift(
                    shift_template_id=tpl.id,
                    start_time=_time_to_str(tpl.start_time),
                    end_time=_time_to_str(tpl.end_time),
                    assignment_type=_template_to_assignment_type(tpl),
                    source="protocol",
                )

        return ResolvedShift(
            shift_template_id=None,
            start_time=protocol.working_hours_start,
            end_time=protocol.working_hours_end,
            assignment_type=AssignmentType.ADMIN,
            source="protocol",
        )

    async def _resolve_rotating_protocol(
        self,
        protocol: ShiftProtocol,
        target_date: date,
        rotation_offset: int = 0,
        template_map: dict | None = None,
    ) -> ResolvedShift | None:
        """Resolve a rotating (pattern-based) protocol for a date."""
        shifts = protocol.rotation_shifts
        if not shifts:
            return None

        day_index = (target_date.day - 1 + rotation_offset) % len(shifts)
        shift_label = shifts[day_index]

        if shift_label == "off":
            return None

        if shift_label == "day":
            start_str = protocol.day_shift_start
            end_str = protocol.day_shift_end
            assn_type = AssignmentType.DAY
        elif shift_label == "night":
            start_str = protocol.night_shift_start
            end_str = protocol.night_shift_end
            assn_type = AssignmentType.NIGHT
        else:
            start_str = protocol.working_hours_start
            end_str = protocol.working_hours_end
            assn_type = AssignmentType.ADMIN

        if start_str and end_str:
            tpl = None
            if template_map:
                tpl = _find_template_by_times(template_map, start_str, end_str)
            if tpl is None:
                tpl = await self._find_template_by_time_strings(start_str, end_str)
            if tpl is not None:
                return ResolvedShift(
                    shift_template_id=tpl.id,
                    start_time=_time_to_str(tpl.start_time),
                    end_time=_time_to_str(tpl.end_time),
                    assignment_type=_template_to_assignment_type(tpl),
                    source="protocol",
                )

        return ResolvedShift(
            shift_template_id=None,
            start_time=start_str,
            end_time=end_str,
            assignment_type=assn_type,
            source="protocol",
        )

    # ── Protocol Step Expansion ────────────────────────────────

    async def _expand_protocol_steps(
        self,
        db: AsyncSession,
        protocol: ShiftProtocol,
    ) -> list[ExpandedStep]:
        """
        Expand a protocol's steps by their duration_days into a flat list.

        Each step with duration_days=N produces N consecutive entries.
        If the protocol has no steps, returns an empty list.
        """
        if not protocol.steps:
            return []

        expanded: list[ExpandedStep] = []
        for step in protocol.steps:
            for _ in range(step.duration_days):
                expanded.append(ExpandedStep(
                    step_order=step.step_order,
                    step_type=step.step_type,
                    label=step.label,
                    shift_template_id=step.shift_template_id,
                ))
        return expanded

    # ── Data Fetchers ──────────────────────────────────────────

    async def _get_department(self, db: AsyncSession, dept_id: UUID) -> Department | None:
        result = await db.execute(
            select(Department).where(Department.id == dept_id)
        )
        return result.scalar_one_or_none()

    async def _get_active_department_protocol(
        self,
        db: AsyncSession,
        department_id: UUID,
        target_date: date,
    ) -> DepartmentProtocol | None:
        """Find the active protocol for a department on a given date.

        First checks the DepartmentProtocol table (effective dated assignments).
        Falls back to Department.shift_protocol_id if no timed assignment covers target_date.
        """
        result = await db.execute(
            select(DepartmentProtocol)
            .where(
                and_(
                    DepartmentProtocol.department_id == department_id,
                    DepartmentProtocol.effective_date <= target_date,
                    or_(
                        DepartmentProtocol.end_date.is_(None),
                        DepartmentProtocol.end_date >= target_date,
                    ),
                )
            )
            .order_by(DepartmentProtocol.effective_date.desc())
            .limit(1)
        )
        dp = result.scalar_one_or_none()
        if dp is not None:
            return dp

        # Fallback: Department.shift_protocol_id (direct field)
        dept_result = await db.execute(
            select(Department).where(Department.id == department_id)
        )
        dept = dept_result.scalar_one_or_none()
        if dept is not None and dept.shift_protocol_id is not None:
            dp = DepartmentProtocol(
                department_id=dept.id,
                protocol_id=dept.shift_protocol_id,
                effective_date=date(2000, 1, 1),
            )
            return dp

        return None

    async def _fetch_active_employees(
        self, db: AsyncSession, department_id: UUID
    ) -> list[Employee]:
        result = await db.execute(
            select(Employee)
            .where(
                and_(
                    Employee.department_id == department_id,
                    Employee.status == EmployeeStatus.ACTIVE.value,
                )
            )
            .order_by(Employee.employee_code)
        )
        return list(result.scalars().all())

    async def _fetch_holidays_for_month(
        self, db: AsyncSession, department_id: UUID, year: int, month: int
    ) -> set[date]:
        """Fetch all holidays (org-wide + department-specific) for the month."""
        first, last = _month_date_range(year, month)
        result = await db.execute(
            select(HolidayCalendar.date)
            .where(
                and_(
                    HolidayCalendar.date >= first,
                    HolidayCalendar.date <= last,
                    or_(
                        HolidayCalendar.scope == HolidayScope.ORGANIZATION,
                        and_(
                            HolidayCalendar.scope == HolidayScope.DEPARTMENT,
                            HolidayCalendar.department_id == department_id,
                        ),
                    ),
                )
            )
        )
        return set(result.scalars().all())

    async def _fetch_leaves_for_month(
        self,
        db: AsyncSession,
        employee_ids: list[UUID],
        first_day: date,
        last_day: date,
    ) -> list[LeaveRequest]:
        if not employee_ids:
            return []
        result = await db.execute(
            select(LeaveRequest)
            .where(
                and_(
                    LeaveRequest.employee_id.in_(employee_ids),
                    LeaveRequest.status == LeaveStatus.APPROVED,
                    LeaveRequest.start_date <= last_day,
                    LeaveRequest.end_date >= first_day,
                )
            )
        )
        return list(result.scalars().all())

    async def _fetch_overrides_for_month(
        self,
        db: AsyncSession,
        employee_ids: list[UUID],
        first_day: date,
        last_day: date,
    ) -> list[EmployeeShiftOverride]:
        if not employee_ids:
            return []
        result = await db.execute(
            select(EmployeeShiftOverride)
            .where(
                and_(
                    EmployeeShiftOverride.employee_id.in_(employee_ids),
                    EmployeeShiftOverride.start_date <= last_day,
                    EmployeeShiftOverride.end_date >= first_day,
                )
            )
        )
        return list(result.scalars().all())

    async def _fetch_swaps_for_month(
        self,
        db: AsyncSession,
        employee_ids: list[UUID],
        first_day: date,
        last_day: date,
    ) -> list[ShiftSwapRequest]:
        if not employee_ids:
            return []
        result = await db.execute(
            select(ShiftSwapRequest)
            .where(
                and_(
                    or_(
                        ShiftSwapRequest.requester_id.in_(employee_ids),
                        ShiftSwapRequest.target_id.in_(employee_ids),
                    ),
                    ShiftSwapRequest.swap_date >= first_day,
                    ShiftSwapRequest.swap_date <= last_day,
                    ShiftSwapRequest.status == "approved",
                )
            )
        )
        return list(result.scalars().all())

    async def _fetch_protocols_with_steps(
        self, db: AsyncSession, protocol_ids: list[UUID]
    ) -> list[ShiftProtocol]:
        if not protocol_ids:
            return []
        result = await db.execute(
            select(ShiftProtocol)
            .options(joinedload(ShiftProtocol.steps))
            .where(ShiftProtocol.id.in_(protocol_ids))
        )
        return list(result.unique().scalars().all())

    async def _fetch_templates_by_ids(
        self, db: AsyncSession, template_ids: list[UUID]
    ) -> list[ShiftTemplate]:
        if not template_ids:
            return []
        result = await db.execute(
            select(ShiftTemplate).where(ShiftTemplate.id.in_(template_ids))
        )
        return list(result.scalars().all())

    async def _get_protocol_by_id(
        self, db: AsyncSession, protocol_id: UUID
    ) -> ShiftProtocol | None:
        result = await db.execute(
            select(ShiftProtocol)
            .options(joinedload(ShiftProtocol.steps))
            .where(ShiftProtocol.id == protocol_id)
        )
        return result.unique().scalar_one_or_none()

    async def _get_template_by_id(
        self, db: AsyncSession, template_id: UUID
    ) -> ShiftTemplate | None:
        if template_id is None:
            return None
        result = await db.execute(
            select(ShiftTemplate).where(ShiftTemplate.id == template_id)
        )
        return result.scalar_one_or_none()

    async def _find_template_by_time_strings(
        self, start_str: str, end_str: str
    ) -> ShiftTemplate | None:
        try:
            sh, sm = start_str.split(":")
            eh, em = end_str.split(":")
            start_t = time(int(sh), int(sm))
            end_t = time(int(eh), int(em))
        except (ValueError, AttributeError):
            return None
        result = await self.session.execute(
            select(ShiftTemplate).where(
                and_(
                    ShiftTemplate.start_time == start_t,
                    ShiftTemplate.end_time == end_t,
                )
            )
        )
        return result.scalar_one_or_none()

    # ── Single-lookup helpers for resolve_shift_for_employee ───

    async def _get_single_override(
        self, db: AsyncSession, employee_id: UUID, target_date: date
    ) -> EmployeeShiftOverride | None:
        result = await db.execute(
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

    async def _get_single_swap(
        self, db: AsyncSession, employee_id: UUID, target_date: date
    ) -> ShiftSwapRequest | None:
        result = await db.execute(
            select(ShiftSwapRequest)
            .where(
                and_(
                    or_(
                        ShiftSwapRequest.requester_id == employee_id,
                        ShiftSwapRequest.target_id == employee_id,
                    ),
                    ShiftSwapRequest.swap_date == target_date,
                    ShiftSwapRequest.status == "approved",
                )
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_single_leave(
        self, db: AsyncSession, employee_id: UUID, target_date: date
    ) -> LeaveRequest | None:
        result = await db.execute(
            select(LeaveRequest)
            .where(
                and_(
                    LeaveRequest.employee_id == employee_id,
                    LeaveRequest.status == LeaveStatus.APPROVED,
                    LeaveRequest.start_date <= target_date,
                    LeaveRequest.end_date >= target_date,
                )
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _is_holiday(
        self, db: AsyncSession, department_id: UUID | None, target_date: date
    ) -> bool:
        """Check if a date is a holiday (org-wide or department-specific)."""
        conditions = [HolidayCalendar.scope == HolidayScope.ORGANIZATION]
        if department_id is not None:
            conditions.append(
                and_(
                    HolidayCalendar.scope == HolidayScope.DEPARTMENT,
                    HolidayCalendar.department_id == department_id,
                )
            )
        result = await db.execute(
            select(HolidayCalendar.id)
            .where(
                and_(
                    HolidayCalendar.date == target_date,
                    or_(*conditions),
                )
            )
            .limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def _delete_existing_snapshot(
        self, db: AsyncSession, department_id: UUID, year: int, month: int
    ) -> None:
        """Remove an existing snapshot for (dept, year, month) if one exists."""
        result = await db.execute(
            select(RosterSnapshot).where(
                and_(
                    RosterSnapshot.department_id == department_id,
                    RosterSnapshot.year == year,
                    RosterSnapshot.month == month,
                )
            )
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            logger.warning(
                f"[Scheduling] Overwriting existing roster for "
                f"dept={department_id} {year}-{month:02d}"
            )
            # Explicitly delete entries first (belt-and-suspenders with cascade)
            await db.execute(
                delete(RosterEntry).where(RosterEntry.snapshot_id == existing.id)
            )
            await db.delete(existing)
            await db.flush()


# ── Module-Level Helpers ───────────────────────────────────────

def _month_date_range(year: int, month: int) -> tuple[date, date]:
    """Return (first_day, last_day) for the given month."""
    first = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    last = date(year, month, last_day)
    return first, last


def _time_to_str(t: time | None) -> str | None:
    """Convert a datetime.time to 'HH:MM' string."""
    if t is None:
        return None
    return f"{t.hour:02d}:{t.minute:02d}"


def _template_to_assignment_type(tpl: ShiftTemplate) -> AssignmentType:
    """Map a ShiftTemplate to its AssignmentType based on shift_type."""
    if tpl.shift_type == "night":
        return AssignmentType.NIGHT
    if tpl.shift_type == "day":
        return AssignmentType.DAY
    if tpl.shift_type == "off":
        return AssignmentType.OFF
    if tpl.shift_type == "holiday":
        return AssignmentType.HOLIDAY
    return AssignmentType.ADMIN


def _step_type_to_assignment(step_type: str, tpl: ShiftTemplate | None) -> AssignmentType:
    """Convert a protocol step type to AssignmentType, preferring template hints."""
    if tpl is not None and tpl.shift_type in ("day", "night"):
        return _template_to_assignment_type(tpl)

    mapping = {
        "work": AssignmentType.DAY,
        "day": AssignmentType.DAY,
        "night": AssignmentType.NIGHT,
        "off": AssignmentType.OFF,
        "leave": AssignmentType.LEAVE,
        "holiday": AssignmentType.HOLIDAY,
    }
    return mapping.get(step_type, AssignmentType.ADMIN)


def _build_leave_date_set(
    leaves: list[LeaveRequest],
    first_day: date,
    last_day: date,
) -> dict[str, set[date]]:
    """Build {employee_id_str -> set[date]} from approved leave requests."""
    leave_map: dict[str, set[date]] = {}
    for lv in leaves:
        emp_key = str(lv.employee_id)
        current = max(lv.start_date, first_day)
        while current <= min(lv.end_date, last_day):
            leave_map.setdefault(emp_key, set()).add(current)
            current += timedelta(days=1)
    return leave_map


def _build_override_map(
    overrides: list[EmployeeShiftOverride],
) -> dict[str, dict[date, EmployeeShiftOverride]]:
    """
    Build {employee_id_str -> {date: override}} lookup.

    If multiple overrides overlap the same date for an employee,
    the most recently created one wins.
    """
    override_map: dict[str, dict[date, EmployeeShiftOverride]] = {}
    for ov in overrides:
        emp_key = str(ov.employee_id)
        if emp_key not in override_map:
            override_map[emp_key] = {}
        current = ov.start_date
        while current <= ov.end_date:
            existing = override_map[emp_key].get(current)
            if existing is None or ov.created_at > existing.created_at:
                override_map[emp_key][current] = ov
            current += timedelta(days=1)
    return override_map


def _build_swap_map(
    swaps: list[ShiftSwapRequest],
) -> dict[str, dict[date, ShiftSwapRequest]]:
    """Build {employee_id_str -> {date: swap}} from approved swaps."""
    swap_map: dict[str, dict[date, ShiftSwapRequest]] = {}
    for sw in swaps:
        req_key = str(sw.requester_id)
        tgt_key = str(sw.target_id)
        swap_map.setdefault(req_key, {})[sw.swap_date] = sw
        swap_map.setdefault(tgt_key, {})[sw.swap_date] = sw
    return swap_map


def _resolve_swap_template_id(
    swap: ShiftSwapRequest, employee_id: UUID
) -> UUID | None:
    """
    Given an approved swap, determine which template the employee should use.

    - If the employee is the requester → they take the target's shift
    - If the employee is the target → they take the requester's shift
    """
    if swap.requester_id == employee_id:
        return swap.target_shift_id
    return swap.requester_shift_id


def _find_template_by_times(
    template_map: dict[UUID, ShiftTemplate],
    start_str: str,
    end_str: str,
) -> ShiftTemplate | None:
    """Find a ShiftTemplate in an in-memory dict by start/end time strings."""
    for tpl in template_map.values():
        tpl_start = _time_to_str(tpl.start_time)
        tpl_end = _time_to_str(tpl.end_time)
        if tpl_start == start_str and tpl_end == end_str:
            return tpl
    return None
