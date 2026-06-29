"""Add shift_protocols table and link to departments

Revision ID: 0009_shift_protocols
Revises: 0008_status_to_varchar
Create Date: 2025-01-10 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0009_shift_protocols"
down_revision = "0008_status_to_varchar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── ENUM ────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE protocol_type AS ENUM ('fixed', 'rotating', 'custom');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # ── shift_protocols ─────────────────────────────────────
    op.create_table(
        "shift_protocols",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("protocol_type", postgresql.ENUM(
            "fixed", "rotating", "custom",
            name="protocol_type", create_type=False
        ), nullable=False, server_default="fixed"),
        # Fixed schedule settings
        sa.Column("working_days", postgresql.JSONB, nullable=True, server_default="[]"),
        sa.Column("working_hours_start", sa.String(5), nullable=True),
        sa.Column("working_hours_end", sa.String(5), nullable=True),
        # Rotating schedule settings
        sa.Column("days_on", sa.Integer, nullable=True),
        sa.Column("days_off", sa.Integer, nullable=True),
        sa.Column("rotation_shifts", postgresql.JSONB, nullable=True, server_default="[]"),
        # Shift time definitions
        sa.Column("day_shift_start", sa.String(5), nullable=True),
        sa.Column("day_shift_end", sa.String(5), nullable=True),
        sa.Column("night_shift_start", sa.String(5), nullable=True),
        sa.Column("night_shift_end", sa.String(5), nullable=True),
        # Common settings
        sa.Column("grace_period_minutes", sa.Integer, nullable=False, server_default="15"),
        sa.Column("include_weekends", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("color", sa.String(20), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_shift_protocols_code", "shift_protocols", ["code"])

    # ── Add shift_protocol_id to departments ────────────────
    op.add_column(
        "departments",
        sa.Column("shift_protocol_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_departments_shift_protocol",
        "departments",
        "shift_protocols",
        ["shift_protocol_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Remove foreign key and column from departments
    op.drop_constraint("fk_departments_shift_protocol", "departments", type_="foreignkey")
    op.drop_column("departments", "shift_protocol_id")
    
    # Drop shift_protocols
    op.drop_index("ix_shift_protocols_code", "shift_protocols")
    op.drop_table("shift_protocols")
    op.execute("DROP TYPE IF EXISTS protocol_type")
