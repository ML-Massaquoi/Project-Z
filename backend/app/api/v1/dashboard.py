"""
Project Z - Dashboard API Routes
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database.session import get_db
from app.models.attendance import AttendanceSession, AttendanceStatus
from app.models.department import Department
from app.models.employee import Employee
from app.repositories.attendance import AttendanceSessionRepository
from app.repositories.device import DeviceRepository
from app.repositories.employee import EmployeeRepository
from app.schemas.dashboard import (
    AttendanceChartPoint,
    DashboardChartData,
    DashboardStats,
    DashboardTrends,
    DepartmentAttendance,
)
from app.utils.time_utils import today_date

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get real-time dashboard statistics."""
    today = today_date()
    yesterday = today - timedelta(days=1)

    emp_repo = EmployeeRepository(db)
    device_repo = DeviceRepository(db)
    session_repo = AttendanceSessionRepository(db)

    # Current counts
    total_employees = await emp_repo.count_active()
    active_devices = await device_repo.count_active()
    online_devices = await device_repo.count_online()

    present_ids = await session_repo.get_present_employee_ids(today)
    present_today = len(present_ids)

    late_today = await session_repo.count_by_status(today, "late")
    absent_today = max(0, total_employees - present_today)

    # Yesterday counts for trends
    yesterday_present_ids = await session_repo.get_present_employee_ids(yesterday)
    yesterday_present = len(yesterday_present_ids)
    yesterday_late = await session_repo.count_by_status(yesterday, "late")
    yesterday_absent = max(0, total_employees - yesterday_present)

    # Calculate trend percentages
    def calc_trend(current: int, previous: int) -> float:
        if previous == 0:
            return 0.0
        return round(((current - previous) / previous) * 100, 1)

    trends = DashboardTrends(
        employees_change=0.0,  # TODO: Compare with last month
        present_change=calc_trend(present_today, yesterday_present),
        late_change=calc_trend(late_today, yesterday_late),
        absent_change=calc_trend(absent_today, yesterday_absent),
    )

    return DashboardStats(
        total_employees=total_employees,
        present_today=present_today,
        late_today=late_today,
        absent_today=absent_today,
        active_devices=active_devices,
        online_devices=online_devices,
        trends=trends,
    )


@router.get("/charts", response_model=DashboardChartData)
async def get_dashboard_charts(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get chart data for attendance overview and department breakdown."""
    today = today_date()
    session_repo = AttendanceSessionRepository(db)
    emp_repo = EmployeeRepository(db)
    total_employees = await emp_repo.count_active()

    # ── Attendance Overview (last 7 days) ────────────────────
    overview = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        present_ids = await session_repo.get_present_employee_ids(d)
        present = len(present_ids)
        late = await session_repo.count_by_status(d, "late")
        absent = max(0, total_employees - present)

        overview.append(AttendanceChartPoint(
            date=d.strftime("%b %d"),
            present=present,
            absent=absent,
            late=late,
        ))

    # ── Department Breakdown (today) ─────────────────────────
    dept_result = await db.execute(
        select(
            Department.id,
            Department.name,
            func.count(AttendanceSession.id).label("count"),
        )
        .join(Employee, Employee.department_id == Department.id)
        .join(
            AttendanceSession,
            and_(
                AttendanceSession.employee_id == Employee.id,
                AttendanceSession.date == today,
            ),
        )
        .group_by(Department.id, Department.name)
        .order_by(func.count(AttendanceSession.id).desc())
    )
    dept_rows = dept_result.all()

    total_sessions = sum(r.count for r in dept_rows) if dept_rows else 1
    department_breakdown = [
        DepartmentAttendance(
            department_name=r.name,
            department_id=str(r.id),
            count=r.count,
            percentage=round((r.count / total_sessions) * 100, 1),
        )
        for r in dept_rows
    ]

    return DashboardChartData(
        attendance_overview=overview,
        department_breakdown=department_breakdown,
    )
