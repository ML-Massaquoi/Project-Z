"""
Project Z - Dashboard API Routes
"""

from datetime import date, timedelta
import traceback as tb_mod

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.config import get_settings
from app.database.session import get_db
from app.models.attendance import AttendanceSession
from app.models.department import Department
from app.models.employee import Employee, EmployeeStatus
from app.models.enrollment_session import EnrollmentSession, EnrollmentStatus
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
from app.services.absence_service import count_absent, count_expected
from app.utils.time_utils import today_date
from app.models.scan_event import ScanEvent

logger = __import__("logging").getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    target_date: date = Query(None, description="Date to query (YYYY-MM-DD). Defaults to today."),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get real-time dashboard statistics from central employee database."""
    try:
        today = today_date()
        query_date = target_date or today
        yesterday = query_date - timedelta(days=1)

        emp_repo = EmployeeRepository(db)
        device_repo = DeviceRepository(db)
        session_repo = AttendanceSessionRepository(db)

        # Current counts - only enrolled (wizard-created) employees
        enrolled_ids = await emp_repo.get_enrolled_employee_ids()
        total_employees = len(enrolled_ids)
        active_devices = await device_repo.count_active()
        online_devices = await device_repo.count_online()

        present_ids = await session_repo.get_present_employee_ids(query_date)
        # Filter present to only enrolled employees
        enrolled_id_set = set(enrolled_ids) if enrolled_ids else set()
        present_today = len([pid for pid in present_ids if pid in enrolled_id_set]) if enrolled_ids else 0

        late_today = await session_repo.count_by_status(query_date, "late")

        # Shift-aware absent calculation (only enrolled employees)
        absent_today = await count_absent(db, query_date, enrolled_ids=enrolled_ids) if enrolled_ids else 0
        expected_today = await count_expected(db, query_date, enrolled_ids=enrolled_ids) if enrolled_ids else 0

        # Total scans recorded on query_date (only enrolled employees)
        scan_filters = [func.date(ScanEvent.scan_timestamp) == query_date]
        if enrolled_ids:
            scan_filters.append(ScanEvent.employee_id.in_(enrolled_ids))
        scans_result = await db.execute(
            select(func.count()).select_from(ScanEvent).where(and_(*scan_filters))
        )
        total_scans_today = scans_result.scalar_one() or 0

        # Offline devices (active - online)
        offline_devices = max(0, active_devices - online_devices)

        # Active departments: departments with at least one enrolled employee's attendance on query_date
        dept_filters = [AttendanceSession.date == query_date]
        if enrolled_ids:
            dept_filters.append(Employee.id.in_(enrolled_ids))
        dept_count_result = await db.execute(
            select(func.count(func.distinct(Employee.department_id))).select_from(AttendanceSession).join(
                Employee, AttendanceSession.employee_id == Employee.id
            ).where(and_(*dept_filters))
        )
        active_departments = dept_count_result.scalar_one() or 0

        # ── Employee status breakdown (only enrolled employees) ──
        if enrolled_ids:
            status_counts = await db.execute(
                select(Employee.status, func.count(Employee.id))
                .where(Employee.id.in_(enrolled_ids))
                .group_by(Employee.status)
            )
            status_map = {row[0].value if hasattr(row[0], 'value') else str(row[0]): row[1] for row in status_counts.all()}
        else:
            status_map = {}

        employees_active = status_map.get("active", 0)
        employees_pending_enrollment = status_map.get("pending_enrollment", 0)
        employees_enrolled = status_map.get("enrolled", 0)
        employees_inactive = status_map.get("inactive", 0)
        employees_terminated = status_map.get("terminated", 0)

        # Active enrollment sessions (in-progress enrollments)
        active_enrollment_result = await db.execute(
            select(func.count()).select_from(EnrollmentSession).where(
                EnrollmentSession.status.notin_([
                    EnrollmentStatus.ENROLLMENT_COMPLETE,
                    EnrollmentStatus.CANCELLED,
                    EnrollmentStatus.FAILED,
                ])
            )
        )
        active_enrollment_sessions = active_enrollment_result.scalar_one() or 0

        # Yesterday counts for trends (only enrolled employees)
        yesterday_present_ids = await session_repo.get_present_employee_ids(yesterday)
        yesterday_present = len([pid for pid in yesterday_present_ids if pid in enrolled_id_set]) if enrolled_ids else 0
        yesterday_late = await session_repo.count_by_status(yesterday, "late")
        yesterday_absent = await count_absent(db, yesterday, enrolled_ids=enrolled_ids) if enrolled_ids else 0

        # Calculate trend percentages
        def calc_trend(current: int, previous: int) -> float:
            if previous == 0:
                return 0.0
            return round(((current - previous) / previous) * 100, 1)

        trends = DashboardTrends(
            employees_change=0.0,
            present_change=calc_trend(present_today, yesterday_present),
            late_change=calc_trend(late_today, yesterday_late),
            absent_change=calc_trend(absent_today, yesterday_absent),
        )

        return DashboardStats(
            total_employees=total_employees,
            present_today=present_today,
            late_today=late_today,
            absent_today=absent_today,
            expected_today=expected_today,
            active_devices=active_devices,
            online_devices=online_devices,
            total_scans_today=total_scans_today,
            offline_devices=offline_devices,
            active_departments=active_departments,
            employees_active=employees_active,
            employees_pending_enrollment=employees_pending_enrollment,
            employees_enrolled=employees_enrolled,
            employees_inactive=employees_inactive,
            employees_terminated=employees_terminated,
            active_enrollment_sessions=active_enrollment_sessions,
            trends=trends,
        )

    except Exception as e:
        logger.error(f"Dashboard stats error: {e}", exc_info=True)
        if settings.DEBUG:
            return JSONResponse(
                status_code=500,
                content={"error": True, "message": str(e), "traceback": tb_mod.format_exc().split("\n")[-8:]},
            )
        raise


@router.get("/charts", response_model=DashboardChartData)
async def get_dashboard_charts(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get chart data for attendance overview and department breakdown."""
    try:
        today = today_date()
        session_repo = AttendanceSessionRepository(db)
        emp_repo = EmployeeRepository(db)
        total_employees = await emp_repo.count_active()

        # Attendance Overview (last 7 days)
        overview = []
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            present_ids = await session_repo.get_present_employee_ids(d)
            present = len(present_ids)
            late = await session_repo.count_by_status(d, "late")
            absent = await count_absent(db, d)

            overview.append(AttendanceChartPoint(
                date=d.strftime("%b %d"),
                present=present,
                absent=absent,
                late=late,
            ))

        # Department Breakdown (today)
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

    except Exception as e:
        logger.error(f"Dashboard charts error: {e}", exc_info=True)
        if settings.DEBUG:
            return JSONResponse(
                status_code=500,
                content={"error": True, "message": str(e), "traceback": tb_mod.format_exc().split("\n")[-8:]},
            )
        raise
