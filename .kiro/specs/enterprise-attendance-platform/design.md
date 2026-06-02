# Design Document

## Enterprise Workforce Operations Platform — Freetown International Airport

---

## Overview

This document describes the technical design for redesigning the existing biometric attendance system into a production-grade **Enterprise Workforce Operations Platform**. The redesign introduces a strict four-layer architecture that permanently separates raw biometric event ingestion from attendance interpretation, adds a fully shift-aware and department-aware attendance engine, rotating and cross-midnight shift support, real-time live monitoring, and deep department analytics.

### Design Goals

- **Zero scan loss**: Every biometric event is stored before any other processing occurs.
- **Non-blocking ingestion**: The ADMS HTTP path never waits for attendance computation.
- **Shift-aware correctness**: 14 attendance statuses computed with 4-level precedence resolution.
- **Real-time visibility**: Sub-2-second WebSocket delivery of all operational events.
- **Long-term scalability**: Monthly-partitioned `scan_events` table with archival strategy.

### Technology Stack (Existing — Unchanged)

- **Backend**: FastAPI + SQLAlchemy async + asyncpg + PostgreSQL 16
- **Queue**: Redis 7 — extended from pub/sub to Redis Streams
- **Migrations**: Alembic
- **Frontend**: React + TanStack Query + Zustand + WebSocket hook
- **Deployment**: Docker Compose

---

## Architecture

The platform is organized into four strictly ordered layers. Data flows downward; no layer reaches upward.

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Raw Scan Ingestion                                    │
│  ADMS HTTP push → scan_events (append-only) → respond "OK"     │
└────────────────────────────┬────────────────────────────────────┘
                             │ fire-and-forget (async)
          ┌──────────────────┴──────────────────┐
          ▼                                     ▼
┌─────────────────────┐             ┌───────────────────────────┐
│  Layer 2: WebSocket │             │  Redis Stream             │
│  Broadcast          │             │  projectz:attendance_tasks│
│  scan_event         │             └──────────────┬────────────┘
│  unknown_user_alert │                            │
│  device_status_upd  │             ┌──────────────▼────────────┐
└─────────────────────┘             │  Layer 3: Background      │
                                    │  Attendance Processing    │
                                    │  (consumer group)         │
                                    └──────────────┬────────────┘
                                                   │
                          ┌────────────────────────┴──────────────┐
                          ▼                                        ▼
               ┌──────────────────────┐              ┌────────────────────┐
               │  attendance_sessions │              │  Layer 4: Analytics│
               │  (upsert per shift)  │              │  attendance_summaries│
               └──────────────────────┘              └────────────────────┘
                          │
                          ▼
               WebSocket: attendance_update
                          department_summary_update
                          late_alert
```

### Layer Responsibilities

| Layer | Responsibility | Blocking? |
|-------|---------------|-----------|
| 1 — Ingestion | Store scan, respond OK | Synchronous, must complete < 100ms |
| 2 — Broadcast | WebSocket fan-out via Redis pub/sub | Fire-and-forget |
| 3 — Processing | Shift resolution, status computation, session upsert | Async consumer |
| 4 — Analytics | Pre-compute department summaries | Triggered by Layer 3 |


---

## Components and Interfaces

### Component Map

```
backend/app/
├── api/
│   ├── v1/
│   │   ├── adms.py              ← Layer 1: ADMS ingestion endpoint (refactored)
│   │   ├── scan_events.py       ← NEW: scan_events feed endpoint
│   │   ├── analytics.py         ← NEW: department summary endpoints
│   │   ├── reports.py           ← NEW: all report endpoints
│   │   ├── leave_requests.py    ← NEW: leave CRUD
│   │   ├── shift_templates.py   ← NEW: shift template CRUD
│   │   ├── dept_shift_rules.py  ← NEW: department shift rule CRUD
│   │   └── shift_assignments.py ← NEW: employee shift assignment CRUD
│   └── websocket.py             ← WebSocket endpoint (extended)
├── models/
│   ├── scan_event.py            ← NEW: ScanEvent model
│   ├── shift_template.py        ← NEW: ShiftTemplate (replaces Shift)
│   ├── dept_shift_rule.py       ← NEW: DepartmentShiftRule
│   ├── shift_assignment.py      ← NEW: EmployeeShiftAssignment
│   ├── shift_override.py        ← NEW: EmployeeShiftOverride
│   ├── attendance_summary.py    ← NEW: AttendanceSummary
│   ├── holiday_calendar.py      ← NEW: HolidayCalendar
│   └── leave_request.py         ← NEW: LeaveRequest
├── services/
│   ├── ingestion_service.py     ← NEW: Layer 1 orchestrator
│   ├── shift_resolver.py        ← NEW: 4-level shift resolution
│   ├── attendance_engine_v2.py  ← NEW: status computation engine
│   ├── summary_service.py       ← NEW: attendance_summaries updater
│   └── stream_consumer.py       ← NEW: Redis Streams consumer
└── workers/
    ├── attendance_worker.py     ← NEW: consumer group worker process
    ├── offline_recovery.py      ← NEW: queued_offline recovery task
    └── partition_manager.py     ← NEW: monthly partition creator
```

### Key Interface Contracts

**IngestionService.ingest(payload: ADMSPayload) → ScanEvent**
- Stores scan_event row (always)
- Publishes to Redis pub/sub `projectz:ws_events` (fire-and-forget)
- Publishes to Redis stream `projectz:attendance_tasks` (fire-and-forget)
- Returns the stored ScanEvent
- Never raises — all errors are logged and swallowed after storage

**ShiftResolver.resolve(employee_id, date) → ResolvedShift | None**
- Applies 4-level precedence (see Shift Resolution Algorithm section)
- Returns None for unscheduled employees

**AttendanceEngineV2.process(scan_event_id) → AttendanceSession**
- Reads scan_event, resolves shift, evaluates windows, computes status
- Upserts attendance_session
- Triggers summary update
- Publishes attendance_update WebSocket event


---

## Data Models

### New Enum Types

```sql
-- Extend existing attendance_status enum
CREATE TYPE attendance_status_v2 AS ENUM (
    'holiday', 'on_leave', 'vacation', 'weekend_off',
    'absent', 'missed_checkin', 'unscheduled_attendance',
    'present', 'late', 'early_arrival', 'half_day',
    'missed_checkout', 'unknown_shift', 'out_of_window'
);

CREATE TYPE scan_result AS ENUM (
    'successful', 'duplicate', 'unknown_user',
    'unknown_device', 'rejected', 'movement', 'retry'
);

CREATE TYPE processing_status AS ENUM (
    'pending', 'queued', 'queued_offline',
    'processing', 'processed', 'failed',
    'failed_permanent', 'out_of_window'
);

CREATE TYPE verification_method AS ENUM (
    'fingerprint', 'face', 'card', 'password', 'other'
);

CREATE TYPE leave_type AS ENUM (
    'annual', 'sick', 'maternity', 'paternity', 'unpaid', 'emergency'
);

CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE holiday_type AS ENUM ('public', 'organizational', 'departmental');

