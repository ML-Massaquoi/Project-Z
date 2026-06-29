# Project Z — Complete Model Reference

All 36 model files documented with table names, columns, types, constraints, relationships, and enums.

## Base Classes (`backend/app/database/base.py`)

- `Base` — SQLAlchemy `DeclarativeBase`
- `UUIDMixin` — Adds `id: UUID PK, default=uuid4, indexed`
- `TimestampMixin` — Adds `created_at` and `updated_at` (tz-aware DateTime, auto-populated)
- `BaseModel(Base, UUIDMixin, TimestampMixin)` — Abstract base providing `id`, `created_at`, `updated_at` to most models
- Some models use `Base + UUIDMixin` only (no timestamp mixin): `AttendanceSummary`, `DeviceHealthLog`, `DeviceStatusHistory`, `EmployeeEnrollmentHistory`, `DeviceActivityLog`, `DataIntegrityLog`, `ExpectedAttendance`

---

## 1. Organization (`organizations`)

**Base**: BaseModel | **Purpose**: Top-level organizational entity.

| Column | Type | Notes |
|--------|------|-------|
| name | String(255) | NOT NULL |
| code | String(50) | UNIQUE, NOT NULL |
| country | String(100) | nullable |
| address | Text | nullable |
| phone | String(50) | nullable |
| email | String(255) | nullable |
| logo_url | String(500) | nullable |
| timezone | String(50) | default "Africa/Freetown" |
| is_active | bool | default True |

**Relationships**: `offices` → Office (1:N, cascade delete-orphan)

---

## 2. Office (`offices`)

**Base**: BaseModel | **Purpose**: Physical office locations within an organization.

| Column | Type | Notes |
|--------|------|-------|
| name | String(255) | NOT NULL |
| code | String(50) | NOT NULL |
| address | Text | nullable |
| city | String(100) | nullable |
| phone | String(50) | nullable |
| is_active | bool | default True |
| organization_id | UUID FK | → organizations.id ON DELETE CASCADE |

**Relationships**: `organization` → Organization (N:1), `departments` → Department (1:N, cascade), `devices` → Device (1:N, cascade)

---

## 3. Department (`departments`)

**Base**: BaseModel | **Purpose**: Organizational departments within offices.

| Column | Type | Notes |
|--------|------|-------|
| name | String(255) | NOT NULL |
| code | String(50) | NOT NULL |
| description | Text | nullable |
| head_name | String(255) | nullable |
| is_active | bool | default True |
| office_id | UUID FK | → offices.id ON DELETE CASCADE |
| shift_protocol_id | UUID FK | → shift_protocols.id ON DELETE SET NULL, nullable |

**Relationships**: `office` → Office (N:1), `employees` → Employee (1:N), `devices` → Device (1:N), `shift_protocol` → ShiftProtocol (N:1, lazy select)

---

## 4. Shift (`shifts`)

**Base**: BaseModel | **Purpose**: Legacy/basic work schedule definition (superseded by ShiftTemplate for new work).

| Column | Type | Notes |
|--------|------|-------|
| name | String(100) | NOT NULL |
| code | String(50) | UNIQUE, NOT NULL |
| start_time | Time | NOT NULL |
| end_time | Time | NOT NULL |
| grace_period_minutes | Integer | default 15 |
| break_duration_minutes | Integer | default 60 |
| working_hours | float | default 8.0 |
| description | String(255) | nullable |
| is_active | bool | default True |
| is_overnight | bool | default False |

**Relationships**: None

---

## 5. ShiftTemplate (`shift_templates`)

**Base**: BaseModel | **Purpose**: Authoritative reusable shift definition with explicit attendance windows, grace periods, and overnight support. Replaces the legacy Shift model.

| Column | Type | Notes |
|--------|------|-------|
| name | String(100) | NOT NULL |
| code | String(50) | UNIQUE, NOT NULL, indexed |
| start_time | Time | NOT NULL |
| end_time | Time | NOT NULL |
| checkin_window_start | Time | NOT NULL |
| checkin_window_end | Time | NOT NULL |
| checkout_window_start | Time | NOT NULL |
| checkout_window_end | Time | NOT NULL |
| grace_period_minutes | Integer | default 15, CHECK 0–120 |
| break_duration_minutes | Integer | default 60, CHECK 0–480 |
| working_hours | Numeric(4,2) | default 8.00, CHECK 0.0–24.0 |
| is_overnight | Boolean | default False |
| description | String(255) | nullable |
| is_active | Boolean | default True, indexed |

**Relationships**: None (referenced by DepartmentShiftRule, EmployeeShiftAssignment, EmployeeShiftOverride)

---

## 6. ShiftProtocol (`shift_protocols`)

**Base**: BaseModel | **Purpose**: Defines work rotation patterns for departments. Supports fixed weekly, rotating (2-on/2-off), and custom schedules.

**Enum — ProtocolType**: `FIXED = "fixed"`, `ROTATING = "rotating"`, `CUSTOM = "custom"`

| Column | Type | Notes |
|--------|------|-------|
| name | String(100) | NOT NULL |
| code | String(50) | UNIQUE, NOT NULL, indexed |
| description | Text | nullable |
| protocol_type | Enum(ProtocolType) | NOT NULL, default FIXED |
| working_days | JSONB | nullable, ISO weekday list e.g. [1,2,3,4,5] |
| working_hours_start | String(5) | nullable, "HH:MM" |
| working_hours_end | String(5) | nullable, "HH:MM" |
| days_on | Integer | nullable, consecutive work days for rotating |
| days_off | Integer | nullable, consecutive rest days for rotating |
| rotation_shifts | JSONB | nullable, ordered array e.g. ["day","day","off","off","night","night","off","off"] |
| day_shift_start | String(5) | nullable |
| day_shift_end | String(5) | nullable |
| night_shift_start | String(5) | nullable |
| night_shift_end | String(5) | nullable |
| grace_period_minutes | Integer | default 15 |
| include_weekends | Boolean | default False |
| is_active | Boolean | default True |
| color | String(20) | nullable, hex color for UI |

