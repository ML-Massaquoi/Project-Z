# Implementation Plan: Enterprise Workforce Operations Platform

## Overview

This plan implements the four-layer architecture for the Enterprise Workforce Operations Platform at Freetown International Airport. Tasks are ordered by dependency: database schema first, then models, then core services, then workers, then API endpoints, then frontend. Each task builds on the previous and ends with full integration wiring.

## Tasks

- [ ] 1. Database schema migration — enterprise platform schema
  - Write Alembic revision `0002_enterprise_platform_schema.py`
  - Add all new PostgreSQL enum types: `scan_result`, `processing_status`, `verification_method`, `leave_type`, `leave_status`, `holiday_type`, `holiday_scope`, `employment_type`, `attendance_status_v2`
  - Create `scan_events` partitioned table (`PARTITION BY RANGE (scan_timestamp)`) with all columns and indexes from design
  - Create `shift_templates` table with all columns, constraints, and indexes
  - Create `department_shift_rules` table with `EXCLUDE USING gist` overlap constraint
  - Create `employee_shift_assignments` table with `chk_assignment_type` constraint
  - Create `employee_shift_overrides` table
  - Create `attendance_summaries` table with `UNIQUE (department_id, summary_date)`
  - Create `holiday_calendar` table with `chk_dept_scope` constraint
  - Create `leave_requests` table with all indexes
  - Extend `attendance_sessions`: add `shift_date`, `shift_template_id`, `shift_name`, `early_minutes`, `checkout_status`, `is_complete` columns; add `UNIQUE (employee_id, shift_date)` constraint
  - Add `employment_type` column to `employees`
  - Create initial monthly partitions for current month + next 2 months
  - Migrate existing `shifts` rows into `shift_templates` with default window derivation
  - _Requirements: 1.3, 3.1, 4.1, 7.1, 9.1, 12.1, 12.2, 12.3, 12.6, 12.7, 15.1, 16.2, 16.4, 16.6_

- [ ] 2. SQLAlchemy models — new tables
  - [~] 2.1 Create `backend/app/models/scan_event.py` — ScanEvent model
    - Define `ScanEvent` SQLAlchemy model with all columns matching the `scan_events` DDL
    - Map all enum columns using SQLAlchemy `Enum` types
    - Add `__table_args__` with `postgresql_partition_by='RANGE (scan_timestamp)'`
    - Export from `backend/app/models/__init__.py`
    - _Requirements: 1.3, 1.5, 1.7, 1.10_

  - [~] 2.2 Create `backend/app/models/shift_template.py` — ShiftTemplate model
    - Define `ShiftTemplate` with all time, integer, decimal, and boolean columns
    - Add `CheckConstraint` for `grace_period_minutes`, `break_duration_minutes`, `working_hours`
    - Export from `backend/app/models/__init__.py`
    - _Requirements: 3.1, 3.2_

  - [~] 2.3 Create `backend/app/models/dept_shift_rule.py` — DepartmentShiftRule model
    - Define `DepartmentShiftRule` with `weekend_days` as `ARRAY(Integer)`
    - Add `ExclusionConstraint` using `gist` for non-overlapping date ranges
    - Export from `backend/app/models/__init__.py`
    - _Requirements: 4.1, 4.6_

  - [~] 2.4 Create `backend/app/models/shift_assignment.py` — EmployeeShiftAssignment model
    - Define `EmployeeShiftAssignment` with `rotation_templates` as `ARRAY(UUID)` and `rotation_start_date`
    - Add `CheckConstraint` for `chk_assignment_type` (exactly one of simple or rotating)
    - Export from `backend/app/models/__init__.py`
    - _Requirements: 4.2, 4.4_

  - [~] 2.5 Create `backend/app/models/shift_override.py` — EmployeeShiftOverride model
    - Define `EmployeeShiftOverride` with `start_date`, `end_date`, `CHECK (end_date >= start_date)`
    - Export from `backend/app/models/__init__.py`
    - _Requirements: 4.3_

  - [~] 2.6 Create `backend/app/models/attendance_summary.py` — AttendanceSummary model
    - Define `AttendanceSummary` with all eight count fields and `UNIQUE (department_id, summary_date)`
    - Export from `backend/app/models/__init__.py`
    - _Requirements: 9.1, 12.5_

  - [~] 2.7 Create `backend/app/models/holiday_calendar.py` — HolidayCalendar model
    - Define `HolidayCalendar` with `holiday_type`, `scope`, `organization_id`, `department_id`
    - Add `CheckConstraint` for `chk_dept_scope`
    - Export from `backend/app/models/__init__.py`
    - _Requirements: 15.1_

  - [~] 2.8 Create `backend/app/models/leave_request.py` — LeaveRequest model
    - Define `LeaveRequest` with `leave_type` enum, `leave_status` enum, `approver_id` nullable FK
    - Add `CHECK (end_date >= start_date)`
    - Export from `backend/app/models/__init__.py`
    - _Requirements: 12.7, 15.3_

