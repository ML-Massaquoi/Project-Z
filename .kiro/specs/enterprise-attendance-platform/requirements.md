# Requirements Document

## Introduction

This document defines the requirements for redesigning the existing biometric attendance system into a production-grade **Enterprise Workforce Operations Platform** for Freetown International Airport. The redesign introduces a strict four-layer architecture that permanently separates raw biometric event ingestion from attendance interpretation, adds a fully shift-aware and department-aware attendance engine, rotating and cross-midnight shift support, real-time live monitoring, and deep department analytics — all while guaranteeing that no scan is ever rejected or deleted.

---

## Glossary

- **ADMS**: Automatic Data Management System — the HTTP push protocol used by ZKTeco/RONASOFT biometric devices.
- **Attendance_Engine**: Background service that interprets raw scan events into structured attendance records.
- **Attendance_Session**: One employee's attendance for one shift occurrence — check-in, check-out, duration, status.
- **Attendance_Summary**: Aggregated per-department, per-date snapshot of attendance statistics.
- **Check-in_Window**: Time range within which the first valid scan is accepted as the employee's reporting time.
- **Check-out_Window**: Time range within which the last valid scan is accepted as the employee's departure time.
- **Cross-midnight_Shift**: A shift whose end time falls on the calendar day after its start time (e.g., 20:00–08:00).
- **Department_Shift_Rule**: Configuration assigning a shift template to a department with window and grace overrides.
- **Device**: A ZKTeco or RONASOFT biometric terminal that pushes scans via ADMS.
- **Employee_Shift_Assignment**: Record assigning a specific shift template to an individual employee.
- **Employee_Shift_Override**: Time-bounded record temporarily replacing an employee's shift for a date range.
- **Grace_Period**: Minutes after shift start within which an employee is still considered on time.
- **Holiday_Calendar**: Table of non-working dates affecting attendance status computation.
- **Ingestion_Pipeline**: Synchronous path: ADMS push → raw scan storage → WebSocket broadcast. Must never block.
- **Leave_Request**: Record indicating an employee is on approved leave for a date range.
- **Raw_Scan_Event**: Immutable record of a single biometric interaction, stored before any interpretation.
- **Redis_Queue**: Redis-backed async task queue decoupling ingestion from attendance processing.
- **Rotating_Shift**: Schedule where employees cycle through multiple shift templates on a defined pattern.
- **Scan_Event**: Synonym for Raw_Scan_Event; primary table name is `scan_events`.
- **Shift_Template**: Reusable work period definition: start/end times, windows, grace period, working hours.
- **WebSocket_Manager**: Service maintaining active WebSocket connections and broadcasting real-time events.
- **Workforce_Operations_Platform**: The complete redesigned system described in this document.

---

## Requirements

---

### Requirement 1: Raw Scan Ingestion — Immutable Event Store

**User Story:** As an airport operations manager, I want every biometric scan to be permanently stored the moment it arrives, so that the audit trail is complete and no scan can ever be lost, rejected, or deleted.

#### Acceptance Criteria

1. WHEN a biometric device pushes an ATTLOG payload via ADMS, THE Ingestion_Pipeline SHALL store each scan record in the `scan_events` table before performing any other processing.
2. THE Ingestion_Pipeline SHALL store scan records regardless of whether the employee is recognized, the scan result is successful, or the device is fully configured.
3. THE `scan_events` table SHALL capture: `id`, `employee_id` (nullable), `employee_code`, `employee_name` (nullable), `department_id` (nullable), `office_id` (nullable), `device_id` (nullable), `verification_method`, `scan_result`, `raw_punch_state`, `raw_payload` (JSONB), `scan_timestamp`, `processing_status`, `websocket_broadcasted`, and `created_at`.
4. THE Ingestion_Pipeline SHALL support verification methods: `fingerprint`, `face`, `card`, and `password`.
5. THE Ingestion_Pipeline SHALL classify each scan with one of: `successful`, `duplicate`, `unknown_user`, `unknown_device`, `rejected`, `movement`, or `retry`.
6. IF a scan arrives from an unrecognized device serial number, THEN THE Ingestion_Pipeline SHALL store the raw payload with `device_id` set to null and `scan_result` set to `unknown_device`.
7. THE `scan_events` table SHALL be append-only — the `scan_result` and `scan_timestamp` fields SHALL never be updated after initial insert. Only `processing_status` and `websocket_broadcasted` may be updated post-insert.
8. IF the database write for a scan record fails, THEN THE Ingestion_Pipeline SHALL log the failure with the raw payload and SHALL still respond "OK" to the device to prevent data loss from device-side retries.
9. THE Ingestion_Pipeline SHALL complete raw scan storage within 100 milliseconds of receiving the complete ADMS HTTP request body, measured from body receipt to successful database flush.
10. THE `processing_status` field SHALL only contain one of: `pending`, `queued`, `queued_offline`, `processing`, `processed`, `failed`, or `out_of_window`.

