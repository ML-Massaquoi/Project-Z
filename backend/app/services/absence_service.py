"""
Project Z - Absence Calculation Service
Determines which employees are expected to work on a given date
and calculates true absent count (excluding leave/vacation/off-duty).

Shift resolution chain (4 levels):
1. EmployeeShiftOverride — per-employee, date-bounded (highest precedence)
2. EmployeeShiftAssignment — per-employee, simple/rotating
3. DepartmentShiftRule — per-department, date-range
4. Default — Mon-Fri for employees without any shift assignment
"""

import logging
from datetime import date
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.shift_assignment import EmployeeShiftAssignment
from app.models.shift_override import EmployeeShiftOverride

logger = logging.getLogger(__name__)


async def get_expected_worker_ids(
    db: AsyncSession,
    target_date: date,
    department_id: Optional[UUID] = None,
    enrolled_ids: Optional[list] = None,
) -> set[UUID]:
    """
    Get set of employee IDs who are expected to work on target_date.

    Logic:
    - If employee has an active EmployeeShiftOverride for this date → use override's template
    - If employee has an EmployeeShiftAssignment → check working_days
    - Otherwise → default to Mon-Fri (isoweekday 1-5)

    Employees on leave/vacation are EXCLUDED from expected workers.
    """
    # 1. Get all active employees (optionally filtered to only enrolled)
    emp_query = select(Employee).where(Employee.status == "active")
    if department_id:
        emp_query = emp_query.where(Employee.department_id == department_id)
    if enrolled_ids is not None:
        emp_query = emp_query.where(Employee.id.in_(enrolled_ids))

    emp_result = await db.execute(emp_query)
    employees = emp_result.scalars().all()

    if not employees:
        return set()

    employee_ids = [e.id for e in employees]

    # 2. Load all shift assignments for these employees
    assignments_result = await db.execute(
        select(EmployeeShiftAssignment).where(
            EmployeeShiftAssignment.employee_id.in_(employee_ids)
        )
    )
    assignments = {a.employee_id: a for a in assignments_result.scalars().all()}

    # 3. Load all active overrides for this date
    overrides_result = await db.execute(
        select(EmployeeShiftOverride).where(
            and_(
                EmployeeShiftOverride.employee_id.in_(employee_ids),
                EmployeeShiftOverride.start_date <= target_date,
                EmployeeShiftOverride.end_date >= target_date,
            )
        )
    )
    overrides = {o.employee_id: o for o in overrides_result.scalars().all()}

    # 4. Check for employees on leave/vacation today
    from app.models.attendance import AttendanceSession
    leave_result = await db.execute(
        select(AttendanceSession.employee_id).where(
            and_(
                AttendanceSession.employee_id.in_(employee_ids),
                AttendanceSession.date == target_date,
                AttendanceSession.status.in_(["on_leave", "vacation"]),
            )
        )
    )
    on_leave_ids = set(leave_result.scalars().all())

    # Also check roster_entries for LEAVE/OFF assignments
    try:
        from app.models.roster import RosterEntry
        roster_result = await db.execute(
            select(RosterEntry.employee_id).where(
                and_(
                    RosterEntry.employee_id.in_(employee_ids),
                    RosterEntry.entry_date == target_date,
                    RosterEntry.assignment.in_(["LEAVE", "OFF", "HOLIDAY"]),
                )
            )
        )
        off_duty_ids = set(roster_result.scalars().all())
    except Exception:
        off_duty_ids = set()

    excluded_ids = on_leave_ids | off_duty_ids

    # 5. Determine who should work today
    expected_ids = set()
    for emp in employees:
        if emp.id in excluded_ids:
            continue

        # Level 1: Override (highest precedence)
        if emp.id in overrides:
            # Override means they have a different shift template for this date
            # They ARE expected to work (override replaces their normal shift, not removes it)
            expected_ids.add(emp.id)
            continue

        # Level 2: Employee shift assignment
        if emp.id in assignments:
            assignment = assignments[emp.id]
            if assignment.is_working_day(target_date):
                expected_ids.add(emp.id)
            continue

        # Level 3 & 4: No assignment → default to Mon-Fri
        iso_weekday = target_date.isoweekday()
        if iso_weekday <= 5:  # Mon=1 through Fri=5
            expected_ids.add(emp.id)

    return expected_ids


async def count_absent(
    db: AsyncSession,
    target_date: date,
    department_id: Optional[UUID] = None,
    enrolled_ids: Optional[list] = None,
) -> int:
    """
    Count employees who are absent on target_date.
    Absent = expected to work but has no attendance session.

    Returns the count of truly absent employees.
    """
    expected = await get_expected_worker_ids(db, target_date, department_id, enrolled_ids=enrolled_ids)

    if not expected:
        return 0

    # Get employees who actually have sessions today
    from app.models.attendance import AttendanceSession
    session_result = await db.execute(
        select(AttendanceSession.employee_id).where(
            and_(
                AttendanceSession.employee_id.in_(expected),
                AttendanceSession.date == target_date,
            )
        )
    )
    present_ids = set(session_result.scalars().all())

    absent_count = len(expected - present_ids)
    return absent_count


async def count_expected(
    db: AsyncSession,
    target_date: date,
    department_id: Optional[UUID] = None,
    enrolled_ids: Optional[list] = None,
) -> int:
    """Count employees expected to work on target_date."""
    expected = await get_expected_worker_ids(db, target_date, department_id, enrolled_ids=enrolled_ids)
    return len(expected)