- [ ] 3. Core service — ShiftResolver
  - [~] 3.1 Create `backend/app/services/shift_resolver.py`
    - Implement `ShiftResolver.resolve(employee_id, date) -> ResolvedShift | None`
    - Level 1: query `employee_shift_overrides` for active override on date
    - Level 2: query `employee_shift_assignments`; if rotating, apply modulo arithmetic `templates[(date - rotation_start_date).days % len(templates)]`; if template code is `'OFF'` return `WEEKEND_OFF` sentinel
    - Level 3: query `department_shift_rules` for effective rule on date; check `weekend_days` array; return `WEEKEND_OFF` if date's weekday is in `weekend_days`
    - Level 4: return `None` (unscheduled)
    - Implement `resolve_grace_period(shift_template, dept_rule, assignment) -> int` with 3-level precedence
    - _Requirements: 3.6, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 3.2 Write property test for ShiftResolver — shift resolution precedence
    - **Property 11: Shift Resolution Precedence**
    - **Validates: Requirements 4.3**

  - [ ]* 3.3 Write property test for ShiftResolver — rotating shift modulo correctness
    - **Property 12: Rotating Shift Modulo Correctness**
    - **Validates: Requirements 4.4**

  - [ ]* 3.4 Write property test for ShiftResolver — grace period precedence
    - **Property 10: Grace Period Precedence**
    - **Validates: Requirements 3.6**

- [ ] 4. Core service — AttendanceEngineV2
  - [~] 4.1 Create `backend/app/services/attendance_engine_v2.py` — window classification and status computation
    - Implement `get_shift_window(template, shift_date) -> tuple[datetime, datetime]` with overnight span logic
    - Implement `classify_scan(scan_time, template, shift_date, session) -> ScanClassification` handling overlapping windows per Req 5.8
    - Implement `is_half_day(duration_minutes, working_hours) -> bool`
    - Implement `compute_overtime(duration_minutes, working_hours) -> float`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8, 6.1, 6.2, 6.3, 6.4, 7.3, 7.6_

  - [ ]* 4.2 Write property test for AttendanceEngineV2 — out-of-window classification
    - **Property 13: Out-of-Window Classification**
    - **Validates: Requirements 5.3**

  - [ ]* 4.3 Write property test for AttendanceEngineV2 — cross-midnight session attribution
    - **Property 14: Cross-Midnight Session Attribution**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ]* 4.4 Write property test for AttendanceEngineV2 — cross-midnight duration correctness
    - **Property 15: Cross-Midnight Duration Correctness**
    - **Validates: Requirements 6.4**

  - [~] 4.5 Implement `AttendanceEngineV2.process(scan_event_id) -> AttendanceSession`
    - Read `scan_event` from DB; call `ShiftResolver.resolve` for employee + shift_date
    - Evaluate status priority chain (14 statuses) in strict order: `holiday → on_leave → vacation → weekend_off → absent → missed_checkin → unscheduled_attendance → early_arrival → late → half_day → missed_checkout → present → unknown_shift → out_of_window`
    - Upsert `attendance_sessions` row; update `scan_events.processing_status` to `processed`
    - Trigger `SummaryService.update_summary` for affected `(department_id, shift_date)`
    - Publish `attendance_update` WebSocket event with all required fields
    - Publish `late_alert` WebSocket event when status is `late`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8.6, 8.7_

  - [ ]* 4.6 Write property test for AttendanceEngineV2 — grace period on-time boundary
    - **Property 8: Grace Period Boundary — On Time**
    - **Validates: Requirements 3.4**

  - [ ]* 4.7 Write property test for AttendanceEngineV2 — grace period late boundary
    - **Property 9: Grace Period Boundary — Late with Correct Minutes**
    - **Validates: Requirements 3.5**

  - [ ]* 4.8 Write property test for AttendanceEngineV2 — status priority ordering
    - **Property 16: Status Priority Ordering**
    - **Validates: Requirements 7.1, 7.8**

  - [ ]* 4.9 Write property test for AttendanceEngineV2 — half-day threshold
    - **Property 17: Half-Day Threshold**
    - **Validates: Requirements 7.3**

  - [ ]* 4.10 Write property test for AttendanceEngineV2 — overtime calculation correctness
    - **Property 18: Overtime Calculation Correctness**
    - **Validates: Requirements 7.6**

  - [ ]* 4.11 Write property test for AttendanceEngineV2 — approved leave overrides scan status
    - **Property 24: Approved Leave Overrides Scan Status**
    - **Validates: Requirements 15.4**

