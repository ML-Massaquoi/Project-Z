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
    op.create_index(
        "ix_attendance_sessions_date_employee",
        "attendance_sessions",
        ["date", "employee_id"],
    )
    op.create_index(
        "ix_attendance_sessions_shift_date_status",
        "attendance_sessions",
        ["shift_date", "status"],
    )
    op.create_index(
        "ix_attendance_sessions_status_date",
        "attendance_sessions",
        ["status", "date"],
    )

    # ── Scan Events Indexes ───────────────────────────────────
    op.create_index(
        "ix_scan_events_processing_status_created",
        "scan_events",
        ["processing_status", "created_at"],
    )
    op.create_index(
        "ix_scan_events_device_id_timestamp",
        "scan_events",
        ["device_id", "scan_timestamp"],
    )

    # ── Employees Indexes ─────────────────────────────────────
    op.create_index(
        "ix_employees_department_status",
        "employees",
        ["department_id", "status"],
    )
    # Use raw SQL with IF NOT EXISTS — 0001 already creates non-unique version
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_employees_employee_code"
        " ON employees (employee_code)"
    )

    # ── Devices Indexes ───────────────────────────────────────
    op.create_index(
        "ix_devices_is_online_last_seen",
        "devices",
        ["is_online", "last_seen"],
    )
    # Use raw SQL with IF NOT EXISTS — 0001 already creates non-unique version
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_devices_serial_number"
        " ON devices (serial_number)"
    )

    # ── Leave Requests Indexes ────────────────────────────────
    op.create_index(
        "ix_leave_requests_status_start_date",
        "leave_requests",
        ["status", "start_date"],
    )
    op.create_index(
        "ix_leave_requests_employee_id_dates",
        "leave_requests",
        ["employee_id", "start_date", "end_date"],
    )

    # ── Audit Logs Indexes ────────────────────────────────────
    op.create_index(
        "ix_audit_logs_created_at",
        "audit_logs",
        ["created_at"],
    )
    op.create_index(
        "ix_audit_logs_action_entity_created",
        "audit_logs",
        ["action", "entity_type", "created_at"],
    )

    # ── Shift Templates Indexes ───────────────────────────────
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_shift_templates_code"
        " ON shift_templates (code)"
    )

    # ── Department Shift Rules Indexes ────────────────────────
    op.create_index(
        "ix_dept_shift_rules_department_id",
        "department_shift_rules",
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
    op.drop_index("ix_employee_shift_assignments_employee_id", table_name="employee_shift_assignments")
    op.drop_index("ix_dept_shift_rules_department_id", table_name="department_shift_rules")
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
