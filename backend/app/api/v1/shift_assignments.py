"""
Project Z - Employee Shift Assignments & Overrides API
CRUD for EmployeeShiftAssignment and EmployeeShiftOverride.
"""
from datetime import date
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.shift_assignment import EmployeeShiftAssignment
from app.models.shift_override import EmployeeShiftOverride

router = APIRouter(tags=["Shift Assignments"])


# ── Employee Shift Assignments ────────────────────────────────

class AssignmentCreate(BaseModel):
    employee_id: UUID
    shift_protocol_id: Optional[UUID] = None
    shift_template_id: Optional[UUID] = None
    rotation_templates: List[UUID] = []
    rotation_start_date: Optional[date] = None
    working_days: Optional[List[int]] = None  # [1,2,3,4,5] = Mon-Fri, None = every day
    grace_period_override: Optional[int] = None
    notes: Optional[str] = None


class AssignmentUpdate(BaseModel):
    shift_protocol_id: Optional[UUID] = None
    shift_template_id: Optional[UUID] = None
    rotation_templates: Optional[List[UUID]] = None
    rotation_start_date: Optional[date] = None
    working_days: Optional[List[int]] = None
    grace_period_override: Optional[int] = None
    notes: Optional[str] = None


def _serialize_assignment(a: EmployeeShiftAssignment, employee_name: str = None, template_name: str = None) -> dict:
    return {
        "id": str(a.id),
        "employee_id": str(a.employee_id),
        "employee_name": employee_name,
        "shift_protocol_id": str(a.shift_protocol_id) if a.shift_protocol_id else None,
        "shift_template_id": str(a.shift_template_id) if a.shift_template_id else None,
        "shift_template_name": template_name,
        "rotation_templates": [str(t) for t in (a.rotation_templates or [])],
        "rotation_start_date": str(a.rotation_start_date) if a.rotation_start_date else None,
        "working_days": a.working_days,
        "grace_period_override": a.grace_period_override,
        "notes": a.notes,
        "is_rotating": a.is_rotating,
        "created_at": a.created_at.isoformat(),
        "updated_at": a.updated_at.isoformat(),
    }


