"""
Project Z - Scheduling API
Shift protocol steps, department-protocol assignments, employee rotation offsets,
roster generation & publication, shift swaps, calendar views, and analytics.
"""

import calendar
import logging
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, select, update
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker, require_hr_admin
from app.database.session import get_db
from app.models.shift_protocol_step import ShiftProtocolStep
from app.models.department import Department
from app.models.department_protocol import DepartmentProtocol
from app.models.employee import Employee
from app.models.roster_publication import RosterPublication
from app.models.shift_swap_request import ShiftSwapRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scheduling", tags=["Scheduling"])


# ---------------------------------------------------------------------------
#  Schemas
# ---------------------------------------------------------------------------

class StepCreate(BaseModel):
    shift_template_id: Optional[UUID] = None
    step_order: int
    step_type: str = "work"
    label: Optional[str] = None
    duration_days: int = 1


class StepUpdate(BaseModel):
    shift_template_id: Optional[UUID] = None
    step_order: Optional[int] = None
    step_type: Optional[str] = None
    label: Optional[str] = None
    duration_days: Optional[int] = None


class StepReorderItem(BaseModel):
    id: UUID
    step_order: int


class DeptProtocolAssign(BaseModel):
    protocol_id: UUID
    effective_date: date
    default_supervisor: Optional[str] = None
    notes: Optional[str] = None


class DeptProtocolUpdate(BaseModel):
    end_date: Optional[date] = None
    default_supervisor: Optional[str] = None
    notes: Optional[str] = None


class RotationOffsetUpdate(BaseModel):
    rotation_offset: int = Field(..., ge=0)


class BatchOffsetItem(BaseModel):
    employee_id: UUID
    rotation_offset: int = Field(..., ge=0)


class BatchOffsetRequest(BaseModel):
    items: list[BatchOffsetItem]


class RosterGenerateRequest(BaseModel):
    year: int = Field(..., ge=2020, le=2100)
    month: int = Field(..., ge=1, le=12)


class MultipleDeptGenerateRequest(BaseModel):
    department_ids: list[UUID]
    year: int = Field(..., ge=2020, le=2100)
    month: int = Field(..., ge=1, le=12)


class PublishRequest(BaseModel):
    year: int = Field(..., ge=2020, le=2100)
    month: int = Field(..., ge=1, le=12)


class SwapRequestCreate(BaseModel):
    target_id: UUID
    swap_date: date
    requester_shift_id: Optional[UUID] = None
    target_shift_id: Optional[UUID] = None
    reason: Optional[str] = None


class SwapRequestUpdate(BaseModel):
    status: str = Field(..., pattern="^(approved|rejected)$")
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
#  Serializers
# ---------------------------------------------------------------------------

def _serialize_step(s: ShiftProtocolStep) -> dict:
    return {
        "id": str(s.id),
        "protocol_id": str(s.protocol_id),
        "shift_template_id": str(s.shift_template_id) if s.shift_template_id else None,
        "step_order": s.step_order,
        "step_type": s.step_type,
        "label": s.label,
        "duration_days": s.duration_days,
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
    }


def _serialize_dept_protocol(dp: DepartmentProtocol) -> dict:
    return {
        "id": str(dp.id),
        "department_id": str(dp.department_id),
        "protocol_id": str(dp.protocol_id),
        "effective_date": dp.effective_date.isoformat(),
        "end_date": dp.end_date.isoformat() if dp.end_date else None,
        "default_supervisor": dp.default_supervisor,
        "notes": dp.notes,
        "created_by": str(dp.created_by) if dp.created_by else None,
        "created_at": dp.created_at.isoformat(),
        "updated_at": dp.updated_at.isoformat(),
    }


def _serialize_publication(p: RosterPublication) -> dict:
    return {
        "id": str(p.id),
        "department_id": str(p.department_id),
        "year": p.year,
        "month": p.month,
        "version": p.version,
        "status": p.status,
        "published_at": p.published_at.isoformat() if p.published_at else None,
        "published_by": str(p.published_by) if p.published_by else None,
        "locked_at": p.locked_at.isoformat() if p.locked_at else None,
        "locked_by": str(p.locked_by) if p.locked_by else None,
        "notes": p.notes,
        "created_at": p.created_at.isoformat(),
    }


