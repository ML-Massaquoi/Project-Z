"""
Project Z - Department Shift Rules API
Full CRUD for DepartmentShiftRule.
Returns HTTP 409 when date ranges overlap for the same department.
"""
from datetime import date
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.dept_shift_rule import DepartmentShiftRule

router = APIRouter(prefix="/department-shift-rules", tags=["Department Shift Rules"])


class DeptShiftRuleCreate(BaseModel):
    department_id: UUID
    shift_template_id: UUID
    effective_from: date
    effective_to: Optional[date] = None
    weekend_days: List[int] = []
    grace_period_override: Optional[int] = None
    notes: Optional[str] = None


class DeptShiftRuleUpdate(BaseModel):
    shift_template_id: Optional[UUID] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    weekend_days: Optional[List[int]] = None
    grace_period_override: Optional[int] = None
    notes: Optional[str] = None


def _serialize(r: DepartmentShiftRule, department_name: str = None, template_name: str = None) -> dict:
    return {
        "id": str(r.id),
        "department_id": str(r.department_id),
        "department_name": department_name,
        "shift_template_id": str(r.shift_template_id),
        "shift_template_name": template_name,
        "effective_from": str(r.effective_from),
        "effective_to": str(r.effective_to) if r.effective_to else None,
        "weekend_days": r.weekend_days or [],
        "grace_period_override": r.grace_period_override,
        "notes": r.notes,
        "created_at": r.created_at.isoformat(),
        "updated_at": r.updated_at.isoformat(),
    }


@router.get("", dependencies=[Depends(PermissionChecker("shift:view"))])
async def list_dept_shift_rules(
    department_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from app.models.department import Department
    from app.models.shift_template import ShiftTemplate

    query = select(DepartmentShiftRule).order_by(DepartmentShiftRule.effective_from.desc())
    if department_id:
        query = query.where(DepartmentShiftRule.department_id == department_id)
    result = await db.execute(query)
    rules = result.scalars().all()

    # Batch load names
    dept_ids = list(set(r.department_id for r in rules))
    template_ids = list(set(r.shift_template_id for r in rules))

    dept_names = {}
    if dept_ids:
        dept_result = await db.execute(
            select(Department.id, Department.name).where(Department.id.in_(dept_ids))
        )
        dept_names = {row[0]: row[1] for row in dept_result}

    template_names = {}
    if template_ids:
        tpl_result = await db.execute(
            select(ShiftTemplate.id, ShiftTemplate.name).where(ShiftTemplate.id.in_(template_ids))
        )
        template_names = {row[0]: row[1] for row in tpl_result}

    return [
        _serialize(
            r,
            department_name=dept_names.get(r.department_id),
            template_name=template_names.get(r.shift_template_id),
        )
        for r in rules
    ]


@router.post("", status_code=201, dependencies=[Depends(PermissionChecker("shift:update"))])
async def create_dept_shift_rule(
    data: DeptShiftRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Create a department shift rule.
    Returns HTTP 409 if the date range overlaps an existing rule for the same department.
    """
    try:
        rule = DepartmentShiftRule(
            department_id=data.department_id,
            shift_template_id=data.shift_template_id,
            effective_from=data.effective_from,
            effective_to=data.effective_to,
            weekend_days=data.weekend_days,
            grace_period_override=data.grace_period_override,
            notes=data.notes,
            created_by=current_user.id,
        )
        db.add(rule)
        await db.flush()
        await db.refresh(rule)
        return _serialize(rule)
    except Exception as e:
        err_str = str(e).lower()
        if "excl_dept_shift_rules_no_overlap" in err_str or "exclusion" in err_str or "overlap" in err_str:
            raise HTTPException(
                409,
                "A shift rule for this department already covers part of the specified date range."
            )
        raise


@router.get("/{rule_id}", dependencies=[Depends(PermissionChecker("shift:view"))])
async def get_dept_shift_rule(
    rule_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(DepartmentShiftRule).where(DepartmentShiftRule.id == rule_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Department shift rule not found")
    return _serialize(r)


@router.put("/{rule_id}", dependencies=[Depends(PermissionChecker("shift:update"))])
async def update_dept_shift_rule(
    rule_id: UUID,
    data: DeptShiftRuleUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(DepartmentShiftRule).where(DepartmentShiftRule.id == rule_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Department shift rule not found")

    updates = data.model_dump(exclude_unset=True)
    if updates:
        try:
            await db.execute(
                update(DepartmentShiftRule)
                .where(DepartmentShiftRule.id == rule_id)
                .values(**updates)
            )
            await db.flush()
        except Exception as e:
            err_str = str(e).lower()
            if "excl_dept_shift_rules_no_overlap" in err_str or "exclusion" in err_str:
                raise HTTPException(409, "Date range overlaps an existing rule for this department.")
            raise

    result = await db.execute(select(DepartmentShiftRule).where(DepartmentShiftRule.id == rule_id))
    return _serialize(result.scalar_one())


@router.delete("/{rule_id}", dependencies=[Depends(PermissionChecker("shift:delete"))])
async def delete_dept_shift_rule(
    rule_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from sqlalchemy import delete
    result = await db.execute(select(DepartmentShiftRule).where(DepartmentShiftRule.id == rule_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Department shift rule not found")
    await db.execute(delete(DepartmentShiftRule).where(DepartmentShiftRule.id == rule_id))
    return {"message": "Department shift rule deleted"}
