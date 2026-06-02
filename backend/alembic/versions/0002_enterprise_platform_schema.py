"""Enterprise platform schema — scan_events, shift_templates, leave, holidays, summaries

Revision ID: 0002_enterprise_platform_schema
Revises: 0001_initial_schema
Create Date: 2025-01-02 00:00:00.000000
"""

from datetime import date, timedelta

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "0002_enterprise_platform_schema"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None

# Pre-define enum types with create_type=False so SQLAlchemy never tries
# to CREATE them — we handle that manually below with DO blocks.
scan_result_enum = postgresql.ENUM(
    "successful", "duplicate", "unknown_user", "unknown_device",
    "rejected", "movement", "retry",
    name="scan_result", create_type=False
)
processing_status_v2_enum = postgresql.ENUM(
    "pending", "queued", "queued_offline", "processing",
    "processed", "failed", "failed_permanent", "out_of_window",
    name="processing_status_v2", create_type=False
)
verification_method_enum = postgresql.ENUM(
    "fingerprint", "face", "card", "password", "other",
    name="verification_method", create_type=False
)
leave_type_enum = postgresql.ENUM(
    "annual", "sick", "maternity", "paternity", "unpaid", "emergency",
    name="leave_type", create_type=False
)
leave_status_enum = postgresql.ENUM(
    "pending", "approved", "rejected",
    name="leave_status", create_type=False
)
holiday_type_enum = postgresql.ENUM(
    "public", "organizational", "departmental",
    name="holiday_type", create_type=False
)
holiday_scope_enum = postgresql.ENUM(
    "organization", "department",
    name="holiday_scope", create_type=False
)
employment_type_enum = postgresql.ENUM(
    "permanent", "contract", "casual",
    name="employment_type", create_type=False
)