- [ ] 5. Core service — IngestionService (Layer 1)
  - [~] 5.1 Create `backend/app/services/ingestion_service.py`
    - Implement `IngestionService.ingest(payload: ADMSPayload) -> ScanEvent | None`
    - Step 1: resolve device by serial number; resolve employee by device-user mapping; resolve `office_name` and `department_name` at ingestion time (default `"Unassigned"` when null)
    - Step 2: classify `scan_result` (successful, duplicate, unknown_user, unknown_device, rejected, movement, retry)
    - Step 3: insert `scan_events` row — always, regardless of employee/device recognition
    - Step 4 (fire-and-forget): publish `scan_event` to Redis pub/sub `projectz:ws_events`; if employee unknown, also publish `unknown_user_alert`
    - Step 5 (fire-and-forget): publish to Redis stream `projectz:attendance_tasks`; on Redis failure, set `processing_status = 'queued_offline'`
    - Wrap all post-storage steps in try/except — errors must never propagate to caller
    - Complete raw scan storage within 100ms of receiving request body
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 8.1, 8.4, 8.5, 11.2, 11.3, 11.4_

  - [ ]* 5.2 Write property test for IngestionService — scan storage precedes all other processing
    - **Property 1: Scan Storage Precedes All Other Processing**
    - **Validates: Requirements 1.1, 2.1, 2.2**

  - [ ]* 5.3 Write property test for IngestionService — universal scan storage (no scan dropped)
    - **Property 2: Universal Scan Storage**
    - **Validates: Requirements 1.2, 1.6**

  - [ ]* 5.4 Write property test for IngestionService — scan event field completeness
    - **Property 3: Scan Event Field Completeness**
    - **Validates: Requirements 1.3, 11.3, 11.4**

  - [ ]* 5.5 Write property test for IngestionService — enum domain validity
    - **Property 4: Enum Domain Validity**
    - **Validates: Requirements 1.5, 1.10**

  - [ ]* 5.6 Write property test for IngestionService — append-only immutability
    - **Property 5: Append-Only Immutability**
    - **Validates: Requirements 1.7**

  - [ ]* 5.7 Write property test for IngestionService — unknown user alert emission
    - **Property 7: Unknown User Alert Emission**
    - **Validates: Requirements 2.5**

  - [ ]* 5.8 Write property test for IngestionService — Redis stream task publication
    - **Property 19: Redis Stream Task Publication**
    - **Validates: Requirements 8.1, 8.5**

- [ ] 6. Core service — SummaryService (Layer 4)
  - [~] 6.1 Create `backend/app/services/summary_service.py`
    - Implement `SummaryService.update_summary(department_id, summary_date)` — upsert `attendance_summaries` row
    - Compute all eight counts from `attendance_sessions` for the given `(department_id, summary_date)`:
      - `present_count` = sessions with status in `{present, late, early_arrival}`
      - `late_count` = sessions with status `late`
      - `absent_count` = sessions with status `absent`
      - `on_leave_count` = sessions with status `on_leave`
      - `vacation_count` = sessions with status `vacation`
      - `overtime_count` = sessions with `overtime_minutes > 0`
      - `on_shift_count` = sessions with `check_in IS NOT NULL AND check_out IS NULL` within active window
    - Publish `department_summary_update` WebSocket event after upsert
    - Complete within 10 seconds of status change
    - _Requirements: 9.1, 9.2, 9.3, 12.5_

  - [ ]* 6.2 Write property test for SummaryService — attendance summary correctness
    - **Property 21: Attendance Summary Correctness**
    - **Validates: Requirements 9.1**

