"""Add shift_protocol_id to employees

Revision ID: 0010_employee_shift_protocol
Revises: 0009_shift_protocols
Create Date: 2025-01-11 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010_employee_shift_protocol"
down_revision = "0009_shift_protocols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("shift_protocol_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_employees_shift_protocol",
        "employees",
        "shift_protocols",
        ["shift_protocol_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_employees_shift_protocol", "employees", type_="foreignkey")
    op.drop_column("employees", "shift_protocol_id")
