"""0013 Add missing attendance_session columns

Revision ID: 0013
Revises: 0012
Create Date: 2025-01-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add shift_date column for shift-aware attendance
    op.add_column(
        "attendance_sessions",
        sa.Column("shift_date", sa.Date(), nullable=True, index=True),
    )

    # Add shift_template_id for referencing the resolved shift template
    op.add_column(
        "attendance_sessions",
        sa.Column(
            "shift_template_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shift_templates.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )

    # Add shift_name for denormalized shift name display
    op.add_column(
        "attendance_sessions",
        sa.Column("shift_name", sa.String(100), nullable=True),
    )

    # Add early_minutes for tracking early arrival
    op.add_column(
        "attendance_sessions",
        sa.Column("early_minutes", sa.Integer(), nullable=True, server_default="0"),
    )

    # Create index for shift_date queries
    op.create_index(
        "ix_attendance_sessions_shift_date",
        "attendance_sessions",
        ["shift_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_attendance_sessions_shift_date", table_name="attendance_sessions")
    op.drop_column("attendance_sessions", "early_minutes")
    op.drop_column("attendance_sessions", "shift_name")
    op.drop_column("attendance_sessions", "shift_template_id")
    op.drop_column("attendance_sessions", "shift_date")
