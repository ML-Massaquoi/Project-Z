"""
Project Z - Models Package
Import all models so Alembic and SQLAlchemy discover them.
"""

# ── Existing models ───────────────────────────────────────────
from app.models.organization import Organization
from app.models.office import Office
from app.models.department import Department
from app.models.shift import Shift
from app.models.device import Device
from app.models.employee import Employee, EmployeeStatus
from app.models.attendance import (
    AttendanceLog,
    AttendanceSession,
    RawAttendancePayload,
    AttendanceStatus,
    VerifyType,
    PunchDirection,
)
from app.models.employee_device_mapping import EmployeeDeviceMapping
from app.models.user import User, Role, RoleType
from app.models.audit import AuditLog

# ── Enterprise platform models (v2) ──────────────────────────
from app.models.scan_event import ScanEvent, ScanResult, ProcessingStatusV2, VerificationMethod
from app.models.shift_template import ShiftTemplate
from app.models.dept_shift_rule import DepartmentShiftRule
from app.models.shift_assignment import EmployeeShiftAssignment
from app.models.shift_override import EmployeeShiftOverride
from app.models.attendance_summary import AttendanceSummary
from app.models.holiday_calendar import HolidayCalendar, HolidayType, HolidayScope
from app.models.leave_request import LeaveRequest, LeaveType, LeaveStatus

__all__ = [
    # Existing
    "Organization",
    "Office",
    "Department",
    "Shift",
    "Device",
    "Employee",
    "EmployeeStatus",
    "AttendanceLog",
    "AttendanceSession",
    "RawAttendancePayload",
    "AttendanceStatus",
    "VerifyType",
    "PunchDirection",
    "EmployeeDeviceMapping",
    "User",
    "Role",
    "RoleType",
    "AuditLog",
    # Enterprise platform v2
    "ScanEvent",
    "ScanResult",
    "ProcessingStatusV2",
    "VerificationMethod",
    "ShiftTemplate",
    "DepartmentShiftRule",
    "EmployeeShiftAssignment",
    "EmployeeShiftOverride",
    "AttendanceSummary",
    "HolidayCalendar",
    "HolidayType",
    "HolidayScope",
    "LeaveRequest",
    "LeaveType",
    "LeaveStatus",
]