CREATE TYPE holiday_scope AS ENUM ('organization', 'department');

CREATE TYPE employment_type AS ENUM ('permanent', 'contract', 'casual');
```

### scan_events (Partitioned)

The primary immutable event store. Partitioned by month on `scan_timestamp`.

```sql
CREATE TABLE scan_events (
    id                   UUID         NOT NULL DEFAULT gen_random_uuid(),
    -- Employee context (nullable for unknown users)
    employee_id          UUID         REFERENCES employees(id) ON DELETE SET NULL,
    employee_code        VARCHAR(50)  NOT NULL DEFAULT 'UNKNOWN',
    employee_name        VARCHAR(255),
    department_id        UUID         REFERENCES departments(id) ON DELETE SET NULL,
    department_name      VARCHAR(255) NOT NULL DEFAULT 'Unassigned',
    office_id            UUID         REFERENCES offices(id) ON DELETE SET NULL,
    office_name          VARCHAR(255) NOT NULL DEFAULT 'Unassigned',
    -- Device context
    device_id            UUID         REFERENCES devices(id) ON DELETE SET NULL,
    device_name          VARCHAR(255) NOT NULL DEFAULT 'Unknown Device',
    device_serial        VARCHAR(100) NOT NULL,
    -- Scan data
    verification_method  verification_method NOT NULL DEFAULT 'fingerprint',
    scan_result          scan_result  NOT NULL,
    raw_punch_state      SMALLINT     NOT NULL DEFAULT 0,
    raw_payload          JSONB        NOT NULL DEFAULT '{}',
    scan_timestamp       TIMESTAMPTZ  NOT NULL,
    -- Processing state (only mutable fields)
    processing_status    processing_status NOT NULL DEFAULT 'pending',
    websocket_broadcasted BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Future extensibility
    latitude             NUMERIC(10, 7),
    longitude            NUMERIC(10, 7),
    -- Metadata
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- Partition key must be in PK for declarative partitioning
    PRIMARY KEY (id, scan_timestamp)
) PARTITION BY RANGE (scan_timestamp);

-- Indexes (created on each partition automatically via inheritance)
CREATE INDEX ix_scan_events_scan_timestamp
    ON scan_events (scan_timestamp DESC);
CREATE INDEX ix_scan_events_employee_scan
    ON scan_events (employee_id, scan_timestamp DESC);
CREATE INDEX ix_scan_events_device_scan
    ON scan_events (device_id, scan_timestamp DESC);
CREATE INDEX ix_scan_events_department_scan
    ON scan_events (department_id, scan_timestamp DESC);
CREATE INDEX ix_scan_events_processing_status
    ON scan_events (processing_status);

-- Monthly partition template (created by partition_manager worker)
-- Example: January 2025
CREATE TABLE scan_events_2025_01
    PARTITION OF scan_events
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```


### shift_templates

Replaces the existing `shifts` table. The existing `shifts` table is kept for backward compatibility during migration; `shift_templates` is the authoritative table going forward.

```sql
CREATE TABLE shift_templates (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    VARCHAR(100) NOT NULL,
    code                    VARCHAR(50)  NOT NULL UNIQUE,
    start_time              TIME         NOT NULL,
    end_time                TIME         NOT NULL,
    -- Attendance windows
    checkin_window_start    TIME         NOT NULL,
    checkin_window_end      TIME         NOT NULL,
    checkout_window_start   TIME         NOT NULL,
    checkout_window_end     TIME         NOT NULL,
    -- Grace and working time
    grace_period_minutes    INTEGER      NOT NULL DEFAULT 15
                                CHECK (grace_period_minutes BETWEEN 0 AND 120),
    break_duration_minutes  INTEGER      NOT NULL DEFAULT 60
                                CHECK (break_duration_minutes BETWEEN 0 AND 480),
    working_hours           NUMERIC(4,2) NOT NULL DEFAULT 8.0
                                CHECK (working_hours BETWEEN 0.0 AND 24.0),
    -- Overnight flag
    is_overnight            BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Metadata
    description             VARCHAR(255),
    is_active               BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_shift_templates_code ON shift_templates (code);
CREATE INDEX ix_shift_templates_is_active ON shift_templates (is_active);
```

### department_shift_rules

```sql
CREATE TABLE department_shift_rules (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id           UUID        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    shift_template_id       UUID        NOT NULL REFERENCES shift_templates(id) ON DELETE RESTRICT,
    effective_from          DATE        NOT NULL,
    effective_to            DATE,  -- NULL = open-ended
    weekend_days            INTEGER[]   NOT NULL DEFAULT '{}',
        -- Array of ISO weekday numbers: 1=Mon, 7=Sun
    grace_period_override   INTEGER     CHECK (grace_period_override BETWEEN 0 AND 120),
    notes                   TEXT,
    created_by              UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Prevent overlapping date ranges for same department
    EXCLUDE USING gist (
        department_id WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31'), '[]') WITH &&
    )
);

CREATE INDEX ix_dept_shift_rules_dept ON department_shift_rules (department_id);
CREATE INDEX ix_dept_shift_rules_dates ON department_shift_rules (effective_from, effective_to);
```

### employee_shift_assignments

```sql
CREATE TABLE employee_shift_assignments (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id             UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    -- For simple (non-rotating) assignments: single shift template
    shift_template_id       UUID        REFERENCES shift_templates(id) ON DELETE RESTRICT,
    -- For rotating assignments: ordered list of template IDs + start date
    rotation_templates      UUID[]      DEFAULT '{}',
        -- Ordered array of shift_template IDs; empty = non-rotating
    rotation_start_date     DATE,
        -- Required when rotation_templates is non-empty
    grace_period_override   INTEGER     CHECK (grace_period_override BETWEEN 0 AND 120),
    notes                   TEXT,
    created_by              UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Exactly one of shift_template_id or rotation_templates must be set
    CONSTRAINT chk_assignment_type CHECK (
        (shift_template_id IS NOT NULL AND array_length(rotation_templates, 1) IS NULL)
        OR
        (shift_template_id IS NULL AND array_length(rotation_templates, 1) >= 2)
    )
);

CREATE INDEX ix_emp_shift_assignments_employee ON employee_shift_assignments (employee_id);
```

### employee_shift_overrides

```sql
CREATE TABLE employee_shift_overrides (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id             UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_template_id       UUID        NOT NULL REFERENCES shift_templates(id) ON DELETE RESTRICT,
    start_date              DATE        NOT NULL,
    end_date                DATE        NOT NULL,
    reason                  VARCHAR(255),
    notes                   TEXT,
    created_by              UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date)
);