---

### Requirement 2: Live Real-Time Monitoring — Non-Blocking Broadcast

**User Story:** As a security supervisor, I want to see every scan appear on the live dashboard the instant it happens, so that I can monitor airport staff movements in real time without waiting for attendance calculations.

#### Acceptance Criteria

1. WHEN a scan record is stored in `scan_events`, THE WebSocket_Manager SHALL broadcast a `scan_event` message to all connected dashboard clients before the Attendance_Engine begins processing.
2. THE Ingestion_Pipeline SHALL execute in this exact sequence: (1) receive ADMS push, (2) store Raw_Scan_Event, (3) broadcast WebSocket `scan_event`, (4) enqueue background attendance task. Steps 3 and 4 SHALL NOT block step 2.
3. WHILE the Attendance_Engine is processing or has failed, THE WebSocket_Manager SHALL continue broadcasting `scan_event` messages for all newly arriving scans without interruption.
4. THE `scan_event` WebSocket payload SHALL include: `employee_photo_url` (null if unknown), `employee_name` (null if unknown), `employee_code`, `department_name` ("Unassigned" if none), `office_name` ("Unassigned" if none), `device_name`, `verification_method`, `scan_timestamp`, `scan_result`, and `shift_type` (one of: `day`, `night`, `overnight`, `unscheduled`, or `unknown`). All fields SHALL be present; none SHALL be null except `employee_photo_url` and `employee_name` for unknown employees.
5. WHEN a scan arrives from an unknown employee (no matching device-user mapping), THE WebSocket_Manager SHALL broadcast an `unknown_user_alert` event containing: `device_serial_number`, `raw_device_user_id`, and `scan_timestamp`.
6. WHEN a device's last ADMS activity exceeds 60 seconds, THE device offline watcher SHALL mark the device offline and THE WebSocket_Manager SHALL broadcast a `device_status_update` event within 5 seconds of that threshold being crossed.
7. THE WebSocket_Manager SHALL support exactly these event types: `scan_event`, `attendance_update`, `department_summary_update`, `device_status_update`, `late_alert`, and `unknown_user_alert`.
8. WHEN a new scan arrives, THE live dashboard SHALL display the scan card at the top of the Live Scan Feed within 2 seconds of the scan's `scan_timestamp`, measured end-to-end from device push to browser render.

---

### Requirement 3: Shift Template System

**User Story:** As an HR administrator, I want to define reusable shift templates with precise time windows and grace periods, so that the attendance engine can correctly evaluate every employee's punctuality regardless of their work schedule.

#### Acceptance Criteria

1. THE Workforce_Operations_Platform SHALL support shift templates with: `name` (max 100 chars), `code` (max 50 chars, unique), `start_time`, `end_time`, `checkin_window_start`, `checkin_window_end`, `checkout_window_start`, `checkout_window_end`, `grace_period_minutes` (integer 0–120), `break_duration_minutes` (integer 0–480), `working_hours` (decimal 0.0–24.0), and `is_overnight` (boolean).
2. THE Workforce_Operations_Platform SHALL accept shift template creation for day shifts (end > start, same day), night shifts (end > start, same day, starting after 18:00), and cross-midnight shifts (`is_overnight = true`, end < start) without returning an error for any of these configurations.
3. WHEN `is_overnight` is true for a Shift_Template, THE Attendance_Engine SHALL set the `shift_date` field of the resulting Attendance_Session to the calendar date of the shift's `start_time`, not the calendar date of the employee's scan.
4. WHEN a Shift_Template has a grace period of N minutes and an employee's first scan within the Check-in_Window falls at or before N minutes after `start_time`, THE Attendance_Engine SHALL set the Attendance_Session status to `present`.
5. WHEN a Shift_Template has a grace period of N minutes and an employee's first scan within the Check-in_Window falls more than N minutes after `start_time`, THE Attendance_Engine SHALL set the Attendance_Session status to `late` and record `late_minutes` as `floor((scan_time − start_time).total_seconds() / 60)`.
6. WHEN resolving grace period for a scan, THE Attendance_Engine SHALL use the most specific configured value in this precedence order: Employee_Shift_Assignment `grace_period_override` → Department_Shift_Rule `grace_period_override` → Shift_Template `grace_period_minutes`.

