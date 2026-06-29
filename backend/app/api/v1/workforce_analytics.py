"""
Project Z - Workforce Analytics API
Executive-level analytics for airport operations management.

Endpoints:
  GET /api/v1/analytics/workforce/summary         — Today's operational summary
  GET /api/v1/analytics/workforce/trends          — Attendance trends (7/30/90 days)
  GET /api/v1/analytics/departments/performance   — Department readiness metrics
  GET /api/v1/analytics/shifts/compliance         — Shift compliance analytics
  GET /api/v1/analytics/devices/reliability       — Device reliability metrics
  GET /api/v1/analytics/exceptions                — Attendance exception report
  GET /api/v1/analytics/executive/dashboard       — Executive dashboard data
"""

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.dependencies import get_current_user
from app.database.session import get_db
from app.models.attendance import AttendanceSession
from app.models.attendance_summary import AttendanceSummary
from app.models.department import Department
from app.models.device import Device
from app.models.employee import Employee
from app.models.scan_event import ScanEvent, ScanResult
from app.utils.time_utils import today_date

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics/workforce", tags=["Workforce Analytics"])


# ── 1. Today's Operational Summary ────────────────────────────

@router.get("/summary")
async def workforce_summary(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Real-time operational summary for today.
    Returns: total employees, present, late, absent, on_leave, departments, devices.
    """
    today = today_date()

    # Total active employees
    total_result = await db.execute(
        select(func.count()).select_from(Employee).where(Employee.status == "active")
    )
    total_employees = total_result.scalar_one()

    # Present today (has attendance session)
    present_result = await db.execute(
        select(func.count(func.distinct(AttendanceSession.employee_id))).where(
            AttendanceSession.date == today
        )
    )
    present_today = present_result.scalar_one()

    # Late today
    late_result = await db.execute(
        select(func.count()).select_from(AttendanceSession).where(
            and_(AttendanceSession.date == today, AttendanceSession.status == "late")
        )
    )
    late_today = late_result.scalar_one()

    # On leave today
    from app.models.leave_request import LeaveRequest, LeaveStatus
    leave_result = await db.execute(
        select(func.count()).select_from(LeaveRequest).where(
            and_(
                LeaveRequest.status == LeaveStatus.APPROVED,
                LeaveRequest.start_date <= today,
                LeaveRequest.end_date >= today,
            )
        )
    )
    on_leave = leave_result.scalar_one()

    absent_today = max(0, total_employees - present_today - on_leave)

    # Device status
    devices_online_result = await db.execute(
        select(func.count()).select_from(Device).where(Device.is_online == True)
    )
    devices_online = devices_online_result.scalar_one()

    devices_total_result = await db.execute(
        select(func.count()).select_from(Device).where(Device.is_active == True)
    )
    devices_total = devices_total_result.scalar_one()

    # Scans today
    scans_result = await db.execute(
        select(func.count()).select_from(ScanEvent).where(
            func.date(ScanEvent.scan_timestamp) == today
        )
    )
    scans_today = scans_result.scalar_one()

    # Unknown users today
    unknown_result = await db.execute(
        select(func.count()).select_from(ScanEvent).where(
            and_(
                func.date(ScanEvent.scan_timestamp) == today,
                ScanEvent.scan_result == ScanResult.UNKNOWN_USER,
            )
        )
    )
    unknown_users_today = unknown_result.scalar_one()

    # Attendance rate
    attendance_rate = round((present_today / total_employees * 100), 1) if total_employees > 0 else 0
    late_rate = round((late_today / present_today * 100), 1) if present_today > 0 else 0

    return {
        "date": str(today),
        "total_employees": total_employees,
        "present_today": present_today,
        "late_today": late_today,
        "absent_today": absent_today,
        "on_leave": on_leave,
        "attendance_rate": attendance_rate,
        "late_rate": late_rate,
        "devices_online": devices_online,
        "devices_total": devices_total,
        "scans_today": scans_today,
        "unknown_users_today": unknown_users_today,
    }


# ── 2. Attendance Trends ─────────────────────────────────────

@router.get("/trends")
async def attendance_trends(
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Daily attendance trends for the last N days.
    Returns: array of {date, present, late, absent, total, attendance_rate}
    """
    today = today_date()
    start_date = today - timedelta(days=days)

    # Get all employees count (baseline)
    total_result = await db.execute(
        select(func.count()).select_from(Employee).where(Employee.status == "active")
    )
    total_employees = total_result.scalar_one()

    # Get sessions in range
    result = await db.execute(
        select(
            AttendanceSession.date,
            func.count(func.distinct(AttendanceSession.employee_id)).label("present"),
        )
        .where(AttendanceSession.date >= start_date)
        .group_by(AttendanceSession.date)
        .order_by(AttendanceSession.date)
    )
    daily_present = {str(row.date): row.present for row in result.all()}

    # Get late counts
    late_result = await db.execute(
        select(
            AttendanceSession.date,
            func.count().label("late"),
        )
        .where(
            and_(
                AttendanceSession.date >= start_date,
                AttendanceSession.status == "late",
            )
        )
        .group_by(AttendanceSession.date)
    )
    daily_late = {str(row.date): row.late for row in late_result.all()}

    # Build trend array
    trends = []
    for i in range(days):
        d = start_date + timedelta(days=i)
        d_str = str(d)
        present = daily_present.get(d_str, 0)
        late = daily_late.get(d_str, 0)
        absent = max(0, total_employees - present)
        rate = round((present / total_employees * 100), 1) if total_employees > 0 else 0

        trends.append({
            "date": d_str,
            "present": present,
            "late": late,
            "absent": absent,
            "total": total_employees,
            "attendance_rate": rate,
        })

    return trends


# ── 3. Department Performance ─────────────────────────────────

@router.get("/departments/performance")
async def department_performance(
    target_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Department readiness metrics for a given date.
    Returns: expected, present, absent, late, readiness%, risk_level per department.
    """
    today = today_date() if not target_date else date.fromisoformat(target_date)

    # Get all departments
    dept_result = await db.execute(
        select(Department).where(Department.is_active == True)
    )
    departments = dept_result.scalars().all()

    performance = []
    for dept in departments:
        # Expected staff
        expected_result = await db.execute(
            select(func.count()).select_from(Employee).where(
                and_(
                    Employee.department_id == dept.id,
                    Employee.status == "active",
                )
            )
        )
        expected = expected_result.scalar_one()

        # Present today
        present_result = await db.execute(
            select(func.count(func.distinct(AttendanceSession.employee_id)))
            .join(Employee, Employee.id == AttendanceSession.employee_id)
            .where(
                and_(
                    Employee.department_id == dept.id,
                    AttendanceSession.date == today,
                )
            )
        )
        present = present_result.scalar_one()

        # Late today
        late_result = await db.execute(
            select(func.count())
            .join(Employee, Employee.id == AttendanceSession.employee_id)
            .where(
                and_(
                    Employee.department_id == dept.id,
                    AttendanceSession.date == today,
                    AttendanceSession.status == "late",
                )
            )
        )
        late = late_result.scalar_one()

        absent = max(0, expected - present)
        readiness = round((present / expected * 100), 1) if expected > 0 else 0

        # Risk level
        if readiness >= 85:
            risk = "low"
        elif readiness >= 60:
            risk = "medium"
        else:
            risk = "high"

        performance.append({
            "department_id": str(dept.id),
            "department_name": dept.name,
            "expected": expected,
            "present": present,
            "absent": absent,
            "late": late,
            "readiness_pct": readiness,
            "risk_level": risk,
        })

    # Sort by readiness ascending (worst first)
    performance.sort(key=lambda x: x["readiness_pct"])

    return performance


# ── 4. Shift Compliance ──────────────────────────────────────

@router.get("/shifts/compliance")
async def shift_compliance(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Shift compliance analytics over a date range.
    Returns: per-shift metrics (total sessions, on_time, late, absent, compliance%).
    """
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    if (end - start).days > 90:
        from fastapi import HTTPException
        raise HTTPException(400, "Date range must not exceed 90 days.")

    result = await db.execute(
        select(AttendanceSession)
        .options(joinedload(AttendanceSession.employee))
        .where(
            and_(
                AttendanceSession.date >= start,
                AttendanceSession.date <= end,
            )
        )
    )
    sessions = result.unique().scalars().all()

    # Group by shift
    by_shift = defaultdict(lambda: {"total": 0, "on_time": 0, "late": 0, "absent": 0, "overtime": 0})
    for s in sessions:
        shift = getattr(s, "shift_name", None) or "Unassigned"
        status = s.status if isinstance(s.status, str) else s.status.value
        by_shift[shift]["total"] += 1
        if status in ("present", "on_time", "early_arrival"):
            by_shift[shift]["on_time"] += 1
        elif status == "late":
            by_shift[shift]["late"] += 1
        elif status in ("absent", "missed_checkin"):
            by_shift[shift]["absent"] += 1
        if (s.overtime_minutes or 0) > 0:
            by_shift[shift]["overtime"] += 1

    return [
        {
            "shift_name": shift,
            "total_sessions": v["total"],
            "on_time": v["on_time"],
            "late": v["late"],
            "absent": v["absent"],
            "overtime": v["overtime"],
            "compliance_pct": round(v["on_time"] / v["total"] * 100, 1) if v["total"] > 0 else 0,
        }
        for shift, v in sorted(by_shift.items())
    ]


# ── 5. Device Reliability ────────────────────────────────────

@router.get("/devices/reliability")
async def device_reliability(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Device reliability metrics over a date range.
    Returns: total scans, unique users, duplicates, online hours, offline events.
    """
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    start_dt = datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(end, datetime.max.time()).replace(tzinfo=timezone.utc)

    # Get all active devices
    device_result = await db.execute(
        select(Device).where(Device.is_active == True).order_by(Device.name)
    )
    devices = device_result.scalars().all()

    reliability = []
    for device in devices:
        # Total scans
        scans_result = await db.execute(
            select(func.count()).select_from(ScanEvent).where(
                and_(
                    ScanEvent.device_id == device.id,
                    ScanEvent.scan_timestamp >= start_dt,
                    ScanEvent.scan_timestamp <= end_dt,
                )
            )
        )
        total_scans = scans_result.scalar_one()

        # Unique users
        unique_result = await db.execute(
            select(func.count(func.distinct(ScanEvent.employee_id))).where(
                and_(
                    ScanEvent.device_id == device.id,
                    ScanEvent.scan_timestamp >= start_dt,
                    ScanEvent.scan_timestamp <= end_dt,
                    ScanEvent.employee_id.isnot(None),
                )
            )
        )
        unique_users = unique_result.scalar_one()

        # Duplicate/unknown scans
        dup_result = await db.execute(
            select(func.count()).select_from(ScanEvent).where(
                and_(
                    ScanEvent.device_id == device.id,
                    ScanEvent.scan_timestamp >= start_dt,
                    ScanEvent.scan_timestamp <= end_dt,
                    ScanEvent.scan_result.in_([ScanResult.DUPLICATE, ScanResult.UNKNOWN_USER]),
                )
            )
        )
        problematic_scans = dup_result.scalar_one()

        # Last seen
        last_seen = device.last_seen
        is_online = device.is_online

        # Heartbeat reliability (if device has been registered)
        heartbeat_reliability = "N/A"
        if last_seen and device.created_at:
            days_registered = max(1, (end - device.created_at.date()).days)
            days_online = 1 if is_online else 0  # Simplified
            heartbeat_reliability = f"{round(days_online / days_registered * 100, 1)}%"

        reliability.append({
            "device_id": str(device.id),
            "device_name": device.name or f"Device {device.serial_number}",
            "serial_number": device.serial_number,
            "ip_address": device.ip_address,
            "is_online": is_online,
            "last_seen": last_seen.isoformat() if last_seen else None,
            "total_scans": total_scans,
            "unique_users": unique_users,
            "problematic_scans": problematic_scans,
            "scan_reliability": round((1 - problematic_scans / total_scans) * 100, 1) if total_scans > 0 else 100,
        })

    return reliability


# ── 6. Attendance Exceptions ─────────────────────────────────

@router.get("/exceptions")
async def attendance_exceptions(
    target_date: Optional[str] = Query(None),
    department_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Detect attendance exceptions for a given date.
    Returns: missing_checkout, late_arrivals, early_departures, unrecognized_users.
    """
    today = today_date() if not target_date else date.fromisoformat(target_date)

    # 1. Missing check-out (checked in but no check-out)
    checkout_query = (
        select(AttendanceSession)
        .options(joinedload(AttendanceSession.employee))
        .where(
            and_(
                AttendanceSession.date == today,
                AttendanceSession.check_in.isnot(None),
                AttendanceSession.check_out.is_(None),
                AttendanceSession.is_complete == False,
            )
        )
    )
    if department_id:
        checkout_query = checkout_query.join(Employee).where(Employee.department_id == department_id)

    checkout_result = await db.execute(checkout_query)
    missing_checkout = [
        {
            "employee_id": str(s.employee_id),
            "employee_name": s.employee.full_name if s.employee else "Unknown",
            "employee_code": s.employee.employee_code if s.employee else "N/A",
            "check_in": s.check_in.isoformat() if s.check_in else None,
        }
        for s in checkout_result.unique().scalars().all()
    ]

    # 2. Late arrivals
    late_query = (
        select(AttendanceSession)
        .options(joinedload(AttendanceSession.employee))
        .where(
            and_(
                AttendanceSession.date == today,
                AttendanceSession.status == "late",
            )
        )
    )
    if department_id:
        late_query = late_query.join(Employee).where(Employee.department_id == department_id)

    late_result = await db.execute(late_query)
    late_arrivals = [
        {
            "employee_id": str(s.employee_id),
            "employee_name": s.employee.full_name if s.employee else "Unknown",
            "employee_code": s.employee.employee_code if s.employee else "N/A",
            "check_in": s.check_in.isoformat() if s.check_in else None,
            "late_minutes": float(s.late_minutes or 0),
        }
        for s in late_result.unique().scalars().all()
    ]

    # 3. Unrecognized users today
    unknown_result = await db.execute(
        select(ScanEvent).where(
            and_(
                func.date(ScanEvent.scan_timestamp) == today,
                ScanEvent.scan_result == ScanResult.UNKNOWN_USER,
            )
        ).order_by(ScanEvent.scan_timestamp.desc())
    )
    unrecognized = [
        {
            "device_serial": s.device_serial,
            "device_name": s.device_name,
            "device_user_id": s.employee_code,
            "scan_count": 1,
            "last_seen": s.scan_timestamp.isoformat(),
        }
        for s in unknown_result.scalars().all()
    ]

    # Deduplicate unrecognized by device_user_id
    seen = set()
    unique_unrecognized = []
    for u in unrecognized:
        key = f"{u['device_serial']}_{u['device_user_id']}"
        if key not in seen:
            seen.add(key)
            unique_unrecognized.append(u)

    return {
        "date": str(today),
        "missing_checkout": missing_checkout,
        "missing_checkout_count": len(missing_checkout),
        "late_arrivals": late_arrivals,
        "late_arrivals_count": len(late_arrivals),
        "unrecognized_users": unique_unrecognized,
        "unrecognized_users_count": len(unique_unrecognized),
    }


# ── 7. Executive Dashboard ───────────────────────────────────

@router.get("/executive/dashboard")
async def executive_dashboard(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Executive-level dashboard data.
    Returns: operational summary, top risks, critical alerts, trend snapshot.
    """
    today = today_date()

    # Reuse workforce summary
    total_result = await db.execute(
        select(func.count()).select_from(Employee).where(Employee.status == "active")
    )
    total_employees = total_result.scalar_one()

    present_result = await db.execute(
        select(func.count(func.distinct(AttendanceSession.employee_id))).where(
            AttendanceSession.date == today
        )
    )
    present_today = present_result.scalar_one()

    late_result = await db.execute(
        select(func.count()).select_from(AttendanceSession).where(
            and_(AttendanceSession.date == today, AttendanceSession.status == "late")
        )
    )
    late_today = late_result.scalar_one()

    absent_today = max(0, total_employees - present_today)
    attendance_rate = round((present_today / total_employees * 100), 1) if total_employees > 0 else 0

    # Department readiness
    dept_result = await db.execute(
        select(Department).where(Department.is_active == True)
    )
    departments = dept_result.scalars().all()

    dept_risks = []
    for dept in departments:
        expected_result = await db.execute(
            select(func.count()).select_from(Employee).where(
                and_(Employee.department_id == dept.id, Employee.status == "active")
            )
        )
        expected = expected_result.scalar_one()

        present_result = await db.execute(
            select(func.count(func.distinct(AttendanceSession.employee_id)))
            .join(Employee, Employee.id == AttendanceSession.employee_id)
            .where(
                and_(Employee.department_id == dept.id, AttendanceSession.date == today)
            )
        )
        present = present_result.scalar_one()

        readiness = round((present / expected * 100), 1) if expected > 0 else 0
        if readiness < 60:
            dept_risks.append({
                "department": dept.name,
                "readiness": readiness,
                "risk": "high",
            })

    # Device health
    devices_online_result = await db.execute(
        select(func.count()).select_from(Device).where(Device.is_online == True)
    )
    devices_online = devices_online_result.scalar_one()

    devices_total_result = await db.execute(
        select(func.count()).select_from(Device).where(Device.is_active == True)
    )
    devices_total = devices_total_result.scalar_one()

    # 7-day trend
    trends = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        p_result = await db.execute(
            select(func.count(func.distinct(AttendanceSession.employee_id))).where(
                AttendanceSession.date == d
            )
        )
        p = p_result.scalar_one()
        rate = round((p / total_employees * 100), 1) if total_employees > 0 else 0
        trends.append({"date": str(d), "attendance_rate": rate})

    # Critical alerts
    alerts = []
    if absent_today > total_employees * 0.2:
        alerts.append({"severity": "high", "message": f"{absent_today} employees absent today ({round(absent_today/total_employees*100)}%)"})
    if late_today > total_employees * 0.1:
        alerts.append({"severity": "medium", "message": f"{late_today} employees arrived late today"})
    if devices_online < devices_total:
        alerts.append({"severity": "medium", "message": f"{devices_total - devices_online} device(s) offline"})
    for risk in dept_risks:
        alerts.append({"severity": "high", "message": f"{risk['department']} readiness at {risk['readiness']}%"})

    return {
        "operational_summary": {
            "total_employees": total_employees,
            "present_today": present_today,
            "late_today": late_today,
            "absent_today": absent_today,
            "attendance_rate": attendance_rate,
            "devices_online": devices_online,
            "devices_total": devices_total,
        },
        "department_risks": dept_risks,
        "trend_7days": trends,
        "critical_alerts": alerts,
        "alert_count": len(alerts),
    }
