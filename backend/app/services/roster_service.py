"""
Project Z - Roster Service
Orchestrates monthly roster generation by:
  1. Loading all shift pairs and their members for a department
  2. Loading admin/unpaired employees
  3. Applying leave overrides
  4. Persisting RosterSnapshot + RosterEntry records
"""
import logging
from datetime import date, datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.roster import AssignmentType, RosterEntry, RosterSnapshot
from app.models.shift_pair import ShiftPair, ShiftPairMember
from app.models.shift_protocol import ShiftProtocol, ProtocolType
from app.models.employee import Employee
from app.models.department import Department
from app.models.leave_request import LeaveRequest, LeaveStatus
from app.services.roster_engine import (
    AdminConfig,
    PairConfig,
    PairScheduleEntry,
    generate_admin_schedule,
    generate_pair_schedule,
    month_date_range,
)

logger = logging.getLogger(__name__)


class RosterService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def generate_monthly_roster(
        self,
        department_id: UUID,
        year: int,
        month: int,
        generated_by: Optional[UUID] = None,
    ) -> RosterSnapshot:
        """
        Generate (or regenerate) the monthly roster for a department.
        Deletes any existing snapshot for the same dept/year/month first.
        """
        start_date, end_date = month_date_range(year, month)
        logger.info(f"[Roster] Generating {year}-{month:02d} for dept={department_id}")

        # ── Load department ────────────────────────────────────
        dept_result = await self.session.execute(
            select(Department).where(Department.id == department_id)
        )
        dept = dept_result.scalar_one_or_none()
        if not dept:
            raise ValueError(f"Department {department_id} not found")

        # ── Delete existing snapshot ───────────────────────────
        existing = await self.session.execute(
            select(RosterSnapshot).where(
                and_(
                    RosterSnapshot.department_id == department_id,
                    RosterSnapshot.year == year,
                    RosterSnapshot.month == month,
                )
            )
        )
        old_snap = existing.scalar_one_or_none()
        if old_snap:
            await self.session.delete(old_snap)
            await self.session.flush()

        # ── Create new snapshot ────────────────────────────────
        snapshot = RosterSnapshot(
            department_id=department_id,
            department_name=dept.name,
            year=year,
            month=month,
            generated_at=datetime.now(timezone.utc),
            generated_by=generated_by,
        )
        self.session.add(snapshot)
        await self.session.flush()
        await self.session.refresh(snapshot)

        # ── Load approved leaves for this period ───────────────
        leaves_result = await self.session.execute(
            select(LeaveRequest).where(
                and_(
                    LeaveRequest.status == LeaveStatus.APPROVED,
                    LeaveRequest.start_date <= end_date,
                    LeaveRequest.end_date >= start_date,
                )
            )
        )
        leaves = leaves_result.scalars().all()
        # Build lookup: employee_id -> set of leave dates
        leave_dates: dict[str, set[date]] = {}
        for lv in leaves:
            emp_key = str(lv.employee_id)
            current = max(lv.start_date, start_date)
            while current <= min(lv.end_date, end_date):
                leave_dates.setdefault(emp_key, set()).add(current)
                from datetime import timedelta
                current += timedelta(days=1)

        all_entries: list[PairScheduleEntry] = []

        # ── Process shift pairs (rotating employees) ───────────
        pairs_result = await self.session.execute(
            select(ShiftPair)
            .where(
                and_(
                    ShiftPair.department_id == department_id,
                    ShiftPair.is_active == True,
                )
            )
        )
        pairs = pairs_result.scalars().all()

        for pair in pairs:
            # Load protocol
            proto_result = await self.session.execute(
                select(ShiftProtocol).where(ShiftProtocol.id == pair.protocol_id)
            )
            proto = proto_result.scalar_one_or_none()
            if not proto:
                logger.warning(f"[Roster] Pair {pair.id} references missing protocol {pair.protocol_id}")
                continue

            # Load members ordered by slot_index
            members_result = await self.session.execute(
                select(ShiftPairMember, Employee)
                .join(Employee, Employee.id == ShiftPairMember.employee_id)
                .where(ShiftPairMember.pair_id == pair.id)
                .order_by(ShiftPairMember.slot_index)
            )
            member_rows = members_result.all()

            if len(member_rows) < 2:
                logger.warning(f"[Roster] Pair {pair.name} has fewer than 2 members — skipping")
                continue

            members_list = [
                (str(emp.id), emp.employee_code, emp.full_name)
                for _, emp in member_rows
            ]

            config = PairConfig(
                pair_id=str(pair.id),
                pair_name=pair.name,
                rotation_start_date=pair.rotation_start_date,
                days_on=proto.days_on or 2,
                days_off=proto.days_off or 2,
                day_shift_start=proto.day_shift_start or "08:00",
                day_shift_end=proto.day_shift_end or "20:00",
                night_shift_start=proto.night_shift_start or "20:00",
                night_shift_end=proto.night_shift_end or "08:00",
                members=members_list,
            )
            entries = generate_pair_schedule(config, start_date, end_date)
            all_entries.extend(entries)

        # ── Process unpaired/admin employees ───────────────────
        # Find all employees in dept who are NOT in any active pair
        paired_emp_ids = set()
        for pair in pairs:
            members_result = await self.session.execute(
                select(ShiftPairMember.employee_id).where(ShiftPairMember.pair_id == pair.id)
            )
            for (emp_id,) in members_result.all():
                paired_emp_ids.add(emp_id)

        all_emps_result = await self.session.execute(
            select(Employee).where(
                and_(
                    Employee.department_id == department_id,
                    Employee.status == "active",
                )
            )
        )
        all_emps = all_emps_result.scalars().all()

        for emp in all_emps:
            if emp.id in paired_emp_ids:
                continue  # already handled above

            # Use employee's protocol if set, otherwise dept protocol, otherwise ADMIN_8_TO_5
            protocol = None
            if emp.shift_protocol_id:
                proto_result = await self.session.execute(
                    select(ShiftProtocol).where(ShiftProtocol.id == emp.shift_protocol_id)
                )
                protocol = proto_result.scalar_one_or_none()

            if not protocol and dept.shift_protocol_id:
                proto_result = await self.session.execute(
                    select(ShiftProtocol).where(ShiftProtocol.id == dept.shift_protocol_id)
                )
                protocol = proto_result.scalar_one_or_none()

            # Default to Mon-Fri 08:00-17:00
            working_days = [1, 2, 3, 4, 5]
            shift_start = "08:00"
            shift_end = "17:00"

            if protocol and protocol.protocol_type == ProtocolType.FIXED:
                if protocol.working_days:
                    working_days = list(protocol.working_days)
                if protocol.working_hours_start:
                    shift_start = protocol.working_hours_start
                if protocol.working_hours_end:
                    shift_end = protocol.working_hours_end

            admin_config = AdminConfig(
                employee_id=str(emp.id),
                employee_code=emp.employee_code,
                employee_name=emp.full_name,
                working_days=working_days,
                shift_start=shift_start,
                shift_end=shift_end,
            )
            entries = generate_admin_schedule(admin_config, start_date, end_date)
            all_entries.extend(entries)

        # ── Apply leave overrides and persist ──────────────────
        db_entries: list[RosterEntry] = []
        for e in all_entries:
            emp_key = e.employee_id
            # Check if this date is a leave day
            final_assignment = e.assignment
            if emp_key in leave_dates and e.entry_date in leave_dates[emp_key]:
                final_assignment = "LEAVE"

            db_entry = RosterEntry(
                snapshot_id=snapshot.id,
                employee_id=UUID(e.employee_id),
                employee_code=e.employee_code,
                employee_name=e.employee_name,
                department_name=dept.name,
                entry_date=e.entry_date,
                assignment=AssignmentType(final_assignment),
                pair_id=UUID(e.pair_id) if e.pair_id else None,
                pair_name=e.pair_name,
                shift_start=e.shift_start,
                shift_end=e.shift_end,
                is_overridden=(final_assignment != e.assignment),
                override_reason="Approved leave" if final_assignment == "LEAVE" else None,
            )
            db_entries.append(db_entry)

        self.session.add_all(db_entries)
        await self.session.flush()

        logger.info(
            f"[Roster] Generated {len(db_entries)} entries for "
            f"{dept.name} {year}-{month:02d}"
        )
        return snapshot

    async def get_snapshot(
        self,
        department_id: UUID,
        year: int,
        month: int,
    ) -> Optional[RosterSnapshot]:
        result = await self.session.execute(
            select(RosterSnapshot).where(
                and_(
                    RosterSnapshot.department_id == department_id,
                    RosterSnapshot.year == year,
                    RosterSnapshot.month == month,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_entries(
        self,
        snapshot_id: UUID,
    ) -> list[RosterEntry]:
        result = await self.session.execute(
            select(RosterEntry)
            .where(RosterEntry.snapshot_id == snapshot_id)
            .order_by(RosterEntry.entry_date, RosterEntry.employee_name)
        )
        return result.scalars().all()

    async def override_entry(
        self,
        entry_id: UUID,
        new_assignment: str,
        reason: Optional[str],
    ) -> Optional[RosterEntry]:
        result = await self.session.execute(
            select(RosterEntry).where(RosterEntry.id == entry_id)
        )
        entry = result.scalar_one_or_none()
        if not entry:
            return None
        entry.assignment = AssignmentType(new_assignment)
        entry.is_overridden = True
        entry.override_reason = reason
        await self.session.flush()
        return entry