---

### Requirement 4: Department Shift Rules and Assignment Architecture

**User Story:** As an operations director, I want to assign shift schedules at the department level with per-employee overrides, so that each department's unique working pattern is enforced automatically.

#### Acceptance Criteria

1. THE Workforce_Operations_Platform SHALL support assigning one or more Shift_Templates to a department via Department_Shift_Rules with `effective_from` and `effective_to` date fields. IF two Department_Shift_Rules for the same department have overlapping effective date ranges, THEN the system SHALL reject the second rule with a 409 Conflict error and preserve the existing rule.
2. THE Workforce_Operations_Platform SHALL support assigning a Shift_Template directly to an individual employee via Employee_Shift_Assignments, which overrides the department-level rule for that employee.
3. WHEN resolving an employee's shift for a given date, THE Attendance_Engine SHALL apply this precedence: (1) Employee_Shift_Override where `start_date <= date <= end_date` → (2) Employee_Shift_Assignment → (3) Department_Shift_Rule where `effective_from <= date <= effective_to` → (4) unscheduled. Weekend and holiday classification (criteria 8–9) applies only when no override or assignment is active for that date.
4. THE Workforce_Operations_Platform SHALL support rotating shift schedules where an Employee_Shift_Assignment references an ordered list of 2–30 Shift_Templates and a `rotation_start_date`. THE Attendance_Engine SHALL compute the active template for a given date as `templates[(date − rotation_start_date).days % len(templates)]`.
5. WHEN a rotating shift's cycle position resolves to a Shift_Template with `code = 'OFF'`, THE Attendance_Engine SHALL classify the attendance status as `weekend_off` and SHALL NOT evaluate check-in or check-out windows for that date.
6. THE Workforce_Operations_Platform SHALL support configuring a `weekend_days` set (subset of Mon–Sun) per Department_Shift_Rule. WHEN a scan occurs on a day in `weekend_days` and no Employee_Shift_Override or Employee_Shift_Assignment is active for that date, THE Attendance_Engine SHALL classify the status as `weekend_off`.
7. WHEN a scan occurs on a date present in the Holiday_Calendar for the employee's organization and no Employee_Shift_Override or Employee_Shift_Assignment is active for that date, THE Attendance_Engine SHALL classify the status as `holiday`.

---

### Requirement 5: Attendance Windows — Scan Interpretation Boundaries

**User Story:** As an HR manager, I want check-in and check-out windows defined per shift, so that lunch-break scans and internal movement scans are never misinterpreted as departure times.

#### Acceptance Criteria

1. IF a scan's timestamp falls within the Check-in_Window (`checkin_window_start` ≤ scan_time ≤ `checkin_window_end`) for the employee's active shift, THEN THE Attendance_Engine SHALL consider it a candidate check-in scan.
2. IF a scan's timestamp falls within the Check-out_Window (`checkout_window_start` ≤ scan_time ≤ `checkout_window_end`) for the employee's active shift, THEN THE Attendance_Engine SHALL consider it a candidate check-out scan.
3. WHEN a scan falls outside both the Check-in_Window and the Check-out_Window, THE Attendance_Engine SHALL set that scan's `processing_status` to `out_of_window` and SHALL NOT update the Attendance_Session with that scan.
4. THE Attendance_Engine SHALL use the chronologically first candidate check-in scan as the employee's `check_in` time. All subsequent scans within the Check-in_Window SHALL have `processing_status` set to `processed` but SHALL NOT update `check_in`.
5. THE Attendance_Engine SHALL use the chronologically last candidate check-out scan as the employee's `check_out` time, updating it each time a later scan arrives within the Check-out_Window.
6. WHEN the Check-out_Window closes (i.e., current time passes `checkout_window_end`) and the employee has a valid `check_in` but no `check_out`, THE Attendance_Engine SHALL set the Attendance_Session's `checkout_status` to `missed_checkout`.
7. WHEN midnight UTC passes and an employee has no candidate check-in scan within the Check-in_Window for a scheduled shift day, THE Attendance_Engine SHALL create an Attendance_Session with status `absent` for that employee and shift date during the daily rollover process.
8. WHEN a scan falls within both the Check-in_Window and the Check-out_Window (overlapping windows), THE Attendance_Engine SHALL treat it as a check-in candidate if no `check_in` exists for the session, and as a check-out candidate otherwise.