**Relationships**: None directly (referenced by Department, ShiftPair, EmployeeShiftAssignment)

---

## 7. ShiftPair (`shift_pairs`) + ShiftPairMember (`shift_pair_members`)

**Base**: BaseModel | **Purpose**: Groups exactly 2 employees who alternate Day/Night shifts in a 2-on/2-off rotational pairing system. Pairs belong to a department and reference a rotating ShiftProtocol.

### ShiftPair

| Column | Type | Notes |
|--------|------|-------|
| department_id | UUID FK | → departments.id ON DELETE CASCADE, indexed |
| protocol_id | UUID FK | → shift_protocols.id ON DELETE RESTRICT, indexed |
| name | String(50) | NOT NULL, e.g. "Pair A" |
| rotation_start_date | Date | NOT NULL, day 0 of rotation cycle |
| color | String(20) | nullable, hex for calendar display |
| notes | Text | nullable |
| is_active | Boolean | default True |

**Constraints**: UNIQUE(department_id, name)
**Relationships**: `members` → ShiftPairMember (1:N, cascade delete-orphan, ordered by slot_index)

### ShiftPairMember

| Column | Type | Notes |
|--------|------|-------|
| pair_id | UUID FK | → shift_pairs.id ON DELETE CASCADE, indexed |
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| slot_index | Integer | NOT NULL, 0=first DAY, 1=first NIGHT |

**Constraints**: UNIQUE(pair_id, slot_index), UNIQUE(pair_id, employee_id), CHECK slot_index IN (0,1)
**Relationships**: `pair` → ShiftPair (N:1)

---

## 8. EmployeeShiftAssignment (`employee_shift_assignments`)

**Base**: BaseModel | **Purpose**: Assigns a ShiftTemplate (or rotating schedule) to an individual employee. Overrides department-level DepartmentShiftRule. Supports simple, rotating, and protocol-based modes.

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| shift_protocol_id | UUID FK | → shift_protocols.id ON DELETE SET NULL, nullable |
| shift_template_id | UUID FK | → shift_templates.id ON DELETE RESTRICT, nullable |
| rotation_templates | ARRAY(UUID) | NOT NULL, default [], ordered list of template UUIDs |
| rotation_start_date | Date | nullable, day 0 of rotation cycle |
| working_days | ARRAY(Integer) | nullable, ISO weekdays 1=Mon..7=Sun |
| grace_period_override | Integer | nullable, CHECK 0–120 |
| notes | Text | nullable |
| created_by | UUID FK | → users.id ON DELETE SET NULL, nullable |

**Constraints**: CHECK ensures either simple (shift_template_id set, rotation_templates empty) OR rotating (shift_template_id null, rotation_templates >= 2)
**Relationships**: `shift_template` → ShiftTemplate (N:1), `shift_protocol` → ShiftProtocol (N:1)

**Methods**: `is_working_day(target_date)`, `is_rotating` (property), `resolve_template_id_for_date(target_date)` — resolves which template applies on a given date using modulo arithmetic for rotating assignments.

---

## 9. EmployeeShiftOverride (`employee_shift_overrides`)

**Base**: BaseModel | **Purpose**: Time-bounded override that temporarily replaces an employee's shift assignment. Highest precedence in the 4-level shift resolution chain.

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| shift_template_id | UUID FK | → shift_templates.id ON DELETE RESTRICT |
| start_date | Date | NOT NULL, indexed |
| end_date | Date | NOT NULL, indexed |
| reason | String(255) | nullable |
| notes | Text | nullable |
| created_by | UUID FK | → users.id ON DELETE SET NULL, nullable |

**Constraints**: CHECK end_date >= start_date
**Relationships**: `shift_template` → ShiftTemplate (N:1)
**Methods**: `is_active_on(target_date)` — inclusive date range check

---

## 10. DepartmentShiftRule (`department_shift_rules`)

**Base**: BaseModel | **Purpose**: Assigns a ShiftTemplate to a department with an effective date range and weekend rules. Non-overlapping date ranges per department enforced at DB level via EXCLUDE USING gist.

| Column | Type | Notes |
|--------|------|-------|
| department_id | UUID FK | → departments.id ON DELETE CASCADE, indexed |
| shift_template_id | UUID FK | → shift_templates.id ON DELETE RESTRICT |
| effective_from | Date | NOT NULL |
| effective_to | Date | nullable (NULL = open-ended) |
| weekend_days | ARRAY(Integer) | NOT NULL, default [], ISO weekdays |
| grace_period_override | Integer | nullable, CHECK 0–120 |
| notes | Text | nullable |
| created_by | UUID FK | → users.id ON DELETE SET NULL, nullable |

**Relationships**: `shift_template` → ShiftTemplate (N:1)
**Methods**: `is_effective_on(target_date)`, `is_weekend(target_date)`

---

## 11. EmployeeDeviceMapping (`employee_device_mappings`)

**Base**: BaseModel | **Purpose**: Maps device-local user IDs to centralized employees. Bridges the gap between device user IDs and backend employee records.

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| device_id | UUID FK | → devices.id ON DELETE CASCADE, indexed |
| device_user_id | String(50) | NOT NULL, indexed, user ID as stored on device |

**Constraints**: UNIQUE(device_id, device_user_id)
**Relationships**: `employee` → Employee (N:1, back_populates="device_mappings"), `device` → Device (N:1)

---

## 12. EmployeeDeviceAssignment (`employee_device_assignments`) + EmployeeDeviceGroupAssignment (`employee_device_group_assignments`)

