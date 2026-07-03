"""Add updated_at column to employee_status_transitions

Revision ID: 0030
Revises: 0029
Create Date: 2026-06-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "employee_status_transitions",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_column("employee_status_transitions", "updated_at")
