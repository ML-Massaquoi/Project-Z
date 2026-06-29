"""Add fingerprint_templates table

Revision ID: 0006_fingerprint_templates
Revises: 0005_device_users
Create Date: 2026-05-31 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0006_fingerprint_templates"
down_revision = "0005_device_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fingerprint_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("device_id", UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("device_user_id", sa.String(50), nullable=False),
        sa.Column("finger_index", sa.Integer, nullable=False),
        sa.Column("template_size", sa.Integer, nullable=False, server_default="0"),
        sa.Column("quality", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_unique_constraint(
        "uq_fingerprint_template",
        "fingerprint_templates",
        ["employee_id", "device_id", "finger_index"],
    )


def downgrade() -> None:
    op.drop_table("fingerprint_templates")
