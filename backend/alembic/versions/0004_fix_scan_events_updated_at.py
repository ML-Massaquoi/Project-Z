"""Add updated_at to scan_events partitioned table

Revision ID: 0004_fix_scan_events_updated_at
Revises: 0003_expected_attendance
Create Date: 2025-01-04 00:00:00.000000

The scan_events table was created via raw SQL in 0002 and did not include
the updated_at column that BaseModel provides. This migration adds it.
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_fix_scan_events_updated_at"
down_revision = "0003_expected_attendance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add updated_at to the parent partitioned table.
    # PostgreSQL propagates the column to all existing partitions automatically.
    op.execute("""
        ALTER TABLE scan_events
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE scan_events DROP COLUMN IF EXISTS updated_at;
    """)
