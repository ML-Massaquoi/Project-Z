"""Add scheduling engine tables and columns

Revision ID: 0031
Revises: 0030
Create Date: 2026-07-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── Add columns to shift_templates ──────────────────────────
    conn.execute(sa.text(
        "ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS "
        "shift_type VARCHAR(20) DEFAULT 'day'"
    ))
    conn.execute(sa.text(
        "ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS "
        "color VARCHAR(20) DEFAULT '#3B82F6'"
    ))

    # ── Add column to employees ──────────────────────────────────
    conn.execute(sa.text(
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS "
        "rotation_offset INTEGER DEFAULT 0"
    ))

    # ── Add columns to shift_protocols ───────────────────────────
    conn.execute(sa.text(
        "ALTER TABLE shift_protocols ADD COLUMN IF NOT EXISTS "
        "cycle_length INTEGER"
    ))
    conn.execute(sa.text(
        "ALTER TABLE shift_protocols ADD COLUMN IF NOT EXISTS "
        "default_shift_supervisor VARCHAR(255)"
    ))

    # ── shift_protocol_steps ─────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS shift_protocol_steps (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            protocol_id       UUID NOT NULL REFERENCES shift_protocols(id) ON DELETE CASCADE,
            shift_template_id UUID REFERENCES shift_templates(id) ON DELETE SET NULL,
            step_order        INTEGER NOT NULL DEFAULT 0,
            step_type         VARCHAR(20) NOT NULL DEFAULT 'work',
            label             VARCHAR(50),
            duration_days     INTEGER NOT NULL DEFAULT 1
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_shift_protocol_steps_protocol_id "
        "ON shift_protocol_steps (protocol_id)"
    ))
    conn.execute(sa.text(
        "COMMENT ON TABLE shift_protocol_steps IS "
        "'Individual steps within a shift protocol cycle'"
    ))

    # ── department_protocols ─────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS department_protocols (
            id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            department_id      UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
            protocol_id        UUID NOT NULL REFERENCES shift_protocols(id) ON DELETE RESTRICT,
            effective_date     DATE NOT NULL,
            end_date           DATE,
            default_supervisor VARCHAR(255),
            notes              TEXT,
            created_by         UUID
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_department_protocols_department_id "
        "ON department_protocols (department_id)"
    ))
    conn.execute(sa.text(
        "COMMENT ON TABLE department_protocols IS "
        "'Assigns shift protocols to departments with effective date ranges'"
    ))

    # ── shift_swap_requests ──────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS shift_swap_requests (
            id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            requester_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            target_id          UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            swap_date          DATE NOT NULL,
            requester_shift_id UUID REFERENCES shift_templates(id) ON DELETE SET NULL,
            target_shift_id    UUID REFERENCES shift_templates(id) ON DELETE SET NULL,
            reason             TEXT,
            status             VARCHAR(20) NOT NULL DEFAULT 'pending',
            reviewed_by        UUID,
            reviewed_at        DATE,
            notes              TEXT
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_shift_swap_requests_requester_id "
        "ON shift_swap_requests (requester_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_shift_swap_requests_swap_date "
        "ON shift_swap_requests (swap_date)"
    ))
    conn.execute(sa.text(
        "COMMENT ON TABLE shift_swap_requests IS "
        "'Employee-initiated shift swap requests subject to approval'"
    ))

    # ── roster_publications ──────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS roster_publications (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
            year            INTEGER NOT NULL,
            month           INTEGER NOT NULL,
            version         INTEGER NOT NULL DEFAULT 1,
            status          VARCHAR(20) NOT NULL DEFAULT 'draft',
            published_at    TIMESTAMPTZ,
            published_by    UUID,
            locked_at       TIMESTAMPTZ,
            locked_by       UUID,
            notes           VARCHAR(500)
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_roster_publications_department_id "
        "ON roster_publications (department_id)"
    ))
    conn.execute(sa.text(
        "COMMENT ON TABLE roster_publications IS "
        "'Published monthly roster versions per department'"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS roster_publications"))
    conn.execute(sa.text("DROP TABLE IF EXISTS shift_swap_requests"))
    conn.execute(sa.text("DROP TABLE IF EXISTS department_protocols"))
    conn.execute(sa.text("DROP TABLE IF EXISTS shift_protocol_steps"))
    op.drop_column("shift_protocols", "default_shift_supervisor")
    op.drop_column("shift_protocols", "cycle_length")
    op.drop_column("employees", "rotation_offset")
    op.drop_column("shift_templates", "color")
    op.drop_column("shift_templates", "shift_type")
