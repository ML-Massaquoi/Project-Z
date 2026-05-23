"""
Project Z - Models Package
Import all models so Alembic and SQLAlchemy discover them.
"""

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

__all__ = [
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
]