---

### Requirement 6: Cross-Midnight Shift Handling

**User Story:** As a night operations manager, I want overnight shifts (e.g., 20:00–08:00) to be correctly attributed to the shift date rather than the calendar date of each scan, so that night workers' attendance is never split across two days.

#### Acceptance Criteria

1. WHEN a Shift_Template has `is_overnight = true`, THE Attendance_Engine SHALL define the shift's active span as: `checkin_window_start` on date D through `checkout_window_end` on date D+1. All scans within this span SHALL be associated with the single Attendance_Session for shift date D.
2. WHEN evaluating whether a scan at time T on date D+1 belongs to an overnight shift starting on date D, THE Attendance_Engine SHALL check: `T ≤ checkout_window_end` on date D+1. IF true, THE Attendance_Engine SHALL attribute the scan to the Attendance_Session for date D.
3. WHEN a cross-midnight shift employee scans at any time between `checkin_window_start` on date D and `checkout_window_end` on date D+1, THE Attendance_Engine SHALL set the Attendance_Session's `shift_date` to D, not to the calendar date of the scan.
4. WHEN computing `duration_minutes` for a cross-midnight shift, THE Attendance_Engine SHALL calculate `(check_out_timestamp − check_in_timestamp).total_seconds() / 60`, which naturally handles the midnight boundary without special-casing.
5. WHEN the daily rollover process runs at midnight UTC, THE Attendance_Engine SHALL NOT auto-close Attendance_Sessions for overnight shifts where the current time falls before `checkout_window_end` on date D+1.
6. WHEN a scan arrives after midnight on date D+1 and no open overnight session exists for the employee on date D, THE Attendance_Engine SHALL check whether the scan falls within the Check-in_Window of a new shift starting on date D+1 before creating a new session for D+1.

---

### Requirement 7: Attendance Status Computation

**User Story:** As an HR administrator, I want the system to automatically compute a precise attendance status for every employee every day, so that I have accurate records without manual intervention.

#### Acceptance Criteria

1. THE Attendance_Engine SHALL compute exactly one primary status per Attendance_Session from this ordered evaluation: `holiday` → `on_leave` → `vacation` → `weekend_off` → `absent` → `missed_checkin` → `unscheduled_attendance` → `present` / `late` / `early_arrival` / `half_day` / `missed_checkout` / `unknown_shift`. The first matching condition wins.
2. WHEN an employee's `check_in` timestamp is more than 30 minutes before `shift_start_time`, THE Attendance_Engine SHALL set status to `early_arrival` and record `early_minutes` as `floor((start_time − check_in).total_seconds() / 60)`.
3. WHEN an employee has both `check_in` and `check_out` and `duration_minutes < (working_hours × 60 × 0.5)`, THE Attendance_Engine SHALL set status to `half_day`. This criterion requires both timestamps to be present; it SHALL NOT apply when `check_out` is null.
4. WHEN an approved Leave_Request of type `vacation` covers the employee's shift date, THE Attendance_Engine SHALL set status to `vacation`. WHEN an approved Leave_Request of any other type covers the shift date, THE Attendance_Engine SHALL set status to `on_leave`. Leave status takes precedence over all scan-derived statuses.
5. WHEN an employee scans on a day with no resolved shift assignment (precedence chain in Req 4 C3 yields unscheduled) and no leave record, THE Attendance_Engine SHALL set status to `unscheduled_attendance`.
6. THE Attendance_Engine SHALL record `overtime_minutes` as a separate numeric field (not a status). WHEN `duration_minutes > (working_hours × 60)`, `overtime_minutes = duration_minutes − (working_hours × 60)`, rounded to one decimal place.
7. WHEN a new valid scan is received within the session's active window (Check-in_Window start through Check-out_Window end), THE Attendance_Engine SHALL recompute the Attendance_Session status and update `overtime_minutes`, `duration_minutes`, `late_minutes`, and `check_out` accordingly.
8. THE Attendance_Engine SHALL apply status evaluation in this priority order when multiple conditions are simultaneously true: `holiday` > `on_leave` > `vacation` > `weekend_off` > `absent` > all scan-derived statuses.
9. WHEN an employee has no `check_in` for a scheduled shift day (not holiday, not leave, not weekend_off) and the Check-in_Window has closed, THE Attendance_Engine SHALL set status to `missed_checkin`. WHEN an employee has no resolved shift for a scan date and no leave record, THE Attendance_Engine SHALL set status to `unknown_shift` if the shift resolution returned an error, or `unscheduled_attendance` if it returned no shift.

