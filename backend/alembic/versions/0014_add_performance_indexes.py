"""0014 Add performance indexes for common queries

Revision ID: 0014
Revises: 0013
Create Date: 2025-01-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Attendance Sessions Indexes ───────────────────────────
    # Covering index for daily attendance queries
    op.create_index(
        "ix_attendance_sessions_date_employee",
        "attendance_sessions",
        ["date", "employee_id"],
    )
    # Index for shift-based queries
    op.create_index(
        "ix_attendance_sessions_shift_date_status",
        "attendance_sessions",
        ["shift_date", "status"],
    )
    # Index for status-based filtering
    op.create_index(
        "ix_attendance_sessions_status_date",
        "attendance_sessions",
        ["status", "date"],
    )

    # ── Scan Events Indexes ───────────────────────────────────
    # Index for processing status queries (worker polls)
    op.create_index(
        "ix_scan_events_processing_status_created",
        "scan_events",
        ["processing_status", "created_at"],
    )
    # Index for device-based queries
    op.create_index(
        "ix_scan_events_device_id_timestamp",
        "scan_events",
        ["device_id", "scan_timestamp"],
    )

    # ── Employees Indexes ─────────────────────────────────────
    # Covering index for department employee queries
    op.create_index(
        "ix_employees_department_status",
        "employees",
        ["department_id", "status"],
    )
    # Index for code lookups
    op.create_index(
        "ix_employees_employee_code",
        "employees",
        ["employee_code"],
        unique=True,
    )

    # ── Devices Indexes ───────────────────────────────────────
    # Index for online status queries
    op.create_index(
        "ix_devices_is_online_last_seen",
        "devices",
        ["is_online", "last_seen"],
    )
    # Index for serial number lookups
    op.create_index(
        "ix_devices_serial_number",
        "devices",
        ["serial_number"],
        unique=True,
    )

    # ── Leave Requests Indexes ────────────────────────────────
    # Index for status-based queries
    op.create_index(
        "ix_leave_requests_status_start_date",
        "leave_requests",
        ["status", "start_date"],
    )
    # Index for employee leave queries
    op.create_index(
        "ix_leave_requests_employee_id_dates",
        "leave_requests",
        ["employee_id", "start_date", "end_date"],
    )

    # ── Audit Logs Indexes ────────────────────────────────────
    # Index for time-based queries
    op.create_index(
        "ix_audit_logs_created_at",
        "audit_logs",
        ["created_at"],
    )
    # Composite index for filtered queries
    op.create_index(
        "ix_audit_logs_action_entity_created",
        "audit_logs",
        ["action", "entity_type", "created_at"],
    )

    # ── Shift Templates Indexes ───────────────────────────────
    op.create_index(
        "ix_shift_templates_code",
        "shift_templates",
        ["code"],
        unique=True,
    )

    # ── Department Shift Rules Indexes ────────────────────────
    op.create_index(
        "ix_dept_shift_rules_department_id",
        "dept_shift_rules",
        ["department_id"],
        unique=True,
    )

    # ── Employee Shift Assignments Indexes ────────────────────
    op.create_index(
        "ix_employee_shift_assignments_employee_id",
        "employee_shift_assignments",
        ["employee_id"],
    )


def downgrade() -> None:
    # Drop indexes in reverse order
    op.drop_index("ix_employee_shift_assignments_employee_id", table_name="employee_shift_assignments")
    op.drop_index("ix_dept_shift_rules_department_id", table_name="dept_shift_rules")
    op.drop_index("ix_shift_templates_code", table_name="shift_templates")
    op.drop_index("ix_audit_logs_action_entity_created", table_name="audit_logs")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_leave_requests_employee_id_dates", table_name="leave_requests")
    op.drop_index("ix_leave_requests_status_start_date", table_name="leave_requests")
    op.drop_index("ix_devices_serial_number", table_name="devices")
    op.drop_index("ix_devices_is_online_last_seen", table_name="devices")
    op.drop_index("ix_employees_employee_code", table_name="employees")
    op.drop_index("ix_employees_department_status", table_name="employees")
    op.drop_index("ix_scan_events_device_id_timestamp", table_name="scan_events")
    op.drop_index("ix_scan_events_processing_status_created", table_name="scan_events")
    op.drop_index("ix_attendance_sessions_status_date", table_name="attendance_sessions")
    op.drop_index("ix_attendance_sessions_shift_date_status", table_name="attendance_sessions")
    op.drop_index("ix_attendance_sessions_date_employee", table_name="attendance_sessions")