- [ ] 7. Redis Streams consumer and workers
  - [~] 7.1 Create `backend/app/services/stream_consumer.py`
    - Implement `ensure_consumer_group(redis)` — create `attendance_processors` group on `projectz:attendance_tasks` with `MKSTREAM`, handle `BUSYGROUP` on restart
    - Implement `consume_loop(worker_id, redis, db_session_factory)` — `XREADGROUP` with `count=10, block=2000`
    - Implement `process_with_retry(entry_id, fields, redis, db_session_factory)` — call `AttendanceEngineV2.process`; `XACK` on success; on failure increment `attempt`; after 3 failures set `processing_status = 'failed_permanent'` and `XACK`
    - _Requirements: 8.2, 8.3, 13.5_

  - [ ]* 7.2 Write property test for stream_consumer — retry count enforcement
    - **Property 20: Retry Count Enforcement**
    - **Validates: Requirements 8.3**

  - [~] 7.3 Create `backend/app/workers/attendance_worker.py`
    - Implement worker entry point that initialises Redis connection, calls `ensure_consumer_group`, then runs `consume_loop` indefinitely
    - Use `worker_id = f"worker-{socket.gethostname()}-{os.getpid()}"`
    - _Requirements: 8.2, 13.5, 13.7_

  - [~] 7.4 Create `backend/app/workers/offline_recovery.py`
    - Implement `recover_offline_scans(redis, db_session_factory)` — query `scan_events` where `processing_status = 'queued_offline'`, limit 100, order by `created_at`
    - Re-enqueue each scan to `projectz:attendance_tasks` stream; update `processing_status` to `queued`
    - Schedule to run every 60 seconds via `asyncio.create_task` in app lifespan
    - _Requirements: 8.5_

  - [~] 7.5 Create `backend/app/workers/partition_manager.py`
    - Implement `ensure_next_month_partition(session)` — create next month's `scan_events_YYYY_MM` partition using `CREATE TABLE IF NOT EXISTS ... PARTITION OF scan_events FOR VALUES FROM (...) TO (...)`
    - Schedule to run on the 25th of each month via lifespan task
    - _Requirements: 12.2_

- [~] 8. Checkpoint — core services complete
  - Ensure all tests pass, ask the user if questions arise.

- [~] 9. Refactor `backend/app/api/v1/adms.py` to use IngestionService
  - Remove direct `attendance_logs` / `raw_attendance_payloads` writes from `adms.py`
  - Inject `IngestionService` and call `await ingestion_service.ingest(payload)`
  - Ensure endpoint always responds `"OK"` within 500ms regardless of downstream errors
  - Keep shadow write to `attendance_logs` as a commented-out block for 30-day cutover period
  - _Requirements: 1.1, 1.8, 1.9, 2.2, 8.4_

- [ ] 10. New API endpoints — scan events feed and analytics
  - [~] 10.1 Create `backend/app/api/v1/scan_events.py`
    - Implement `GET /api/v1/scan-events` with query params: `date`, `employee_id`, `device_id`, `department_id`, `scan_result`, `limit` (default 50, max 200), `cursor`
    - Return `{ items: ScanEventResponse[], next_cursor: str | null }` with cursor-based pagination
    - Implement `GET /api/v1/scan-events/{id}` returning full detail including `raw_payload`
    - _Requirements: 14.6, 14.7_

  - [~] 10.2 Create `backend/app/api/v1/analytics.py`
    - Implement `GET /api/v1/analytics/departments/summary?date={YYYY-MM-DD}` — query `attendance_summaries`; return empty array with HTTP 200 when no data
    - Implement `GET /api/v1/analytics/departments/{dept_id}/summary?start_date={}&end_date={}` — validate date range ≤ 90 days; return HTTP 400 with `"Date range must not exceed 90 days."` when exceeded
    - _Requirements: 9.4, 9.5_

