"""
Project Z - Reports API v2
All 7 report endpoints with 90-day range enforcement.
"""
import io
import csv
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.attendance import AttendanceSession
from app.models.employee import Employee
from app.models.scan_event import ScanEvent

router = APIRouter(prefix="/reports", tags=["Reports v2"])

MAX_RANGE_DAYS = 90


def _validate_range(start: date, end: date) -> None:
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(400, "Date range must not exceed 90 days.")


def _parse_date(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except ValueError:
        raise HTTPException(400, f"Invalid date format: {s}. Use YYYY-MM-DD.")


# ── 1. Daily attendance report ────────────────────────────────

@router.get("/attendance/daily", dependencies=[Depends(PermissionChecker("report:view"))])
async def daily_attendance_report(
    date: str = Query(...),
    department_id: Optional[UUID] = None,
    format: str = Query("csv", description="csv | excel | pdf"),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    target = _parse_date(date)
    query = (
        select(AttendanceSession)
        .options(joinedload(AttendanceSession.employee))
        .where(AttendanceSession.date == target)
        .order_by(AttendanceSession.check_in)
    )
    if department_id:
        query = query.join(Employee).where(Employee.department_id == department_id)
    result = await db.execute(query)
    sessions = result.unique().scalars().all()

    rows = []
    for s in sessions:
        emp = s.employee
        rows.append({
            "Date": str(s.date),
            "Employee Code": emp.employee_code if emp else "N/A",
            "Employee Name": emp.full_name if emp else "Unknown",
            "Department": emp.department_id if emp else "",
            "Shift": getattr(s, "shift_name", "") or "",
            "Check In": s.check_in.strftime("%H:%M:%S") if s.check_in else "",
            "Check Out": s.check_out.strftime("%H:%M:%S") if s.check_out else "",
            "Duration (min)": round(float(s.duration_minutes), 1) if s.duration_minutes else "",
            "Late (min)": float(s.late_minutes or 0),
            "Overtime (min)": float(s.overtime_minutes or 0),
            "Status": s.status if isinstance(s.status, str) else s.status.value,
        })

    return _export(rows, f"daily_attendance_{date}", format)


# ── 2. Lateness report ────────────────────────────────────────

@router.get("/attendance/lateness", dependencies=[Depends(PermissionChecker("report:view"))])
async def lateness_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    department_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    start, end = _parse_date(start_date), _parse_date(end_date)
    _validate_range(start, end)

    query = (
        select(AttendanceSession)
        .options(joinedload(AttendanceSession.employee))
        .where(
            and_(
                AttendanceSession.date >= start,
                AttendanceSession.date <= end,
                AttendanceSession.status == "late",
            )
        )
        .order_by(AttendanceSession.date, AttendanceSession.check_in)
    )
    if department_id:
        query = query.join(Employee).where(Employee.department_id == department_id)
    result = await db.execute(query)
    sessions = result.unique().scalars().all()

    return [
        {
            "date": str(s.date),
            "employee_code": s.employee.employee_code if s.employee else "N/A",
            "employee_name": s.employee.full_name if s.employee else "Unknown",
            "check_in": s.check_in.strftime("%H:%M:%S") if s.check_in else None,
            "late_minutes": float(s.late_minutes or 0),
        }
        for s in sessions
    ]


# ── 3. Absences report ────────────────────────────────────────

@router.get("/attendance/absences", dependencies=[Depends(PermissionChecker("report:view"))])
async def absences_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    department_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    start, end = _parse_date(start_date), _parse_date(end_date)
    _validate_range(start, end)

    query = (
        select(AttendanceSession)
        .options(joinedload(AttendanceSession.employee))
        .where(
            and_(
                AttendanceSession.date >= start,
                AttendanceSession.date <= end,
                AttendanceSession.status.in_(["absent", "missed_checkin"]),
            )
        )
        .order_by(AttendanceSession.date)
    )
    if department_id:
        query = query.join(Employee).where(Employee.department_id == department_id)
    result = await db.execute(query)
    sessions = result.unique().scalars().all()

    return [
        {
            "date": str(s.date),
            "employee_code": s.employee.employee_code if s.employee else "N/A",
            "employee_name": s.employee.full_name if s.employee else "Unknown",
            "status": s.status if isinstance(s.status, str) else s.status.value,
        }
        for s in sessions
    ]


# ── 4. Overtime report ────────────────────────────────────────

@router.get("/attendance/overtime", dependencies=[Depends(PermissionChecker("report:view"))])
async def overtime_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    department_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    start, end = _parse_date(start_date), _parse_date(end_date)
    _validate_range(start, end)

    query = (
        select(AttendanceSession)
        .options(joinedload(AttendanceSession.employee))
        .where(
            and_(
                AttendanceSession.date >= start,
                AttendanceSession.date <= end,
                AttendanceSession.overtime_minutes > 0,
            )
        )
        .order_by(AttendanceSession.date)
    )
    if department_id:
        query = query.join(Employee).where(Employee.department_id == department_id)
    result = await db.execute(query)
    sessions = result.unique().scalars().all()

    return [
        {
            "date": str(s.date),
            "employee_code": s.employee.employee_code if s.employee else "N/A",
            "employee_name": s.employee.full_name if s.employee else "Unknown",
            "overtime_minutes": float(s.overtime_minutes or 0),
            "duration_minutes": float(s.duration_minutes or 0),
        }
        for s in sessions
    ]


# ── 5. Shift compliance report ────────────────────────────────

@router.get("/attendance/shift-compliance", dependencies=[Depends(PermissionChecker("report:view"))])
async def shift_compliance_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    department_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    start, end = _parse_date(start_date), _parse_date(end_date)
    _validate_range(start, end)

    query = (
        select(AttendanceSession)
        .options(joinedload(AttendanceSession.employee))
        .where(
            and_(
                AttendanceSession.date >= start,
                AttendanceSession.date <= end,
            )
        )
    )
    if department_id:
        query = query.join(Employee).where(Employee.department_id == department_id)
    result = await db.execute(query)
    sessions = result.unique().scalars().all()

    # Group by date
    from collections import defaultdict
    by_date: dict = defaultdict(lambda: {"on_time": 0, "late": 0, "absent": 0, "total": 0})
    for s in sessions:
        d = str(s.date)
        status = s.status if isinstance(s.status, str) else s.status.value
        by_date[d]["total"] += 1
        if status == "late":
            by_date[d]["late"] += 1
        elif status in ("absent", "missed_checkin"):
            by_date[d]["absent"] += 1
        elif status in ("present", "early_arrival"):
            by_date[d]["on_time"] += 1

    return [
        {
            "date": d,
            "total": v["total"],
            "on_time": v["on_time"],
            "late": v["late"],
            "absent": v["absent"],
            "on_time_pct": round(v["on_time"] / v["total"] * 100, 1) if v["total"] else 0,
            "late_pct": round(v["late"] / v["total"] * 100, 1) if v["total"] else 0,
            "absent_pct": round(v["absent"] / v["total"] * 100, 1) if v["total"] else 0,
        }
        for d, v in sorted(by_date.items())
    ]


# ── 6. Raw scan audit report ──────────────────────────────────

@router.get("/scans/audit", dependencies=[Depends(PermissionChecker("report:view"))])
async def scan_audit_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    employee_id: Optional[UUID] = None,
    device_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    if not employee_id and not device_id:
        raise HTTPException(400, "At least one of employee_id or device_id is required.")
    start, end = _parse_date(start_date), _parse_date(end_date)
    _validate_range(start, end)

    from datetime import datetime, timezone
    filters = [
        ScanEvent.scan_timestamp >= datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc),
        ScanEvent.scan_timestamp <= datetime.combine(end, datetime.max.time()).replace(tzinfo=timezone.utc),
    ]
    if employee_id:
        filters.append(ScanEvent.employee_id == employee_id)
    if device_id:
        filters.append(ScanEvent.device_id == device_id)

    result = await db.execute(
        select(ScanEvent).where(and_(*filters)).order_by(ScanEvent.scan_timestamp)
    )
    scans = result.scalars().all()

    return [
        {
            "id": str(s.id),
            "scan_timestamp": s.scan_timestamp.isoformat(),
            "employee_code": s.employee_code,
            "employee_name": s.employee_name,
            "device_name": s.device_name,
            "office_name": s.office_name,
            "verification_method": s.verification_method.value if hasattr(s.verification_method, "value") else str(s.verification_method),
            "scan_result": s.scan_result.value if hasattr(s.scan_result, "value") else str(s.scan_result),
            "processing_status": s.processing_status.value if hasattr(s.processing_status, "value") else str(s.processing_status),
        }
        for s in scans
    ]


# ── 7. Movement history report ────────────────────────────────

@router.get("/scans/movement", dependencies=[Depends(PermissionChecker("report:view"))])
async def movement_history_report(
    employee_id: UUID = Query(...),
    date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    target = _parse_date(date)
    from datetime import datetime, timezone
    result = await db.execute(
        select(ScanEvent)
        .where(
            and_(
                ScanEvent.employee_id == employee_id,
                ScanEvent.scan_timestamp >= datetime.combine(target, datetime.min.time()).replace(tzinfo=timezone.utc),
                ScanEvent.scan_timestamp <= datetime.combine(target, datetime.max.time()).replace(tzinfo=timezone.utc),
            )
        )
        .order_by(ScanEvent.scan_timestamp.asc())
    )
    scans = result.scalars().all()
    return [
        {
            "scan_timestamp": s.scan_timestamp.isoformat(),
            "device_name": s.device_name,
            "office_name": s.office_name,
            "department_name": s.department_name,
            "verification_method": s.verification_method.value if hasattr(s.verification_method, "value") else str(s.verification_method),
            "scan_result": s.scan_result.value if hasattr(s.scan_result, "value") else str(s.scan_result),
        }
        for s in scans
    ]


# ── Export helper ─────────────────────────────────────────────

def _export(rows: list, filename_base: str, fmt: str):
    if fmt == "csv":
        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        content = output.getvalue().encode("utf-8")
        return StreamingResponse(
            io.BytesIO(content),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.csv"'},
        )
    elif fmt == "excel":
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        if rows:
            ws.append(list(rows[0].keys()))
            for row in rows:
                ws.append(list(row.values()))
        buf = io.BytesIO()
        wb.save(buf)
        return StreamingResponse(
            io.BytesIO(buf.getvalue()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.xlsx"'},
        )
    else:
        # Default to CSV for unsupported formats
        return _export(rows, filename_base, "csv")