def _make_partition_bounds(year: int, month: int) -> tuple[str, str]:
    """Return (start, end) date strings for a monthly partition."""
    start = date(year, month, 1)
    # First day of next month
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def upgrade() -> None:
    # ── EXTENSIONS ───────────────────────────────────────────
    # btree_gist is required for the EXCLUDE constraint on department_shift_rules
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist;")

    # ── ENUMS ────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE scan_result AS ENUM (
                'successful', 'duplicate', 'unknown_user',
                'unknown_device', 'rejected', 'movement', 'retry'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE processing_status_v2 AS ENUM (
                'pending', 'queued', 'queued_offline', 'processing',
                'processed', 'failed', 'failed_permanent', 'out_of_window'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE verification_method AS ENUM (
                'fingerprint', 'face', 'card', 'password', 'other'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE leave_type AS ENUM (
                'annual', 'sick', 'maternity', 'paternity', 'unpaid', 'emergency'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE holiday_type AS ENUM ('public', 'organizational', 'departmental');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE holiday_scope AS ENUM ('organization', 'department');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE employment_type AS ENUM ('permanent', 'contract', 'casual');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # ── scan_events (partitioned by RANGE on scan_timestamp) ─
    # We use raw SQL for the partitioned table because SQLAlchemy's op.create_table
    # does not support PARTITION BY natively.
    op.execute("""
        CREATE TABLE IF NOT EXISTS scan_events (
            id                    UUID         NOT NULL DEFAULT gen_random_uuid(),
            employee_id           UUID         REFERENCES employees(id) ON DELETE SET NULL,
            employee_code         VARCHAR(50)  NOT NULL DEFAULT 'UNKNOWN',
            employee_name         VARCHAR(255),
            department_id         UUID         REFERENCES departments(id) ON DELETE SET NULL,
            department_name       VARCHAR(255) NOT NULL DEFAULT 'Unassigned',
            office_id             UUID         REFERENCES offices(id) ON DELETE SET NULL,
            office_name           VARCHAR(255) NOT NULL DEFAULT 'Unassigned',
            device_id             UUID         REFERENCES devices(id) ON DELETE SET NULL,
            device_name           VARCHAR(255) NOT NULL DEFAULT 'Unknown Device',
            device_serial         VARCHAR(100) NOT NULL,
            verification_method   verification_method NOT NULL DEFAULT 'fingerprint',
            scan_result           scan_result  NOT NULL,
            raw_punch_state       SMALLINT     NOT NULL DEFAULT 0,
            raw_payload           JSONB        NOT NULL DEFAULT '{}',
            scan_timestamp        TIMESTAMPTZ  NOT NULL,
            processing_status     processing_status_v2 NOT NULL DEFAULT 'pending',
            websocket_broadcasted BOOLEAN      NOT NULL DEFAULT FALSE,
            latitude              NUMERIC(10,7),
            longitude             NUMERIC(10,7),
            created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
            PRIMARY KEY (id, scan_timestamp)
        ) PARTITION BY RANGE (scan_timestamp);
    """)

    # Indexes on the parent table (inherited by all partitions)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_scan_events_scan_timestamp
            ON scan_events (scan_timestamp DESC);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_scan_events_employee_scan
            ON scan_events (employee_id, scan_timestamp DESC);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_scan_events_device_scan
            ON scan_events (device_id, scan_timestamp DESC);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_scan_events_department_scan
            ON scan_events (department_id, scan_timestamp DESC);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_scan_events_processing_status
            ON scan_events (processing_status);
    """)

    # Create initial partitions: current month + next 2 months
    today = date.today()
    for offset in range(3):
        # Advance by 'offset' months
        month = today.month + offset
        year = today.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        start, end = _make_partition_bounds(year, month)
        partition_name = f"scan_events_{year}_{month:02d}"
        op.execute(f"""
            CREATE TABLE IF NOT EXISTS {partition_name}
                PARTITION OF scan_events
                FOR VALUES FROM ('{start}') TO ('{end}');
        """)

    # ── shift_templates ───────────────────────────────────────
    op.create_table(
        "shift_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("checkin_window_start", sa.Time, nullable=False),
        sa.Column("checkin_window_end", sa.Time, nullable=False),
        sa.Column("checkout_window_start", sa.Time, nullable=False),
        sa.Column("checkout_window_end", sa.Time, nullable=False),
        sa.Column("grace_period_minutes", sa.Integer, nullable=False, server_default="15"),
        sa.Column("break_duration_minutes", sa.Integer, nullable=False, server_default="60"),
        sa.Column("working_hours", sa.Numeric(4, 2), nullable=False, server_default="8.0"),
        sa.Column("is_overnight", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_shift_templates_code"),
        sa.CheckConstraint(
            "grace_period_minutes BETWEEN 0 AND 120",
            name="chk_shift_templates_grace_period"
        ),
        sa.CheckConstraint(
            "break_duration_minutes BETWEEN 0 AND 480",
            name="chk_shift_templates_break_duration"
        ),
        sa.CheckConstraint(
            "working_hours BETWEEN 0.0 AND 24.0",
            name="chk_shift_templates_working_hours"
        ),
    )
    op.create_index("ix_shift_templates_code", "shift_templates", ["code"])
    op.create_index("ix_shift_templates_is_active", "shift_templates", ["is_active"])

    # ── department_shift_rules ────────────────────────────────
    op.create_table(
        "department_shift_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("department_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("departments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shift_template_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("shift_templates.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("effective_from", sa.Date, nullable=False),
        sa.Column("effective_to", sa.Date, nullable=True),
        sa.Column("weekend_days", postgresql.ARRAY(sa.Integer), nullable=False,
                  server_default="{}"),
        sa.Column("grace_period_override", sa.Integer, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint(
            "grace_period_override IS NULL OR grace_period_override BETWEEN 0 AND 120",
            name="chk_dept_shift_rules_grace_override"
        ),
    )
    op.create_index("ix_dept_shift_rules_dept", "department_shift_rules", ["department_id"])
    op.create_index("ix_dept_shift_rules_dates", "department_shift_rules",
                    ["effective_from", "effective_to"])

    # EXCLUDE constraint requires btree_gist — added via raw SQL
    op.execute("""
        ALTER TABLE department_shift_rules
            ADD CONSTRAINT excl_dept_shift_rules_no_overlap
            EXCLUDE USING gist (
                department_id WITH =,
                daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
            );
    """)

    # ── employee_shift_assignments ────────────────────────────
    op.create_table(
        "employee_shift_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shift_template_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("shift_templates.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("rotation_templates", postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
                  nullable=False, server_default="{}"),
        sa.Column("rotation_start_date", sa.Date, nullable=True),
        sa.Column("grace_period_override", sa.Integer, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint(
            "grace_period_override IS NULL OR grace_period_override BETWEEN 0 AND 120",
            name="chk_emp_shift_assignments_grace_override"
        ),
        sa.CheckConstraint(
            "(shift_template_id IS NOT NULL AND array_length(rotation_templates, 1) IS NULL)"
            " OR "
            "(shift_template_id IS NULL AND array_length(rotation_templates, 1) >= 2)",
            name="chk_assignment_type"
        ),
    )
    op.create_index("ix_emp_shift_assignments_employee", "employee_shift_assignments",
                    ["employee_id"])

    # ── employee_shift_overrides ──────────────────────────────
    op.create_table(
        "employee_shift_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shift_template_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("shift_templates.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint("end_date >= start_date", name="chk_shift_overrides_date_range"),
    )
    op.create_index("ix_emp_shift_overrides_employee", "employee_shift_overrides",
                    ["employee_id"])
    op.create_index("ix_emp_shift_overrides_dates", "employee_shift_overrides",
                    ["start_date", "end_date"])

    # ── attendance_sessions — extend existing table ───────────
    # Add shift_date (copy from existing 'date' column)
    op.add_column(
        "attendance_sessions",
        sa.Column("shift_date", sa.Date, nullable=True),
    )
    # Populate shift_date from the existing 'date' column
    op.execute("UPDATE attendance_sessions SET shift_date = date WHERE shift_date IS NULL;")

    # Add shift context columns
    op.add_column(
        "attendance_sessions",
        sa.Column("shift_template_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "attendance_sessions",
        sa.Column("shift_name", sa.String(100), nullable=True),
    )
    op.add_column(
        "attendance_sessions",
        sa.Column("early_minutes", sa.Numeric(6, 1), nullable=True, server_default="0"),
    )
    op.add_column(
        "attendance_sessions",
        sa.Column("checkout_status", sa.String(30), nullable=True),
    )

    # Unique index: one session per employee per shift_date (idempotent)
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_sessions_employee_shift_date"
        " ON attendance_sessions (employee_id, shift_date)"
    )

    # Indexes on new columns
    op.create_index("ix_attendance_sessions_shift_date", "attendance_sessions", ["shift_date"])
    op.create_index("ix_attendance_sessions_status", "attendance_sessions", ["status"])

    # FK from attendance_sessions.shift_template_id → shift_templates.id
    op.create_foreign_key(
        "fk_attendance_sessions_shift_template",
        "attendance_sessions",
        "shift_templates",
        ["shift_template_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ── attendance_summaries ──────────────────────────────────
    op.create_table(
        "attendance_summaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("department_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("departments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department_name", sa.String(255), nullable=False),
        sa.Column("summary_date", sa.Date, nullable=False),
        sa.Column("expected_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("present_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("late_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("absent_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("on_leave_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("vacation_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("overtime_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("on_shift_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.UniqueConstraint("department_id", "summary_date",
                            name="uq_attendance_summaries_dept_date"),
    )
    op.create_index("ix_attendance_summaries_date", "attendance_summaries", ["summary_date"])
    op.create_index("ix_attendance_summaries_dept_date", "attendance_summaries",
                    ["department_id", "summary_date"])

    # ── holiday_calendar ──────────────────────────────────────
    op.create_table(
        "holiday_calendar",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("holiday_type", holiday_type_enum, nullable=False,
                  server_default="public"),
        sa.Column("scope", holiday_scope_enum, nullable=False,
                  server_default="organization"),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("departments.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint(
            "(scope = 'department' AND department_id IS NOT NULL)"
            " OR (scope = 'organization' AND department_id IS NULL)",
            name="chk_dept_scope"
        ),
    )
    op.create_index("ix_holiday_calendar_date", "holiday_calendar", ["date"])
    op.create_index("ix_holiday_calendar_org_date", "holiday_calendar",
                    ["organization_id", "date"])

    # ── leave_requests ────────────────────────────────────────
    op.create_table(
        "leave_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("leave_type", leave_type_enum, nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("status", leave_status_enum, nullable=False, server_default="pending"),
        sa.Column("approver_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint("end_date >= start_date", name="chk_leave_requests_date_range"),
    )
    op.create_index("ix_leave_requests_employee", "leave_requests", ["employee_id"])
    op.create_index("ix_leave_requests_dates", "leave_requests", ["start_date", "end_date"])
    op.create_index("ix_leave_requests_status", "leave_requests", ["status"])

    # ── employees — extend with employment_type ───────────────
    op.add_column(
        "employees",
        sa.Column("employment_type", employment_type_enum, nullable=True,
                  server_default="permanent"),
    )


def downgrade() -> None:
    # ── employees — remove employment_type ───────────────────
    op.drop_column("employees", "employment_type")

    # ── leave_requests ────────────────────────────────────────
    op.drop_index("ix_leave_requests_status", table_name="leave_requests")
    op.drop_index("ix_leave_requests_dates", table_name="leave_requests")
    op.drop_index("ix_leave_requests_employee", table_name="leave_requests")
    op.drop_table("leave_requests")

    # ── holiday_calendar ──────────────────────────────────────
    op.drop_index("ix_holiday_calendar_org_date", table_name="holiday_calendar")
    op.drop_index("ix_holiday_calendar_date", table_name="holiday_calendar")
    op.drop_table("holiday_calendar")

    # ── attendance_summaries ──────────────────────────────────
    op.drop_index("ix_attendance_summaries_dept_date", table_name="attendance_summaries")
    op.drop_index("ix_attendance_summaries_date", table_name="attendance_summaries")
    op.drop_table("attendance_summaries")

    # ── attendance_sessions — remove added columns ────────────
    # Drop FK constraint first (must precede column drop)
    op.drop_constraint(
        "fk_attendance_sessions_shift_template",
        "attendance_sessions",
        type_="foreignkey",
    )
    # Drop unique index on (employee_id, shift_date)
    op.execute(
        "DROP INDEX IF EXISTS uq_attendance_sessions_employee_shift_date"
    )
    # Drop indexes created with op.create_index
    op.drop_index("ix_attendance_sessions_status", table_name="attendance_sessions")
    op.drop_index("ix_attendance_sessions_shift_date", table_name="attendance_sessions")
    op.drop_column("attendance_sessions", "checkout_status")
    op.drop_column("attendance_sessions", "early_minutes")
    op.drop_column("attendance_sessions", "shift_name")
    op.drop_column("attendance_sessions", "shift_template_id")
    op.drop_column("attendance_sessions", "shift_date")

    # ── employee_shift_overrides ──────────────────────────────
    op.drop_index("ix_emp_shift_overrides_dates", table_name="employee_shift_overrides")
    op.drop_index("ix_emp_shift_overrides_employee", table_name="employee_shift_overrides")
    op.drop_table("employee_shift_overrides")

    # ── employee_shift_assignments ────────────────────────────
    op.drop_index("ix_emp_shift_assignments_employee", table_name="employee_shift_assignments")
    op.drop_table("employee_shift_assignments")

    # ── department_shift_rules ────────────────────────────────
    op.drop_index("ix_dept_shift_rules_dates", table_name="department_shift_rules")
    op.drop_index("ix_dept_shift_rules_dept", table_name="department_shift_rules")
    op.drop_table("department_shift_rules")

    # ── shift_templates ───────────────────────────────────────
    op.drop_index("ix_shift_templates_is_active", table_name="shift_templates")
    op.drop_index("ix_shift_templates_code", table_name="shift_templates")
    op.drop_table("shift_templates")

    # ── scan_events (partitioned — drop parent cascades to partitions) ──
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE indexname = 'ix_scan_events_processing_status'
            ) THEN
                DROP INDEX ix_scan_events_processing_status;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE indexname = 'ix_scan_events_department_scan'
            ) THEN
                DROP INDEX ix_scan_events_department_scan;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE indexname = 'ix_scan_events_device_scan'
            ) THEN
                DROP INDEX ix_scan_events_device_scan;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE indexname = 'ix_scan_events_employee_scan'
            ) THEN
                DROP INDEX ix_scan_events_employee_scan;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE indexname = 'ix_scan_events_scan_timestamp'
            ) THEN
                DROP INDEX ix_scan_events_scan_timestamp;
            END IF;
        END $$;
    """)
    op.execute("DROP TABLE IF EXISTS scan_events CASCADE;")

    # ── ENUMS ────────────────────────────────────────────────
    op.execute("DROP TYPE IF EXISTS employment_type;")
    op.execute("DROP TYPE IF EXISTS holiday_scope;")
    op.execute("DROP TYPE IF EXISTS holiday_type;")
    op.execute("DROP TYPE IF EXISTS leave_status;")
    op.execute("DROP TYPE IF EXISTS leave_type;")
    op.execute("DROP TYPE IF EXISTS verification_method;")
    op.execute("DROP TYPE IF EXISTS processing_status_v2;")
    op.execute("DROP TYPE IF EXISTS scan_result;")