- [ ] 11. New API endpoints — reports
  - [~] 11.1 Create `backend/app/api/v1/reports.py`
    - Implement `GET /api/v1/reports/attendance/daily` — accept `date`, optional `department_id`, `format` (csv/excel/pdf); return file download with all required columns
    - Implement `GET /api/v1/reports/attendance/lateness` — sessions with `status = 'late'`, sorted by date then employee name
    - Implement `GET /api/v1/reports/attendance/absences` — sessions with `status = 'absent'` or `'missed_checkin'`
    - Implement `GET /api/v1/reports/attendance/overtime` — sessions where `overtime_minutes > 0`
    - Implement `GET /api/v1/reports/attendance/shift-compliance` — per-shift/dept/day counts and percentages
    - Implement `GET /api/v1/reports/scans/audit` — require at least one of `employee_id` or `device_id`; return `scan_events` records
    - Implement `GET /api/v1/reports/scans/movement` — all scans for employee on date, ascending `scan_timestamp`
    - Enforce 90-day limit on all range endpoints; return HTTP 400 with `"Date range must not exceed 90 days."` when exceeded
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

  - [ ]* 11.2 Write property test for reports — date range validation
    - **Property 23: Report Date Range Validation**
    - **Validates: Requirements 14.8**

- [ ] 12. New API endpoints — leave requests, shift templates, dept rules, shift assignments
  - [~] 12.1 Create `backend/app/api/v1/leave_requests.py`
    - Implement `POST /api/v1/leave-requests` — validate `leave_type` enum; return HTTP 422 for invalid type; return HTTP 201 on success
    - Implement `GET /api/v1/leave-requests` with filters: `employee_id`, `status`, `start_date`, `end_date`
    - Implement `GET /api/v1/leave-requests/{id}`
    - Implement `PUT /api/v1/leave-requests/{id}/approve` — update status; trigger retroactive session update via `AttendanceEngineV2`
    - Implement `PUT /api/v1/leave-requests/{id}/reject`
    - _Requirements: 15.3, 15.4, 15.5, 15.6_

  - [~] 12.2 Create `backend/app/api/v1/shift_templates.py`
    - Implement full CRUD: `POST`, `GET` (list with `is_active` filter), `GET /{id}`, `PUT /{id}`, `DELETE /{id}` (soft delete: `is_active = false`)
    - Accept day shifts, night shifts, and cross-midnight shifts without error
    - _Requirements: 3.1, 3.2_

  - [~] 12.3 Create `backend/app/api/v1/dept_shift_rules.py`
    - Implement full CRUD: `POST`, `GET` (filter by `department_id`), `GET /{id}`, `PUT /{id}`, `DELETE /{id}`
    - Catch `ExclusionViolationError` on POST/PUT and return HTTP 409 with conflict message
    - _Requirements: 4.1_

  - [~] 12.4 Create `backend/app/api/v1/shift_assignments.py`
    - Implement CRUD for `employee_shift_assignments`: `POST`, `GET` (filter by `employee_id`), `GET /{id}`, `PUT /{id}`, `DELETE /{id}`
    - Implement CRUD for `employee_shift_overrides`: `POST`, `GET` (filter by `employee_id`), `GET /{id}`, `PUT /{id}`, `DELETE /{id}`
    - _Requirements: 4.2, 4.3_

- [ ] 13. Extend WebSocket service for all 6 event types
  - Update `backend/app/api/websocket.py` and `backend/app/services/websocket_service.py`
  - Rename Redis pub/sub channel from `projectz:events` to `projectz:ws_events`
  - Ensure `WebSocketManager` supports broadcasting all 6 event types: `scan_event`, `attendance_update`, `department_summary_update`, `device_status_update`, `late_alert`, `unknown_user_alert`
  - Extend `device_offline_watcher` to broadcast `device_status_update` within 5 seconds of 60-second inactivity threshold
  - Ensure WebSocket broadcast is fire-and-forget and never blocks ingestion path
  - Re-subscribe to `projectz:ws_events` within 10 seconds of worker restart
  - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7, 13.4, 13.6_

  - [ ]* 13.1 Write property test for WebSocket service — WebSocket payload completeness
    - **Property 6: WebSocket Payload Completeness**
    - **Validates: Requirements 2.4, 10.10**

