"""
Project Z - Auto Absent Detection Worker
Runs after each shift ends to mark employees as absent if they never scanned.

Uses ShiftResolver for shift resolution (4-level chain):
  1. EmployeeShiftOverride
  2. EmployeeShiftAssignment
  3. DepartmentShiftRule
  4. Unscheduled

Runs every 5 minutes, checks shifts that ended in the last 30 minutes.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

CHECK_INTERVAL = 300  # 5 minutes


async def check_absences(db_session_factory) -> None:
    """
    Check for employees who should have scanned but didn't.
    Uses ShiftResolver to determine which employees should be working today
    and creates absent records for those who haven't scanned.
    """
    from sqlalchemy import select, and_, func
    from app.models.employee import Employee
    from app.models.attendance import AttendanceSession
    from app.models.shift_template import ShiftTemplate
    from app.services.shift_resolver import ShiftResolver, WEEKEND_OFF
    from app.utils.time_utils import today_date

    now = datetime.now(timezone.utc)
    today = today_date()

    async with db_session_factory() as session:
        resolver = ShiftResolver(session)

        # Get all active employees
        emp_result = await session.execute(
            select(Employee).where(Employee.status == 'active')
        )
        employees = emp_result.scalars().all()

        absent_count = 0
        skipped_count = 0

        for emp in employees:
            # Resolve shift for this employee today
            resolved = await resolver.resolve(emp.id, today)

            if resolved is None:
                # Unscheduled employee — skip
                skipped_count += 1
                continue

            if resolved.is_weekend_off:
                # Employee is off today — skip
                skipped_count += 1
                continue

            template = resolved.template

            # Calculate shift end time
            shift_end = datetime.combine(today, template.end_time)
            if template.is_overnight:
                shift_end += timedelta(days=1)

            # Only check if shift ended in the last 30 minutes
            diff_minutes = (now.replace(tzinfo=None) - shift_end.replace(tzinfo=None)).total_seconds() / 60
            if diff_minutes < 0 or diff_minutes > 30:
                continue

            logger.info(
                f"[AutoAbsent] Checking employee {emp.employee_code} "
                f"on shift '{template.name}' (ended {diff_minutes:.0f}min ago)"
            )

            # Check if employee has any session today
            session_result = await session.execute(
                select(AttendanceSession).where(
                    and_(
                        AttendanceSession.employee_id == emp.id,
                        AttendanceSession.date == today,
                    )
                ).limit(1)
            )
            if session_result.scalar_one_or_none() is None:
                # Employee didn't scan — create absent session
                absent_session = AttendanceSession(
                    employee_id=emp.id,
                    date=today,
                    shift_date=today,
                    shift_template_id=template.id,
                    status='absent',
                    is_complete=True,
                    notes=f'Auto-marked absent: no scan on shift {template.name}',
                )
                session.add(absent_session)
                absent_count += 1

        if absent_count > 0:
            await session.commit()
            logger.info(
                f"[AutoAbsent] Marked {absent_count} employees absent "
                f"({skipped_count} skipped: unscheduled/off)"
            )

            # Broadcast summary update
            from app.services.websocket_service import ws_manager
            await ws_manager.broadcast('attendance_update', {
                'source': 'auto_absent',
                'absent_count': absent_count,
                'skipped_count': skipped_count,
            })
        else:
            logger.debug(
                f"[AutoAbsent] No absences detected "
                f"({skipped_count} employees skipped: unscheduled/off)"
            )


async def run_auto_absent_worker(db_session_factory) -> None:
    """Background loop: checks for absences every 5 minutes."""
    logger.info("[AutoAbsent] Starting auto-absent detection worker")

    while True:
        try:
            await asyncio.sleep(CHECK_INTERVAL)
            await check_absences(db_session_factory)
        except asyncio.CancelledError:
            logger.info("[AutoAbsent] Worker cancelled")
            break
        except Exception as e:
            logger.error(f"[AutoAbsent] Worker error: {e}", exc_info=True)
            await asyncio.sleep(30)