CREATE INDEX ix_emp_shift_overrides_employee ON employee_shift_overrides (employee_id);
CREATE INDEX ix_emp_shift_overrides_dates ON employee_shift_overrides (start_date, end_date);
```


### attendance_sessions (Extended)

The existing `attendance_sessions` table is extended with new columns. The `date` column is renamed to `shift_date` to clarify it represents the shift's calendar date (critical for overnight shifts).

```sql
-- Extended attendance_sessions schema (migration adds new columns)
CREATE TABLE attendance_sessions (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id             UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_date              DATE        NOT NULL,  -- renamed from 'date'
    -- Shift context (resolved at processing time)
    shift_template_id       UUID        REFERENCES shift_templates(id) ON DELETE SET NULL,
    shift_name              VARCHAR(100),
    -- Timestamps
    check_in                TIMESTAMPTZ,
    check_out               TIMESTAMPTZ,
    check_in_device_id      UUID        REFERENCES devices(id) ON DELETE SET NULL,
    check_out_device_id     UUID        REFERENCES devices(id) ON DELETE SET NULL,
    -- Computed metrics
    duration_minutes        NUMERIC(8,1),
    late_minutes            NUMERIC(6,1) DEFAULT 0,
    early_minutes           NUMERIC(6,1) DEFAULT 0,
    overtime_minutes        NUMERIC(6,1) DEFAULT 0,
    -- Status
    status                  VARCHAR(30)  NOT NULL DEFAULT 'absent',
    checkout_status         VARCHAR(30),  -- 'missed_checkout' when applicable
    is_complete             BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Metadata
    notes                   TEXT,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- One session per employee per shift date
    UNIQUE (employee_id, shift_date)
);

CREATE INDEX ix_attendance_sessions_employee ON attendance_sessions (employee_id);
CREATE INDEX ix_attendance_sessions_shift_date ON attendance_sessions (shift_date);
CREATE INDEX ix_attendance_sessions_status ON attendance_sessions (status);
CREATE INDEX ix_attendance_sessions_dept_date ON attendance_sessions
    (shift_date) INCLUDE (employee_id, status);
```

### attendance_summaries

Pre-computed snapshot table. Never queried via JOIN to `attendance_sessions` at dashboard time.

```sql
CREATE TABLE attendance_summaries (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id           UUID        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    department_name         VARCHAR(255) NOT NULL,
    summary_date            DATE        NOT NULL,
    -- Counts
    expected_count          INTEGER     NOT NULL DEFAULT 0,
    present_count           INTEGER     NOT NULL DEFAULT 0,
    late_count              INTEGER     NOT NULL DEFAULT 0,
    absent_count            INTEGER     NOT NULL DEFAULT 0,
    on_leave_count          INTEGER     NOT NULL DEFAULT 0,
    vacation_count          INTEGER     NOT NULL DEFAULT 0,
    overtime_count          INTEGER     NOT NULL DEFAULT 0,
    on_shift_count          INTEGER     NOT NULL DEFAULT 0,
    -- Metadata
    last_updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (department_id, summary_date)
);

CREATE INDEX ix_attendance_summaries_date ON attendance_summaries (summary_date);
CREATE INDEX ix_attendance_summaries_dept_date ON attendance_summaries (department_id, summary_date);
```

### holiday_calendar

```sql
CREATE TABLE holiday_calendar (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    date                    DATE        NOT NULL,
    name                    VARCHAR(255) NOT NULL,
    holiday_type            holiday_type NOT NULL DEFAULT 'public',
    scope                   holiday_scope NOT NULL DEFAULT 'organization',
    organization_id         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id           UUID        REFERENCES departments(id) ON DELETE CASCADE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_dept_scope CHECK (
        (scope = 'department' AND department_id IS NOT NULL)
        OR (scope = 'organization' AND department_id IS NULL)
    )
);

CREATE INDEX ix_holiday_calendar_date ON holiday_calendar (date);
CREATE INDEX ix_holiday_calendar_org_date ON holiday_calendar (organization_id, date);
```

### leave_requests

```sql
CREATE TABLE leave_requests (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id             UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type              leave_type  NOT NULL,
    start_date              DATE        NOT NULL,
    end_date                DATE        NOT NULL,
    status                  leave_status NOT NULL DEFAULT 'pending',
    approver_id             UUID        REFERENCES users(id) ON DELETE SET NULL,
    reason                  TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date)
);

CREATE INDEX ix_leave_requests_employee ON leave_requests (employee_id);
CREATE INDEX ix_leave_requests_dates ON leave_requests (start_date, end_date);
CREATE INDEX ix_leave_requests_status ON leave_requests (status);
```

### employees (Extended)

```sql
-- Add employment_type column to existing employees table
ALTER TABLE employees
    ADD COLUMN employment_type employment_type DEFAULT 'permanent';
