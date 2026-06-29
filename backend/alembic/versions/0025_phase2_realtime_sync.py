"""Phase 2 - Real-Time Device Synchronization Engine tables

Revision ID: 0025
Revises: 0024
Create Date: 2026-06-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── device_status_history ────────────────────────────────────
    op.create_table(
        "device_status_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("device_id", UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, index=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("firmware_version", sa.String(50), nullable=True),
        sa.Column("device_name", sa.String(255), nullable=True),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), index=True),
    )
    op.create_index("ix_device_status_history_device_recorded", "device_status_history", ["device_id", "recorded_at"])

    # ── employee_enrollment_history ──────────────────────────────
    op.create_table(
        "employee_enrollment_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("device_id", UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("device_user_id", sa.String(50), nullable=False),
        sa.Column("action", sa.String(30), nullable=False, index=True),
        sa.Column("enrollment_type", sa.String(30), nullable=False, server_default="fingerprint"),
        sa.Column("details", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_enrollment_history_employee_device", "employee_enrollment_history", ["employee_id", "device_id"])

    # ── device_activity_logs ─────────────────────────────────────
    op.create_table(
        "device_activity_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("device_id", UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("activity_type", sa.String(50), nullable=False, index=True),
        sa.Column("details", JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), index=True),
    )
    op.create_index("ix_device_activity_logs_device_type", "device_activity_logs", ["device_id", "activity_type"])
    op.create_index("ix_device_activity_logs_created", "device_activity_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("device_activity_logs")
    op.drop_table("employee_enrollment_history")
    op.drop_table("device_status_history")