@router.get("/employee-shift-assignments", tags=["Shift Assignments"], dependencies=[Depends(PermissionChecker("shift:view"))])
async def list_assignments(
    employee_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from app.models.employee import Employee
    from app.models.shift_template import ShiftTemplate

    query = select(EmployeeShiftAssignment).order_by(EmployeeShiftAssignment.created_at.desc())
    if employee_id:
        query = query.where(EmployeeShiftAssignment.employee_id == employee_id)
    result = await db.execute(query)
    assignments = result.scalars().all()

    # Batch load names
    employee_ids = list(set(a.employee_id for a in assignments))
    template_ids = list(set(a.shift_template_id for a in assignments if a.shift_template_id))

    employee_names = {}
    if employee_ids:
        emp_result = await db.execute(
            select(Employee.id, Employee.full_name).where(Employee.id.in_(employee_ids))
        )
        employee_names = {row[0]: row[1] for row in emp_result}

    template_names = {}
    if template_ids:
        tpl_result = await db.execute(
            select(ShiftTemplate.id, ShiftTemplate.name).where(ShiftTemplate.id.in_(template_ids))
        )
        template_names = {row[0]: row[1] for row in tpl_result}

    return [
        _serialize_assignment(
            a,
            employee_name=employee_names.get(a.employee_id),
            template_name=template_names.get(a.shift_template_id),
        )
        for a in assignments
    ]


@router.post("/employee-shift-assignments", status_code=201, tags=["Shift Assignments"], dependencies=[Depends(PermissionChecker("shift:assign"))])
async def create_assignment(
    data: AssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    a = EmployeeShiftAssignment(
        employee_id=data.employee_id,
        shift_protocol_id=data.shift_protocol_id,
        shift_template_id=data.shift_template_id,
        rotation_templates=data.rotation_templates or [],
        rotation_start_date=data.rotation_start_date,
        working_days=data.working_days,
        grace_period_override=data.grace_period_override,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(a)
    await db.flush()
    await db.refresh(a)
    return _serialize_assignment(a)


@router.get("/employee-shift-assignments/{assignment_id}", tags=["Shift Assignments"], dependencies=[Depends(PermissionChecker("shift:view"))])
async def get_assignment(
    assignment_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(EmployeeShiftAssignment).where(EmployeeShiftAssignment.id == assignment_id)
    )
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Assignment not found")
    return _serialize_assignment(a)


@router.put("/employee-shift-assignments/{assignment_id}", tags=["Shift Assignments"], dependencies=[Depends(PermissionChecker("shift:update"))])
async def update_assignment(
    assignment_id: UUID,
    data: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(EmployeeShiftAssignment).where(EmployeeShiftAssignment.id == assignment_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Assignment not found")
    updates = data.model_dump(exclude_unset=True)
    if updates:
        await db.execute(
            update(EmployeeShiftAssignment)
            .where(EmployeeShiftAssignment.id == assignment_id)
            .values(**updates)
        )
        await db.flush()
    result = await db.execute(
        select(EmployeeShiftAssignment).where(EmployeeShiftAssignment.id == assignment_id)
    )
    return _serialize_assignment(result.scalar_one())


@router.delete("/employee-shift-assignments/{assignment_id}", tags=["Shift Assignments"], dependencies=[Depends(PermissionChecker("shift:delete"))])
async def delete_assignment(
    assignment_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(EmployeeShiftAssignment).where(EmployeeShiftAssignment.id == assignment_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Assignment not found")
    await db.execute(
        delete(EmployeeShiftAssignment).where(EmployeeShiftAssignment.id == assignment_id)
    )
    return {"message": "Assignment deleted"}


# ── Employee Shift Overrides ──────────────────────────────────

class OverrideCreate(BaseModel):
    employee_id: UUID
    shift_template_id: UUID
    start_date: date
    end_date: date
    reason: Optional[str] = None
    notes: Optional[str] = None


class OverrideUpdate(BaseModel):
    shift_template_id: Optional[UUID] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    reason: Optional[str] = None
    notes: Optional[str] = None


def _serialize_override(o: EmployeeShiftOverride) -> dict:
    return {
        "id": str(o.id),
        "employee_id": str(o.employee_id),
        "shift_template_id": str(o.shift_template_id),
        "start_date": str(o.start_date),
        "end_date": str(o.end_date),
        "reason": o.reason,
        "notes": o.notes,
        "created_at": o.created_at.isoformat(),
        "updated_at": o.updated_at.isoformat(),
    }


@router.get("/employee-shift-overrides", tags=["Shift Assignments"], dependencies=[Depends(PermissionChecker("shift:view"))])
async def list_overrides(
    employee_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    query = select(EmployeeShiftOverride).order_by(EmployeeShiftOverride.start_date.desc())
    if employee_id:
        query = query.where(EmployeeShiftOverride.employee_id == employee_id)
    result = await db.execute(query)
    return [_serialize_override(o) for o in result.scalars().all()]


@router.post("/employee-shift-overrides", status_code=201, tags=["Shift Assignments"], dependencies=[Depends(PermissionChecker("shift:assign"))])
async def create_override(
    data: OverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if data.end_date < data.start_date:
        raise HTTPException(422, "end_date must be >= start_date")
    o = EmployeeShiftOverride(
        employee_id=data.employee_id,
        shift_template_id=data.shift_template_id,
        start_date=data.start_date,
        end_date=data.end_date,
        reason=data.reason,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(o)
    await db.flush()
    await db.refresh(o)
    return _serialize_override(o)


@router.get("/employee-shift-overrides/{override_id}", tags=["Shift Assignments"], dependencies=[Depends(PermissionChecker("shift:view"))])
async def get_override(
    override_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(EmployeeShiftOverride).where(EmployeeShiftOverride.id == override_id)
    )
    o = result.scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Override not found")
    return _serialize_override(o)


@router.put("/employee-shift-overrides/{override_id}", tags=["Shift Assignments"], dependencies=[Depends(PermissionChecker("shift:update"))])
async def update_override(
    override_id: UUID,
    data: OverrideUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(EmployeeShiftOverride).where(EmployeeShiftOverride.id == override_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Override not found")
    updates = data.model_dump(exclude_unset=True)
    if updates:
        await db.execute(
            update(EmployeeShiftOverride)
            .where(EmployeeShiftOverride.id == override_id)
            .values(**updates)
        )
        await db.flush()
    result = await db.execute(
        select(EmployeeShiftOverride).where(EmployeeShiftOverride.id == override_id)
    )
    return _serialize_override(result.scalar_one())


@router.delete("/employee-shift-overrides/{override_id}", tags=["Shift Assignments"], dependencies=[Depends(PermissionChecker("shift:delete"))])
async def delete_override(
    override_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(EmployeeShiftOverride).where(EmployeeShiftOverride.id == override_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Override not found")
    await db.execute(
        delete(EmployeeShiftOverride).where(EmployeeShiftOverride.id == override_id)
    )
    return {"message": "Override deleted"}