```


### Partitioning Strategy

Monthly partitions are created by the `partition_manager` worker, which runs on the 25th of each month to create the next month's partition.

```python
# workers/partition_manager.py — core logic
async def ensure_next_month_partition(session: AsyncSession):
    """Create next month's scan_events partition if it doesn't exist."""
    today = date.today()
    next_month = today.replace(day=1) + timedelta(days=32)
    next_month = next_month.replace(day=1)
    partition_name = f"scan_events_{next_month.strftime('%Y_%m')}"
    partition_start = next_month.strftime('%Y-%m-%d')
    partition_end = (next_month + timedelta(days=32)).replace(day=1).strftime('%Y-%m-%d')

    await session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {partition_name}
            PARTITION OF scan_events
            FOR VALUES FROM ('{partition_start}') TO ('{partition_end}');
    """))
```

### Archival Strategy

Partitions older than 12 months are moved to `archive` schema:

```sql
-- Run monthly by a scheduled job
ALTER TABLE scan_events DETACH PARTITION scan_events_2024_01;
ALTER TABLE scan_events_2024_01 SET SCHEMA archive;
ALTER TABLE archive.scan_events_2024_01 RENAME TO scan_events_2024_01;
```

---

## Shift Resolution Algorithm

The `ShiftResolver` applies a strict 4-level precedence chain for every `(employee_id, date)` pair.

```
Level 1: Employee_Shift_Override
    WHERE employee_id = ? AND start_date <= date AND end_date >= date
    → Returns the override's shift_template

Level 2: Employee_Shift_Assignment
    WHERE employee_id = ?
    → If rotation_templates is non-empty:
        index = (date - rotation_start_date).days % len(rotation_templates)
        template_id = rotation_templates[index]
        If template.code == 'OFF': return WEEKEND_OFF sentinel
    → Else: returns shift_template_id directly

Level 3: Department_Shift_Rule
    WHERE department_id = employee.department_id
      AND effective_from <= date
      AND (effective_to IS NULL OR effective_to >= date)
    → If date's weekday is in weekend_days: return WEEKEND_OFF sentinel
    → Else: returns shift_template_id

Level 4: Unscheduled
    → Returns None (no shift assigned)
```

### Rotating Shift Modulo Arithmetic

```python
def resolve_rotating_shift(
    templates: list[UUID],
    rotation_start_date: date,
    target_date: date,
) -> UUID:
    """
    Compute the active shift template for a rotating schedule.
    Uses modulo arithmetic on the number of days since rotation start.
    """
    days_elapsed = (target_date - rotation_start_date).days
    # days_elapsed can be negative if target_date < rotation_start_date
    # Python's modulo handles negative numbers correctly: -1 % 3 == 2
    index = days_elapsed % len(templates)
    return templates[index]
```

### Cross-Midnight Window Spanning

For overnight shifts (`is_overnight = True`), the attendance window spans two calendar days:

```python
def get_shift_window(
    template: ShiftTemplate,
    shift_date: date,
) -> tuple[datetime, datetime]:
    """
    Returns (window_open, window_close) for a shift.
    For overnight shifts, window_close is on shift_date + 1 day.
    """
    window_open = datetime.combine(shift_date, template.checkin_window_start)
    if template.is_overnight:
        window_close = datetime.combine(
            shift_date + timedelta(days=1),
            template.checkout_window_end
        )
    else:
        window_close = datetime.combine(shift_date, template.checkout_window_end)
    return window_open, window_close
```

When a scan arrives after midnight, the engine checks whether it falls within an open overnight session from the previous day before creating a new session for the current day.


---

## Attendance Status Computation Engine

### Status Priority Order

The engine evaluates conditions in strict priority order. The first matching condition wins.

```
Priority 1: holiday
    → holiday_calendar has a row for (employee.organization_id, shift_date)
      OR (employee.department_id, shift_date) when scope='department'

Priority 2: on_leave
    → leave_requests has approved row covering shift_date
      AND leave_type != 'annual'

Priority 3: vacation
    → leave_requests has approved row covering shift_date
      AND leave_type == 'annual'

Priority 4: weekend_off
    → Shift resolution returned WEEKEND_OFF sentinel
      (from department weekend_days or rotating OFF template)

Priority 5: absent
    → Shift was resolved (employee has a scheduled shift)
      AND check_in_window has closed
      AND no check_in exists

Priority 6: missed_checkin
    → Same as absent but check_in_window is still open
      (used for intra-day "not yet arrived" state)

Priority 7: unscheduled_attendance
    → Shift resolution returned None (unscheduled)
      AND employee has at least one scan today

Priority 8: unknown_shift
    → Shift resolution raised an error (misconfiguration)

Priority 9: early_arrival
    → check_in exists
      AND check_in < (shift_start_time - 30 minutes)

Priority 10: late
    → check_in exists
      AND check_in > (shift_start_time + grace_period_minutes)

Priority 11: half_day
    → check_in AND check_out both exist
      AND duration_minutes < (working_hours * 60 * 0.5)

Priority 12: missed_checkout
    → check_in exists, check_out is NULL
      AND checkout_window has closed

Priority 13: present
    → check_in exists within check_in_window
      AND check_in <= (shift_start_time + grace_period_minutes)

Priority 14: out_of_window
    → Scan exists but falls outside both windows
      (stored on scan_events.processing_status, not on session status)
```

### Grace Period Resolution

```python
def resolve_grace_period(
    shift_template: ShiftTemplate,
    dept_rule: DepartmentShiftRule | None,
    assignment: EmployeeShiftAssignment | None,
) -> int:
    """
    3-level grace period precedence.
    Returns the most specific configured value.
    """
    if assignment and assignment.grace_period_override is not None:
        return assignment.grace_period_override
    if dept_rule and dept_rule.grace_period_override is not None:
        return dept_rule.grace_period_override
    return shift_template.grace_period_minutes
```

### Attendance Window Boundary Logic

```python
def classify_scan(
    scan_time: datetime,
    template: ShiftTemplate,
    shift_date: date,
    session: AttendanceSession | None,
) -> ScanClassification:
    """
    Classify a scan as check_in_candidate, check_out_candidate, or out_of_window.
    Handles overlapping windows per Requirement 5.8.
    """
    checkin_start = datetime.combine(shift_date, template.checkin_window_start)
    checkin_end = datetime.combine(shift_date, template.checkin_window_end)
    checkout_start = datetime.combine(shift_date, template.checkout_window_start)
    if template.is_overnight:
        checkout_end = datetime.combine(
            shift_date + timedelta(days=1), template.checkout_window_end
        )
    else:
        checkout_end = datetime.combine(shift_date, template.checkout_window_end)

    in_checkin_window = checkin_start <= scan_time <= checkin_end
    in_checkout_window = checkout_start <= scan_time <= checkout_end

    if in_checkin_window and in_checkout_window:
        # Overlapping window: check_in if no session yet, else check_out
        if session is None or session.check_in is None:
            return ScanClassification.CHECK_IN_CANDIDATE
        return ScanClassification.CHECK_OUT_CANDIDATE
    elif in_checkin_window:
        return ScanClassification.CHECK_IN_CANDIDATE
    elif in_checkout_window:
        return ScanClassification.CHECK_OUT_CANDIDATE
    else:
        return ScanClassification.OUT_OF_WINDOW
```

### Half-Day Threshold

```python
HALF_DAY_THRESHOLD = 0.5  # 50% of working hours

def is_half_day(duration_minutes: float, working_hours: float) -> bool:
    """Both check_in and check_out must exist for half_day to apply."""
    return duration_minutes < (working_hours * 60 * HALF_DAY_THRESHOLD)
```

### Overtime Calculation

```python
def compute_overtime(duration_minutes: float, working_hours: float) -> float:
    """Overtime is a separate numeric field, not a status."""
    expected_minutes = working_hours * 60
    if duration_minutes > expected_minutes:
        return round(duration_minutes - expected_minutes, 1)
    return 0.0
```


---

## Redis Streams Architecture

### Stream Design

```
Stream name:    projectz:attendance_tasks
Consumer group: attendance_processors
Consumer IDs:   worker-{hostname}-{pid}  (e.g., worker-backend-1-12345)

Message format:
{
    "scan_event_id": "<uuid>",
    "employee_id":   "<uuid>",   # denormalized for fast lookup
    "scan_timestamp": "<iso8601>",
    "attempt": 1                 # incremented on retry
}
```

### Consumer Group Lifecycle

```python
# stream_consumer.py — startup
async def ensure_consumer_group(redis: Redis):
    """Create consumer group if it doesn't exist. MKSTREAM creates stream."""
    try:
        await redis.xgroup_create(
            name="projectz:attendance_tasks",
            groupname="attendance_processors",
            id="0",       # start from beginning
            mkstream=True
        )
    except ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise  # Group already exists — expected on restart

# Main consumer loop
async def consume_loop(worker_id: str, redis: Redis, db_session_factory):
    while True:
        # Read up to 10 messages, block for 2 seconds if empty
        messages = await redis.xreadgroup(
            groupname="attendance_processors",
            consumername=worker_id,
            streams={"projectz:attendance_tasks": ">"},
            count=10,
            block=2000,
        )
        for stream_name, entries in (messages or []):
            for entry_id, fields in entries:
                await process_with_retry(entry_id, fields, redis, db_session_factory)

