"""Add slot_index column to roster_entries

Revision ID: 0032
Revises: 0031
Create Date: 2026-07-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE roster_entries ADD COLUMN IF NOT EXISTS "
        "slot_index INTEGER DEFAULT NULL"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE roster_entries DROP COLUMN IF EXISTS slot_index"
    ))
