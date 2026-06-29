"""
Project Z - Roster API
Shift pair management + monthly roster generation.

Endpoints:
  POST   /roster/pairs                   Create a shift pair
  GET    /roster/pairs?department_id=    List pairs for a department
  GET    /roster/pairs/{id}              Get pair with members
  PUT    /roster/pairs/{id}              Update pair name/color/dates
  DELETE /roster/pairs/{id}              Delete pair

  POST   /roster/pairs/{id}/members      Add member to pair (slot 0 or 1)
  DELETE /roster/pairs/{id}/members/{emp_id}  Remove member

  POST   /roster/generate                Generate monthly roster
  GET    /roster/snapshots?department_id=&year=&month=  List/get snapshot
  GET    /roster/snapshots/{id}/entries  All entries for a snapshot
  GET    /roster/calendar?dept=&year=&month=  Calendar view (grouped by employee)
  PUT    /roster/entries/{id}            Override a single entry
  GET    /roster/employee/{emp_id}?year=&month=  Employee's monthly schedule
"""

import logging
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_hr_admin
from app.database.session import get_db
from app.models.roster import AssignmentType, RosterEntry, RosterSnapshot
from app.models.shift_pair import ShiftPair, ShiftPairMember
from app.models.employee import Employee
from app.services.roster_service import RosterService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/roster", tags=["Roster"])


# ── Pydantic schemas ───────────────────────────────────────────

class CreatePairRequest(BaseModel):
    department_id: UUID
    protocol_id: UUID
    name: str = Field(..., min_length=1, max_length=50)
    rotation_start_date: date
    color: Optional[str] = "#2563EB"
    notes: Optional[str] = None


class UpdatePairRequest(BaseModel):
    name: Optional[str] = None
    rotation_start_date: Optional[date] = None
    color: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class AddMemberRequest(BaseModel):
    employee_id: UUID
    slot_index: int = Field(..., ge=0, le=1)


class GenerateRosterRequest(BaseModel):
    department_id: UUID
    year: int = Field(..., ge=2020, le=2100)
    month: int = Field(..., ge=1, le=12)


class OverrideEntryRequest(BaseModel):
    assignment: str  # DAY | NIGHT | OFF | LEAVE | ABSENT | HOLIDAY | ADMIN
    reason: Optional[str] = None


# ── Pair endpoints ─────────────────────────────────────────────

@router.post("/pairs", status_code=status.HTTP_201_CREATED)
async def create_pair(
    body: CreatePairRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_hr_admin),
):
    pair = ShiftPair(
        department_id=body.department_id,
        protocol_id=body.protocol_id,
        name=body.name,
        rotation_start_date=body.rotation_start_date,
        color=body.color,
        notes=body.notes,
    )
    db.add(pair)
    await db.flush()
    await db.refresh(pair)
    return _serialize_pair(pair, [])


@router.get("/pairs")
async def list_pairs(
    department_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(ShiftPair)
        .where(ShiftPair.department_id == department_id)
        .order_by(ShiftPair.name)
    )
    pairs = result.scalars().all()

    out = []
    for pair in pairs:
        members = await _load_members(db, pair.id)
        out.append(_serialize_pair(pair, members))
    return {"items": out, "total": len(out)}


@router.get("/pairs/{pair_id}")
async def get_pair(
    pair_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    pair = await _get_pair_or_404(db, pair_id)
    members = await _load_members(db, pair.id)
    return _serialize_pair(pair, members)


@router.put("/pairs/{pair_id}")
async def update_pair(
    pair_id: UUID,
    body: UpdatePairRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_hr_admin),
):
    pair = await _get_pair_or_404(db, pair_id)
    if body.name is not None: pair.name = body.name
    if body.rotation_start_date is not None: pair.rotation_start_date = body.rotation_start_date
    if body.color is not None: pair.color = body.color
    if body.notes is not None: pair.notes = body.notes
    if body.is_active is not None: pair.is_active = body.is_active
    await db.flush()
    members = await _load_members(db, pair.id)
    return _serialize_pair(pair, members)


@router.delete("/pairs/{pair_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pair(
    pair_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_hr_admin),
):
    pair = await _get_pair_or_404(db, pair_id)
    await db.delete(pair)
    await db.flush()