**Base**: BaseModel | **Purpose**: Controls which devices an employee's biometric data is synced to. Supports both individual device and group-based assignments.

### EmployeeDeviceAssignment

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| device_id | UUID FK | → devices.id ON DELETE CASCADE, indexed |
| assigned_by | String(256) | nullable |
| assigned_at | DateTime(tz) | NOT NULL, default now |
| sync_status | String(20) | NOT NULL, default "pending" (pending/synced/failed) |
| last_synced_at | DateTime(tz) | nullable |

**Constraints**: UNIQUE(employee_id, device_id)

### EmployeeDeviceGroupAssignment

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| group_id | UUID FK | → device_groups.id ON DELETE CASCADE, indexed |
| assigned_by | String(256) | nullable |
| assigned_at | DateTime(tz) | NOT NULL, default now |

**Constraints**: UNIQUE(employee_id, group_id)

---

## 13. AttendanceSummary (`attendance_summaries`)

**Base**: Base + UUIDMixin (no TimestampMixin) | **Purpose**: Pre-computed per-department, per-date attendance snapshot. Dashboard queries read from this table — never aggregate attendance_sessions directly. Updated by SummaryService within 10 seconds of any session status change.

| Column | Type | Notes |
|--------|------|-------|
| department_id | UUID FK | → departments.id ON DELETE CASCADE, indexed |
| department_name | String(255) | NOT NULL |
| summary_date | Date | NOT NULL, indexed |
| expected_count | Integer | default 0 |
| present_count | Integer | default 0 |
| late_count | Integer | default 0 |
| absent_count | Integer | default 0 |
| on_leave_count | Integer | default 0 |
| vacation_count | Integer | default 0 |
| overtime_count | Integer | default 0 |
| on_shift_count | Integer | default 0 (checked_in but no check_out) |
| created_at | DateTime(tz) | NOT NULL |
| last_updated_at | DateTime(tz) | NOT NULL |

**Constraints**: UNIQUE(department_id, summary_date)

---

## 14. AuditLog (`audit_logs`)

**Base**: BaseModel | **Purpose**: Tracks all system mutations for compliance and debugging.

| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID FK | → users.id ON DELETE SET NULL, nullable |
| username | String(100) | nullable, indexed, denormalized for fast queries |
| action | String(50) | NOT NULL, indexed |
| entity_type | String(100) | NOT NULL, indexed |
| entity_id | String(100) | nullable |
| description | Text | nullable |
| details | JSONB | nullable |
| previous_value | JSONB | nullable, entity state before mutation |
| new_value | JSONB | nullable, entity state after mutation |
| ip_address | String(45) | nullable |
| user_agent | String(500) | nullable |
| endpoint | String(200) | nullable, API path |
| request_method | String(10) | nullable, HTTP method |

**Indexes**: (created_at, entity_type), (user_id, action)

---

## 15. HolidayCalendar (`holiday_calendar`)

**Base**: BaseModel | **Purpose**: Non-working dates that affect attendance status computation. Scoped to organization-wide or a specific department.

**Enums**:
- `HolidayType`: PUBLIC, ORGANIZATIONAL, DEPARTMENTAL
- `HolidayScope`: ORGANIZATION, DEPARTMENT

| Column | Type | Notes |
|--------|------|-------|
| date | Date | NOT NULL, indexed |
| name | String(255) | NOT NULL |
| holiday_type | Enum(HolidayType) | NOT NULL, default PUBLIC |
| scope | Enum(HolidayScope) | NOT NULL, default ORGANIZATION |
| organization_id | UUID FK | → organizations.id ON DELETE CASCADE, indexed |
| department_id | UUID FK | → departments.id ON DELETE CASCADE, nullable |

**Constraints**: CHECK ensures scope=department requires department_id, scope=organization requires department_id IS NULL

---

## 16. LeaveRequest (`leave_requests`)

**Base**: BaseModel | **Purpose**: Employee leave requests with approval workflow. Approved leave overrides attendance status computation.

**Enums**:
- `LeaveType`: ANNUAL, SICK, MATERNITY, PATERNITY, UNPAID, EMERGENCY
- `LeaveStatus`: PENDING, APPROVED, REJECTED

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| leave_type | Enum(LeaveType) | NOT NULL |
| start_date | Date | NOT NULL, indexed |
| end_date | Date | NOT NULL, indexed |
| status | Enum(LeaveStatus) | NOT NULL, default PENDING, indexed |
| approver_id | UUID FK | → users.id ON DELETE SET NULL, nullable |
| reason | Text | nullable |

**Constraints**: CHECK end_date >= start_date
**Methods**: `covers_date(target_date)`, `is_approved` (property), `is_vacation` (property — true when ANNUAL leave)

---

## 17. DeviceUser (`device_users`)

**Base**: BaseModel | **Purpose**: Stores biometric device-local user registry. Synced from devices via TCP SDK (pyzk).

| Column | Type | Notes |
|--------|------|-------|
| device_id | UUID FK | → devices.id ON DELETE CASCADE, indexed |
| device_user_id | String(50) | NOT NULL, user ID on device |
| name | String(255) | NOT NULL, default "" |
| privilege | Integer | NOT NULL, default 0 |
| card_number | String(50) | nullable |
| group_id | String(50) | nullable |
| fingerprint_count | Integer | default 0 |
| face_registered | Boolean | default False |
| password_set | Boolean | default False |
| employee_id | UUID FK | → employees.id ON DELETE SET NULL, nullable, indexed |
| last_synced_at | DateTime(tz) | NOT NULL |
| first_seen_at | DateTime(tz) | nullable |
| raw_data | JSONB | nullable |

**Relationships**: `device` → Device (N:1), `employee` → Employee (N:1)

---

