"""Change attendance_sessions.status from enum to VARCHAR

Revision ID: 0008_status_to_varchar
Revises: 0007_shift_fk
Create Date: 2026-05-31 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_status_to_varchar"
down_revision = "0007_shift_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the default first (it references the old enum type)
    op.execute("ALTER TABLE attendance_sessions ALTER COLUMN status DROP DEFAULT")
    # Change column type from enum to VARCHAR
    op.alter_column(
        "attendance_sessions",
        "status",
        type_=sa.String(50),
        existing_nullable=False,
    )
    # Set new default
    op.execute("ALTER TABLE attendance_sessions ALTER COLUMN status SET DEFAULT 'on_time'")
    # Drop the old enum type
    op.execute("DROP TYPE IF EXISTS attendance_status CASCADE")


def downgrade() -> None:
    op.execute("""
        CREATE TYPE attendance_status AS ENUM ('on_time', 'late', 'early_departure', 'absent', 'half_day')
    """)
    op.alter_column(
        "attendance_sessions",
        "status",
        type_=sa.Enum("on_time", "late", "early_departure", "absent", "half_day", name="attendance_status"),
        existing_nullable=False,
        existing_server_default="on_time",
    )
