"""Add system_alerts table for server-persisted operational alerts

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-19 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Create enum types — check first to be idempotent
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE alert_severity AS ENUM ('INFO','WARNING','CRITICAL','EMERGENCY');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """))
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE alert_category AS ENUM ('device','attendance','system','security','operational');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS system_alerts (
            id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            severity         alert_severity NOT NULL,
            category         alert_category NOT NULL,
            title            VARCHAR(255) NOT NULL,
            message          TEXT         NOT NULL,
            source           VARCHAR(100),
            source_id        VARCHAR(100),
            event_type       VARCHAR(100),
            acknowledged     BOOLEAN      NOT NULL DEFAULT false,
            acknowledged_by  VARCHAR(100),
            acknowledged_at  TIMESTAMPTZ,
            metadata         JSONB,
            resolution_note  TEXT,
            expires_at       TIMESTAMPTZ,
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """))

    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_system_alerts_id                  ON system_alerts (id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_system_alerts_severity             ON system_alerts (severity)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_system_alerts_category             ON system_alerts (category)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_system_alerts_acknowledged         ON system_alerts (acknowledged)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_system_alerts_expires_at           ON system_alerts (expires_at)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_system_alerts_category_severity    ON system_alerts (category, severity)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_system_alerts_created_acknowledged ON system_alerts (created_at, acknowledged)"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS system_alerts"))
    conn.execute(sa.text("DROP TYPE IF EXISTS alert_category"))
    conn.execute(sa.text("DROP TYPE IF EXISTS alert_severity"))