async def process_with_retry(entry_id, fields, redis, db_session_factory):
    scan_event_id = fields["scan_event_id"]
    attempt = int(fields.get("attempt", 1))
    try:
        async with db_session_factory() as session:
            engine = AttendanceEngineV2(session)
            await engine.process(UUID(scan_event_id))
        await redis.xack("projectz:attendance_tasks", "attendance_processors", entry_id)
    except Exception as e:
        logger.error(f"Processing failed attempt={attempt} scan={scan_event_id}: {e}")
        if attempt >= 3:
            # Dead letter: mark as failed_permanent, acknowledge to remove from PEL
            async with db_session_factory() as session:
                await session.execute(
                    update(ScanEvent)
                    .where(ScanEvent.id == UUID(scan_event_id))
                    .values(processing_status="failed_permanent")
                )
                await session.commit()
            await redis.xack("projectz:attendance_tasks", "attendance_processors", entry_id)
        else:
            # Re-enqueue with incremented attempt count
            await redis.xadd("projectz:attendance_tasks", {
                **fields,
                "attempt": str(attempt + 1)
            })
            await redis.xack("projectz:attendance_tasks", "attendance_processors", entry_id)
```

### Offline Recovery

When Redis is unavailable at ingestion time, scans are stored with `processing_status = 'queued_offline'`. A recovery task polls every 60 seconds:

```python
# workers/offline_recovery.py
async def recover_offline_scans(redis: Redis, db_session_factory):
    """Re-enqueue scans that were stored when Redis was unavailable."""
    async with db_session_factory() as session:
        result = await session.execute(
            select(ScanEvent)
            .where(ScanEvent.processing_status == "queued_offline")
            .limit(100)
            .order_by(ScanEvent.created_at)
        )
        scans = result.scalars().all()
        for scan in scans:
            await redis.xadd("projectz:attendance_tasks", {
                "scan_event_id": str(scan.id),
                "employee_id": str(scan.employee_id) if scan.employee_id else "",
                "scan_timestamp": scan.scan_timestamp.isoformat(),
                "attempt": "1",
            })
            await session.execute(
                update(ScanEvent)
                .where(ScanEvent.id == scan.id)
                .values(processing_status="queued")
            )
        await session.commit()
```

### WebSocket Channel Separation

Two Redis channels are used to separate concerns:

| Channel | Purpose |
|---------|---------|
| `projectz:ws_events` | WebSocket fan-out to all connected clients (Layer 2) |
| `projectz:attendance_tasks` | Redis Stream for background processing (Layer 3) |

The existing `REDIS_CHANNEL = "projectz:events"` in `websocket_service.py` is renamed to `projectz:ws_events` in the new design.


---

## API Design

All endpoints are versioned under `/api/v1/`. Authentication uses the existing JWT bearer token scheme.

### Scan Events Feed

```
GET /api/v1/scan-events
    Query params:
        date          DATE        (default: today)
        employee_id   UUID        (optional filter)
        device_id     UUID        (optional filter)
        department_id UUID        (optional filter)
        scan_result   str         (optional filter)
        limit         int         (default: 50, max: 200)
        cursor        str         (pagination cursor = last scan_event id)
    Response: { items: ScanEventResponse[], next_cursor: str | null }

GET /api/v1/scan-events/{id}
    Response: ScanEventResponse (full detail including raw_payload)
```

### Analytics Endpoints

```
GET /api/v1/analytics/departments/summary?date={YYYY-MM-DD}
    Response: AttendanceSummaryResponse[]
    Notes: Returns empty array (HTTP 200) when no data exists.

GET /api/v1/analytics/departments/{dept_id}/summary
    Query params:
        start_date    DATE  (required)
        end_date      DATE  (required, max 90 days from start_date)
    Response: AttendanceSummaryResponse[]
    Error: HTTP 400 "Date range must not exceed 90 days." when exceeded.
```

### Report Endpoints

```
GET /api/v1/reports/attendance/daily
    Query params:
        date          DATE   (required)
        department_id UUID   (optional)
        format        str    (csv | excel | pdf, default: csv)
    Response: File download

GET /api/v1/reports/attendance/lateness
    Query params:
        start_date    DATE   (required)
        end_date      DATE   (required, max 90 days)
        department_id UUID   (optional)
    Response: LatenessReportRow[]

GET /api/v1/reports/attendance/absences
    Query params:
        start_date    DATE   (required)
        end_date      DATE   (required, max 90 days)
        department_id UUID   (optional)
    Response: AbsenceReportRow[]

GET /api/v1/reports/attendance/overtime
    Query params:
        start_date    DATE   (required)
        end_date      DATE   (required, max 90 days)
        department_id UUID   (optional)
    Response: OvertimeReportRow[]

GET /api/v1/reports/attendance/shift-compliance
    Query params:
        start_date    DATE   (required)
        end_date      DATE   (required, max 90 days)
        department_id UUID   (optional)
    Response: ShiftComplianceRow[]

GET /api/v1/reports/scans/audit
    Query params:
        employee_id   UUID   (required if device_id absent)
        device_id     UUID   (required if employee_id absent)
        start_date    DATE   (required)
        end_date      DATE   (required, max 90 days)
    Response: ScanAuditRow[]

GET /api/v1/reports/scans/movement
    Query params:
        employee_id   UUID   (required)
        date          DATE   (required)
    Response: ScanEventResponse[] (ascending scan_timestamp order)
```

### Leave Requests CRUD

```
POST   /api/v1/leave-requests
    Body: { employee_id, leave_type, start_date, end_date, reason? }
    Response: LeaveRequestResponse (HTTP 201)
    Error: HTTP 422 for invalid leave_type

GET    /api/v1/leave-requests
    Query params:
        employee_id   UUID        (optional)
        status        leave_status (optional)
        start_date    DATE        (optional)
        end_date      DATE        (optional)
    Response: LeaveRequestResponse[]

GET    /api/v1/leave-requests/{id}
    Response: LeaveRequestResponse

PUT    /api/v1/leave-requests/{id}/approve
    Response: LeaveRequestResponse (triggers retroactive session update)

PUT    /api/v1/leave-requests/{id}/reject
    Response: LeaveRequestResponse
```

### Shift Templates CRUD

```
POST   /api/v1/shift-templates
GET    /api/v1/shift-templates          (list, filter by is_active)
GET    /api/v1/shift-templates/{id}
PUT    /api/v1/shift-templates/{id}
DELETE /api/v1/shift-templates/{id}     (soft delete: is_active = false)
```

### Department Shift Rules CRUD

```
POST   /api/v1/department-shift-rules
    Error: HTTP 409 Conflict when date range overlaps existing rule for same dept.
GET    /api/v1/department-shift-rules?department_id={id}
GET    /api/v1/department-shift-rules/{id}
PUT    /api/v1/department-shift-rules/{id}
DELETE /api/v1/department-shift-rules/{id}
```

### Employee Shift Assignments CRUD

```
POST   /api/v1/employee-shift-assignments
GET    /api/v1/employee-shift-assignments?employee_id={id}
GET    /api/v1/employee-shift-assignments/{id}
PUT    /api/v1/employee-shift-assignments/{id}
DELETE /api/v1/employee-shift-assignments/{id}

