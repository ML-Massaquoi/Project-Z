"""Add working_days to employee_shift_assignments

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-16 10:00:00.000000

Adds working_days column to employee_shift_assignments so that
assignment-level overrides can restrict which days of the week
the shift template applies (e.g., Mon-Fri for office staff).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employee_shift_assignments",
        sa.Column("working_days", ARRAY(sa.Integer), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("employee_shift_assignments", "working_days")