## 18. FingerprintTemplate (`fingerprint_templates`)

**Base**: BaseModel | **Purpose**: Central biometric template repository. Stores fingerprint (and future biometric) templates centrally. Authoritative source for all biometric data.

**Enums**:
- `BiometricType`: FINGERPRINT, FACE, PALM, RFID, PIN
- `SyncStatus`: SYNCED, PENDING, FAILED, OUTDATED

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE |
| device_id | UUID FK | → devices.id ON DELETE CASCADE, source device |
| device_user_id | String(50) | NOT NULL |
| biometric_type | String(20) | default "fingerprint" |
| finger_index | Integer | default 0, 0–9 |
| template_data | LargeBinary | nullable, raw binary template |
| template_size | Integer | default 0, bytes |
| template_hash | String(128) | nullable, SHA-256 for dedup |
| template_version | Integer | default 1 |
| quality | Integer | default 0, 0–100 |
| source_device_id | String(100) | nullable, serial of enrollment device |
| sync_status | String(20) | default "synced" |
| last_synced_at | DateTime | nullable |
| is_active | Boolean | default True |

**Constraints**: UNIQUE(employee_id, finger_index, biometric_type)
**Indexes**: (employee_id, biometric_type), (device_id, biometric_type), template_hash, sync_status
**Relationships**: `employee` → Employee (N:1), `device` → Device (N:1)
**Properties**: `has_template_data` — checks if binary data is present

---

## 19. DeviceSyncStatus (`device_sync_status`)

**Base**: BaseModel | **Purpose**: Tracks synchronization state per device. Updated after every sync operation. One row per device.

**SyncHealth (string constants)**: HEALTHY, DEGRADED, CRITICAL, UNKNOWN

| Column | Type | Notes |
|--------|------|-------|
| device_id | UUID FK | → devices.id ON DELETE CASCADE, UNIQUE |
| total_users_on_device | Integer | default 0 |
| total_users_synced | Integer | default 0 |
| total_templates_stored | Integer | default 0 |
| total_templates_pushed | Integer | default 0 |
| pending_push_users | Integer | default 0 |
| pending_push_templates | Integer | default 0 |
| failed_syncs | Integer | default 0 |
| last_full_sync_at | DateTime | nullable |
| last_push_at | DateTime | nullable |
| last_pull_at | DateTime | nullable |
| last_error | Text | nullable |
| is_provisioned | Boolean | default False |
| provisioned_at | DateTime | nullable |
| sync_health | String(20) | default "unknown" |

**Relationships**: `device` → Device (N:1)

---

## 20. DeviceSyncLog (`device_sync_logs`)

**Base**: BaseModel | **Purpose**: Immutable audit log for all synchronization operations.

| Column | Type | Notes |
|--------|------|-------|
| device_id | UUID FK | → devices.id ON DELETE CASCADE, indexed |
| sync_type | String(30) | NOT NULL (push_users, push_templates, pull_users, pull_templates, full_sync, provisioning) |
| direction | String(10) | NOT NULL (push, pull, bidirectional) |
| status | String(20) | NOT NULL, default "running" (running, completed, failed, partial) |
| started_at | DateTime | NOT NULL |
| completed_at | DateTime | nullable |
| duration_ms | Integer | nullable |
| users_affected | Integer | default 0 |
| templates_affected | Integer | default 0 |
| errors_count | Integer | default 0 |
| error_details | JSONB | nullable |
| initiated_by | String(256) | NOT NULL, default "system" |
| extra_metadata | JSONB | nullable |

**Relationships**: `device` → Device (N:1)

---

## 21. DailyReport (`daily_reports`) + DailyReportLine (`daily_report_lines`)

**Base**: BaseModel | **Purpose**: Generated daily attendance reports with per-employee detail lines. Each report captures first scan = check-in, last scan = check-out.

### DailyReport

| Column | Type | Notes |
|--------|------|-------|
| report_date | Date | NOT NULL, indexed |
| department_id | UUID FK | → departments.id ON DELETE CASCADE, indexed |
| department_name | String(255) | NOT NULL |
| total_expected | Integer | default 0 |
| total_present | Integer | default 0 |
| total_late | Integer | default 0 |
| total_absent | Integer | default 0 |
| total_on_leave | Integer | default 0 |
| total_overtime | Integer | default 0 |
| total_early_departure | Integer | default 0 |
| generated_at | DateTime(tz) | NOT NULL |
| generated_by | UUID | nullable |
| is_final | bool | default False |

**Constraints**: UNIQUE(report_date, department_id)
**Relationships**: `lines` → DailyReportLine (1:N, cascade delete-orphan)

### DailyReportLine

| Column | Type | Notes |
|--------|------|-------|
| report_id | UUID FK | → daily_reports.id ON DELETE CASCADE, indexed |
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| employee_code | String(50) | NOT NULL |
| employee_name | String(255) | NOT NULL |
| department_name | String(255) | NOT NULL |
| position | String(255) | nullable |
| shift_name | String(100) | nullable |
| shift_start | Time | nullable |
| shift_end | Time | nullable |
| first_scan | DateTime(tz) | nullable |
| last_scan | DateTime(tz) | nullable |
| total_scans | Integer | default 0 |
| check_in | DateTime(tz) | nullable |
| check_out | DateTime(tz) | nullable |
| late_minutes | Float | default 0 |
| overtime_minutes | Float | default 0 |
| early_departure_minutes | Float | default 0 |
| duration_minutes | Float | default 0 |
| status | String(50) | default "absent" (on_time, late, absent, on_leave, off_duty, partial) |
| check_in_device | String(255) | nullable |
| check_out_device | String(255) | nullable |

**Constraints**: UNIQUE(report_id, employee_id)
**Relationships**: `report` → DailyReport (N:1)

---