POST   /api/v1/employee-shift-overrides
GET    /api/v1/employee-shift-overrides?employee_id={id}
GET    /api/v1/employee-shift-overrides/{id}
PUT    /api/v1/employee-shift-overrides/{id}
DELETE /api/v1/employee-shift-overrides/{id}
```


---

## Frontend Live Dashboard Architecture

### WebSocket Event Handlers

The frontend maintains a single WebSocket connection managed by a Zustand store. All six event types are handled:

```typescript
// stores/websocketStore.ts
type WSEventType =
  | 'scan_event'
  | 'attendance_update'
  | 'department_summary_update'
  | 'device_status_update'
  | 'late_alert'
  | 'unknown_user_alert';

interface WSMessage {
  event: WSEventType;
  data: unknown;
}

// Event routing in the WebSocket hook
function handleMessage(msg: WSMessage) {
  switch (msg.event) {
    case 'scan_event':
      useScanFeedStore.getState().prependScan(msg.data as ScanEventPayload);
      if (msg.data.scan_result === 'duplicate') {
        useDuplicateStore.getState().prependDuplicate(msg.data as ScanEventPayload);
      }
      break;
    case 'attendance_update':
      useActiveEmployeesStore.getState().upsertSession(msg.data as AttendanceUpdatePayload);
      break;
    case 'department_summary_update':
      useDeptSummaryStore.getState().updateDepartment(msg.data as DeptSummaryPayload);
      useKPIStore.getState().recalculate();
      break;
    case 'device_status_update':
      useDeviceStore.getState().updateDevice(msg.data as DeviceStatusPayload);
      break;
    case 'late_alert':
      useAlertStore.getState().addLateAlert(msg.data as LateAlertPayload);
      break;
    case 'unknown_user_alert':
      useUnknownUserStore.getState().prependAlert(msg.data as UnknownUserPayload);
      break;
  }
}
```

### Live Scan Feed Component

```typescript
// components/LiveScanFeed.tsx
// Prepends new scan cards on scan_event; maintains max 200 items in memory.
// Renders: avatar (initials fallback), name, code, dept, office, device,
//          verify method icon, timestamp (HH:MM:SS), scan_result badge, shift_type label.

const MAX_FEED_ITEMS = 200;

function useScanFeedStore() {
  return useStore((state) => ({
    scans: state.scans,
    prependScan: (scan: ScanEventPayload) => {
      state.scans = [scan, ...state.scans].slice(0, MAX_FEED_ITEMS);
    },
  }));
}
```

### Department Activity Panel

```typescript
// components/DepartmentActivityPanel.tsx
// Updates affected department row on department_summary_update.
// Displays: dept name, present_count, late_count, absent_count, on_shift_count.
// Color-coded attendance rate bar.

function DepartmentRow({ dept }: { dept: DeptSummaryPayload }) {
  const attendanceRate = dept.expected_count > 0
    ? Math.round((dept.present_count / dept.expected_count) * 100)
    : 0;
  // ...render
}
```

### Unknown User Scans Panel

```typescript
// components/UnknownUserPanel.tsx
// Prepends new entries on unknown_user_alert.
// Displays: raw_device_user_id, device_serial_number, scan_timestamp.
// Each entry has a "Map Employee" action button linking to /employees/map.
```

### Duplicate Scan Activity Panel

```typescript
// components/DuplicateScanPanel.tsx
// Filters scan_event events where scan_result === 'duplicate'.
// Refreshed on each qualifying scan_event.
// Resets at midnight (day.rollover event).
// Displays: employee name, device, timestamp, count of duplicates today.
```

### Null Safety Rules

All dashboard components enforce these display rules:
- `employee_name` null → display `"Unknown"`
- `employee_photo_url` null → display initials avatar
- `department_name` null or `""` → display `"Unassigned"`
- `office_name` null or `""` → display `"Unassigned"`
- `device_name` null → display `"Unknown Device"`

These rules are enforced at the WebSocket payload level (backend always sends non-null strings) and again at the component render level as a defensive fallback.


---

## Migration Strategy

### Phase 1: Schema Additions (Non-Breaking)

Add all new tables and columns without removing anything. The existing `attendance_logs`, `attendance_sessions`, `shifts`, and `raw_attendance_payloads` tables remain intact.

```sql
-- Alembic revision: 0002_enterprise_platform_schema
-- Add new enum types
-- Create scan_events (partitioned)
-- Create shift_templates
-- Create department_shift_rules
-- Create employee_shift_assignments
-- Create employee_shift_overrides
-- Create attendance_summaries
-- Create holiday_calendar
-- Create leave_requests
-- Add employment_type to employees
-- Add shift_date, shift_template_id, early_minutes, checkout_status to attendance_sessions
-- Add scan_events_2025_XX partitions for current + next 2 months
```

### Phase 2: Data Migration

```sql
-- Migrate existing shifts → shift_templates
INSERT INTO shift_templates (
    id, name, code, start_time, end_time,
    checkin_window_start, checkin_window_end,
    checkout_window_start, checkout_window_end,
    grace_period_minutes, break_duration_minutes,
    working_hours, is_overnight, is_active, created_at, updated_at
)
SELECT
    id, name, code, start_time, end_time,
    -- Default windows: checkin = [start - 1h, start + 2h]
    --                  checkout = [end - 2h, end + 1h]
    (start_time - INTERVAL '1 hour')::TIME,
    (start_time + INTERVAL '2 hours')::TIME,
    (end_time - INTERVAL '2 hours')::TIME,
    (end_time + INTERVAL '1 hour')::TIME,
    grace_period_minutes, break_duration_minutes,
    COALESCE(working_hours, 8.0), is_overnight, is_active,
    created_at, updated_at
FROM shifts;

-- Migrate existing attendance_logs → scan_events
-- (historical data backfill — run as background job)
INSERT INTO scan_events (
    id, employee_id, employee_code, employee_name,
    department_id, department_name, office_id, office_name,
    device_id, device_name, device_serial,
    verification_method, scan_result, raw_punch_state,
    raw_payload, scan_timestamp, processing_status,
    websocket_broadcasted, created_at
)
SELECT
    al.id,
    al.employee_id,
    COALESCE(e.employee_code, 'MIGRATED'),
    e.full_name,
    e.department_id,
    COALESCE(d.name, 'Unassigned'),
    dev.office_id,
    COALESCE(o.name, 'Unassigned'),
    al.device_id,
    COALESCE(dev.name, 'Unknown Device'),
    COALESCE(dev.serial_number, 'MIGRATED'),
    al.verify_type::TEXT::verification_method,
    CASE WHEN al.is_duplicate THEN 'duplicate' ELSE 'successful' END::scan_result,
    0,
    jsonb_build_object('migrated_from', 'attendance_logs', 'work_code', al.work_code),
    al.timestamp,
    'processed'::processing_status,
    TRUE,
    al.created_at
FROM attendance_logs al
LEFT JOIN employees e ON e.id = al.employee_id
LEFT JOIN departments d ON d.id = e.department_id
LEFT JOIN devices dev ON dev.id = al.device_id
LEFT JOIN offices o ON o.id = dev.office_id;

