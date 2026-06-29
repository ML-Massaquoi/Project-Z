"""Add device_users table for biometric device user registry

Revision ID: 0005_device_users
Revises: 0004_fix_scan_events_updated_at
Create Date: 2026-05-31 00:00:00.000000

Creates the device_users table to store biometric device-local user records
synced from devices via TCP SDK (pyzk).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0005_device_users"
down_revision = "0004_fix_scan_events_updated_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "device_users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("device_id", UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("device_user_id", sa.String(50), nullable=False, comment="User ID as stored on the biometric device"),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("privilege", sa.Integer, nullable=False, server_default="0"),
        sa.Column("card_number", sa.String(50), nullable=True),
        sa.Column("group_id", sa.String(50), nullable=True),
        sa.Column("fingerprint_count", sa.Integer, server_default="0"),
        sa.Column("face_registered", sa.Boolean, server_default="false"),
        sa.Column("password_set", sa.Boolean, server_default="false"),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_data", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Unique constraint on (device_id, device_user_id)
    op.create_unique_constraint(
        "uq_device_user_registry",
        "device_users",
        ["device_id", "device_user_id"],
    )


def downgrade() -> None:
    op.drop_table("device_users")