## 22. SystemAlert (`system_alerts`)

**Base**: Base (no UUIDMixin/TimestampMixin — manages own id/timestamps) | **Purpose**: Server-persisted operational alerts with severity levels and acknowledgment workflow.

**Enums**:
- `AlertSeverity`: INFO, WARNING, CRITICAL, EMERGENCY
- `AlertCategory`: DEVICE, ATTENDANCE, SYSTEM, SECURITY, OPERATIONAL

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | default uuid4, indexed |
| severity | Enum(AlertSeverity) | NOT NULL, indexed |
| category | Enum(AlertCategory) | NOT NULL, indexed |
| title | String(255) | NOT NULL |
| message | Text | NOT NULL |
| source | String(100) | nullable, e.g. "attendance_worker" |
| source_id | String(100) | nullable, e.g. device_id |
| event_type | String(100) | nullable, e.g. "device_offline" |
| acknowledged | Boolean | default False, indexed |
| acknowledged_by | String(100) | nullable |
| acknowledged_at | DateTime(tz) | nullable |
| extra | JSONB | nullable, DB column name: "metadata" |
| resolution_note | Text | nullable |
| expires_at | DateTime(tz) | nullable, indexed |
| created_at | DateTime(tz) | NOT NULL |
| updated_at | DateTime(tz) | NOT NULL |

**Indexes**: (category, severity), (created_at, acknowledged)

---

## 23. DeviceHealthLog (`device_health_logs`)

**Base**: Base + UUIDMixin | **Purpose**: Time-series health check records for each device. One row per health probe attempt.

**Enum — HealthCheckResult**: SUCCESS, TIMEOUT, CONNECTION_REFUSED, SDK_ERROR, UNKNOWN_ERROR

| Column | Type | Notes |
|--------|------|-------|
| device_id | UUID FK | → devices.id ON DELETE CASCADE, indexed |
| check_result | Enum(HealthCheckResult) | NOT NULL |
| response_time_ms | Integer | nullable |
| error_message | Text | nullable |
| device_online | Boolean | nullable |
| scan_count_at_check | Integer | nullable |
| checked_by | String(100) | nullable, "health_worker" or "manual" |
| created_at | DateTime(tz) | NOT NULL |

---

## 24. DataIntegrityLog (`data_integrity_logs`)

**Base**: Base + UUIDMixin | **Purpose**: Records of integrity check runs and findings.

**Enums**:
- `CheckSeverity`: INFO, WARNING, ERROR, CRITICAL
- `CheckCategory`: SCAN_SESSION, SESSION_INVARIANT, SUMMARY_DRIFT, ORPHAN_RECORD, STUCK_PIPELINE, DAILY_REPORT, GENERAL

| Column | Type | Notes |
|--------|------|-------|
| check_category | Enum(CheckCategory) | NOT NULL, indexed |
| severity | Enum(CheckSeverity) | NOT NULL, indexed |
| check_name | String(200) | NOT NULL |
| message | Text | NOT NULL |
| affected_count | Integer | default 0 |
| affected_entity_type | String(100) | nullable |
| affected_ids | JSONB | nullable |
| resolved | Boolean | default False |
| resolved_at | DateTime(tz) | nullable |
| resolved_by | String(100) | nullable |
| resolution_note | Text | nullable |
| run_by | String(100) | nullable, "integrity_worker" or "manual" |
| run_id | String(100) | nullable, indexed, groups findings from same run |
| created_at | DateTime(tz) | NOT NULL |

---

## 25. Roster (`roster_snapshots` + `roster_entries`)

**Base**: BaseModel | **Purpose**: Monthly shift roster for FIA workforce scheduling. RosterSnapshot is the header; RosterEntry is per-employee-per-day.

**Enum — AssignmentType**: DAY, NIGHT, OFF, LEAVE, ABSENT, HOLIDAY, ADMIN

### RosterSnapshot

| Column | Type | Notes |
|--------|------|-------|
| department_id | UUID FK | → departments.id ON DELETE CASCADE, indexed |
| department_name | String(255) | NOT NULL |
| year | Integer | NOT NULL |
| month | Integer | NOT NULL, 1–12 |
| generated_at | DateTime(tz) | NOT NULL |
| generated_by | UUID FK | → users.id ON DELETE SET NULL, nullable |
| notes | Text | nullable |

**Constraints**: UNIQUE(department_id, year, month)
**Relationships**: `entries` → RosterEntry (1:N, cascade delete-orphan)

### RosterEntry

| Column | Type | Notes |
|--------|------|-------|
| snapshot_id | UUID FK | → roster_snapshots.id ON DELETE CASCADE, indexed |
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| employee_code | String(50) | NOT NULL |
| employee_name | String(255) | NOT NULL |
| department_name | String(255) | NOT NULL |
| entry_date | Date | NOT NULL, indexed |
| assignment | Enum(AssignmentType) | NOT NULL |
| pair_id | UUID FK | → shift_pairs.id ON DELETE SET NULL, nullable |
| pair_name | String(50) | nullable |
| shift_start | String(5) | nullable, "HH:MM" |
| shift_end | String(5) | nullable, "HH:MM" |
| is_overridden | Boolean | default False |
| override_reason | String(255) | nullable |

**Constraints**: UNIQUE(snapshot_id, employee_id, entry_date)
**Relationships**: `snapshot` → RosterSnapshot (N:1)

---

## 26. DeviceStatusHistory (`device_status_history`)

**Base**: Base + UUIDMixin | **Purpose**: Tracks device status transitions over time for uptime reporting, outage history, and reliability metrics.

