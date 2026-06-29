"""Central biometric synchronization system

Revision ID: 0023
Revises: 0022
Create Date: 2026-06-20
"""

from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. Enhance fingerprint_templates ──────────────────────
    # Add template_data (binary), template_hash, template_version,
    # biometric_type, source_device, sync_status, last_synced_at
    op.add_column(
        "fingerprint_templates",
        sa.Column("template_data", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "fingerprint_templates",
        sa.Column("template_hash", sa.String(128), nullable=True),
    )
    op.add_column(
        "fingerprint_templates",
        sa.Column("template_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "fingerprint_templates",
        sa.Column(
            "biometric_type",
            sa.String(20),
            nullable=False,
            server_default="fingerprint",
            comment="fingerprint, face, palm, rfid, pin",
        ),
    )
    op.add_column(
        "fingerprint_templates",
        sa.Column("source_device_id", sa.String(100), nullable=True, comment="Serial number of originating device"),
    )
    op.add_column(
        "fingerprint_templates",
        sa.Column(
            "sync_status",
            sa.String(20),
            nullable=False,
            server_default="synced",
            comment="synced, pending, failed, outdated",
        ),
    )
    op.add_column(
        "fingerprint_templates",
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "fingerprint_templates",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default="true",
            comment="Soft delete flag",
        ),
    )

    # Indexes for new columns
    op.create_index("ix_fptemplates_hash", "fingerprint_templates", ["template_hash"])
    op.create_index("ix_fptemplates_sync_status", "fingerprint_templates", ["sync_status"])
    op.create_index(
        "ix_fptemplates_employee_biometric",
        "fingerprint_templates",
        ["employee_id", "biometric_type"],
    )
    op.create_index(
        "ix_fptemplates_device_biometric",
        "fingerprint_templates",
        ["device_id", "biometric_type"],
    )

    # Unique constraint: one template per employee per finger per biometric_type
    op.create_unique_constraint(
        "uq_fptemplates_employee_finger_type",
        "fingerprint_templates",
        ["employee_id", "finger_index", "biometric_type"],
    )

    # ── 2. Create device_sync_logs ────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS device_sync_logs (
            id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id         UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
            sync_type         VARCHAR(30) NOT NULL,
            direction         VARCHAR(10) NOT NULL,
            status            VARCHAR(20) NOT NULL DEFAULT 'running',
            started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            completed_at      TIMESTAMPTZ,
            duration_ms       INTEGER,
            users_affected    INTEGER     NOT NULL DEFAULT 0,
            templates_affected INTEGER    NOT NULL DEFAULT 0,
            errors_count      INTEGER     NOT NULL DEFAULT 0,
            error_details     JSONB,
            initiated_by      VARCHAR(256) NOT NULL DEFAULT 'system',
            extra_metadata    JSONB,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.create_index("ix_device_sync_logs_device", "device_sync_logs", ["device_id"])
    op.create_index("ix_device_sync_logs_status", "device_sync_logs", ["status"])
    op.create_index("ix_device_sync_logs_type", "device_sync_logs", ["sync_type"])
    op.create_index("ix_device_sync_logs_created", "device_sync_logs", ["created_at"])

    # ── 3. Create device_sync_status ──────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS device_sync_status (
            id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id             UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
            total_users_on_device INTEGER     NOT NULL DEFAULT 0,
            total_users_synced    INTEGER     NOT NULL DEFAULT 0,
            total_templates_stored INTEGER    NOT NULL DEFAULT 0,
            total_templates_pushed INTEGER    NOT NULL DEFAULT 0,
            pending_push_users    INTEGER     NOT NULL DEFAULT 0,
            pending_push_templates INTEGER    NOT NULL DEFAULT 0,
            failed_syncs          INTEGER     NOT NULL DEFAULT 0,
            last_full_sync_at     TIMESTAMPTZ,
            last_push_at          TIMESTAMPTZ,
            last_pull_at          TIMESTAMPTZ,
            last_error            TEXT,
            is_provisioned        BOOLEAN     NOT NULL DEFAULT false,
            provisioned_at        TIMESTAMPTZ,
            sync_health           VARCHAR(20) NOT NULL DEFAULT 'unknown',
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(device_id)
        )
    """))

    op.create_index("ix_device_sync_status_health", "device_sync_status", ["sync_health"])
    op.create_index("ix_device_sync_status_provisioned", "device_sync_status", ["is_provisioned"])

    # ── 4. Add sync columns to devices ────────────────────────
    op.add_column(
        "devices",
        sa.Column("is_provisioned", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "devices",
        sa.Column("provisioned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "devices",
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "devices",
        sa.Column("sync_enabled", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "devices",
        sa.Column("total_users_synced", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "devices",
        sa.Column("total_templates_synced", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    conn = op.get_bind()

    # Remove columns from devices
    op.drop_column("devices", "total_templates_synced")
    op.drop_column("devices", "total_users_synced")
    op.drop_column("devices", "sync_enabled")
    op.drop_column("devices", "last_sync_at")
    op.drop_column("devices", "provisioned_at")
    op.drop_column("devices", "is_provisioned")

    # Drop device_sync_status
    op.drop_table("device_sync_status")

    # Drop device_sync_logs
    op.drop_table("device_sync_logs")

    # Drop fingerprint_templates indexes and columns
    op.drop_constraint("uq_fptemplates_employee_finger_type", "fingerprint_templates")
    op.drop_index("ix_fptemplates_device_biometric")
    op.drop_index("ix_fptemplates_employee_biometric")
    op.drop_index("ix_fptemplates_sync_status")
    op.drop_index("ix_fptemplates_hash")
    op.drop_column("fingerprint_templates", "is_active")
    op.drop_column("fingerprint_templates", "last_synced_at")
    op.drop_column("fingerprint_templates", "sync_status")
    op.drop_column("fingerprint_templates", "source_device_id")
    op.drop_column("fingerprint_templates", "biometric_type")
    op.drop_column("fingerprint_templates", "template_version")
    op.drop_column("fingerprint_templates", "template_hash")
    op.drop_column("fingerprint_templates", "template_data")
