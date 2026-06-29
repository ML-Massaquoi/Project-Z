"""Add backup_jobs table

Revision ID: 0022
Revises: 0021
Create Date: 2026-06-19
"""

from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE backupstatus AS ENUM ('pending','running','completed','failed','expired');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """))

    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE backuptype AS ENUM ('full','schema_only','data_only');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS backup_jobs (
            id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            status            backupstatus NOT NULL DEFAULT 'pending',
            backup_type       backuptype   NOT NULL DEFAULT 'full',
            file_name         VARCHAR(512),
            file_path         VARCHAR(1024),
            file_size_bytes   BIGINT,
            checksum_sha256   VARCHAR(128),
            database_name     VARCHAR(256),
            duration_seconds  INTEGER,
            error_message     TEXT,
            init_by           VARCHAR(256) NOT NULL DEFAULT 'scheduler',
            scheduled_at      TIMESTAMPTZ,
            started_at        TIMESTAMPTZ,
            completed_at      TIMESTAMPTZ,
            expires_at        TIMESTAMPTZ,
            extra_metadata    JSONB,
            created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """))

    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_backup_jobs_status     ON backup_jobs (status)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_backup_jobs_expires_at ON backup_jobs (expires_at)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_backup_jobs_created_at ON backup_jobs (created_at)"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS backup_jobs"))
    conn.execute(sa.text("DROP TYPE  IF EXISTS backupstatus"))
    conn.execute(sa.text("DROP TYPE  IF EXISTS backuptype"))