| Column | Type | Notes |
|--------|------|-------|
| device_id | UUID FK | → devices.id ON DELETE CASCADE, indexed |
| status | String(20) | NOT NULL, indexed (online, offline, disconnected, warning, syncing) |
| ip_address | String(45) | nullable |
| firmware_version | String(50) | nullable |
| device_name | String(255) | nullable |
| reason | Text | nullable |
| recorded_at | DateTime(tz) | NOT NULL, default now, indexed |

---

## 27. EmployeeEnrollmentHistory (`employee_enrollment_history`)

**Base**: Base + UUIDMixin | **Purpose**: Immutable audit trail for enrollment lifecycle — tracks when employees are enrolled/updated/removed on biometric devices.

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| device_id | UUID FK | → devices.id ON DELETE CASCADE, indexed |
| device_user_id | String(50) | NOT NULL |
| action | String(30) | NOT NULL, indexed (enrolled, updated, removed, synced) |
| enrollment_type | String(30) | NOT NULL, default "fingerprint" (fingerprint, face, card, password, full_profile) |
| details | JSONB | nullable |
| created_at | DateTime(tz) | NOT NULL |

---

## 28. DeviceActivityLog (`device_activity_logs`)

**Base**: Base + UUIDMixin | **Purpose**: Immutable audit trail for all device activities — ADMS heartbeats, data pushes, restarts, user changes, template operations, etc.

| Column | Type | Notes |
|--------|------|-------|
| device_id | UUID FK | → devices.id ON DELETE CASCADE, indexed |
| activity_type | String(50) | NOT NULL, indexed (heartbeat, attendance_push, device_connected, device_disconnected, device_restarted, user_added, user_removed, user_updated, fingerprint_added, fingerprint_removed, face_added, card_added, data_sync, firmware_update, ip_change) |
| details | JSONB | nullable |
| ip_address | String(45) | nullable |
| created_at | DateTime(tz) | NOT NULL, indexed |

---

## 29. DeviceGroup (`device_groups`)

**Base**: BaseModel | **Purpose**: Logical grouping of biometric devices by location, department, or function.

| Column | Type | Notes |
|--------|------|-------|
| name | String(255) | UNIQUE, NOT NULL, indexed |
| description | Text | nullable |
| color | String(7) | nullable, hex color for UI |
| icon | String(50) | nullable, lucide icon name |

**Relationships**: `devices` → Device (1:N, back_populates="device_group")

---

## 30. OfflineSyncQueue (`offline_sync_queue`)

**Base**: BaseModel | **Purpose**: Queues sync operations when devices are offline. Automatically retries when devices come back online.

**Enums**:
- `QueueStatus`: PENDING, PROCESSING, COMPLETED, FAILED, EXPIRED
- `SyncOperation`: PUSH_USER, PUSH_TEMPLATE, PUSH_ALL, FULL_SYNC

| Column | Type | Notes |
|--------|------|-------|
| device_id | UUID FK | → devices.id ON DELETE CASCADE, indexed |
| employee_id | UUID FK | → employees.id ON DELETE SET NULL, nullable, indexed |
| operation | String(30) | NOT NULL, indexed |
| status | String(20) | NOT NULL, default "pending", indexed |
| payload | JSONB | nullable |
| error_message | Text | nullable |
| retry_count | Integer | default 0 |
| max_retries | Integer | default 5 |
| queued_at | DateTime(tz) | NOT NULL |
| last_retry_at | DateTime(tz) | nullable |
| completed_at | DateTime(tz) | nullable |
| initiated_by | String(256) | NOT NULL, default "system" |

---

## 31. EnrollmentSession (`enrollment_sessions`)

**Base**: BaseModel | **Purpose**: Tracks biometric enrollment sessions for employees.

**Status constants (EnrollmentStatus)**: WAITING_FOR_FINGERPRINT, FINGERPRINT_IN_PROGRESS, FINGERPRINT_CAPTURED, WAITING_FOR_FACE, FACE_IN_PROGRESS, FACE_CAPTURED, ENROLLMENT_COMPLETE, CANCELLED, FAILED

**Status constants (BiometricStatus)**: PENDING, IN_PROGRESS, CAPTURED, SKIPPED, FAILED

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| device_id | UUID FK | → devices.id ON DELETE SET NULL, nullable, indexed |
| status | String(30) | NOT NULL, default "waiting_for_fingerprint", indexed |
| fingerprint_status | String(30) | NOT NULL, default "pending" |
| face_status | String(30) | NOT NULL, default "pending" |
| fingerprint_template_count | Integer | NOT NULL, default 0 |
| face_template_count | Integer | NOT NULL, default 0 |
| error_message | Text | nullable |
| started_by_user_id | UUID | nullable |
| started_by_username | String(100) | nullable |
| started_at | DateTime(tz) | NOT NULL |
| fingerprint_captured_at | DateTime(tz) | nullable |
| face_captured_at | DateTime(tz) | nullable |
| completed_at | DateTime(tz) | nullable |
| cancelled_at | DateTime(tz) | nullable |
| metadata_ | JSONB | nullable, DB column "metadata" |

**Relationships**: `employee` → Employee (N:1), `device` → Device (N:1, optional)

---

## 32. EnrollmentEvent (`enrollment_events`)

**Base**: BaseModel | **Purpose**: Individual enrollment events for real-time WebSocket broadcasting.

| Column | Type | Notes |
|--------|------|-------|
| session_id | UUID FK | → enrollment_sessions.id ON DELETE CASCADE, indexed |
| employee_id | UUID FK | → employees.id ON DELETE CASCADE |
| device_id | UUID FK | → devices.id ON DELETE SET NULL, nullable |
| event_type | String(30) | NOT NULL, indexed (started, fingerprint_captured, face_captured, completed, failed, cancelled) |
| biometric_type | String(20) | NOT NULL (fingerprint, face, card, password) |
| details | JSONB | nullable |

**Relationships**: `session` → EnrollmentSession (N:1), `employee` → Employee (N:1), `device` → Device (N:1, optional)