---

### Requirement 8: Background Attendance Processing Pipeline

**User Story:** As a system architect, I want attendance processing to run asynchronously in the background, so that raw scan ingestion and live broadcasting are never delayed by computation.

#### Acceptance Criteria

1. WHEN a Raw_Scan_Event is stored, THE Ingestion_Pipeline SHALL publish a task message to the Redis stream `projectz:attendance_tasks` containing the `scan_event_id`, without awaiting the consumer's acknowledgement.
2. THE Attendance_Engine consumer SHALL read from `projectz:attendance_tasks` using Redis Streams consumer groups, processing each task exactly once per consumer group. Each task SHALL be acknowledged (`XACK`) only after successful attendance computation.
3. WHEN the Attendance_Engine fails to process a scan event, THE Workforce_Operations_Platform SHALL update `processing_status` to `failed` in `scan_events`, log the error with `scan_event_id` and exception details, and leave the message unacknowledged for retry up to 3 attempts. After 3 failures, `processing_status` SHALL be set to `failed_permanent`.
4. THE Ingestion_Pipeline SHALL respond to the ADMS device with "OK" within 500 milliseconds of receiving the complete request body, regardless of Redis availability or Attendance_Engine state.
5. WHEN the Redis stream is unavailable at ingestion time, THE Ingestion_Pipeline SHALL set `processing_status` to `queued_offline` and SHALL NOT enqueue the task. A background recovery task SHALL poll for `queued_offline` records every 60 seconds and re-enqueue them when Redis becomes available.
6. WHEN the Attendance_Engine successfully processes a scan, THE Attendance_Engine SHALL update `processing_status` to `processed` in the `scan_events` record for that scan.
7. WHEN the Attendance_Engine completes processing a scan and updates an Attendance_Session, THE Attendance_Engine SHALL publish an `attendance_update` WebSocket event containing: `session_id`, `employee_id`, `employee_code`, `shift_date`, `check_in`, `check_out`, `status`, `late_minutes`, `overtime_minutes`, and `duration_minutes`.

---

### Requirement 9: Department Attendance Analytics

**User Story:** As a department head, I want to see a real-time summary of my department's attendance every day, so that I can immediately identify staffing gaps and take action.

#### Acceptance Criteria

1. THE Workforce_Operations_Platform SHALL maintain an `attendance_summaries` table with one row per `(department_id, summary_date)` containing: `expected_count`, `present_count`, `late_count`, `absent_count`, `on_leave_count`, `vacation_count`, `overtime_count`, and `on_shift_count`.
2. WHEN an Attendance_Session status changes, THE Attendance_Engine SHALL update the corresponding row in `attendance_summaries` within 10 seconds of the status change.
3. WHEN an `attendance_summaries` row is updated, THE Attendance_Engine SHALL publish a `department_summary_update` WebSocket event containing: `department_id`, `department_name`, `summary_date`, and all eight count fields.
4. THE Workforce_Operations_Platform SHALL expose `GET /api/v1/analytics/departments/summary?date={YYYY-MM-DD}` returning the `attendance_summaries` row for every department for the specified date. WHEN no data exists for the date, the endpoint SHALL return an empty array with HTTP 200.
5. THE Workforce_Operations_Platform SHALL expose `GET /api/v1/analytics/departments/{dept_id}/summary?start_date={}&end_date={}` returning daily summaries for the specified department. WHEN the date range exceeds 90 days, the endpoint SHALL return HTTP 400 with message "Date range must not exceed 90 days."
6. THE `on_shift_count` field SHALL equal the count of Attendance_Sessions for the department on the current date where `check_in IS NOT NULL AND check_out IS NULL` and the current time falls within the session's shift Check-in_Window start through Check-out_Window end.
7. WHEN a `department_summary_update` event is received by the frontend, THE live dashboard SHALL update the department panel for the affected department within 2 seconds of receiving the event.

---

### Requirement 10: Live Dashboard — Real-Time Operations Monitor

**User Story:** As an airport operations controller, I want a live dashboard that shows every scan, every department's status, and every active employee in real time, so that I can monitor the entire workforce from a single screen.

