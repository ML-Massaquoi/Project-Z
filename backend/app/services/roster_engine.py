"""
Project Z - Roster Engine
Pure-Python rotation calculator for the FIA 2-On/2-Off Pairing System.

Algorithm
---------
Given a pair with rotation_start_date D and two members [slot0, slot1]:

  cycle_pos = (target_date - D).days % (2 * days_on + 2 * days_off)
              for default 2-on/2-off: cycle length = 8

  Phase mapping for 2-on/2-off (days_on=2, days_off=2):
    pos 0, 1  → ON  first half  (slot0=DAY, slot1=NIGHT)
    pos 2, 3  → OFF
    pos 4, 5  → ON  second half (slot0=NIGHT, slot1=DAY)  ← roles SWAPPED
    pos 6, 7  → OFF

For days_on=3, days_off=3 just scale accordingly.
For admin/fixed staff: always ADMIN on working_days, OFF on others.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional


# ── Data classes ───────────────────────────────────────────────

@dataclass
class PairScheduleEntry:
    employee_id: str
    employee_code: str
    employee_name: str
    entry_date: date
    assignment: str      # DAY | NIGHT | OFF | ADMIN | LEAVE | HOLIDAY
    shift_start: Optional[str]
    shift_end: Optional[str]
    pair_id: Optional[str]
    pair_name: Optional[str]
    slot_index: Optional[int] = None


@dataclass
class PairConfig:
    pair_id: str
    pair_name: str
    rotation_start_date: date
    days_on: int
    days_off: int
    day_shift_start: str    # "08:00"
    day_shift_end: str      # "20:00"
    night_shift_start: str  # "20:00"
    night_shift_end: str    # "08:00"
    members: list[tuple[str, str, str]]  # [(employee_id, employee_code, employee_name), ...]
    # members[0] = slot0 (starts as DAY on first cycle)
    # members[1] = slot1 (starts as NIGHT on first cycle)


@dataclass
class AdminConfig:
    employee_id: str
    employee_code: str
    employee_name: str
    working_days: list[int]  # ISO weekdays [1,2,3,4,5] = Mon-Fri
    shift_start: str          # "08:00"
    shift_end: str            # "17:00"


# ── Core rotation function ─────────────────────────────────────

def get_pair_assignment(
    pair: PairConfig,
    member_slot: int,  # 0 or 1
    target_date: date,
) -> tuple[str, Optional[str], Optional[str]]:
    """
    Returns (assignment_type, shift_start, shift_end) for one member on one date.

    The cycle length is 2*(days_on + days_off).
    First half ON: slot0=DAY, slot1=NIGHT
    Rest OFF
    Second half ON: slot0=NIGHT, slot1=DAY  (roles swap)
    Rest OFF
    """
    cycle_len = 2 * (pair.days_on + pair.days_off)
    delta = (target_date - pair.rotation_start_date).days

    # Handle negative delta (date before rotation_start_date)
    pos = delta % cycle_len

    # Boundaries
    first_on_end   = pair.days_on                           # [0, days_on)
    first_off_end  = pair.days_on + pair.days_off           # [days_on, days_on+days_off)
    second_on_end  = pair.days_on * 2 + pair.days_off       # second ON block
    # second OFF: [second_on_end, cycle_len)

    if pos < first_on_end:
        # First ON block — slot0=DAY, slot1=NIGHT
        if member_slot == 0:
            return ("DAY", pair.day_shift_start, pair.day_shift_end)
        else:
            return ("NIGHT", pair.night_shift_start, pair.night_shift_end)

    elif pos < first_off_end:
        return ("OFF", None, None)

    elif pos < second_on_end:
        # Second ON block — roles SWAPPED: slot0=NIGHT, slot1=DAY
        if member_slot == 0:
            return ("NIGHT", pair.night_shift_start, pair.night_shift_end)
        else:
            return ("DAY", pair.day_shift_start, pair.day_shift_end)

    else:
        return ("OFF", None, None)


def generate_pair_schedule(
    pair: PairConfig,
    start_date: date,
    end_date: date,
) -> list[PairScheduleEntry]:
    """
    Generate all roster entries for a pair over a date range.
    """
    entries: list[PairScheduleEntry] = []
    current = start_date

    while current <= end_date:
        for slot_idx, (emp_id, emp_code, emp_name) in enumerate(pair.members):
            assignment, shift_start, shift_end = get_pair_assignment(pair, slot_idx, current)
            entries.append(PairScheduleEntry(
                employee_id=emp_id,
                employee_code=emp_code,
                employee_name=emp_name,
                entry_date=current,
                assignment=assignment,
                shift_start=shift_start,
                shift_end=shift_end,
                pair_id=pair.pair_id,
                pair_name=pair.pair_name,
                slot_index=slot_idx,
            ))
        current += timedelta(days=1)

    return entries


def generate_admin_schedule(
    admin: AdminConfig,
    start_date: date,
    end_date: date,
) -> list[PairScheduleEntry]:
    """
    Generate admin/fixed schedule entries over a date range.
    Working days → ADMIN, non-working days → OFF.
    """
    entries: list[PairScheduleEntry] = []
    current = start_date

    while current <= end_date:
        iso_wd = current.isoweekday()  # 1=Mon…7=Sun
        if iso_wd in admin.working_days:
            assignment = "ADMIN"
            shift_start = admin.shift_start
            shift_end   = admin.shift_end
        else:
            assignment = "OFF"
            shift_start = None
            shift_end   = None

        entries.append(PairScheduleEntry(
            employee_id=admin.employee_id,
            employee_code=admin.employee_code,
            employee_name=admin.employee_name,
            entry_date=current,
            assignment=assignment,
            shift_start=shift_start,
            shift_end=shift_end,
            pair_id=None,
            pair_name=None,
        ))
        current += timedelta(days=1)

    return entries


def month_date_range(year: int, month: int) -> tuple[date, date]:
    """Returns (first_day, last_day) of the given month."""
    import calendar
    first = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    last = date(year, month, last_day)
    return first, last