@router.post("/pairs/{pair_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(
    pair_id: UUID,
    body: AddMemberRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_hr_admin),
):
    pair = await _get_pair_or_404(db, pair_id)

    # Check slot not already taken
    existing = await db.execute(
        select(ShiftPairMember).where(
            and_(
                ShiftPairMember.pair_id == pair_id,
                ShiftPairMember.slot_index == body.slot_index,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Slot {body.slot_index} is already occupied. Remove the current member first.",
        )

    # Check employee not already in another pair for same department
    existing_emp = await db.execute(
        select(ShiftPairMember)
        .join(ShiftPair, ShiftPair.id == ShiftPairMember.pair_id)
        .where(
            and_(
                ShiftPairMember.employee_id == body.employee_id,
                ShiftPair.department_id == pair.department_id,
                ShiftPair.is_active == True,
            )
        )
    )
    if existing_emp.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Employee is already a member of another active pair in this department.",
        )

    member = ShiftPairMember(
        pair_id=pair_id,
        employee_id=body.employee_id,
        slot_index=body.slot_index,
    )
    db.add(member)
    await db.flush()
    members = await _load_members(db, pair_id)
    return _serialize_pair(pair, members)


@router.delete("/pairs/{pair_id}/members/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    pair_id: UUID,
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_hr_admin),
):
    result = await db.execute(
        select(ShiftPairMember).where(
            and_(
                ShiftPairMember.pair_id == pair_id,
                ShiftPairMember.employee_id == employee_id,
            )
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this pair")
    await db.delete(member)
    await db.flush()


# ── Roster generation ──────────────────────────────────────────

@router.post("/generate")
async def generate_roster(
    body: GenerateRosterRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_hr_admin),
):
    service = RosterService(db)
    try:
        snapshot = await service.generate_monthly_roster(
            department_id=body.department_id,
            year=body.year,
            month=body.month,
            generated_by=current_user.id,
        )
        await db.commit()
        return {
            "snapshot_id": str(snapshot.id),
            "department_id": str(snapshot.department_id),
            "department_name": snapshot.department_name,
            "year": snapshot.year,
            "month": snapshot.month,
            "generated_at": snapshot.generated_at.isoformat(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/snapshots")
async def list_snapshots(
    department_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(RosterSnapshot)
        .where(RosterSnapshot.department_id == department_id)
        .order_by(RosterSnapshot.year.desc(), RosterSnapshot.month.desc())
    )
    snaps = result.scalars().all()
    return {
        "items": [_serialize_snapshot(s) for s in snaps],
        "total": len(snaps),
    }


@router.get("/snapshots/{snapshot_id}/entries")
async def get_snapshot_entries(
    snapshot_id: UUID,
    employee_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    snap_result = await db.execute(
        select(RosterSnapshot).where(RosterSnapshot.id == snapshot_id)
    )
    snap = snap_result.scalar_one_or_none()
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    query = select(RosterEntry).where(RosterEntry.snapshot_id == snapshot_id)
    if employee_id:
        query = query.where(RosterEntry.employee_id == employee_id)
    query = query.order_by(RosterEntry.entry_date, RosterEntry.employee_name)

    result = await db.execute(query)
    entries = result.scalars().all()

    return {
        "snapshot": _serialize_snapshot(snap),
        "entries": [_serialize_entry(e) for e in entries],
        "total": len(entries),
    }


@router.get("/calendar")
async def get_calendar(
    department_id: UUID = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Returns a calendar-grid structure for the frontend:
    {
      employees: [{ id, code, name, pair_name, schedule: { "2026-07-01": "DAY", ... } }],
      days: ["2026-07-01", "2026-07-02", ...],
      snapshot_id: "..."
    }
    """
    snap_result = await db.execute(
        select(RosterSnapshot).where(
            and_(
                RosterSnapshot.department_id == department_id,
                RosterSnapshot.year == year,
                RosterSnapshot.month == month,
            )
        )
    )
    snap = snap_result.scalar_one_or_none()
    if not snap:
        return {"snapshot_id": None, "employees": [], "days": []}

    entries_result = await db.execute(
        select(RosterEntry)
        .where(RosterEntry.snapshot_id == snap.id)
        .order_by(RosterEntry.entry_date, RosterEntry.employee_name)
    )
    entries = entries_result.scalars().all()

    # Build employee map
    emp_map: dict[str, dict] = {}
    all_days: set[str] = set()

    for e in entries:
        emp_key = str(e.employee_id)
        if emp_key not in emp_map:
            emp_map[emp_key] = {
                "id": emp_key,
                "code": e.employee_code,
                "name": e.employee_name,
                "pair_name": e.pair_name,
                "schedule": {},
            }
        day_str = e.entry_date.isoformat()
        all_days.add(day_str)
        emp_map[emp_key]["schedule"][day_str] = {
            "assignment": e.assignment.value,
            "shift_start": e.shift_start,
            "shift_end": e.shift_end,
            "is_overridden": e.is_overridden,
            "entry_id": str(e.id),
        }

    sorted_days = sorted(all_days)
    return {
        "snapshot_id": str(snap.id),
        "department_name": snap.department_name,
        "year": year,
        "month": month,
        "days": sorted_days,
        "employees": sorted(emp_map.values(), key=lambda x: (x["pair_name"] or "ZZZ", x["name"])),
    }


@router.put("/entries/{entry_id}")
async def override_entry(
    entry_id: UUID,
    body: OverrideEntryRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_hr_admin),
):
    # Validate assignment type
    valid = {a.value for a in AssignmentType}
    if body.assignment not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid assignment. Must be one of: {sorted(valid)}")

    service = RosterService(db)
    entry = await service.override_entry(entry_id, body.assignment, body.reason)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.commit()
    return _serialize_entry(entry)


@router.get("/employee/{employee_id}")
async def get_employee_schedule(
    employee_id: UUID,
    year: int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get a single employee's monthly schedule."""
    result = await db.execute(
        select(RosterEntry)
        .join(RosterSnapshot, RosterSnapshot.id == RosterEntry.snapshot_id)
        .where(
            and_(
                RosterEntry.employee_id == employee_id,
                RosterSnapshot.year == year,
                RosterSnapshot.month == month,
            )
        )
        .order_by(RosterEntry.entry_date)
    )
    entries = result.scalars().all()
    return {
        "employee_id": str(employee_id),
        "year": year,
        "month": month,
        "entries": [_serialize_entry(e) for e in entries],
        "total": len(entries),
    }


# ── Serializers ────────────────────────────────────────────────

def _serialize_pair(pair: ShiftPair, members: list) -> dict:
    return {
        "id": str(pair.id),
        "department_id": str(pair.department_id),
        "protocol_id": str(pair.protocol_id),
        "name": pair.name,
        "rotation_start_date": pair.rotation_start_date.isoformat(),
        "color": pair.color,
        "notes": pair.notes,
        "is_active": pair.is_active,
        "members": members,
        "created_at": pair.created_at.isoformat(),
    }


def _serialize_snapshot(snap: RosterSnapshot) -> dict:
    return {
        "id": str(snap.id),
        "department_id": str(snap.department_id),
        "department_name": snap.department_name,
        "year": snap.year,
        "month": snap.month,
        "generated_at": snap.generated_at.isoformat(),
        "created_at": snap.created_at.isoformat(),
    }


def _serialize_entry(e: RosterEntry) -> dict:
    return {
        "id": str(e.id),
        "snapshot_id": str(e.snapshot_id),
        "employee_id": str(e.employee_id),
        "employee_code": e.employee_code,
        "employee_name": e.employee_name,
        "entry_date": e.entry_date.isoformat(),
        "assignment": e.assignment.value,
        "pair_name": e.pair_name,
        "shift_start": e.shift_start,
        "shift_end": e.shift_end,
        "is_overridden": e.is_overridden,
        "override_reason": e.override_reason,
    }


# ── Helpers ────────────────────────────────────────────────────

async def _get_pair_or_404(db: AsyncSession, pair_id: UUID) -> ShiftPair:
    result = await db.execute(select(ShiftPair).where(ShiftPair.id == pair_id))
    pair = result.scalar_one_or_none()
    if not pair:
        raise HTTPException(status_code=404, detail="Shift pair not found")
    return pair


async def _load_members(db: AsyncSession, pair_id: UUID) -> list[dict]:
    result = await db.execute(
        select(ShiftPairMember, Employee)
        .join(Employee, Employee.id == ShiftPairMember.employee_id)
        .where(ShiftPairMember.pair_id == pair_id)
        .order_by(ShiftPairMember.slot_index)
    )
    rows = result.all()
    return [
        {
            "slot_index": member.slot_index,
            "employee_id": str(emp.id),
            "employee_code": emp.employee_code,
            "employee_name": emp.full_name,
            "position": emp.position,
        }
        for member, emp in rows
    ]
