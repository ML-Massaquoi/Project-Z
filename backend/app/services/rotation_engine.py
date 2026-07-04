"""
Project Z - Rotation Engine (Protocol-Driven)

Replaces the old employee-driven SchedulingEngine.

Architecture:
  Department → Protocol → Build Sequence → Groups with Offsets → Monthly Roster

The protocol belongs to the department.
Employees inherit schedules from their assigned rotation group.

This is the same scheduling foundation used by airports, hospitals,
manufacturing plants, and 24/7 operations centers.
"""
import calendar
import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.department import Department
from app.models.employee import Employee, EmployeeStatus
from app.models.rotation_group import RotationGroup, GroupAssignment
from app.models.roster import RosterSnapshot, RosterEntry, AssignmentType
from app.models.shift_protocol import ShiftProtocol, ProtocolType
from app.models.shift_protocol_step import ShiftProtocolStep

logger = logging.getLogger(__name__)


@dataclass
class DailyAssignment:
    """One day's assignment for one employee."""
    assignment_type: AssignmentType
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None    # HH:MM


class RotationEngine:
    """
    Protocol-driven roster generator.

    Usage:
        engine = RotationEngine(db)
        snapshot = await engine.generate_department_roster(
            db=session, department_id=..., year=2026, month=7
        )
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    # ── Public API ─────────────────────────────────────────────

    async def generate_department_roster(
        self,
        db: AsyncSession,
        department_id: str | UUID,
        year: int,
        month: int,
        generated_by: str | UUID | None = None,
    ) -> RosterSnapshot:
        """
        Generate (or regenerate) the monthly roster for a department
        using the protocol-driven rotation architecture.
        """
        dept_id = UUID(department_id) if isinstance(department_id, str) else department_id

        # ── Load department + protocol ─────────────────────
        dept = await self._get_department(db, dept_id)
        if not dept:
            raise ValueError(f"Department {dept_id} not found")
        if not dept.shift_protocol_id:
            raise ValueError(f"Department '{dept.name}' has no assigned shift protocol")

        proto = await self._get_protocol(db, dept.shift_protocol_id)
        if not proto:
            raise ValueError(f"Protocol {dept.shift_protocol_id} not found")

        # ── Build cyclic sequence from protocol steps ──────
        sequence = await self._build_protocol_sequence(db, proto)

        # ── Tear down existing snapshot ────────────────────
        await self._delete_existing_snapshot(db, dept_id, year, month)

        # ── Create fresh snapshot ──────────────────────────
        snapshot = RosterSnapshot(
            department_id=dept_id,
            department_name=dept.name,
            year=year,
            month=month,
            generated_at=datetime.now(timezone.utc),
            generated_by=UUID(generated_by) if isinstance(generated_by, str) else generated_by,
        )
        db.add(snapshot)
        await db.flush()
        await db.refresh(snapshot)

        first_day = date(year, month, 1)
        last_day = date(year, month, calendar.monthrange(year, month)[1])

        if proto.protocol_type == ProtocolType.ROTATING:
            # ── Rotating: group-driven generation ──────────
            groups = await self._get_or_create_groups(db, dept_id)
            if not groups:
                logger.info(f"[Rotation] No rotation groups for dept {dept.name}")
                return snapshot

            entries: list[RosterEntry] = []
            for group in groups:
                members_result = await db.execute(
                    select(GroupAssignment)
                    .where(GroupAssignment.group_id == group.id)
                )
                members = members_result.scalars().all()
                if not members:
                    continue

                current = first_day
                while current <= last_day:
                    day_index = (current - first_day).days
                    pos = (group.protocol_offset + day_index) % len(sequence)
                    step = sequence[pos]

                    for member in members:
                        emp_result = await db.execute(
                            select(Employee).where(Employee.id == member.employee_id)
                        )
                        emp = emp_result.scalar_one_or_none()
                        if not emp:
                            continue

                        entry = self._build_entry(
                            snapshot=snapshot,
                            employee=emp,
                            dept=dept,
                            current=current,
                            step=step,
                            group_name=group.name,
                            group_id=group.id,
                        )
                        entries.append(entry)

                    current += timedelta(days=1)

        else:
            # ── Fixed: per-employee schedule ───────────────
            employees_result = await db.execute(
                select(Employee).where(
                    and_(
                        Employee.department_id == dept_id,
                        Employee.status == EmployeeStatus.ACTIVE,
                    )
                )
            )
            employees = employees_result.scalars().all()

            entries = []
            current = first_day
            while current <= last_day:
                for emp in employees:
                    iso_weekday = current.isoweekday()  # 1=Mon, 7=Sun

                    if proto.working_days:
                        is_working = iso_weekday in proto.working_days
                    else:
                        is_working = iso_weekday <= 5  # Mon-Fri default

                    if is_working:
                        assign = AssignmentType.ADMIN
                        start = proto.working_hours_start or "08:00"
                        end = proto.working_hours_end or "17:00"
                    else:
                        assign = AssignmentType.OFF
                        start = None
                        end = None

                    entry = RosterEntry(
                        snapshot_id=snapshot.id,
                        employee_id=emp.id,
                        employee_code=emp.employee_code,
                        employee_name=emp.full_name,
                        department_name=dept.name,
                        entry_date=current,
                        assignment=assign,
                        shift_start=start,
                        shift_end=end,
                    )
                    entries.append(entry)

                current += timedelta(days=1)

        # ── Bulk persist ─────────────────────────────────
        if entries:
            db.add_all(entries)
            await db.flush()

        logger.info(
            f"[Rotation] Generated {len(entries)} roster entries for "
            f"{dept.name} {year}-{month:02d}"
        )
        return snapshot

    # ── Internal helpers ───────────────────────────────────────

    def _build_entry(
        self,
        snapshot: RosterSnapshot,
        employee: Employee,
        dept: Department,
        current: date,
        step: DailyAssignment,
        group_name: Optional[str] = None,
        group_id: Optional[UUID] = None,
    ) -> RosterEntry:
        return RosterEntry(
            snapshot_id=snapshot.id,
            employee_id=employee.id,
            employee_code=employee.employee_code,
            employee_name=employee.full_name,
            department_name=dept.name,
            entry_date=current,
            assignment=step.assignment_type,
            shift_start=step.start_time,
            shift_end=step.end_time,
            pair_name=group_name,
            pair_id=group_id,
        )

    async def _build_protocol_sequence(
        self, db: AsyncSession, proto: ShiftProtocol
    ) -> list[DailyAssignment]:
        """Build a cyclic sequence array from protocol steps."""
        if not proto.steps:
            # Fallback: build from rotation_shifts JSON array
            return self._build_sequence_from_json(proto)

        sequence: list[DailyAssignment] = []
        for step in proto.steps:
            label = (step.label or "").upper()
            if label == "DAY" or label == "DAY_SHIFT":
                assign_type = AssignmentType.DAY
                start = proto.day_shift_start or "08:00"
                end = proto.day_shift_end or "20:00"
            elif label == "NIGHT" or label == "NIGHT_SHIFT":
                assign_type = AssignmentType.NIGHT
                start = proto.night_shift_start or "20:00"
                end = proto.night_shift_end or "08:00"
            elif step.step_type == "off":
                assign_type = AssignmentType.OFF
                start = None
                end = None
            elif step.step_type == "holiday":
                assign_type = AssignmentType.HOLIDAY
                start = None
                end = None
            elif step.step_type == "leave":
                assign_type = AssignmentType.LEAVE
                start = None
                end = None
            else:
                assign_type = AssignmentType.ADMIN
                start = proto.day_shift_start or "08:00"
                end = proto.day_shift_end or "17:00"

            for _ in range(step.duration_days):
                sequence.append(DailyAssignment(
                    assignment_type=assign_type,
                    start_time=start,
                    end_time=end,
                ))

        if not sequence:
            # Empty fallback
            sequence.append(DailyAssignment(
                assignment_type=AssignmentType.OFF,
            ))

        return sequence

    def _build_sequence_from_json(
        self, proto: ShiftProtocol
    ) -> list[DailyAssignment]:
        """Build sequence from the rotation_shifts JSON array (legacy fallback)."""
        shifts = proto.rotation_shifts or []
        if not shifts:
            return [DailyAssignment(assignment_type=AssignmentType.OFF)]

        sequence: list[DailyAssignment] = []
        for shift_name in shifts:
            name = str(shift_name).upper().strip()
            if name in ("DAY", "D"):
                sequence.append(DailyAssignment(
                    assignment_type=AssignmentType.DAY,
                    start_time=proto.day_shift_start or "08:00",
                    end_time=proto.day_shift_end or "20:00",
                ))
            elif name in ("NIGHT", "N"):
                sequence.append(DailyAssignment(
                    assignment_type=AssignmentType.NIGHT,
                    start_time=proto.night_shift_start or "20:00",
                    end_time=proto.night_shift_end or "08:00",
                ))
            else:
                sequence.append(DailyAssignment(
                    assignment_type=AssignmentType.OFF,
                ))

        return sequence

    async def _get_or_create_groups(
        self, db: AsyncSession, dept_id: UUID
    ) -> list[RotationGroup]:
        """Get existing rotation groups or auto-create them."""
        result = await db.execute(
            select(RotationGroup)
            .where(
                and_(
                    RotationGroup.department_id == dept_id,
                    RotationGroup.is_active == True,
                )
            )
            .order_by(RotationGroup.name)
        )
        groups = result.scalars().all()

        if not groups:
            logger.info(f"[Rotation] No groups found for dept={dept_id}, auto-creating")

            # Load active employees
            emp_result = await db.execute(
                select(Employee).where(
                    and_(
                        Employee.department_id == dept_id,
                        Employee.status == EmployeeStatus.ACTIVE,
                    )
                )
            )
            employees = emp_result.scalars().all()

            if not employees:
                return []

            # Default: 4 groups
            num_groups = min(4, len(employees))
            group_names = ["Group A", "Group B", "Group C", "Group D"]

            # Calculate balanced distribution
            base_size = len(employees) // num_groups
            remainder = len(employees) % num_groups

            created_groups = []
            emp_idx = 0
            for gi in range(num_groups):
                group = RotationGroup(
                    department_id=dept_id,
                    name=group_names[gi],
                    protocol_offset=gi,  # Sequential offsets: 0, 1, 2, 3
                    is_active=True,
                )
                db.add(group)
                await db.flush()
                await db.refresh(group)
                created_groups.append(group)

                # Assign employees to this group
                group_size = base_size + (1 if gi < remainder else 0)
                for _ in range(group_size):
                    if emp_idx < len(employees):
                        assignment = GroupAssignment(
                            group_id=group.id,
                            employee_id=employees[emp_idx].id,
                        )
                        db.add(assignment)
                        emp_idx += 1

            await db.flush()
            return created_groups

        return groups

    async def _get_department(
        self, db: AsyncSession, dept_id: UUID
    ) -> Optional[Department]:
        result = await db.execute(
            select(Department).options(
                joinedload(Department.shift_protocol)
            ).where(Department.id == dept_id)
        )
        return result.scalar_one_or_none()

    async def _get_protocol(
        self, db: AsyncSession, protocol_id: UUID
    ) -> Optional[ShiftProtocol]:
        result = await db.execute(
            select(ShiftProtocol)
            .options(joinedload(ShiftProtocol.steps))
            .where(ShiftProtocol.id == protocol_id)
        )
        return result.unique().scalar_one_or_none()

    async def _delete_existing_snapshot(
        self, db: AsyncSession, department_id: UUID, year: int, month: int
    ) -> None:
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
        if existing:
            await db.execute(
                delete(RosterEntry).where(RosterEntry.snapshot_id == existing.id)
            )
            await db.delete(existing)
            await db.flush()

    # ── Auto-distribute employees into groups ─────────────────

    async def auto_distribute(
        self,
        db: AsyncSession,
        department_id: UUID,
        num_groups: int = 4,
    ) -> list[RotationGroup]:
        """
        Distribute all active employees in a department evenly
        across N rotation groups.  Creates groups if they don't exist.
        """
        dept_id = UUID(department_id) if isinstance(department_id, str) else department_id

        # Remove existing active groups
        existing = await db.execute(
            select(RotationGroup).where(
                and_(
                    RotationGroup.department_id == dept_id,
                    RotationGroup.is_active == True,
                )
            )
        )
        for g in existing.scalars().all():
            await db.delete(g)
        await db.flush()

        # Load employees
        emp_result = await db.execute(
            select(Employee).where(
                and_(
                    Employee.department_id == dept_id,
                    Employee.status == EmployeeStatus.ACTIVE,
                )
            ).order_by(Employee.employee_code)
        )
        employees = emp_result.scalars().all()

        if not employees:
            return []

        num_groups = min(num_groups, len(employees))
        group_names = [f"Group {chr(65 + i)}" for i in range(num_groups)]
        base_size = len(employees) // num_groups
        remainder = len(employees) % num_groups

        created_groups: list[RotationGroup] = []
        emp_idx = 0
        for gi in range(num_groups):
            group = RotationGroup(
                department_id=dept_id,
                name=group_names[gi],
                protocol_offset=gi,
                is_active=True,
            )
            db.add(group)
            await db.flush()
            await db.refresh(group)
            created_groups.append(group)

            group_size = base_size + (1 if gi < remainder else 0)
            for _ in range(group_size):
                if emp_idx < len(employees):
                    db.add(GroupAssignment(
                        group_id=group.id,
                        employee_id=employees[emp_idx].id,
                    ))
                    emp_idx += 1

        await db.flush()
        logger.info(
            f"[Rotation] Auto-distributed {len(employees)} employees "
            f"into {num_groups} groups for dept={dept_id}"
        )
        return created_groups