#### Acceptance Criteria

1. THE live dashboard SHALL display a Live Scan Feed in reverse chronological order. WHEN a `scan_event` WebSocket message is received, THE dashboard SHALL prepend the new scan card to the top of the feed within 2 seconds of the scan's `scan_timestamp`.
2. THE live dashboard SHALL render each scan card with: employee avatar (initials fallback if no photo), employee full name ("Unknown" if null), employee code, department name ("Unassigned" if null), office name ("Unassigned" if null), device name, verification method icon, scan timestamp formatted as `HH:MM:SS`, scan result badge (color-coded), and shift type label.
3. THE live dashboard SHALL display a Department Activity panel. WHEN a `department_summary_update` event is received, THE panel SHALL update the affected department's counts within 2 seconds.
4. THE live dashboard SHALL display an Active Employees panel listing employees with `check_in IS NOT NULL AND check_out IS NULL` for the current date, refreshed on each `attendance_update` event.
5. THE live dashboard SHALL display KPI counters for present, late, and absent employees for the current date, sourced from `attendance_summaries` and updated on each `department_summary_update` event.
6. THE live dashboard SHALL display a Device Status panel listing all devices with their online/offline status and location context (`device_name → office_name → department_name`), updated on each `device_status_update` event.
7. THE live dashboard SHALL display an Unknown User Scans panel. WHEN an `unknown_user_alert` event is received, THE panel SHALL prepend a new entry showing: raw device user ID, device serial number, and scan timestamp.
8. THE live dashboard SHALL display a Duplicate Scan Activity panel showing scans with `scan_result = 'duplicate'` for the current calendar day, refreshed on each `scan_event` event where `scan_result = 'duplicate'`.
9. WHEN a `device_status_update` event is received with `status = 'offline'`, THE live dashboard SHALL update the device's status indicator to offline within 2 seconds of receiving the event.
10. THE live dashboard SHALL never render a null or empty string for device location fields. WHEN `office_name` or `department_name` is null in any event payload, THE dashboard SHALL display "Unassigned" in that field.

---

### Requirement 11: Device Location Hierarchy

**User Story:** As a facilities manager, I want every device to always show its full location context (device → office → department → building), so that scan events are always traceable to a physical location.

#### Acceptance Criteria

1. THE Workforce_Operations_Platform SHALL enforce the hierarchy: Device has optional FK to Office; Office has required FK to Organization; Department has required FK to Office. This hierarchy SHALL be reflected in all API responses and WebSocket payloads.
2. WHEN a scan event is stored and broadcast, THE Ingestion_Pipeline SHALL resolve the device's `office_name` and `department_name` at ingestion time and include them in the `scan_events` record and the WebSocket payload.
3. IF a device has no `office_id`, THEN THE Ingestion_Pipeline SHALL use the string `"Unassigned"` for `office_name` in the `scan_events` record and all WebSocket payloads. This SHALL be stored as a non-null string, not null.
4. IF a device has no `department_id`, THEN THE Ingestion_Pipeline SHALL use the string `"Unassigned"` for `department_name` in the `scan_events` record and all WebSocket payloads. This SHALL be stored as a non-null string, not null.
5. THE `GET /api/v1/devices` endpoint SHALL return `office_name` and `department_name` as non-null strings for every device in the response. WHEN the device has no assignment, the value SHALL be `"Unassigned"`, never `null` or `""`.

---

### Requirement 12: Database Design — Performance and Reliability

**User Story:** As a database administrator, I want the database schema to be optimized for high-volume scan ingestion, fast dashboard queries, and long-term data retention, so that the system performs reliably under airport-scale load.

#### Acceptance Criteria

