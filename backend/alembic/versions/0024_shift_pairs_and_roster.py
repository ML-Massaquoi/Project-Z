"""Add shift_pairs, shift_pair_members, roster_snapshots, roster_entries

Revision ID: 0024
Revises: 0023
Create Date: 2026-06-20
"""

from alembic import op
import sqlalchemy as sa

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── roster_assignment_type enum ────────────────────────────
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE roster_assignment_type AS ENUM
                ('DAY','NIGHT','OFF','LEAVE','ABSENT','HOLIDAY','ADMIN');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """))

    # ── shift_pairs ────────────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS shift_pairs (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            department_id        UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
            protocol_id          UUID NOT NULL REFERENCES shift_protocols(id) ON DELETE RESTRICT,
            name                 VARCHAR(50)  NOT NULL,
            rotation_start_date  DATE         NOT NULL,
            color                VARCHAR(20),
            notes                TEXT,
            is_active            BOOLEAN      NOT NULL DEFAULT true,
            created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
            CONSTRAINT uq_shift_pair_dept_name UNIQUE (department_id, name)
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_shift_pairs_department_id ON shift_pairs (department_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_shift_pairs_protocol_id   ON shift_pairs (protocol_id)"))

    # ── shift_pair_members ─────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS shift_pair_members (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            pair_id     UUID NOT NULL REFERENCES shift_pairs(id) ON DELETE CASCADE,
            employee_id UUID NOT NULL REFERENCES employees(id)   ON DELETE CASCADE,
            slot_index  INTEGER NOT NULL CHECK (slot_index IN (0, 1)),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_pair_member_slot     UNIQUE (pair_id, slot_index),
            CONSTRAINT uq_pair_member_employee UNIQUE (pair_id, employee_id)
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_shift_pair_members_pair_id     ON shift_pair_members (pair_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_shift_pair_members_employee_id ON shift_pair_members (employee_id)"))

    # ── roster_snapshots ───────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS roster_snapshots (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
            department_name VARCHAR(255) NOT NULL,
            year            INTEGER     NOT NULL,
            month           INTEGER     NOT NULL,
            generated_at    TIMESTAMPTZ NOT NULL,
            generated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
            notes           TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_roster_snapshot_dept_ym UNIQUE (department_id, year, month)
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_roster_snapshots_department_id ON roster_snapshots (department_id)"))

    # ── roster_entries ─────────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS roster_entries (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            snapshot_id      UUID NOT NULL REFERENCES roster_snapshots(id) ON DELETE CASCADE,
            employee_id      UUID NOT NULL REFERENCES employees(id)        ON DELETE CASCADE,
            employee_code    VARCHAR(50)  NOT NULL,
            employee_name    VARCHAR(255) NOT NULL,
            department_name  VARCHAR(255) NOT NULL,
            entry_date       DATE         NOT NULL,
            assignment       roster_assignment_type NOT NULL,
            pair_id          UUID REFERENCES shift_pairs(id) ON DELETE SET NULL,
            pair_name        VARCHAR(50),
            shift_start      VARCHAR(5),
            shift_end        VARCHAR(5),
            is_overridden    BOOLEAN NOT NULL DEFAULT false,
            override_reason  VARCHAR(255),
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_roster_entry_snap_emp_date UNIQUE (snapshot_id, employee_id, entry_date)
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_roster_entries_snapshot_id  ON roster_entries (snapshot_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_roster_entries_employee_id  ON roster_entries (employee_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_roster_entries_entry_date   ON roster_entries (entry_date)"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS roster_entries"))
    conn.execute(sa.text("DROP TABLE IF EXISTS roster_snapshots"))
    conn.execute(sa.text("DROP TABLE IF EXISTS shift_pair_members"))
    conn.execute(sa.text("DROP TABLE IF EXISTS shift_pairs"))
    conn.execute(sa.text("DROP TYPE  IF EXISTS roster_assignment_type"))