---

## 33. FaceTemplate (`face_templates`)

**Base**: BaseModel | **Purpose**: Stores face biometric templates captured during enrollment.

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| device_id | UUID FK | → devices.id ON DELETE SET NULL, nullable, indexed |
| enrollment_session_id | UUID FK | → enrollment_sessions.id ON DELETE SET NULL, nullable |
| template_data | LargeBinary | nullable |
| template_size | Integer | nullable, default 0 |
| template_hash | String(64) | nullable |
| face_image | LargeBinary | nullable, face photo if device supports |
| face_version | Integer | nullable, default 1 |
| quality_score | Float | nullable |
| sync_status | String(20) | NOT NULL, default "pending" |
| last_synced_at | DateTime(tz) | nullable |
| is_active | Boolean | NOT NULL, default True |

**Relationships**: `employee` → Employee (N:1), `device` → Device (N:1), `enrollment_session` → EnrollmentSession (N:1)

---

## 34. EmployeeStatusTransition (`employee_status_transitions`)

**Base**: BaseModel | **Purpose**: Audit trail for all employee status changes.

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| from_status | String(30) | nullable |
| to_status | String(30) | NOT NULL |
| reason | Text | nullable |
| changed_by_user_id | UUID | nullable |
| changed_by_username | String(100) | nullable |
| ip_address | String(45) | nullable |

**Relationships**: `employee` → Employee (N:1)

---

## 35. BackupJob (`backup_jobs`)

**Base**: BaseModel | **Purpose**: Tracks automated and manual PostgreSQL backup jobs.

**Enums**:
- `BackupStatus`: PENDING, RUNNING, COMPLETED, FAILED, EXPIRED
- `BackupType`: FULL, SCHEMA_ONLY, DATA_ONLY

| Column | Type | Notes |
|--------|------|-------|
| status | Enum(BackupStatus) | NOT NULL, default PENDING, indexed |
| backup_type | Enum(BackupType) | NOT NULL, default FULL |
| file_name | String(512) | nullable |
| file_path | String(1024) | nullable |
| file_size_bytes | BigInteger | nullable |
| checksum_sha256 | String(128) | nullable |
| database_name | String(256) | nullable |
| duration_seconds | Integer | nullable |
| error_message | Text | nullable |
| init_by | String(256) | NOT NULL, default "scheduler" |
| scheduled_at | DateTime(tz) | nullable |
| started_at | DateTime(tz) | nullable |
| completed_at | DateTime(tz) | nullable |
| expires_at | DateTime(tz) | nullable, indexed |
| extra_metadata | JSONB | nullable |

---

## 36. ExpectedAttendance (`expected_attendance`)

**Base**: Base + UUIDMixin | **Purpose**: Pre-computed daily workforce expectations per employee. One row per employee per operational shift date. Generated by the roster engine from shift assignments + department rules.

**Status lifecycle**: expected → checked_in → checked_out; expected → late (after grace); expected → absent (after checkin_window_end); expected → on_leave / holiday / weekend_off / unscheduled

| Column | Type | Notes |
|--------|------|-------|
| employee_id | UUID FK | → employees.id ON DELETE CASCADE, indexed |
| department_id | UUID FK | → departments.id ON DELETE SET NULL, nullable |
| office_id | UUID FK | → offices.id ON DELETE SET NULL, nullable |
| shift_template_id | UUID FK | → shift_templates.id ON DELETE SET NULL, nullable |
| resolution_source | String(30) | NOT NULL, default "unscheduled" (override, assignment, department_rule, unscheduled) |
| shift_date | Date | NOT NULL, indexed |
| expected_checkin | DateTime(tz) | nullable |
| expected_checkout | DateTime(tz) | nullable |
| checkin_window_start | DateTime(tz) | nullable |
| checkin_window_end | DateTime(tz) | nullable |
| checkout_window_start | DateTime(tz) | nullable |
| checkout_window_end | DateTime(tz) | nullable |
| status | String(30) | NOT NULL, default "expected" (expected, checked_in, checked_out, late, absent, half_day, on_leave, holiday, weekend_off, overtime, incomplete, unscheduled) |
| actual_checkin | DateTime(tz) | nullable |
| actual_checkout | DateTime(tz) | nullable |
| attendance_session_id | UUID FK | → attendance_sessions.id ON DELETE SET NULL, nullable |
| late_minutes | Numeric(6,1) | nullable, default 0 |
| early_minutes | Numeric(6,1) | nullable, default 0 |
| overtime_minutes | Numeric(6,1) | nullable, default 0 |
| duration_minutes | Numeric(8,1) | nullable |
| generated_at | DateTime(tz) | NOT NULL |
| finalized_at | DateTime(tz) | nullable |
| auto_generated | Boolean | NOT NULL, default True |
| notes | Text | nullable |
| created_at | DateTime(tz) | NOT NULL |
| updated_at | DateTime(tz) | NOT NULL |

**Constraints**: UNIQUE(employee_id, shift_date)

---

## Summary of All Enums (consolidated)

