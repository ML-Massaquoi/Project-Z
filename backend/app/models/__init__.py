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
from app.models.device_user import DeviceUser
from app.models.fingerprint_template import FingerprintTemplate, BiometricType, SyncStatus
from app.models.device_sync_status import DeviceSyncStatus, SyncHealth
from app.models.device_sync_log import DeviceSyncLog
from app.models.shift_protocol import ShiftProtocol, ProtocolType
from app.models.daily_report import DailyReport, DailyReportLine
from app.models.system_alert import SystemAlert, AlertSeverity, AlertCategory
from app.models.device_health_log import DeviceHealthLog, HealthCheckResult
from app.models.data_integrity_log import DataIntegrityLog, CheckCategory, CheckSeverity

# ── FIA Shift Management ──────────────────────────────────────
from app.models.shift_pair import ShiftPair, ShiftPairMember
from app.models.roster import RosterSnapshot, RosterEntry, AssignmentType

# ── Phase 2: Real-Time Sync ──────────────────────────────────
from app.models.device_status_history import DeviceStatusHistory
from app.models.employee_enrollment_history import EmployeeEnrollmentHistory
from app.models.device_activity_log import DeviceActivityLog

# ── Phase 4: Device Management & Replication ────────────────
from app.models.device_group import DeviceGroup
from app.models.offline_sync_queue import OfflineSyncQueue, QueueStatus, SyncOperation
from app.models.employee_device_assignment import EmployeeDeviceAssignment, EmployeeDeviceGroupAssignment

# ── Phase 5: Workforce Scheduling Engine ────────────────────
from app.models.shift_protocol_step import ShiftProtocolStep
from app.models.department_protocol import DepartmentProtocol
from app.models.shift_swap_request import ShiftSwapRequest
from app.models.roster_publication import RosterPublication

# ── Rotation Engine (replaces ShiftPair) ────────────────────
from app.models.rotation_group import RotationGroup, GroupAssignment

# ── Employee Enrollment & Lifecycle ──────────────────────────
from app.models.enrollment_session import EnrollmentSession
from app.models.enrollment_event import EnrollmentEvent
from app.models.face_template import FaceTemplate
from app.models.status_transition import EmployeeStatusTransition

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
    "DeviceUser",
    "FingerprintTemplate",
    "BiometricType",
    "SyncStatus",
    "DeviceSyncStatus",
    "SyncHealth",
    "DeviceSyncLog",
    "ShiftProtocol",
    "ProtocolType",
    "DailyReport",
    "DailyReportLine",
    "SystemAlert",
    "AlertSeverity",
    "AlertCategory",
    "DeviceHealthLog",
    "HealthCheckResult",
    "DataIntegrityLog",
    "CheckCategory",
    "CheckSeverity",
    # FIA Shift Management
    "ShiftPair",
    "ShiftPairMember",
    "RosterSnapshot",
    "RosterEntry",
    "AssignmentType",
    # Phase 2: Real-Time Sync
    "DeviceStatusHistory",
    "EmployeeEnrollmentHistory",
    "DeviceActivityLog",
    # Phase 4: Device Management & Replication
    "DeviceGroup",
    "OfflineSyncQueue",
    "QueueStatus",
    "SyncOperation",
    "EmployeeDeviceAssignment",
    "EmployeeDeviceGroupAssignment",
    # Phase 5: Workforce Scheduling Engine
    "ShiftProtocolStep",
    "DepartmentProtocol",
    "ShiftSwapRequest",
    "RosterPublication",
    # Employee Enrollment & Lifecycle
    "EnrollmentSession",
    "EnrollmentEvent",
    "FaceTemplate",
    "EmployeeStatusTransition",
    # Rotation Engine (replaces ShiftPair)
    "RotationGroup",
    "GroupAssignment",
]
