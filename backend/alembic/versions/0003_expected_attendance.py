"""Expected attendance table — workforce expectation engine

Revision ID: 0003_expected_attendance
Revises: 0002_enterprise_platform_schema
Create Date: 2025-01-03 00:00:00.000000

Introduces the expected_attendance table which is the foundation for:
  - absence detection
  - late detection
  - operational staffing visibility
  - department readiness analytics

Design decisions:
  - NOT partitioned: expected records are generated per-day, queried by
    shift_date + department. Row volume is bounded by headcount × days,
    not by scan volume. A partial index on (shift_date, status) is
    sufficient for all dashboard queries.
  - UNIQUE (employee_id, shift_date): one expectation per employee per
    operational shift date. Overnight shifts are attributed to the start
    date (D), not D+1.
  - status is a VARCHAR(30) not an enum: the state machine evolves
    without requiring ALTER TYPE migrations.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_expected_attendance"
down_revision = "0002_enterprise_platform_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── expected_attendance ───────────────────────────────────
    op.create_table(
        "expected_attendance",
        # ── Identity ──────────────────────────────────────────
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # ── Employee context ──────────────────────────────────
        sa.Column(
            "employee_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "department_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "office_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("offices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # ── Shift context (snapshot at generation time) ───────
        sa.Column(
            "shift_template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shift_templates.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Which assignment/rule sourced this expectation
        # 'override' | 'assignment' | 'department_rule' | 'unscheduled'
        sa.Column("resolution_source", sa.String(30), nullable=False, server_default="unscheduled"),
        # ── Temporal ──────────────────────────────────────────
        # Operational shift date (overnight shifts use start date D, not D+1)
        sa.Column("shift_date", sa.Date, nullable=False),
        # Absolute UTC datetimes derived from shift template + shift_date
        sa.Column("expected_checkin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expected_checkout", sa.DateTime(timezone=True), nullable=True),
        # Attendance window boundaries (when we start/stop accepting scans)
        sa.Column("checkin_window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checkin_window_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checkout_window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checkout_window_end", sa.DateTime(timezone=True), nullable=True),
        # ── State machine ─────────────────────────────────────
        # Values: expected | checked_in | checked_out | late | absent |
        #         half_day | on_leave | holiday | weekend_off | overtime |
        #         incomplete | unscheduled
        sa.Column("status", sa.String(30), nullable=False, server_default="expected"),
        # ── Actuals (populated as scans arrive) ───────────────
        sa.Column("actual_checkin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_checkout", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "attendance_session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("attendance_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # ── Computed metrics ──────────────────────────────────
        sa.Column("late_minutes", sa.Numeric(6, 1), nullable=True, server_default="0"),
        sa.Column("early_minutes", sa.Numeric(6, 1), nullable=True, server_default="0"),
        sa.Column("overtime_minutes", sa.Numeric(6, 1), nullable=True, server_default="0"),
        sa.Column("duration_minutes", sa.Numeric(8, 1), nullable=True),
        # ── Lifecycle ─────────────────────────────────────────
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auto_generated", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("notes", sa.Text, nullable=True),
        # ── Timestamps ────────────────────────────────────────
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        # ── Constraints ───────────────────────────────────────
        # One expectation per employee per operational shift date
        sa.UniqueConstraint(
            "employee_id",
            "shift_date",
            name="uq_expected_attendance_employee_shift_date",
        ),
    )

    # ── Indexes ───────────────────────────────────────────────
    # Primary dashboard query: all expectations for a date
    op.create_index(
        "ix_expected_attendance_shift_date",
        "expected_attendance",
        ["shift_date"],
    )
    # Department staffing panel: dept + date
    op.create_index(
        "ix_expected_attendance_dept_date",
        "expected_attendance",
        ["department_id", "shift_date"],
    )
    # Employee history lookup
    op.create_index(
        "ix_expected_attendance_employee_date",
        "expected_attendance",
        ["employee_id", "shift_date"],
    )
    # Absence/late detection jobs: filter by status + date
    op.create_index(
        "ix_expected_attendance_status_date",
        "expected_attendance",
        ["status", "shift_date"],
    )
    # Checkin window end — used by absence detection job to find expired windows
    op.create_index(
        "ix_expected_attendance_checkin_window_end",
        "expected_attendance",
        ["checkin_window_end"],
    )


def downgrade() -> None:
    op.drop_index("ix_expected_attendance_checkin_window_end",
                  table_name="expected_attendance")
    op.drop_index("ix_expected_attendance_status_date",
                  table_name="expected_attendance")
    op.drop_index("ix_expected_attendance_employee_date",
                  table_name="expected_attendance")
    op.drop_index("ix_expected_attendance_dept_date",
                  table_name="expected_attendance")
    op.drop_index("ix_expected_attendance_shift_date",
                  table_name="expected_attendance")
    op.drop_table("expected_attendance")