def _serialize_swap(sr: ShiftSwapRequest) -> dict:
    return {
        "id": str(sr.id),
        "requester_id": str(sr.requester_id),
        "target_id": str(sr.target_id),
        "swap_date": sr.swap_date.isoformat(),
        "requester_shift_id": str(sr.requester_shift_id) if sr.requester_shift_id else None,
        "target_shift_id": str(sr.target_shift_id) if sr.target_shift_id else None,
        "reason": sr.reason,
        "status": sr.status,
        "reviewed_by": str(sr.reviewed_by) if sr.reviewed_by else None,
        "reviewed_at": sr.reviewed_at.isoformat() if sr.reviewed_at else None,
        "notes": sr.notes,
        "created_at": sr.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

async def _get_protocol_or_404(db: AsyncSession, protocol_id: UUID) -> None:
    from app.models.shift_protocol import ShiftProtocol
    result = await db.execute(select(ShiftProtocol).where(ShiftProtocol.id == protocol_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Shift protocol not found")


async def _get_dept_protocol_or_404(db: AsyncSession, assignment_id: UUID) -> DepartmentProtocol:
    result = await db.execute(
        select(DepartmentProtocol).where(DepartmentProtocol.id == assignment_id)
    )
    dp = result.scalar_one_or_none()
    if not dp:
        raise HTTPException(404, "Department protocol assignment not found")
    return dp


# ---------------------------------------------------------------------------
#  Shift Protocol Steps
# ---------------------------------------------------------------------------

@router.get(
    "/protocols/{protocol_id}/steps",
    dependencies=[Depends(PermissionChecker("shift:view"))],
)
async def list_steps(
    protocol_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    await _get_protocol_or_404(db, protocol_id)
    result = await db.execute(
        select(ShiftProtocolStep)
        .where(ShiftProtocolStep.protocol_id == protocol_id)
        .order_by(ShiftProtocolStep.step_order)
    )
    return [_serialize_step(s) for s in result.scalars().all()]


@router.post(
    "/protocols/{protocol_id}/steps",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("shift:create"))],
)
async def create_step(
    protocol_id: UUID,
    data: StepCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    await _get_protocol_or_404(db, protocol_id)
    step = ShiftProtocolStep(
        protocol_id=protocol_id,
        shift_template_id=data.shift_template_id,
        step_order=data.step_order,
        step_type=data.step_type,
        label=data.label,
        duration_days=data.duration_days,
    )
    db.add(step)
    await db.flush()
    await db.refresh(step)
    return _serialize_step(step)


@router.put(
    "/protocols/{protocol_id}/steps/{step_id}",
    dependencies=[Depends(PermissionChecker("shift:update"))],
)
async def update_step(
    protocol_id: UUID,
    step_id: UUID,
    data: StepUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    await _get_protocol_or_404(db, protocol_id)
    result = await db.execute(
        select(ShiftProtocolStep).where(
            and_(
                ShiftProtocolStep.id == step_id,
                ShiftProtocolStep.protocol_id == protocol_id,
            )
        )
    )
    step = result.scalar_one_or_none()
    if not step:
        raise HTTPException(404, "Step not found")
    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(step, key, value)
    await db.flush()
    await db.refresh(step)
    return _serialize_step(step)


@router.delete(
    "/protocols/{protocol_id}/steps/{step_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker("shift:delete"))],
)
async def delete_step(
    protocol_id: UUID,
    step_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    await _get_protocol_or_404(db, protocol_id)
    result = await db.execute(
        select(ShiftProtocolStep).where(
            and_(
                ShiftProtocolStep.id == step_id,
                ShiftProtocolStep.protocol_id == protocol_id,
            )
        )
    )
    step = result.scalar_one_or_none()
    if not step:
        raise HTTPException(404, "Step not found")
    await db.delete(step)
    await db.flush()


@router.post(
    "/protocols/{protocol_id}/steps/reorder",
    dependencies=[Depends(PermissionChecker("shift:update"))],
)
async def reorder_steps(
    protocol_id: UUID,
    data: list[StepReorderItem],
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    await _get_protocol_or_404(db, protocol_id)
    for item in data:
        await db.execute(
            update(ShiftProtocolStep)
            .where(
                and_(
                    ShiftProtocolStep.id == item.id,
                    ShiftProtocolStep.protocol_id == protocol_id,
                )
            )
            .values(step_order=item.step_order)
        )
    await db.flush()
    result = await db.execute(
        select(ShiftProtocolStep)
        .where(ShiftProtocolStep.protocol_id == protocol_id)
        .order_by(ShiftProtocolStep.step_order)
    )
    return [_serialize_step(s) for s in result.scalars().all()]


# ---------------------------------------------------------------------------
#  Department-Protocol Assignments
# ---------------------------------------------------------------------------

@router.get(
    "/departments/{dept_id}/protocols",
    dependencies=[Depends(PermissionChecker("shift:view"))],
)
async def list_dept_protocols(
    dept_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(DepartmentProtocol)
        .where(DepartmentProtocol.department_id == dept_id)
        .order_by(DepartmentProtocol.effective_date.desc())
    )
    return [_serialize_dept_protocol(dp) for dp in result.scalars().all()]


@router.post(
    "/departments/{dept_id}/protocols",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("shift:create"))],
)
async def assign_dept_protocol(
    dept_id: UUID,
    data: DeptProtocolAssign,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from app.models.shift_protocol import ShiftProtocol
    proto_result = await db.execute(
        select(ShiftProtocol).where(ShiftProtocol.id == data.protocol_id)
    )
    if not proto_result.scalar_one_or_none():
        raise HTTPException(404, "Shift protocol not found")

    await db.execute(
        update(DepartmentProtocol)
        .where(
            and_(
                DepartmentProtocol.department_id == dept_id,
                DepartmentProtocol.end_date.is_(None),
            )
        )
        .values(end_date=data.effective_date)
    )

    dp = DepartmentProtocol(
        department_id=dept_id,
        protocol_id=data.protocol_id,
        effective_date=data.effective_date,
        default_supervisor=data.default_supervisor,
        notes=data.notes,
        created_by=_user.id,
    )
    db.add(dp)

    # Also update Department.shift_protocol_id so RosterService picks it up
    await db.execute(
        update(Department)
        .where(Department.id == dept_id)
        .values(shift_protocol_id=data.protocol_id)
    )

    await db.flush()
    await db.refresh(dp)
    
    # Auto-regenerate roster for current month if one exists
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    from app.services.scheduling_engine import SchedulingEngine
    try:
        engine = SchedulingEngine(db)
        await engine.generate_department_roster(
            db=db,
            department_id=dept_id,
            year=now.year,
            month=now.month,
            generated_by=_user.id,
        )
        logger.info(f"[Scheduling] Auto-regenerated roster for dept={dept_id} after protocol change")
    except Exception as e:
        logger.warning(f"[Scheduling] Auto-regeneration failed for dept={dept_id}: {e}")
    
    return _serialize_dept_protocol(dp)


@router.put(
    "/departments/{dept_id}/protocols/{assignment_id}",
    dependencies=[Depends(PermissionChecker("shift:update"))],
)
async def update_dept_protocol(
    dept_id: UUID,
    assignment_id: UUID,
    data: DeptProtocolUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    dp = await _get_dept_protocol_or_404(db, assignment_id)
    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(dp, key, value)
    await db.flush()
    await db.refresh(dp)
    return _serialize_dept_protocol(dp)


@router.delete(
    "/departments/{dept_id}/protocols/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker("shift:delete"))],
)
async def remove_dept_protocol(
    dept_id: UUID,
    assignment_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    dp = await _get_dept_protocol_or_404(db, assignment_id)
    dp.end_date = date.today()
    await db.flush()


@router.get(
    "/departments/{dept_id}/active-protocol",
    dependencies=[Depends(PermissionChecker("shift:view"))],
)
async def get_active_dept_protocol(
    dept_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(DepartmentProtocol)
        .where(
            and_(
                DepartmentProtocol.department_id == dept_id,
                DepartmentProtocol.end_date.is_(None),
            )
        )
        .order_by(DepartmentProtocol.effective_date.desc())
        .limit(1)
    )
    dp = result.scalar_one_or_none()
    if not dp:
        raise HTTPException(404, "No active protocol assigned to this department")
    return _serialize_dept_protocol(dp)


# ---------------------------------------------------------------------------
#  Employee Rotation Offsets
# ---------------------------------------------------------------------------

@router.get(
    "/employees/{emp_id}/offset",
    dependencies=[Depends(PermissionChecker("employee:view"))],
)
async def get_rotation_offset(
    emp_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(404, "Employee not found")
    return {
        "employee_id": str(emp.id),
        "employee_code": emp.employee_code,
        "employee_name": emp.full_name,
        "rotation_offset": emp.rotation_offset if emp.rotation_offset is not None else 0,
    }


@router.put(
    "/employees/{emp_id}/offset",
    dependencies=[Depends(PermissionChecker("employee:update"))],
)
async def update_rotation_offset(
    emp_id: UUID,
    data: RotationOffsetUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(404, "Employee not found")
    emp.rotation_offset = data.rotation_offset
    await db.flush()
    return {
        "employee_id": str(emp.id),
        "employee_code": emp.employee_code,
        "employee_name": emp.full_name,
        "rotation_offset": emp.rotation_offset,
    }


@router.post(
    "/employees/batch-offset",
    dependencies=[Depends(PermissionChecker("employee:update"))],
)
async def batch_update_offsets(
    data: BatchOffsetRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    updated = []
    errors = []
    for item in data.items:
        result = await db.execute(select(Employee).where(Employee.id == item.employee_id))
        emp = result.scalar_one_or_none()
        if not emp:
            errors.append({"employee_id": str(item.employee_id), "error": "Not found"})
            continue
        emp.rotation_offset = item.rotation_offset
        updated.append({
            "employee_id": str(emp.id),
            "employee_code": emp.employee_code,
            "rotation_offset": emp.rotation_offset,
        })
    await db.flush()
    return {"updated": updated, "errors": errors, "total_updated": len(updated)}


@router.get(
    "/employees/by-department/{dept_id}/offsets",
    dependencies=[Depends(PermissionChecker("employee:view"))],
)
async def list_dept_employee_offsets(
    dept_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Employee)
        .where(Employee.department_id == dept_id)
        .order_by(Employee.full_name)
    )
    employees = result.scalars().all()
    return [
        {
            "employee_id": str(emp.id),
            "employee_code": emp.employee_code,
            "employee_name": emp.full_name,
            "department_id": str(emp.department_id) if emp.department_id else None,
            "rotation_offset": emp.rotation_offset if emp.rotation_offset is not None else 0,
        }
        for emp in employees
    ]


# ---------------------------------------------------------------------------
#  Roster Generation
# ---------------------------------------------------------------------------

@router.post(
    "/generate/department/{dept_id}",
    status_code=status.HTTP_201_CREATED,
)
async def generate_department_roster(
    dept_id: UUID,
    data: RosterGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_hr_admin),
):
    from app.services.scheduling_engine import SchedulingEngine
    engine = SchedulingEngine(db)
    try:
        snapshot = await engine.generate_department_roster(
            db=db,
            department_id=dept_id,
            year=data.year,
            month=data.month,
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


@router.post(
    "/generate/departments",
    status_code=status.HTTP_201_CREATED,
)
async def generate_multiple_department_rosters(
    data: MultipleDeptGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_hr_admin),
):
    from app.services.roster_service import RosterService
    results = []
    errors = []
    service = RosterService(db)
    for dept_id in data.department_ids:
        try:
            snapshot = await service.generate_monthly_roster(
                department_id=dept_id,
                year=data.year,
                month=data.month,
                generated_by=current_user.id,
            )
            results.append({
                "snapshot_id": str(snapshot.id),
                "department_id": str(snapshot.department_id),
                "department_name": snapshot.department_name,
                "year": snapshot.year,
                "month": snapshot.month,
                "generated_at": snapshot.generated_at.isoformat(),
            })
        except ValueError as e:
            errors.append({"department_id": str(dept_id), "error": str(e)})
    await db.commit()
    return {"results": results, "errors": errors, "total_generated": len(results)}


@router.post(
    "/generate/organization",
    status_code=status.HTTP_201_CREATED,
)
async def generate_organization_roster(
    data: RosterGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_hr_admin),
):
    from app.models.department import Department
    dept_result = await db.execute(select(Department).where(Department.is_active == True))
    departments = dept_result.scalars().all()

    from app.services.roster_service import RosterService
    results = []
    errors = []
    service = RosterService(db)
    for dept in departments:
        try:
            snapshot = await service.generate_monthly_roster(
                department_id=dept.id,
                year=data.year,
                month=data.month,
                generated_by=current_user.id,
            )
            results.append({
                "snapshot_id": str(snapshot.id),
                "department_id": str(snapshot.department_id),
                "department_name": snapshot.department_name,
                "year": snapshot.year,
                "month": snapshot.month,
                "generated_at": snapshot.generated_at.isoformat(),
            })
        except ValueError as e:
            errors.append({"department_id": str(dept.id), "error": str(e)})
    await db.commit()
    return {"results": results, "errors": errors, "total_generated": len(results)}


class MultiMonthGenerateRequest(BaseModel):
    year: int = Field(..., ge=2020, le=2100)
    start_month: int = Field(..., ge=1, le=12)
    num_months: int = Field(..., ge=1, le=12)


@router.post(
    "/generate/department/{dept_id}/multi-month",
    status_code=status.HTTP_201_CREATED,
)
async def generate_department_multi_month(
    dept_id: UUID,
    data: MultiMonthGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_hr_admin),
):
    from app.services.scheduling_engine import SchedulingEngine
    engine = SchedulingEngine(db)
    try:
        snapshots = await engine.generate_multi_month_roster(
            db=db,
            department_id=dept_id,
            year=data.year,
            start_month=data.start_month,
            num_months=data.num_months,
            generated_by=current_user.id,
        )
        await db.commit()
        return {
            "snapshots": [
                {
                    "snapshot_id": str(s.id),
                    "department_id": str(s.department_id),
                    "department_name": s.department_name,
                    "year": s.year,
                    "month": s.month,
                    "generated_at": s.generated_at.isoformat(),
                }
                for s in snapshots
            ],
            "total_generated": len(snapshots),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/generate/organization/multi-month",
    status_code=status.HTTP_201_CREATED,
)
async def generate_organization_multi_month(
    data: MultiMonthGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_hr_admin),
):
    from app.services.scheduling_engine import SchedulingEngine
    engine = SchedulingEngine(db)
    try:
        snapshots = await engine.generate_organization_multi_month(
            db=db,
            year=data.year,
            start_month=data.start_month,
            num_months=data.num_months,
            generated_by=current_user.id,
        )
        await db.commit()
        return {
            "snapshots": [
                {
                    "snapshot_id": str(s.id),
                    "department_id": str(s.department_id),
                    "department_name": s.department_name,
                    "year": s.year,
                    "month": s.month,
                    "generated_at": s.generated_at.isoformat(),
                }
                for s in snapshots
            ],
            "total_generated": len(snapshots),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
#  Roster Publication
# ---------------------------------------------------------------------------

@router.post(
    "/publish/{dept_id}",
    status_code=status.HTTP_201_CREATED,
)
async def publish_roster(
    dept_id: UUID,
    data: PublishRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_hr_admin),
):
    result = await db.execute(
        select(RosterPublication)
        .where(
            and_(
                RosterPublication.department_id == dept_id,
                RosterPublication.year == data.year,
                RosterPublication.month == data.month,
            )
        )
        .order_by(RosterPublication.version.desc())
        .limit(1)
    )
    pub = result.scalar_one_or_none()
    if pub and pub.status == "locked":
        raise HTTPException(400, "Roster is locked and cannot be republished")

    version = (pub.version + 1) if pub else 1
    from datetime import datetime, timezone
    new_pub = RosterPublication(
        department_id=dept_id,
        year=data.year,
        month=data.month,
        version=version,
        status="published",
        published_at=datetime.now(timezone.utc),
        published_by=current_user.id,
    )
    db.add(new_pub)
    await db.flush()
    await db.refresh(new_pub)
    return _serialize_publication(new_pub)


@router.post(
    "/lock/{dept_id}",
    dependencies=[Depends(PermissionChecker("shift:update"))],
)
async def lock_roster(
    dept_id: UUID,
    data: PublishRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_hr_admin),
):
    from datetime import datetime, timezone
    result = await db.execute(
        select(RosterPublication)
        .where(
            and_(
                RosterPublication.department_id == dept_id,
                RosterPublication.year == data.year,
                RosterPublication.month == data.month,
            )
        )
        .order_by(RosterPublication.version.desc())
        .limit(1)
    )
    pub = result.scalar_one_or_none()
    if not pub:
        raise HTTPException(404, "No publication found for this period. Publish first.")

    pub.status = "locked"
    pub.locked_at = datetime.now(timezone.utc)
    pub.locked_by = current_user.id
    await db.flush()
    await db.refresh(pub)
    return _serialize_publication(pub)


@router.get(
    "/publications/{dept_id}",
    dependencies=[Depends(PermissionChecker("shift:view"))],
)
async def list_publications(
    dept_id: UUID,
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    query = select(RosterPublication).where(
        RosterPublication.department_id == dept_id
    )
    if year is not None:
        query = query.where(RosterPublication.year == year)
    if month is not None:
        query = query.where(RosterPublication.month == month)
    query = query.order_by(RosterPublication.year.desc(), RosterPublication.month.desc())
    result = await db.execute(query)
    return [_serialize_publication(p) for p in result.scalars().all()]


@router.delete(
    "/publications/{dept_id}/{pub_id}",
    dependencies=[Depends(PermissionChecker("shift:delete"))],
)
async def delete_publication(
    dept_id: UUID,
    pub_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(RosterPublication).where(
            RosterPublication.id == pub_id,
            RosterPublication.department_id == dept_id,
        )
    )
    pub = result.scalar_one_or_none()
    if not pub:
        raise HTTPException(404, "Publication not found")
    if pub.status == "locked":
        raise HTTPException(400, "Locked publications cannot be deleted")
    await db.delete(pub)
    await db.flush()
    return {"message": "Publication deleted", "id": str(pub_id)}


@router.delete(
    "/snapshot/{dept_id}",
    dependencies=[Depends(PermissionChecker("shift:delete"))],
)
async def delete_roster_snapshot(
    dept_id: UUID,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Delete a roster snapshot and all its entries for a department/month."""
    from app.models.roster import RosterSnapshot
    result = await db.execute(
        select(RosterSnapshot).where(
            and_(
                RosterSnapshot.department_id == dept_id,
                RosterSnapshot.year == year,
                RosterSnapshot.month == month,
            )
        )
    )
    snap = result.scalar_one_or_none()
    if not snap:
        raise HTTPException(404, "No roster snapshot found for this period")
    await db.delete(snap)
    await db.flush()
    return {"message": "Roster snapshot deleted", "department_id": str(dept_id), "year": year, "month": month}


# ---------------------------------------------------------------------------
#  Shift Swaps
# ---------------------------------------------------------------------------

@router.post(
    "/swap-requests",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("shift:create"))],
)
async def create_swap_request(
    data: SwapRequestCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    requester = _user.employee_id if hasattr(_user, "employee_id") and _user.employee_id else _user.id
    sr = ShiftSwapRequest(
        requester_id=requester,
        target_id=data.target_id,
        swap_date=data.swap_date,
        requester_shift_id=data.requester_shift_id,
        target_shift_id=data.target_shift_id,
        reason=data.reason,
        status=ShiftSwapRequest.SwapStatus.PENDING,
    )
    db.add(sr)
    await db.flush()
    await db.refresh(sr)
    return _serialize_swap(sr)


@router.get(
    "/swap-requests",
    dependencies=[Depends(PermissionChecker("shift:view"))],
)
async def list_swap_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    requester_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    query = select(ShiftSwapRequest)
    if status_filter:
        query = query.where(ShiftSwapRequest.status == status_filter)
    if requester_id:
        query = query.where(ShiftSwapRequest.requester_id == requester_id)
    query = query.order_by(ShiftSwapRequest.created_at.desc())
    result = await db.execute(query)
    return [_serialize_swap(sr) for sr in result.scalars().all()]


@router.put(
    "/swap-requests/{swap_id}",
    dependencies=[Depends(PermissionChecker("shift:update"))],
)
async def update_swap_request(
    swap_id: UUID,
    data: SwapRequestUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(ShiftSwapRequest).where(ShiftSwapRequest.id == swap_id))
    sr = result.scalar_one_or_none()
    if not sr:
        raise HTTPException(404, "Swap request not found")
    if sr.status != ShiftSwapRequest.SwapStatus.PENDING:
        raise HTTPException(400, "Only pending requests can be approved or rejected")

    from datetime import datetime, timezone
    sr.status = data.status
    sr.reviewed_by = _user.id
    sr.reviewed_at = date.today()
    if data.notes is not None:
        sr.notes = data.notes
    await db.flush()
    await db.refresh(sr)
    return _serialize_swap(sr)


@router.delete(
    "/swap-requests/{swap_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker("shift:delete"))],
)
async def cancel_swap_request(
    swap_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(ShiftSwapRequest).where(ShiftSwapRequest.id == swap_id))
    sr = result.scalar_one_or_none()
    if not sr:
        raise HTTPException(404, "Swap request not found")
    if sr.status != ShiftSwapRequest.SwapStatus.PENDING:
        raise HTTPException(400, "Only pending requests can be cancelled")
    sr.status = ShiftSwapRequest.SwapStatus.CANCELLED
    await db.flush()


# ---------------------------------------------------------------------------
#  Calendar / Schedule View
# ---------------------------------------------------------------------------

@router.get(
    "/calendar/{dept_id}",
    dependencies=[Depends(PermissionChecker("shift:view"))],
)
async def get_department_calendar(
    dept_id: UUID,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from app.models.roster import RosterEntry, RosterSnapshot
    snap_result = await db.execute(
        select(RosterSnapshot).where(
            and_(
                RosterSnapshot.department_id == dept_id,
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


# ---------------------------------------------------------------------------
#  Enterprise Roster Grid (group-based, weekly sections)
# ---------------------------------------------------------------------------

def _build_weeks(days_in_month: int, year: int, month: int) -> list[dict]:
    """Split a month into weekly blocks."""
    weeks: list[dict] = []
    week_num = 1
    for d in range(1, days_in_month + 1, 7):
        week_end = min(d + 6, days_in_month)
        start_date = date(year, month, d)
        end_date = date(year, month, week_end)
        day_list = []
        for dd in range(d, week_end + 1):
            dt = date(year, month, dd)
            day_list.append({
                "date": dt.isoformat(),
                "day_name": dt.strftime("%A"),
                "day_number": str(dd),
            })
        weeks.append({
            "label": f"Week {week_num}",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": day_list,
        })
        week_num += 1
    return weeks


@router.get(
    "/calendar/{dept_id}/grid",
    dependencies=[Depends(PermissionChecker("shift:view"))],
)
async def get_department_roster_grid(
    dept_id: UUID,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Enterprise roster grid grouped by (pair_name, slot_index) with weekly sections."""
    from app.models.roster import RosterEntry, RosterSnapshot
    from app.models.shift_protocol import ShiftProtocol

    # ── Department + protocol type ──────────────────────────
    dept_result = await db.execute(
        select(Department).options(
            joinedload(Department.shift_protocol)
        ).where(Department.id == dept_id)
    )
    dept = dept_result.scalar_one_or_none()
    if not dept:
        raise HTTPException(404, "Department not found")

    protocol_type = "fixed"
    if dept.shift_protocol:
        protocol_type = dept.shift_protocol.protocol_type.value if hasattr(dept.shift_protocol.protocol_type, 'value') else str(dept.shift_protocol.protocol_type)

    # ── Snapshot + entries ─────────────────────────────────
    snap_result = await db.execute(
        select(RosterSnapshot).where(
            and_(
                RosterSnapshot.department_id == dept_id,
                RosterSnapshot.year == year,
                RosterSnapshot.month == month,
            )
        )
    )
    snap = snap_result.scalar_one_or_none()
    if not snap:
        days_in_month = calendar.monthrange(year, month)[1]
        weeks = _build_weeks(days_in_month, year, month)
        return {
            "department": {"id": str(dept_id), "name": dept.name, "protocol_type": protocol_type},
            "year": year, "month": month,
            "weeks": weeks,
            "unpaired": [],
        }

    entries_result = await db.execute(
        select(RosterEntry)
        .where(RosterEntry.snapshot_id == snap.id)
        .order_by(RosterEntry.entry_date, RosterEntry.pair_name, RosterEntry.slot_index, RosterEntry.employee_name)
    )
    entries = entries_result.scalars().all()

    # ── Group entries by (pair_name, slot_index) ────────────
    from collections import defaultdict
    group_map: dict[str, dict] = {}
    unpaired_entries: list[dict] = []

    for e in entries:
        group_key = f"{e.pair_name or '__unpaired__'}|{e.slot_index or -1}"
        day_str = e.entry_date.isoformat()

        if not e.pair_name:
            # Unpaired/admin employees → separate list
            unpaired_entries.append({
                "employee_id": str(e.employee_id),
                "employee_code": e.employee_code,
                "employee_name": e.employee_name,
                "date": day_str,
                "assignment": e.assignment.value,
                "shift_start": e.shift_start,
                "shift_end": e.shift_end,
            })
            continue

        if group_key not in group_map:
            group_map[group_key] = {
                "name": f"Group {e.pair_name.replace('Pair ', '')}-{e.slot_index + 1}" if e.slot_index is not None else e.pair_name,
                "pair_id": str(e.pair_id) if e.pair_id else None,
                "slot_index": e.slot_index,
                "employees": {},
                "schedule": {},
            }

        grp = group_map[group_key]
        emp_key = str(e.employee_id)
        if emp_key not in grp["employees"]:
            grp["employees"][emp_key] = {
                "id": emp_key,
                "name": e.employee_name,
                "code": e.employee_code,
            }
        grp["schedule"][day_str] = {
            "assignment": e.assignment.value,
            "shift_start": e.shift_start,
            "shift_end": e.shift_end,
        }

    # ── Build week structure ────────────────────────────────
    days_in_month = calendar.monthrange(year, month)[1]
    weeks = _build_weeks(days_in_month, year, month)

    # Attach group schedules to each week
    group_list = list(group_map.values())
    for grp in group_list:
        grp["employees"] = sorted(grp["employees"].values(), key=lambda x: x["name"])

    for week in weeks:
        week_groups = []
        for grp in group_list:
            week_schedule = []
            for day_info in week["days"]:
                ds = day_info["date"]
                entry = grp["schedule"].get(ds)
                if entry:
                    week_schedule.append(entry)
                else:
                    week_schedule.append({"assignment": "OFF", "shift_start": None, "shift_end": None})
            week_groups.append({
                "name": grp["name"],
                "pair_id": grp["pair_id"],
                "slot_index": grp["slot_index"],
                "employees": grp["employees"],
                "schedule": week_schedule,
            })
        week["groups"] = week_groups

    # ── Build unpaired per-week ─────────────────────────────
    unpaired_by_emp: dict[str, dict] = {}
    for ue in unpaired_entries:
        ek = ue["employee_id"]
        if ek not in unpaired_by_emp:
            unpaired_by_emp[ek] = {
                "employee_id": ek,
                "employee_code": ue["employee_code"],
                "employee_name": ue["employee_name"],
            }
    unpaired_list = list(unpaired_by_emp.values())
    for up in unpaired_list:
        up["schedule"] = [{"assignment": "OFF", "shift_start": None, "shift_end": None} for _ in range(days_in_month)]
    for ue in unpaired_entries:
        day_index = int(ue["date"].split("-")[2]) - 1
        for up in unpaired_list:
            if up["employee_id"] == ue["employee_id"]:
                up["schedule"][day_index] = {
                    "assignment": ue["assignment"],
                    "shift_start": ue["shift_start"],
                    "shift_end": ue["shift_end"],
                }
                break

    return {
        "department": {"id": str(dept_id), "name": dept.name, "protocol_type": protocol_type},
        "year": year,
        "month": month,
        "weeks": weeks,
        "unpaired": unpaired_list,
    }


# ── Clear Calendar Endpoints ─────────────────────────────


@router.delete(
    "/calendar/{dept_id}/clear",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_hr_admin)],
)
async def clear_department_calendar(
    dept_id: UUID,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Delete all roster entries for a department's given month.
    Removes the snapshot and all associated entries.

    This is a destructive action — use with caution.
    """
    from app.models.roster import RosterEntry, RosterSnapshot

    snap_result = await db.execute(
        select(RosterSnapshot).where(
            and_(
                RosterSnapshot.department_id == dept_id,
                RosterSnapshot.year == year,
                RosterSnapshot.month == month,
            )
        )
    )
    snap = snap_result.scalar_one_or_none()
    if not snap:
        raise HTTPException(
            status_code=404,
            detail=f"No roster snapshot found for dept={dept_id} {year}-{month:02d}"
        )

    # Delete entries first, then the snapshot
    await db.execute(
        delete(RosterEntry).where(RosterEntry.snapshot_id == snap.id)
    )
    await db.delete(snap)
    await db.commit()

    return {"status": "cleared", "dept_id": str(dept_id), "year": year, "month": month}


@router.delete(
    "/calendar/clear/organization",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_hr_admin)],
)
async def clear_organization_calendar(
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Delete ALL roster entries across ALL departments for a given month.
    Removes every snapshot and all associated entries.

    This is a destructive action — use with extreme caution.
    """
    from app.models.roster import RosterEntry, RosterSnapshot

    # Delete all entries for this month's snapshots
    snap_result = await db.execute(
        select(RosterSnapshot).where(
            and_(
                RosterSnapshot.year == year,
                RosterSnapshot.month == month,
            )
        )
    )
    snaps = snap_result.scalars().all()
    snap_ids = [s.id for s in snaps]

    if not snap_ids:
        return {"status": "cleared", "snapshots_removed": 0, "entries_removed": 0}

    result = await db.execute(
        delete(RosterEntry).where(RosterEntry.snapshot_id.in_(snap_ids))
    )
    entries_deleted = result.rowcount if result.rowcount is not None else 0

    for snap in snaps:
        await db.delete(snap)

    await db.commit()

    return {
        "status": "cleared",
        "snapshots_removed": len(snaps),
        "entries_removed": entries_deleted,
    }


@router.get(
    "/calendar/employee/{emp_id}",
    dependencies=[Depends(PermissionChecker("shift:view"))],
)
async def get_employee_calendar(
    emp_id: UUID,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from app.models.roster import RosterEntry, RosterSnapshot
    result = await db.execute(
        select(RosterEntry)
        .join(RosterSnapshot, RosterSnapshot.id == RosterEntry.snapshot_id)
        .where(
            and_(
                RosterEntry.employee_id == emp_id,
                RosterSnapshot.year == year,
                RosterSnapshot.month == month,
            )
        )
        .order_by(RosterEntry.entry_date)
    )
    entries = result.scalars().all()
    return {
        "employee_id": str(emp_id),
        "year": year,
        "month": month,
        "entries": [
            {
                "id": str(e.id),
                "entry_date": e.entry_date.isoformat(),
                "assignment": e.assignment.value,
                "pair_name": e.pair_name,
                "shift_start": e.shift_start,
                "shift_end": e.shift_end,
                "is_overridden": e.is_overridden,
            }
            for e in entries
        ],
        "total": len(entries),
    }


@router.get(
    "/calendar/{dept_id}/day/{target_date}",
    dependencies=[Depends(PermissionChecker("shift:view"))],
)
async def get_day_schedule(
    dept_id: UUID,
    target_date: date,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from app.models.roster import RosterEntry, RosterSnapshot
    snap_result = await db.execute(
        select(RosterSnapshot)
        .where(
            and_(
                RosterSnapshot.department_id == dept_id,
                RosterSnapshot.year == target_date.year,
                RosterSnapshot.month == target_date.month,
            )
        )
        .order_by(RosterSnapshot.created_at.desc())
        .limit(1)
    )
    snap = snap_result.scalar_one_or_none()
    if not snap:
        raise HTTPException(404, "No roster found for this month")

    result = await db.execute(
        select(RosterEntry)
        .where(
            and_(
                RosterEntry.snapshot_id == snap.id,
                RosterEntry.entry_date == target_date,
            )
        )
        .order_by(RosterEntry.employee_name)
    )
    entries = result.scalars().all()
    return {
        "department_id": str(dept_id),
        "date": target_date.isoformat(),
        "snapshot_id": str(snap.id),
        "entries": [
            {
                "id": str(e.id),
                "employee_id": str(e.employee_id),
                "employee_code": e.employee_code,
                "employee_name": e.employee_name,
                "assignment": e.assignment.value,
                "pair_name": e.pair_name,
                "shift_start": e.shift_start,
                "shift_end": e.shift_end,
            }
            for e in entries
        ],
        "total": len(entries),
    }


# ---------------------------------------------------------------------------
#  Attendance Comparison
# ---------------------------------------------------------------------------

@router.get(
    "/comparison/{emp_id}",
    dependencies=[Depends(PermissionChecker("attendance:view"))],
)
async def compare_scheduled_vs_actual(
    emp_id: UUID,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from app.models.roster import RosterEntry, RosterSnapshot
    from app.models.attendance import AttendanceLog

    schedule_result = await db.execute(
        select(RosterEntry)
        .join(RosterSnapshot, RosterSnapshot.id == RosterEntry.snapshot_id)
        .where(
            and_(
                RosterEntry.employee_id == emp_id,
                RosterEntry.entry_date >= start_date,
                RosterEntry.entry_date <= end_date,
            )
        )
        .order_by(RosterEntry.entry_date)
    )
    scheduled = schedule_result.scalars().all()

    actual_result = await db.execute(
        select(AttendanceLog)
        .where(
            and_(
                AttendanceLog.employee_id == emp_id,
                AttendanceLog.timestamp >= start_date,
                AttendanceLog.timestamp <= end_date,
            )
        )
        .order_by(AttendanceLog.timestamp)
    )
    actual = actual_result.scalars().all()

    comparison = []
    for s in scheduled:
        day_logs = [a for a in actual if a.timestamp.date() == s.entry_date]
        comparison.append({
            "date": s.entry_date.isoformat(),
            "scheduled": s.assignment.value,
            "scheduled_start": s.shift_start,
            "scheduled_end": s.shift_end,
            "actual_scans": len(day_logs),
            "first_scan": min(a.timestamp.isoformat() for a in day_logs) if day_logs else None,
            "last_scan": max(a.timestamp.isoformat() for a in day_logs) if day_logs else None,
            "status": "present" if day_logs else "absent",
        })

    return {
        "employee_id": str(emp_id),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "total_scheduled": len(scheduled),
        "total_present": sum(1 for c in comparison if c["status"] == "present"),
        "total_absent": sum(1 for c in comparison if c["status"] == "absent"),
        "comparison": comparison,
    }


@router.get(
    "/comparison/{emp_id}/day/{target_date}",
    dependencies=[Depends(PermissionChecker("attendance:view"))],
)
async def compare_single_day(
    emp_id: UUID,
    target_date: date,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from app.models.roster import RosterEntry, RosterSnapshot
    from app.models.attendance import AttendanceLog

    schedule_result = await db.execute(
        select(RosterEntry)
        .join(RosterSnapshot, RosterSnapshot.id == RosterEntry.snapshot_id)
        .where(
            and_(
                RosterEntry.employee_id == emp_id,
                RosterEntry.entry_date == target_date,
            )
        )
    )
    entry = schedule_result.scalar_one_or_none()

    day_start = target_date.isoformat()
    actual_result = await db.execute(
        select(AttendanceLog)
        .where(
            and_(
                AttendanceLog.employee_id == emp_id,
                AttendanceLog.timestamp >= day_start,
                AttendanceLog.timestamp < day_start,
            )
        )
    )
    actual_logs = actual_result.scalars().all()

    return {
        "employee_id": str(emp_id),
        "date": target_date.isoformat(),
        "scheduled": {
            "assignment": entry.assignment.value if entry else None,
            "shift_start": entry.shift_start if entry else None,
            "shift_end": entry.shift_end if entry else None,
        } if entry else None,
        "actual_scans": [
            {
                "id": str(log.id),
                "timestamp": log.timestamp.isoformat(),
                "direction": log.direction if hasattr(log, "direction") else None,
            }
            for log in actual_logs
        ],
        "status": "present" if actual_logs else ("not_scheduled" if not entry else "absent"),
    }


# ---------------------------------------------------------------------------
#  Analytics
# ---------------------------------------------------------------------------

@router.get(
    "/analytics/{dept_id}",
    dependencies=[Depends(PermissionChecker("shift:view"))],
)
async def get_scheduling_analytics(
    dept_id: UUID,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from app.models.roster import AssignmentType, RosterEntry, RosterSnapshot

    snap_result = await db.execute(
        select(RosterSnapshot).where(
            and_(
                RosterSnapshot.department_id == dept_id,
                RosterSnapshot.year == year,
                RosterSnapshot.month == month,
            )
        )
    )
    snap = snap_result.scalar_one_or_none()
    if not snap:
        return {
            "total_scheduled_hours": 0,
            "coverage_percent": 0.0,
            "employees_off": 0,
            "night_staff": 0,
            "morning_staff": 0,
            "overtime_hours": 0.0,
            "leave_count": 0,
            "absences": 0,
            "late_arrivals": 0,
        }

    entries_result = await db.execute(
        select(RosterEntry).where(RosterEntry.snapshot_id == snap.id)
    )
    entries = entries_result.scalars().all()

    total_days = len(set(e.entry_date for e in entries))
    unique_employees = len(set(e.employee_id for e in entries))

    night_staff = sum(1 for e in entries if e.assignment == AssignmentType.NIGHT)
    morning_staff = sum(1 for e in entries if e.assignment == AssignmentType.DAY)
    employees_off = sum(1 for e in entries if e.assignment == AssignmentType.OFF)
    leave_count = sum(1 for e in entries if e.assignment == AssignmentType.LEAVE)
    absences = sum(1 for e in entries if e.assignment == AssignmentType.ABSENT)

    total_scheduled_hours = (morning_staff + night_staff) * 12.0

    total_possible = unique_employees * total_days if unique_employees and total_days else 1
    assigned = total_days * unique_employees - employees_off - leave_count - absences
    coverage_percent = round((assigned / total_possible) * 100, 1) if total_possible else 0.0

    return {
        "total_scheduled_hours": total_scheduled_hours,
        "coverage_percent": coverage_percent,
        "employees_off": employees_off,
        "night_staff": night_staff,
        "morning_staff": morning_staff,
        "overtime_hours": 0.0,
        "leave_count": leave_count,
        "absences": absences,
        "late_arrivals": 0,
    }
