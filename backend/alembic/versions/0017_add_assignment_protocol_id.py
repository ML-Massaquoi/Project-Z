"""Add shift_protocol_id to employee_shift_assignments

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-16 11:00:00.000000

Adds shift_protocol_id column to employee_shift_assignments so that
employees can be assigned directly to a protocol (rotating or fixed)
instead of a single shift template.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employee_shift_assignments",
        sa.Column("shift_protocol_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_emp_assignments_shift_protocol",
        "employee_shift_assignments",
        "shift_protocols",
        ["shift_protocol_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_emp_assignments_shift_protocol",
        "employee_shift_assignments",
        type_="foreignkey",
    )
    op.drop_column("employee_shift_assignments", "shift_protocol_id")
