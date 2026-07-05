"""Add late_threshold_minutes to shift_templates

Adds a configurable late threshold that allows scans between (grace + threshold)
to still be marked 'present' in status while recording actual late minutes.

Revision ID: 0034
Revises: 0033
Create Date: 2026-07-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0034"
down_revision: Union[str, None] = "0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "shift_templates",
        sa.Column(
            "late_threshold_minutes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
            comment="Extra minutes after grace where status is still 'present' but late_minutes is recorded. 0 = disabled.",
        ),
    )
    op.create_check_constraint(
        "chk_shift_templates_late_threshold",
        "shift_templates",
        sa.text("late_threshold_minutes BETWEEN 0 AND 240"),
    )


def downgrade() -> None:
    op.drop_constraint("chk_shift_templates_late_threshold", "shift_templates")
    op.drop_column("shift_templates", "late_threshold_minutes")