| Enum | Values | Used In |
|------|--------|---------|
| ProtocolType | fixed, rotating, custom | ShiftProtocol |
| HolidayType | public, organizational, departmental | HolidayCalendar |
| HolidayScope | organization, department | HolidayCalendar |
| LeaveType | annual, sick, maternity, paternity, unpaid, emergency | LeaveRequest |
| LeaveStatus | pending, approved, rejected | LeaveRequest |
| BiometricType | fingerprint, face, palm, rfid, pin | FingerprintTemplate |
| SyncStatus | synced, pending, failed, outdated | FingerprintTemplate |
| HealthCheckResult | success, timeout, connection_refused, sdk_error, unknown_error | DeviceHealthLog |
| CheckSeverity | info, warning, error, critical | DataIntegrityLog |
| CheckCategory | scan_session, session_invariant, summary_drift, orphan_record, stuck_pipeline, daily_report, general | DataIntegrityLog |
| AssignmentType | DAY, NIGHT, OFF, LEAVE, ABSENT, HOLIDAY, ADMIN | RosterEntry |
| AlertSeverity | INFO, WARNING, CRITICAL, EMERGENCY | SystemAlert |
| AlertCategory | device, attendance, system, security, operational | SystemAlert |
| BackupStatus | pending, running, completed, failed, expired | BackupJob |
| BackupType | full, schema_only, data_only | BackupJob |
| QueueStatus | pending, processing, completed, failed, expired | OfflineSyncQueue |
| SyncOperation | push_user, push_template, push_all, full_sync | OfflineSyncQueue |
| SyncHealth | healthy, degraded, critical, unknown | DeviceSyncStatus (string constants, not enum) |
| EnrollmentStatus | waiting_for_fingerprint, fingerprint_in_progress, ... , failed | EnrollmentSession (string constants) |
| BiometricStatus | pending, in_progress, captured, skipped, failed | EnrollmentSession (string constants) |

---

## Summary of All Tables (38 tables total)

| # | Table Name | Model Class | Base |
|---|-----------|-------------|------|
| 1 | organizations | Organization | BaseModel |
| 2 | offices | Office | BaseModel |
| 3 | departments | Department | BaseModel |
| 4 | shifts | Shift | BaseModel |
| 5 | shift_templates | ShiftTemplate | BaseModel |
| 6 | shift_protocols | ShiftProtocol | BaseModel |
| 7 | shift_pairs | ShiftPair | BaseModel |
| 8 | shift_pair_members | ShiftPairMember | BaseModel |
| 9 | employee_shift_assignments | EmployeeShiftAssignment | BaseModel |
| 10 | employee_shift_overrides | EmployeeShiftOverride | BaseModel |
| 11 | department_shift_rules | DepartmentShiftRule | BaseModel |
| 12 | employee_device_mappings | EmployeeDeviceMapping | BaseModel |
| 13 | employee_device_assignments | EmployeeDeviceAssignment | BaseModel |
| 14 | employee_device_group_assignments | EmployeeDeviceGroupAssignment | BaseModel |
| 15 | attendance_summaries | AttendanceSummary | Base+UUID |
| 16 | audit_logs | AuditLog | BaseModel |
| 17 | holiday_calendar | HolidayCalendar | BaseModel |
| 18 | leave_requests | LeaveRequest | BaseModel |
| 19 | device_users | DeviceUser | BaseModel |
| 20 | fingerprint_templates | FingerprintTemplate | BaseModel |
| 21 | device_sync_status | DeviceSyncStatus | BaseModel |
| 22 | device_sync_logs | DeviceSyncLog | BaseModel |
| 23 | daily_reports | DailyReport | BaseModel |
| 24 | daily_report_lines | DailyReportLine | BaseModel |
| 25 | system_alerts | SystemAlert | Base (custom) |
| 26 | device_health_logs | DeviceHealthLog | Base+UUID |
| 27 | data_integrity_logs | DataIntegrityLog | Base+UUID |
| 28 | roster_snapshots | RosterSnapshot | BaseModel |
| 29 | roster_entries | RosterEntry | BaseModel |
| 30 | device_status_history | DeviceStatusHistory | Base+UUID |
| 31 | employee_enrollment_history | EmployeeEnrollmentHistory | Base+UUID |
| 32 | device_activity_logs | DeviceActivityLog | Base+UUID |
| 33 | device_groups | DeviceGroup | BaseModel |
| 34 | offline_sync_queue | OfflineSyncQueue | BaseModel |
| 35 | enrollment_sessions | EnrollmentSession | BaseModel |
| 36 | enrollment_events | EnrollmentEvent | BaseModel |
| 37 | face_templates | FaceTemplate | BaseModel |
| 38 | employee_status_transitions | EmployeeStatusTransition | BaseModel |
| 39 | backup_jobs | BackupJob | BaseModel |
| 40 | expected_attendance | ExpectedAttendance | Base+UUID |

---

## Key Relationship Graph (simplified)

```
Organization (1) ──→ (N) Office (1) ──→ (N) Department
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        ↓                     ↓                     ↓
                   (N) Employee          (N) Device            ShiftProtocol
                        │                     │                     │
          ┌─────────────┼──────────┐          │           ┌────────┼────────┐
          ↓             ↓          ↓          ↓           ↓        ↓        ↓
   DeviceMapping  ShiftAssignment  ShiftOverride   DeviceGroup  ShiftPair  DeptShiftRule
          │             │
          ↓             ↓
   AttendanceSummary  ExpectedAttendance
```

**Not in these 36 files but referenced via FKs**: `Employee`, `Device`, `User`, `Role`, `AttendanceSession`, `AttendanceLog`, `RawAttendancePayload` — these models exist elsewhere in the codebase.

**Files touched**: All 36 files listed in the task + `backend/app/database/base.py`
**Findings worth promoting**:
- The shift system has 4 resolution levels: override > assignment > department_rule > unscheduled
- `SystemAlert` uses old-style `Column()` instead of `mapped_column()` — inconsistent with all other models
- `SyncHealth` and `EnrollmentStatus`/`BiometricStatus` are plain string constants, not proper enums — unlike all other status-like fields that use `str, enum.Enum`
- `AttendanceSummary` and several monitoring tables use `Base + UUIDMixin` without `TimestampMixin`, managing timestamps manually
- `FingerprintTemplate` is the central biometric repository (supports fingerprint, face, palm, rfid, pin types)
- `ExpectedAttendance` is the core state machine for daily attendance lifecycle tracking