1. THE `scan_events` table SHALL have the following indexes: `(scan_timestamp DESC)`, `(employee_id, scan_timestamp DESC)`, `(device_id, scan_timestamp DESC)`, `(department_id, scan_timestamp DESC)`, and `(processing_status)`.
2. THE `scan_events` table SHALL be range-partitioned by month on `scan_timestamp` using PostgreSQL declarative partitioning (`PARTITION BY RANGE (scan_timestamp)`). Each monthly partition SHALL be created automatically before the month begins.
3. THE `attendance_sessions` table SHALL have a composite unique constraint on `(employee_id, shift_date)` enforced at the database level, preventing duplicate sessions per employee per shift date.
4. THE Workforce_Operations_Platform SHALL support an archival strategy: a scheduled job SHALL move `scan_events` partitions older than 12 months to a designated archive schema (`archive.scan_events_YYYY_MM`) without deleting the data. The original partition SHALL be detached from the main table after archival.
5. THE `attendance_summaries` table SHALL exist as a pre-computed snapshot table, updated by the Attendance_Engine. Dashboard queries for department counts SHALL read from `attendance_summaries`, not from `attendance_sessions` directly.
6. THE schema SHALL include these tables: `scan_events`, `attendance_sessions`, `attendance_summaries`, `shift_templates`, `department_shift_rules`, `employee_shift_assignments`, `employee_shift_overrides`, `holiday_calendar`, and `leave_requests`.
7. THE `leave_requests` table SHALL include: `id`, `employee_id`, `leave_type` (enum: `annual`, `sick`, `maternity`, `paternity`, `unpaid`, `emergency`), `start_date`, `end_date`, `status` (enum: `pending`, `approved`, `rejected`), `approver_id` (nullable FK to users), `reason` (text, nullable), `created_at`, `updated_at`.

---

### Requirement 13: Real-Time Performance and Reliability

**User Story:** As a system engineer, I want the platform to handle simultaneous scans from many devices during shift changes without degrading WebSocket latency or blocking scan ingestion, so that the system meets airport-grade reliability standards.

#### Acceptance Criteria

1. THE Ingestion_Pipeline SHALL handle a minimum of 50 concurrent ADMS HTTP connections, each pushing scan payloads simultaneously, without dropping any scan event or returning a non-200 HTTP response.
2. THE WebSocket_Manager SHALL deliver `scan_event` broadcasts to all connected clients within 2 seconds of the scan being stored in `scan_events`, measured under a load of 50 concurrent device connections and 100 concurrent WebSocket clients.
3. WHILE the Attendance_Engine consumer has a processing backlog of up to 10,000 unprocessed tasks in the Redis stream, THE Ingestion_Pipeline SHALL continue accepting and storing new scans at full throughput without blocking.
4. THE Workforce_Operations_Platform SHALL use Redis pub/sub channel `projectz:ws_events` to distribute WebSocket broadcast messages across all FastAPI worker processes. Every worker SHALL subscribe to this channel and forward messages to its local WebSocket connections.
5. THE Workforce_Operations_Platform SHALL support running with a minimum of 4 Uvicorn worker processes. The Attendance_Engine consumer SHALL use Redis Streams consumer groups to ensure each scan task is processed exactly once across all workers.
6. WHEN a FastAPI worker process restarts, THE WebSocket_Manager in that worker SHALL re-subscribe to the Redis pub/sub channel `projectz:ws_events` within 10 seconds of the worker becoming ready.
7. IF the Attendance_Engine consumer process fails or is killed, THEN THE Ingestion_Pipeline SHALL continue storing raw scans in `scan_events` and broadcasting WebSocket events without interruption. Unprocessed tasks SHALL remain in the Redis stream for processing when the consumer restarts.
8. THE Workforce_Operations_Platform SHALL emit structured JSON log entries for: every scan ingestion failure (with raw payload), every attendance processing failure (with `scan_event_id`), and every WebSocket broadcast failure (with event type and connection count).

---

### Requirement 14: Attendance Reporting

**User Story:** As an HR director, I want to generate detailed attendance reports for any department and date range, so that I can review compliance, identify patterns, and support payroll processing.

#### Acceptance Criteria

