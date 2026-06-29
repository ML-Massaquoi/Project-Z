"""Add device health monitoring fields and health log table

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-19 13:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add columns to devices — idempotent
    conn.execute(sa.text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS health_status        VARCHAR(20)  NOT NULL DEFAULT 'unknown'"))
    conn.execute(sa.text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER      NOT NULL DEFAULT 0"))
    conn.execute(sa.text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_health_check    TIMESTAMPTZ"))
    conn.execute(sa.text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS avg_response_time_ms INTEGER"))
    conn.execute(sa.text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS total_scan_count     INTEGER      NOT NULL DEFAULT 0"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_devices_health_status ON devices (health_status)"))

    # Create enum type — idempotent via DO block
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE health_check_result AS ENUM ('success','timeout','connection_refused','sdk_error','unknown_error');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS device_health_logs (
            id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id           UUID    NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
            check_result        health_check_result NOT NULL,
            response_time_ms    INTEGER,
            error_message       TEXT,
            device_online       BOOLEAN,
            scan_count_at_check INTEGER,
            checked_by          VARCHAR(100),
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_device_health_logs_device_id  ON device_health_logs (device_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_device_health_logs_created_at ON device_health_logs (created_at)"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS device_health_logs"))
    conn.execute(sa.text("DROP TYPE  IF EXISTS health_check_result"))
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_devices_health_status"))
    conn.execute(sa.text("ALTER TABLE devices DROP COLUMN IF EXISTS total_scan_count"))
    conn.execute(sa.text("ALTER TABLE devices DROP COLUMN IF EXISTS avg_response_time_ms"))
    conn.execute(sa.text("ALTER TABLE devices DROP COLUMN IF EXISTS last_health_check"))
    conn.execute(sa.text("ALTER TABLE devices DROP COLUMN IF EXISTS consecutive_failures"))
    conn.execute(sa.text("ALTER TABLE devices DROP COLUMN IF EXISTS health_status"))