- [ ] 14. Wire backend — router and app lifespan
  - [~] 14.1 Update `backend/app/api/v1/router.py`
    - Register all new routers: `scan_events`, `analytics`, `reports`, `leave_requests`, `shift_templates`, `dept_shift_rules`, `shift_assignments`
    - Ensure all routes are versioned under `/api/v1/`
    - _Requirements: 16.1_

  - [~] 14.2 Update `backend/app/main.py` — add workers to lifespan
    - Add `stream_consumer` startup: call `ensure_consumer_group`, then launch `consume_loop` as background `asyncio.Task`
    - Add `offline_recovery` startup: schedule `recover_offline_scans` every 60 seconds
    - Add `partition_manager` startup: schedule `ensure_next_month_partition` to run on the 25th of each month
    - Ensure all background tasks are cancelled cleanly on shutdown
    - _Requirements: 8.2, 8.5, 12.2, 13.7_

- [~] 15. Checkpoint — backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [~] 16. Frontend — TypeScript types
  - Update `frontend/src/types/index.ts`
  - Add `ScanEvent`, `ScanEventPayload` (WebSocket), `AttendanceSummary`, `DeptSummaryPayload`, `AttendanceUpdatePayload`, `DeviceStatusPayload`, `LateAlertPayload`, `UnknownUserPayload`, `ShiftTemplate`, `DepartmentShiftRule`, `EmployeeShiftAssignment`, `EmployeeShiftOverride`, `LeaveRequest` interfaces
  - All nullable fields from WebSocket payloads must be typed as `string | null` with display fallbacks documented in JSDoc
  - _Requirements: 2.4, 10.2, 10.10_

- [~] 17. Frontend — API client modules
  - Update `frontend/src/api/client.ts`
  - Add `scanEventsApi` module: `list(params)`, `getById(id)`
  - Add `analyticsApi` module: `getDepartmentsSummary(date)`, `getDepartmentSummaryRange(deptId, startDate, endDate)`
  - Add `reportsApi` module: `dailyAttendance(params)`, `lateness(params)`, `absences(params)`, `overtime(params)`, `shiftCompliance(params)`, `scanAudit(params)`, `movement(params)`
  - Add `leaveApi` module: `create(body)`, `list(params)`, `getById(id)`, `approve(id)`, `reject(id)`
  - Add `shiftApi` module: CRUD for shift templates, department shift rules, employee shift assignments, employee shift overrides
  - _Requirements: 9.4, 9.5, 14.1–14.7, 15.5_

- [ ] 18. Frontend — Zustand stores
  - [~] 18.1 Create `frontend/src/stores/scanFeedStore.ts`
    - Implement `useScanFeedStore` with `scans: ScanEventPayload[]` state
    - Implement `prependScan(scan)` — prepend to array, cap at 200 items (`MAX_FEED_ITEMS = 200`)
    - _Requirements: 10.1_

  - [~] 18.2 Create `frontend/src/stores/deptSummaryStore.ts`
    - Implement `useDeptSummaryStore` with `departments: Record<string, DeptSummaryPayload>` state
    - Implement `updateDepartment(payload)` — upsert by `department_id`
    - _Requirements: 10.3, 10.5_

- [~] 19. Frontend — WebSocket hook extension
  - Update `frontend/src/hooks/useWebSocket.ts`
  - Add handlers for all 6 event types in `handleMessage` switch:
    - `scan_event` → `useScanFeedStore.prependScan`; if `scan_result === 'duplicate'` also update duplicate panel store
    - `attendance_update` → upsert active employees store
    - `department_summary_update` → `useDeptSummaryStore.updateDepartment`; recalculate KPI counters
    - `device_status_update` → update device store
    - `late_alert` → add to alert store
    - `unknown_user_alert` → prepend to unknown user store
  - _Requirements: 2.7, 10.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9_