-- Migrate attendance_sessions: add shift_date = date, shift_template_id from employee.shift_id
UPDATE attendance_sessions s
SET
    shift_date = s.date,
    shift_template_id = e.shift_id
FROM employees e
WHERE s.employee_id = e.id AND e.shift_id IS NOT NULL;
```

### Phase 3: Cutover

1. Deploy new `adms.py` that writes to `scan_events` instead of `attendance_logs`.
2. Deploy `stream_consumer.py` worker alongside the main backend.
3. Keep `attendance_logs` writes as a shadow copy for 30 days, then disable.
4. After 30 days of stable operation, drop `attendance_logs` and `raw_attendance_payloads`.

### Mapping Table

| Old Table | New Table | Notes |
|-----------|-----------|-------|
| `attendance_logs` | `scan_events` | Superseded; migrated as historical data |
| `attendance_sessions` | `attendance_sessions` | Extended in-place |
| `shifts` | `shift_templates` | Data migrated; old table kept as read-only |
| `raw_attendance_payloads` | `scan_events.raw_payload` (JSONB) | Raw payload embedded in scan_events |


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Scan Storage Precedes All Other Processing

*For any* valid ADMS payload, after the ingestion call completes, a `scan_events` row for that scan must exist in the database before any `attendance_sessions` row is created or modified as a result of that scan.

**Validates: Requirements 1.1, 2.1, 2.2**

---

### Property 2: Universal Scan Storage (No Scan Is Dropped)

*For any* scan input — whether the employee is recognized, unrecognized, the device is known or unknown, or the scan result is any valid value — the `scan_events` table gains exactly one new row per scan record in the ADMS payload.

**Validates: Requirements 1.2, 1.6**

---

### Property 3: Scan Event Field Completeness

*For any* stored `scan_events` row, all required fields (`employee_code`, `department_name`, `office_name`, `device_name`, `device_serial`, `verification_method`, `scan_result`, `scan_timestamp`, `processing_status`, `websocket_broadcasted`) are present and non-null, with `department_name` and `office_name` defaulting to `"Unassigned"` when no assignment exists.

**Validates: Requirements 1.3, 11.3, 11.4**

---

### Property 4: Enum Domain Validity

*For any* `scan_events` row at any point in its lifecycle, `scan_result` is always a member of `{successful, duplicate, unknown_user, unknown_device, rejected, movement, retry}` and `processing_status` is always a member of `{pending, queued, queued_offline, processing, processed, failed, failed_permanent, out_of_window}`.

**Validates: Requirements 1.5, 1.10**

---

### Property 5: Append-Only Immutability

*For any* `scan_events` row, after the initial insert, the values of `scan_result` and `scan_timestamp` remain identical to their initial values regardless of how many processing operations are subsequently applied to that row.

**Validates: Requirements 1.7**

---

### Property 6: WebSocket Payload Completeness

*For any* `scan_event` WebSocket broadcast, the payload contains all required fields: `employee_photo_url` (null only for unknown employees), `employee_name` (null only for unknown employees), `employee_code`, `department_name` (never null — `"Unassigned"` as fallback), `office_name` (never null — `"Unassigned"` as fallback), `device_name`, `verification_method`, `scan_timestamp`, `scan_result`, and `shift_type`.

**Validates: Requirements 2.4, 10.10**

---

### Property 7: Unknown User Alert Emission

*For any* scan with a `device_user_id` that has no matching row in `employee_device_mappings`, an `unknown_user_alert` WebSocket event is broadcast containing `device_serial_number`, `raw_device_user_id`, and `scan_timestamp`.

**Validates: Requirements 2.5**

---

### Property 8: Grace Period Boundary — On Time

*For any* shift template with grace period N minutes and any scan time T where `start_time ≤ T ≤ start_time + N minutes`, the computed attendance status is `present` (not `late`).

**Validates: Requirements 3.4**

---

### Property 9: Grace Period Boundary — Late with Correct Minutes

*For any* shift template with grace period N minutes and any scan time T where `T > start_time + N minutes`, the computed status is `late` and `late_minutes = floor((T − start_time).total_seconds() / 60)`.

**Validates: Requirements 3.5**

---

### Property 10: Grace Period Precedence

*For any* combination of grace period configurations at three levels (shift template, department rule, employee assignment), the resolved grace period always equals the most specific non-null value: employee assignment override → department rule override → shift template default.

**Validates: Requirements 3.6**

---

### Property 11: Shift Resolution Precedence

*For any* employee and date with configurations at multiple levels, the resolved shift always equals the highest-precedence non-null assignment: Employee_Shift_Override → Employee_Shift_Assignment → Department_Shift_Rule → unscheduled (None).

**Validates: Requirements 4.3**

---

### Property 12: Rotating Shift Modulo Correctness

*For any* rotating shift assignment with N templates (2 ≤ N ≤ 30), a rotation start date R, and any target date D, the resolved shift template is `templates[(D − R).days % N]`. This holds for all dates including dates before R (Python modulo handles negative values correctly).

**Validates: Requirements 4.4**

---

### Property 13: Out-of-Window Classification

*For any* shift template and any scan time T that falls outside both `[checkin_window_start, checkin_window_end]` and `[checkout_window_start, checkout_window_end]`, the scan's `processing_status` is set to `out_of_window` and the corresponding `attendance_sessions` row is not modified.

**Validates: Requirements 5.3**

---

### Property 14: Cross-Midnight Session Attribution

*For any* overnight shift template (is_overnight = true) with shift date D, any scan time T where `checkin_window_start(D) ≤ T ≤ checkout_window_end(D+1)` is attributed to the single `attendance_sessions` row with `shift_date = D`.

**Validates: Requirements 6.1, 6.2, 6.3**

---

### Property 15: Cross-Midnight Duration Correctness

*For any* attendance session with `check_in` before midnight and `check_out` after midnight, `duration_minutes = (check_out − check_in).total_seconds() / 60 > 0`. No special-casing of the midnight boundary is required.

**Validates: Requirements 6.4**

---

### Property 16: Status Priority Ordering

*For any* attendance session where multiple status conditions are simultaneously true, the computed status always equals the highest-priority applicable condition in the order: `holiday > on_leave > vacation > weekend_off > absent > missed_checkin > unscheduled_attendance > early_arrival > late > half_day > missed_checkout > present`.

**Validates: Requirements 7.1, 7.8**

---

### Property 17: Half-Day Threshold

*For any* attendance session where both `check_in` and `check_out` are present and `duration_minutes < working_hours × 60 × 0.5`, the computed status is `half_day`. When `check_out` is null, `half_day` is never assigned regardless of elapsed time.

**Validates: Requirements 7.3**

---

### Property 18: Overtime Calculation Correctness

*For any* attendance session where `duration_minutes > working_hours × 60`, `overtime_minutes = round(duration_minutes − working_hours × 60, 1)`. When `duration_minutes ≤ working_hours × 60`, `overtime_minutes = 0.0`.

**Validates: Requirements 7.6**

---

### Property 19: Redis Stream Task Publication

*For any* successfully stored `scan_events` row, exactly one message is published to the Redis stream `projectz:attendance_tasks` containing the `scan_event_id`. When Redis is unavailable, the scan's `processing_status` is set to `queued_offline` and no stream message is published.

**Validates: Requirements 8.1, 8.5**

---

### Property 20: Retry Count Enforcement

*For any* scan event that fails processing, `processing_status` is `failed` after fewer than 3 failures and `failed_permanent` after exactly 3 failures. The message is removed from the Redis Streams PEL (pending entries list) only after either successful processing or reaching `failed_permanent`.

**Validates: Requirements 8.3**

---

### Property 21: Attendance Summary Correctness

*For any* set of `attendance_sessions` rows for a given `(department_id, summary_date)`, the corresponding `attendance_summaries` row correctly reflects: `present_count` = count of sessions with status in `{present, late, early_arrival}`, `late_count` = count with status `late`, `absent_count` = count with status `absent`, `on_leave_count` = count with status `on_leave`, `vacation_count` = count with status `vacation`, `overtime_count` = count with `overtime_minutes > 0`.

**Validates: Requirements 9.1**

---

### Property 22: Unique Session Per Employee Per Shift Date

*For any* employee and shift date, attempting to create a second `attendance_sessions` row results in a database constraint violation. The `UNIQUE (employee_id, shift_date)` constraint is enforced at the database level.

**Validates: Requirements 12.3**

---

### Property 23: Report Date Range Validation

*For any* report endpoint call where `(end_date − start_date).days > 90`, the response is HTTP 400 with the message `"Date range must not exceed 90 days."` This holds for all seven report endpoints.

**Validates: Requirements 14.8**

---

### Property 24: Approved Leave Overrides Scan Status

*For any* employee with an approved `leave_request` covering shift date D, the `attendance_sessions` row for that employee on date D has status `vacation` (when `leave_type = 'annual'`) or `on_leave` (for all other leave types), regardless of what scan data exists for that date.

**Validates: Requirements 15.4**


---

## Error Handling

### Layer 1 — Ingestion Errors

The ingestion path must never return a non-200 response to the ADMS device. All errors are handled defensively:

```python
# ingestion_service.py
async def ingest(self, payload: ADMSPayload) -> ScanEvent | None:
    try:
        scan_event = await self._store_scan_event(payload)
    except Exception as e:
        # Log with full raw payload for manual recovery
        logger.error(
            f"[INGESTION] CRITICAL: scan storage failed | "
            f"device={payload.serial_number} | error={e} | "
            f"raw={payload.body[:500]}",
            exc_info=True
        )
        return None  # Caller still responds "OK" to device

    # Fire-and-forget: errors here must not block the response
    try:
        await self._broadcast_scan_event(scan_event)
    except Exception as e:
        logger.warning(f"[INGESTION] WebSocket broadcast failed: {e}")

    try:
        await self._enqueue_processing_task(scan_event)
    except Exception as e:
        logger.warning(f"[INGESTION] Redis enqueue failed, marking queued_offline: {e}")
        await self._mark_queued_offline(scan_event.id)

    return scan_event