1. THE `GET /api/v1/reports/attendance/daily` endpoint SHALL accept `date`, optional `department_id`, and `format` (csv, excel, pdf) and return a report with: employee name, employee code, department, shift name, check-in time, check-out time, duration (minutes), late minutes, overtime minutes, and attendance status.
2. THE `GET /api/v1/reports/attendance/lateness` endpoint SHALL accept `start_date`, `end_date`, and optional `department_id` and return all Attendance_Sessions with `status = 'late'`, including `late_minutes` per occurrence, sorted by date then employee name.
3. THE `GET /api/v1/reports/attendance/absences` endpoint SHALL accept `start_date`, `end_date`, and optional `department_id` and return all Attendance_Sessions with `status = 'absent'` or `status = 'missed_checkin'`, one row per employee per absent day.
4. THE `GET /api/v1/reports/attendance/overtime` endpoint SHALL accept `start_date`, `end_date`, and optional `department_id` and return all Attendance_Sessions where `overtime_minutes > 0`, including `overtime_minutes` per occurrence.
5. THE `GET /api/v1/reports/attendance/shift-compliance` endpoint SHALL accept `start_date`, `end_date`, and optional `department_id` and return per-shift, per-department, per-day counts and percentages for: on_time, late, absent.
6. THE `GET /api/v1/reports/scans/audit` endpoint SHALL accept `employee_id` or `device_id` (at least one required), `start_date`, `end_date`, and return every `scan_events` record for the specified scope, including: `scan_timestamp`, `verification_method`, `scan_result`, `processing_status`, `device_name`, `office_name`.
7. THE `GET /api/v1/reports/scans/movement` endpoint SHALL accept `employee_id` and `date` and return all `scan_events` for that employee on that date in ascending `scan_timestamp` order.
8. WHEN generating any report, THE Workforce_Operations_Platform SHALL return the first result within 10 seconds for date ranges up to 90 days. WHEN the date range exceeds 90 days, the endpoint SHALL return HTTP 400 with message "Date range must not exceed 90 days."

---

### Requirement 15: Holiday Calendar and Leave Integration

**User Story:** As an HR administrator, I want public holidays and approved leave to be automatically reflected in attendance status, so that employees are not marked absent on non-working days.

#### Acceptance Criteria

1. THE `holiday_calendar` table SHALL include: `id`, `date`, `name` (max 255 chars), `holiday_type` (enum: `public`, `organizational`, `departmental`), `scope` (enum: `organization`, `department`), `department_id` (nullable FK, required when `scope = 'department'`), `organization_id` (FK), `created_at`.
2. WHEN the Attendance_Engine evaluates status for a date D and a matching row exists in `holiday_calendar` for the employee's organization (or department when `scope = 'department'`), THE Attendance_Engine SHALL set status to `holiday` before evaluating any scan-derived status.
3. THE `leave_requests` table SHALL support leave types: `annual`, `sick`, `maternity`, `paternity`, `unpaid`, `emergency`. THE `POST /api/v1/leave-requests` endpoint SHALL accept these types and reject any other value with HTTP 422.
4. WHEN a Leave_Request with `status = 'approved'` has a date range covering an employee's shift date, THE Attendance_Engine SHALL set the Attendance_Session status to `on_leave` (or `vacation` for `leave_type = 'annual'`) for that date, overriding any scan-derived status.
5. THE Workforce_Operations_Platform SHALL expose: `POST /api/v1/leave-requests` (create), `PUT /api/v1/leave-requests/{id}/approve` (approve), `PUT /api/v1/leave-requests/{id}/reject` (reject), and `GET /api/v1/leave-requests` (list with filters for employee, status, date range).
6. WHEN a Leave_Request transitions to `status = 'approved'`, THE Attendance_Engine SHALL query all Attendance_Sessions for the employee within the leave date range where `status = 'absent'` and update them to `on_leave` (or `vacation`). This retroactive update SHALL complete within 30 seconds of approval.

---

### Requirement 16: Future Extensibility

**User Story:** As a product owner, I want the platform architecture to support future capabilities without requiring a full redesign, so that the system can grow with the airport's operational needs.

#### Acceptance Criteria

1. ALL REST API endpoints SHALL be versioned under `/api/v1/`. The routing structure SHALL support adding `/api/v2/` endpoints without modifying existing v1 routes, enabling future mobile attendance approval applications.
2. THE `scan_events.raw_payload` field SHALL be of type JSONB and SHALL store the complete original ADMS payload as received, enabling future AI anomaly detection and facial recognition analytics without schema changes.
3. THE Workforce_Operations_Platform SHALL scope all organizational data under `organization_id` in every relevant table. Adding a second organization record SHALL be sufficient to support a second branch deployment without schema changes.
4. THE `employees` table SHALL include an `employment_type` column with enum values: `permanent`, `contract`, `casual`. This column SHALL be nullable with default `permanent` to preserve backward compatibility with existing records.
5. THE `employee_shift_assignments` and `employee_shift_overrides` tables SHALL include a `notes` text field and a `created_by` FK to users, enabling a future roster planner UI to record scheduling decisions without modifying the core attendance engine.
6. THE `scan_events` table SHALL include `latitude` (numeric, nullable) and `longitude` (numeric, nullable) columns. WHEN geofenced attendance is enabled in future, these fields SHALL store GPS coordinates from mobile scan submissions without requiring a schema migration.
