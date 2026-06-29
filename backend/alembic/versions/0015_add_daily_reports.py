"""0015 Add daily_reports and daily_report_lines tables

Revision ID: 0015
Revises: 0014
Create Date: 2025-06-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── daily_reports ──────────────────────────────────────
    op.create_table(
        "daily_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("report_date", sa.Date(), nullable=False, index=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("departments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("department_name", sa.String(255), nullable=False),
        sa.Column("total_expected", sa.Integer(), server_default="0"),
        sa.Column("total_present", sa.Integer(), server_default="0"),
        sa.Column("total_late", sa.Integer(), server_default="0"),
        sa.Column("total_absent", sa.Integer(), server_default="0"),
        sa.Column("total_on_leave", sa.Integer(), server_default="0"),
        sa.Column("total_overtime", sa.Integer(), server_default="0"),
        sa.Column("total_early_departure", sa.Integer(), server_default="0"),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("generated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_final", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("report_date", "department_id", name="uq_daily_report_dept_date"),
    )

    # ── daily_report_lines ─────────────────────────────────
    op.create_table(
        "daily_report_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("report_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("daily_reports.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_code", sa.String(50), nullable=False),
        sa.Column("employee_name", sa.String(255), nullable=False),
        sa.Column("department_name", sa.String(255), nullable=False),
        sa.Column("position", sa.String(255), nullable=True),
        sa.Column("shift_name", sa.String(100), nullable=True),
        sa.Column("shift_start", sa.Time(), nullable=True),
        sa.Column("shift_end", sa.Time(), nullable=True),
        sa.Column("first_scan", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_scan", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_scans", sa.Integer(), server_default="0"),
        sa.Column("check_in", sa.DateTime(timezone=True), nullable=True),
        sa.Column("check_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column("late_minutes", sa.Float(), server_default="0"),
        sa.Column("overtime_minutes", sa.Float(), server_default="0"),
        sa.Column("early_departure_minutes", sa.Float(), server_default="0"),
        sa.Column("duration_minutes", sa.Float(), server_default="0"),
        sa.Column("status", sa.String(50), server_default="absent"),
        sa.Column("check_in_device", sa.String(255), nullable=True),
        sa.Column("check_out_device", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("report_id", "employee_id", name="uq_daily_report_line_emp"),
    )

    # Indexes for fast daily report queries
    op.create_index("ix_daily_reports_date_dept", "daily_reports", ["report_date", "department_id"])
    op.create_index("ix_daily_report_lines_status", "daily_report_lines", ["status"])
    op.create_index("ix_daily_report_lines_emp_date", "daily_report_lines", ["employee_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_daily_report_lines_emp_date", table_name="daily_report_lines")
    op.drop_index("ix_daily_report_lines_status", table_name="daily_report_lines")
    op.drop_index("ix_daily_reports_date_dept", table_name="daily_reports")
    op.drop_table("daily_report_lines")
    op.drop_table("daily_reports")