- [ ] 20. Frontend — Live dashboard UI components
  - [~] 20.1 Create `frontend/src/components/dashboard/LiveScanFeed.tsx`
    - Render scan cards in reverse chronological order from `useScanFeedStore`
    - Each card: employee avatar (initials fallback when no photo), full name (`"Unknown"` fallback), employee code, department name (`"Unassigned"` fallback), office name (`"Unassigned"` fallback), device name, verification method icon, timestamp formatted as `HH:MM:SS`, scan result badge (color-coded), shift type label
    - New cards prepend to top within 2 seconds of `scan_event` receipt
    - _Requirements: 10.1, 10.2, 10.10_

  - [~] 20.2 Create `frontend/src/components/dashboard/DepartmentActivityPanel.tsx`
    - Render department rows from `useDeptSummaryStore`
    - Each row: dept name, `present_count`, `late_count`, `absent_count`, `on_shift_count`, color-coded attendance rate bar
    - Update affected row within 2 seconds of `department_summary_update` event
    - _Requirements: 10.3, 9.7_

  - [~] 20.3 Create `frontend/src/components/dashboard/UnknownUserPanel.tsx`
    - Prepend new entries on `unknown_user_alert` event
    - Each entry: `raw_device_user_id`, `device_serial_number`, `scan_timestamp`, "Map Employee" action button linking to `/employees/map`
    - _Requirements: 10.7_

  - [~] 20.4 Create `frontend/src/components/dashboard/DuplicateScanPanel.tsx`
    - Filter `scan_event` events where `scan_result === 'duplicate'` for current calendar day
    - Display: employee name, device, timestamp, count of duplicates today
    - Reset at midnight
    - _Requirements: 10.8_

- [ ] 21. Frontend — LiveMonitor page and routing
  - [~] 21.1 Create `frontend/src/pages/LiveMonitor.tsx`
    - Compose `LiveScanFeed`, `DepartmentActivityPanel`, `UnknownUserPanel`, `DuplicateScanPanel` components
    - Add KPI counters for present, late, absent sourced from `attendance_summaries` via `analyticsApi`
    - Add Active Employees panel listing employees with open sessions, refreshed on `attendance_update`
    - Add Device Status panel listing all devices with online/offline status and location context, updated on `device_status_update`
    - Enforce null-safety display rules: `"Unknown"` for null names, `"Unassigned"` for null dept/office, `"Unknown Device"` for null device name
    - _Requirements: 10.1–10.10, 11.1_

  - [~] 21.2 Update `frontend/src/App.tsx`
    - Add `/live-monitor` route pointing to `LiveMonitor` page
    - _Requirements: 10.1_

- [~] 22. Final checkpoint — full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP delivery
- Each task references specific requirement IDs (Req 1–16) for full traceability
- Checkpoints at tasks 8, 15, and 22 ensure incremental validation at each major layer boundary
- Property tests (Properties 1–24 from design.md) validate universal correctness guarantees; unit tests validate specific examples and edge cases
- The four-layer architecture must be respected: Layer 1 (ingestion) is always synchronous and < 100ms; Layers 2–4 are always fire-and-forget or async
- The `scan_events` table is append-only — only `processing_status` and `websocket_broadcasted` may be updated post-insert
- All WebSocket payloads must use `"Unassigned"` (not null) for missing `department_name` and `office_name`
- The existing `shifts` table and `attendance_logs` table are kept intact during migration; cutover happens in Phase 3 after 30 days of stable operation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8"] },
    { "id": 2, "tasks": ["3.1", "4.1", "6.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "4.2", "4.3", "4.4", "4.5", "6.2"] },
    { "id": 4, "tasks": ["4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.4", "7.5"] },
    { "id": 7, "tasks": ["9"] },
    { "id": 8, "tasks": ["10.1", "10.2", "11.1", "12.1", "12.2", "12.3", "12.4", "13"] },
    { "id": 9, "tasks": ["11.2", "13.1", "14.1", "14.2"] },
    { "id": 10, "tasks": ["16", "17"] },
    { "id": 11, "tasks": ["18.1", "18.2"] },
    { "id": 12, "tasks": ["19"] },
    { "id": 13, "tasks": ["20.1", "20.2", "20.3", "20.4"] },
    { "id": 14, "tasks": ["21.1", "21.2"] }
  ]
}
```
