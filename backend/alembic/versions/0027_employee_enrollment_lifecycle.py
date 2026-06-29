"""Phase 1 + 3-6: Employee Master Registry, Enrollment Sessions, Face Templates, Status Lifecycle

Revision ID: 0027
Revises: 0026
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def column_exists(table, column):
    conn = op.get_bind()
    result = conn.execute(
        sa.text(f"SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='{table}' AND column_name='{column}')")
    )
    return result.scalar()


def table_exists(table):
    conn = op.get_bind()
    result = conn.execute(
        sa.text(f"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='{table}')")
    )
    return result.scalar()


def enum_value_exists(enum_name, value):
    conn = op.get_bind()
    result = conn.execute(
        sa.text(f"SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='{value}' AND enumtypid=(SELECT oid FROM pg_type WHERE typname='{enum_name}'))")
    )
    return result.scalar()


def upgrade() -> None:
    # ── Employee Registry Enhancement (idempotent) ────────────
    employee_cols = [
        ("first_name", "VARCHAR(100)"),
        ("last_name", "VARCHAR(100)"),
        ("middle_name", "VARCHAR(100)"),
        ("gender", "VARCHAR(20)"),
        ("date_joined", "DATE"),
        ("employment_type", "VARCHAR(30) DEFAULT 'full_time'"),
        ("employee_number", "VARCHAR(50)"),
        ("termination_date", "DATE"),
        ("status_changed_at", "TIMESTAMP WITH TIME ZONE"),
        ("status_changed_by", "UUID"),
    ]
    for col_name, col_def in employee_cols:
        if not column_exists("employees", col_name):
            op.execute(f"ALTER TABLE employees ADD COLUMN {col_name} {col_def}")

    # Add unique index on employee_number if not exists
    conn = op.get_bind()
    has_idx = conn.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='ix_employees_employee_number')")
    ).scalar()
    if not has_idx:
        op.execute("CREATE UNIQUE INDEX ix_employees_employee_number ON employees (employee_number) WHERE employee_number IS NOT NULL")

    # Backfill employee_number from employee_code
    op.execute("UPDATE employees SET employee_number = employee_code WHERE employee_number IS NULL")

    # Backfill first_name/last_name from full_name
    op.execute("""
        UPDATE employees
        SET first_name = CASE WHEN position(' ' in full_name) > 0 THEN split_part(full_name, ' ', 1) ELSE full_name END,
            last_name = CASE WHEN position(' ' in full_name) > 0 THEN trim(substring(full_name from position(' ' in full_name) + 1)) ELSE '' END
        WHERE first_name IS NULL
    """)

    # ── Employee Status Lifecycle (idempotent) ─────────────────
    for val in ["pending_enrollment", "enrolled", "transferred", "retired"]:
        if not enum_value_exists("employee_status", val):
            op.execute(f"ALTER TYPE employee_status ADD VALUE IF NOT EXISTS '{val}'")

    # ── Status Transition Log ──────────────────────────────────
    if not table_exists("employee_status_transitions"):
        op.create_table(
            "employee_status_transitions",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("from_status", sa.String(30), nullable=True),
            sa.Column("to_status", sa.String(30), nullable=False),
            sa.Column("reason", sa.Text, nullable=True),
            sa.Column("changed_by_user_id", UUID(as_uuid=True), nullable=True),
            sa.Column("changed_by_username", sa.String(100), nullable=True),
            sa.Column("ip_address", sa.String(45), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    # ── Enrollment Sessions ────────────────────────────────────
    if not table_exists("enrollment_sessions"):
        op.create_table(
            "enrollment_sessions",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("device_id", UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("status", sa.String(30), nullable=False, server_default="waiting_for_fingerprint", index=True),
            sa.Column("fingerprint_status", sa.String(30), nullable=False, server_default="pending"),
            sa.Column("face_status", sa.String(30), nullable=False, server_default="pending"),
            sa.Column("fingerprint_template_count", sa.Integer, nullable=False, server_default="0"),
            sa.Column("face_template_count", sa.Integer, nullable=False, server_default="0"),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("started_by_user_id", UUID(as_uuid=True), nullable=True),
            sa.Column("started_by_username", sa.String(100), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("fingerprint_captured_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("face_captured_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("metadata", JSONB, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    # ── Face Templates ─────────────────────────────────────────
    if not table_exists("face_templates"):
        op.create_table(
            "face_templates",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("device_id", UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("enrollment_session_id", UUID(as_uuid=True), sa.ForeignKey("enrollment_sessions.id", ondelete="SET NULL"), nullable=True),
            sa.Column("template_data", sa.LargeBinary, nullable=True),
            sa.Column("template_size", sa.Integer, nullable=True, server_default="0"),
            sa.Column("template_hash", sa.String(64), nullable=True),
            sa.Column("face_image", sa.LargeBinary, nullable=True),
            sa.Column("face_version", sa.Integer, nullable=True, server_default="1"),
            sa.Column("quality_score", sa.Float, nullable=True),
            sa.Column("sync_status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_face_templates_employee_active", "face_templates", ["employee_id", "is_active"])

    # ── Enrollment Events ──────────────────────────────────────
    if not table_exists("enrollment_events"):
        op.create_table(
            "enrollment_events",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("enrollment_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
            sa.Column("device_id", UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
            sa.Column("event_type", sa.String(30), nullable=False, index=True),
            sa.Column("biometric_type", sa.String(20), nullable=False),
            sa.Column("details", JSONB, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    if table_exists("enrollment_events"):
        op.drop_table("enrollment_events")
    if table_exists("face_templates"):
        op.drop_index("ix_face_templates_employee_active")
        op.drop_table("face_templates")
    if table_exists("enrollment_sessions"):
        op.drop_table("enrollment_sessions")
    if table_exists("employee_status_transitions"):
        op.drop_table("employee_status_transitions")

    for col in ["first_name", "last_name", "middle_name", "gender", "date_joined",
                "employment_type", "employee_number", "termination_date",
                "status_changed_at", "status_changed_by"]:
        if column_exists("employees", col):
            op.drop_column("employees", col)