```

### Layer 3 — Processing Errors

Processing errors are retried up to 3 times with exponential backoff. After 3 failures, the scan is marked `failed_permanent` and a structured error log is emitted:

```json
{
  "level": "ERROR",
  "event": "attendance_processing_failed",
  "scan_event_id": "<uuid>",
  "employee_id": "<uuid>",
  "attempt": 3,
  "error_type": "ShiftResolutionError",
  "error_message": "No shift template found for department_id=...",
  "timestamp": "2025-01-15T08:32:11Z"
}
```

### Conflict Detection — Department Shift Rules

The `EXCLUDE USING gist` constraint on `department_shift_rules` enforces non-overlapping date ranges at the database level. The API layer catches `ExclusionViolationError` and returns HTTP 409:

```python
except ExclusionViolationError:
    raise HTTPException(
        status_code=409,
        detail="A shift rule for this department already covers part of the specified date range."
    )
```

### Device Offline Detection

The existing `_device_offline_watcher` task is extended to broadcast `device_status_update` events:

```python
async def mark_stale_devices_offline(self) -> int:
    # ... existing logic ...
    for device in stale_devices:
        await ws_manager.broadcast("device_status_update", {
            "device_id": str(device.id),
            "device_serial": device.serial_number,
            "device_name": device.name or "Unknown Device",
            "status": "offline",
            "office_name": device.office.name if device.office else "Unassigned",
            "department_name": device.department.name if device.department else "Unassigned",
            "last_seen": device.last_seen.isoformat() if device.last_seen else None,
        })
```

### Structured Logging

All error events emit structured JSON logs with these mandatory fields:

| Event | Required Fields |
|-------|----------------|
| Scan ingestion failure | `device_serial`, `raw_payload` (truncated to 500 chars), `error` |
| Attendance processing failure | `scan_event_id`, `employee_id`, `attempt`, `error_type`, `error_message` |
| WebSocket broadcast failure | `event_type`, `connection_count`, `error` |

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. Unit tests cover specific examples and integration points; property tests verify universal correctness across all inputs.

### Property-Based Testing

The project uses **Hypothesis** (Python) for property-based testing. Each property test runs a minimum of 100 iterations.

```python
# tests/properties/test_shift_resolver.py
from hypothesis import given, settings
from hypothesis import strategies as st

@given(
    grace_period=st.integers(min_value=0, max_value=120),
    minutes_after_start=st.floats(min_value=0.0, max_value=float(grace_period))
)
@settings(max_examples=200)
def test_grace_period_boundary_on_time(grace_period, minutes_after_start):
    """
    Feature: enterprise-attendance-platform
    Property 8: Grace Period Boundary — On Time
    For any shift with grace period N and scan time within [start, start+N], status is present.
    """
    shift = build_shift_template(grace_period_minutes=grace_period)
    scan_time = shift_start + timedelta(minutes=minutes_after_start)
    status, late_minutes = compute_lateness(scan_time, shift)
    assert status == AttendanceStatus.PRESENT
    assert late_minutes == 0
```

Tag format for all property tests:
```python
# Feature: enterprise-attendance-platform, Property {N}: {property_text}
```

### Unit Tests

Unit tests focus on:
- Specific status computation examples (holiday, on_leave, half_day edge cases)
- API endpoint request/response validation
- Migration correctness (spot-check migrated records)
- WebSocket payload structure validation
- Report generation output format

### Integration Tests

Integration tests (using `pytest-asyncio` + test database + test Redis):
- Redis Streams consumer group exactly-once processing (2 workers, 1 message)
- `attendance_summaries` update within 10 seconds of session status change
- Retroactive leave approval updating existing `absent` sessions
- Monthly partition creation by `partition_manager`
- Device offline detection and broadcast timing

### Test Configuration

```python
# pytest.ini / pyproject.toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
markers = [
    "property: property-based tests (run with --hypothesis-seed=0 for reproducibility)",
    "integration: requires live PostgreSQL and Redis",
    "unit: pure unit tests with mocks",
]
```

