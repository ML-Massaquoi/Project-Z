"""0013 Add missing attendance_session columns

NOTE: This migration is a no-op because all columns were
already added by migration 0002_enterprise_platform_schema.

Revision ID: 0013
Revises: 0012
Create Date: 2025-01-15
"""
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
