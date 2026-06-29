"""Add shift_id FK to attendance_sessions

Revision ID: 0007_shift_fk
Revises: 0006_fingerprint_templates
Create Date: 2026-05-31 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0007_shift_fk"
down_revision = "0006_fingerprint_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attendance_sessions",
        sa.Column("shift_id", UUID(as_uuid=True), sa.ForeignKey("shifts.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_attendance_sessions_shift_id", "attendance_sessions", ["shift_id"])


def downgrade() -> None:
    op.drop_index("ix_attendance_sessions_shift_id", "attendance_sessions")
    op.drop_column("attendance_sessions", "shift_id")
