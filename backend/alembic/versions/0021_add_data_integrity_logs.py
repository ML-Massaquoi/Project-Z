"""Add data_integrity_logs table for consistency check tracking

Revision ID: 0021
Revises: 0020
Create Date: 2026-06-19 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE integrity_check_category AS ENUM
                ('scan_session','session_invariant','summary_drift','orphan_record','stuck_pipeline','daily_report','general');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """))

    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE integrity_check_severity AS ENUM ('info','warning','error','critical');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS data_integrity_logs (
            id                   UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
            check_category       integrity_check_category NOT NULL,
            severity             integrity_check_severity NOT NULL,
            check_name           VARCHAR(200) NOT NULL,
            message              TEXT         NOT NULL,
            affected_count       INTEGER      NOT NULL DEFAULT 0,
            affected_entity_type VARCHAR(100),
            affected_ids         JSONB,
            resolved             BOOLEAN      NOT NULL DEFAULT false,
            resolved_at          TIMESTAMPTZ,
            resolved_by          VARCHAR(100),
            resolution_note      TEXT,
            run_by               VARCHAR(100),
            run_id               VARCHAR(100),
            created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """))

    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_data_integrity_logs_check_category ON data_integrity_logs (check_category)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_data_integrity_logs_severity       ON data_integrity_logs (severity)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_data_integrity_logs_run_id         ON data_integrity_logs (run_id)"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS data_integrity_logs"))
    conn.execute(sa.text("DROP TYPE  IF EXISTS integrity_check_severity"))
    conn.execute(sa.text("DROP TYPE  IF EXISTS integrity_check_category"))
