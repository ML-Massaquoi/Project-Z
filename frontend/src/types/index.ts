/* ── Core Entity Types ──────────────────────────────────── */

export interface User {
  id: string
  username: string
  email: string
  full_name: string | null
  role: string | null
  role_type: string | null
  permissions: string[]
  avatar_url: string | null
}

export interface Employee {
  id: string
  employee_code: string
  employee_number?: string | null
  first_name?: string | null
  last_name?: string | null
  middle_name?: string | null
  full_name: string
  gender?: 'male' | 'female' | 'other' | null
  email: string | null
  phone: string | null
  position: string | null
  employment_type?: 'full_time' | 'part_time' | 'contract' | 'intern' | 'temporary' | null
  date_joined?: string | null
  status: 'pending_enrollment' | 'enrolled' | 'active' | 'inactive' | 'suspended' | 'transferred' | 'terminated' | 'retired'
  department_id: string | null
  department_name: string | null
  shift_id: string | null
  shift_name: string | null
  shift_protocol_id?: string | null
  avatar_url?: string | null
  termination_date?: string | null
  created_at: string
  updated_at: string
}

export interface Device {
  id: string
  serial_number: string
  name: string | null
  ip_address: string | null
  model: string | null
  platform: string
  firmware_version: string | null
  is_online: boolean
  is_active: boolean
  last_seen: string | null
  last_activity: string | null
  health_status: 'healthy' | 'degraded' | 'critical' | 'offline' | 'unknown'
  consecutive_failures: number
  last_health_check: string | null
  avg_response_time_ms: number | null
  total_scan_count: number
  office_id: string | null
  office_name: string | null
  department_id: string | null
  department_name: string | null
  created_at: string
  updated_at: string
}

export interface DeviceHealthSummary {
  device_id: string
  serial_number: string
  name: string | null
  ip_address: string | null
  office_id: string | null
  health_status: string
  is_online: boolean
  last_seen: string | null
  last_health_check: string | null
  consecutive_failures: number
  avg_response_time_ms: number | null
  firmware_version: string | null
}

export interface DeviceHealthDetail {
  device_id: string
  serial_number: string
  health_status: string
  is_online: boolean
  last_seen: string | null
  last_health_check: string | null
  consecutive_failures: number
  avg_response_time_ms: number | null
  uptime_24h_percent: number | null
  uptime_7d_percent: number | null
  total_checks_24h: number
  error_breakdown_24h: Record<string, number>
}

export interface DeviceHealthLogEntry {
  id: string
  check_result: string
  response_time_ms: number | null
  error_message: string | null
  device_online: boolean | null
  checked_by: string | null
  created_at: string
}

export interface DeviceFleetHealth {
  total_devices: number
  online_count: number
  offline_count: number
  health_status_counts: Record<string, number>
  avg_response_time_ms: number | null
  fleet_health_percent: number
}

export interface AttendanceLog {
  id: string
  employee_id: string
  employee_name: string | null
  employee_code: string | null
  department_name: string | null
  device_id: string | null
  device_name: string | null
  device_ip: string | null
  timestamp: string
  verify_type: string
  punch_direction: 'in' | 'out' | 'unknown'
  is_duplicate: boolean
  created_at: string
}

export interface AttendanceSession {
  id: string
  employee_id: string
  employee_name: string | null
  employee_code: string | null
  department_name: string | null
  date: string
  check_in: string | null
  check_out: string | null
  duration_minutes: number | null
  late_minutes: number | null
  overtime_minutes: number | null
  status: string
  is_complete: boolean
  created_at: string
}

export interface Department {
  id: string
  name: string
  code: string
  description: string | null
  head_name: string | null
  office_id: string
  office_name: string | null
  is_active: boolean
  employee_count: number
  shift_protocol_id?: string | null
  created_at: string
  updated_at: string
}

export interface Shift {
  id: string
  name: string
  code: string
  start_time: string
  end_time: string
  grace_period_minutes: number
  break_duration_minutes: number
  working_hours: number | null
  description: string | null
  is_overnight: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ShiftProtocol {
  id: string
  name: string
  code?: string
  protocol_type: 'fixed' | 'rotating' | 'custom'
  working_days?: number[]
  working_hours_start?: string
  working_hours_end?: string
  days_on?: number
  days_off?: number
  rotation_shifts?: string[]
  rotation_pattern_days?: number
  day_shift_start?: string
  day_shift_end?: string
  night_shift_start?: string
  night_shift_end?: string
  grace_period_minutes?: number
  include_weekends?: boolean
  color?: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Office {
  id: string
  name: string
  code: string
  address: string | null
  city: string | null
  phone: string | null
  organization_id: string
  is_active: boolean
  department_count: number
  device_count: number
  created_at: string
  updated_at: string
}

/* ── Dashboard Types ───────────────────────────────────── */

export interface DashboardStats {
  total_employees: number
  present_today: number
  late_today: number
  absent_today: number
  expected_today: number
  active_devices: number
  online_devices: number
  // Enrollment status breakdown
  employees_active: number
  employees_pending_enrollment: number
  employees_enrolled: number
  employees_inactive: number
  employees_terminated: number
  active_enrollment_sessions: number
  total_scans_today: number
  offline_devices: number
  active_departments: number
  trends: {
    employees_change: number
    present_change: number
    late_change: number
    absent_change: number
  }
}

export interface DashboardChartData {
  attendance_overview: { date: string; present: number; absent: number; late: number }[]
  department_breakdown: { department_name: string; department_id: string; count: number; percentage: number }[]
}

/* ── API Response Types ────────────────────────────────── */

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

/* ── WebSocket Event Types (Deprecated: Defined below under resilient event types) ── */

/* ── Notification Types ────────────────────────────────── */

// Notification shape (for future API integration)
export interface Notification {
  id: string
  message: string
  read: boolean
  created_at: string
}

/* ── Modal Form Value Types ────────────────────────────── */

// Export modal form values
export interface ExportFormValues {
  startDate: string
  endDate: string
  departmentId?: string
  format: 'xlsx' | 'pdf' | 'csv'
}

// Add employee wizard form values
export interface AddEmployeeFormValues {
  // Step 1
  full_name: string
  employee_code: string
  email: string
  phone?: string
  // Step 2
  position: string
  department_id: string
  status: 'active' | 'inactive' | 'suspended' | 'terminated'
  // Step 3
  shift_id?: string
  // Step 4
  documents?: File[]
}

/* ── WebSocket Payload Types ───────────────────────────── */

// WS late employee alert payload
export interface LateEmployeeAlertPayload {
  employee_name: string
  employee_code: string
  late_minutes: number
}

/* ── Enterprise Platform v2 Types ──────────────────────── */

/** Raw biometric scan event (immutable after insert) */
export interface ScanEvent {
  id: string
  employee_id: string | null
  employee_code: string
  employee_name: string | null
  department_id: string | null
  /** Never null — "Unassigned" when no dept */
  department_name: string
  office_id: string | null
  /** Never null — "Unassigned" when no office */
  office_name: string
  device_id: string | null
  /** Never null — "Unknown Device" when unresolved */
  device_name: string
  device_serial: string
  verification_method: 'fingerprint' | 'face' | 'card' | 'password' | 'other'
  scan_result: 'successful' | 'duplicate' | 'unknown_user' | 'unknown_device' | 'rejected' | 'movement' | 'retry'
  raw_punch_state: number
  scan_timestamp: string
  processing_status: 'pending' | 'queued' | 'queued_offline' | 'processing' | 'processed' | 'failed' | 'failed_permanent' | 'out_of_window'
  websocket_broadcasted: boolean
  created_at: string
  raw_payload?: Record<string, unknown>
}

/** WebSocket scan_event payload (broadcast immediately on ingestion) */
export interface ScanEventPayload {
  scan_event_id: string
  /** null for unknown employees */
  employee_photo_url: string | null
  /** null for unknown employees — display "Unknown" */
  employee_name: string | null
  employee_code: string
  /** "Unassigned" when no dept — never null */
  department_name: string
  /** "Unassigned" when no office — never null */
  office_name: string
  /** "Unknown Device" when unresolved — never null */
  device_name: string
  device_serial: string
  verification_method: string
  scan_timestamp: string
  scan_result: string
  /** 'day' | 'night' | 'overnight' | 'unscheduled' | 'unknown' */
  shift_type: string
}

/** WebSocket attendance_update payload */
export interface AttendanceUpdatePayload {
  session_id: string
  employee_id: string
  employee_code?: string | null
  employee_name?: string | null
  department_name?: string | null
  device_name?: string | null
  device_ip?: string | null
  shift_date: string
  check_in: string | null
  check_out: string | null
  status: string
  late_minutes: number
  overtime_minutes: number
  duration_minutes: number
  verification_method?: string
  source?: string
}

/** WebSocket department_summary_update payload */
export interface DeptSummaryPayload {
  department_id: string
  department_name: string
  summary_date: string
  expected_count: number
  present_count: number
  late_count: number
  absent_count: number
  on_leave_count: number
  vacation_count: number
  overtime_count: number
  on_shift_count: number
}

/** WebSocket device_status_update payload */
export interface DeviceStatusPayload {
  device_id: string | null
  serial_number: string
  device_name: string
  status: 'online' | 'offline'
  ip_address: string | null
  /** "Unassigned" when no office */
  office_name: string
  /** "Unassigned" when no dept */
  department_name: string
  last_seen: string | null
}

/** WebSocket late_alert payload */
export interface LateAlertPayload {
  employee_id: string
  shift_date: string
  late_minutes: number
}

/** WebSocket unknown_user_alert payload */
export interface UnknownUserPayload {
  device_serial_number: string
  raw_device_user_id: string
  scan_timestamp: string
  device_name: string
  office_name: string
}

/** Pre-computed department attendance snapshot */
export interface AttendanceSummary {
  id: string
  department_id: string
  department_name: string
  summary_date: string
  expected_count: number
  present_count: number
  late_count: number
  absent_count: number
  on_leave_count: number
  vacation_count: number
  overtime_count: number
  on_shift_count: number
  last_updated_at: string | null
}

/** Shift template with attendance windows */
export interface ShiftTemplate {
  id: string
  name: string
  code: string
  start_time: string
  end_time: string
  checkin_window_start: string
  checkin_window_end: string
  checkout_window_start: string
  checkout_window_end: string
  grace_period_minutes: number
  break_duration_minutes: number
  working_hours: number
  is_overnight: boolean
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Department shift rule */
export interface DepartmentShiftRule {
  id: string
  department_id: string
  shift_template_id: string
  effective_from: string
  effective_to: string | null
  weekend_days: number[]
  grace_period_override: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Employee shift assignment (simple or rotating) */
export interface EmployeeShiftAssignment {
  id: string
  employee_id: string
  shift_protocol_id: string | null
  shift_template_id: string | null
  rotation_templates: string[]
  rotation_start_date: string | null
  working_days: number[] | null
  grace_period_override: number | null
  notes: string | null
  is_rotating: boolean
  created_at: string
  updated_at: string
}

/** Employee shift override (time-bounded) */
export interface EmployeeShiftOverride {
  id: string
  employee_id: string
  shift_template_id: string
  start_date: string
  end_date: string
  reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/* ── WebSocket Resilient Event Types ───────────────────── */

export interface WSEvent {
  event_id?: string
  sequence_id?: number
  timestamp?: string
  version?: number
  event: string
  data: Record<string, unknown>
}

/* ── Dashboard Department Operations Data ─────────────── */
export interface DepartmentOpsData {
  id: string
  department_id: string
  department_name: string
  present_count: number
  late_count: number
  absent_count: number
  expected_count: number
  [key: string]: unknown
}

/* ── Workforce Planning Types ─────────────────────────── */

export interface DepartmentSummary {
  department_id: string
  department_name: string
  department_code: string
  office_name: string | null
  shift_protocol_name: string | null
  head_name: string | null
  total_employees: number
  present_today: number
  late_today: number
  absent_today: number
  on_leave: number
  day_shift_staff: number
  night_shift_staff: number
}

export interface DepartmentEmployee {
  id: string
  employee_code: string
  full_name: string
  position: string | null
  department_name: string
  current_shift: string
  shift_label: string
  next_shift: string
  next_shift_label: string
  status: string
  check_in: string | null
  check_out: string | null
  late_minutes: number
  shift_protocol_name: string | null
  has_individual_override: boolean
}

export interface DepartmentDetail {
  department: {
    id: string
    name: string
    code: string
    office_name: string | null
    shift_protocol_name: string | null
    head_name: string | null
  }
  employees: DepartmentEmployee[]
  total: number
  date: string
}

export interface RosterDay {
  date: string
  label: string
  is_today: boolean
}

export interface RosterEmployee {
  employee_id: string
  employee_code: string
  full_name: string
  position: string | null
  current_shift: string
  daily: RosterDay[]
}

export interface DepartmentRoster {
  department: { id: string; name: string }
  year: number
  month: number
  days: string[]
  employees: RosterEmployee[]
}

export interface EmployeeProfile {
  employee: {
    id: string
    employee_code: string
    full_name: string
    email: string | null
    phone: string | null
    position: string | null
    status: string
    department_id: string | null
    department_name: string
  }
  attendance_summary: {
    present_this_month: number
    late_this_month: number
    absences_this_month: number
    overtime_hours: number
    total_sessions: number
  }
  current_assignment: {
    department_name: string
    roster_type: string
    current_shift: string
    current_shift_label: string
    next_shift: string
    next_shift_label: string
    next_working_day: string | null
    next_working_shift: string | null
  }
}

export interface EmployeeCalendarDay {
  date: string
  day_of_week: string
  label: string
  is_today: boolean
  is_past: boolean
  attendance_status: string | null
  leave_type: string | null
  check_in: string | null
  check_out: string | null
}

export interface EmployeeCalendar {
  employee: { id: string; employee_code: string; full_name: string }
  year: number
  month: number
  calendar: EmployeeCalendarDay[]
}

export interface ShiftCoverage {
  date: string
  time: string
  total_employees: number
  day_shift: number
  night_shift: number
  off_duty: number
  present_now: number
  day_coverage: number
  night_coverage: number
}

export interface UpcomingChange {
  type: 'shift_change' | 'returning_from_leave'
  employee_id: string
  employee_name: string
  department_name: string
  new_shift?: string
  effective_date?: string
  return_date?: string
  leave_type?: string
  reason?: string | null
}

/* ── Connection & Degraded States ─────────────────────── */

export type ConnectionStatus = 'connected' | 'reconnecting' | 'replaying' | 'degraded' | 'disconnected'

/* ── Persistent Operational Alerts ─────────────────────── */

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY'

export interface OperationalAlert {
  id: string
  event_id?: string
  severity: AlertSeverity
  title: string
  message: string
  timestamp: string
  acknowledged: boolean
  acknowledged_by?: string
  acknowledged_at?: string
  metadata?: Record<string, unknown>
}

/* ── Workforce State Telemetry ────────────────────────── */

export interface CriticalStaffMember {
  id: string
  employee_code: string
  full_name: string
  position: string
  department_name: string
  status: 'absent' | 'late' | 'excused'
}

export interface WorkforceMetrics {
  expected_count: number
  present_count: number
  late_count: number
  absent_count: number
  on_shift_count: number
  understaffed_departments: { department_id: string; name: string; percent: number }[]
  missing_critical_staff: CriticalStaffMember[]
  overtime_escalations: { employee_name: string; shift_name: string; overtime_minutes: number }[]
  shift_transitions: { shift_name: string; status: 'starting' | 'ending'; time: string; count: number }[]
}

/* ── Audit Types ───────────────────────────────────────── */

export interface AuditLogEntry {
  id: string
  action: string
  entity_type: string
  entity_id?: string
  description?: string
  details?: Record<string, unknown>
  previous_value?: Record<string, unknown> | null
  new_value?: Record<string, unknown> | null
  user_id?: string
  username?: string
  ip_address?: string
  user_agent?: string
  endpoint?: string
  request_method?: string
  created_at: string
}

export interface AuditStats {
  total_events: number
  by_action: Record<string, number>
  by_entity_type: Record<string, number>
  top_actors: { username: string; count: number }[]
}

// ── Device Synchronization Types ────────────────────────────

export interface SyncOverview {
  total_devices: number
  total_provisioned: number
  total_templates_stored: number
  total_pending_sync: number
  total_failed_syncs: number
  recent_logs: SyncLog[]
}

export interface SyncLog {
  id: string
  device_id: string
  device_name?: string
  sync_type: string
  direction: string
  status: string
  started_at: string
  completed_at?: string
  duration_ms?: number
  users_affected: number
  templates_affected: number
  errors_count: number
  initiated_by: string
  error_details?: Record<string, unknown>
}

export interface DeviceSyncStatus {
  device_id: string
  total_users_on_device: number
  total_users_synced: number
  total_templates_stored: number
  total_templates_pushed: number
  pending_push_users: number
  pending_push_templates: number
  failed_syncs: number
  last_full_sync_at?: string
  last_push_at?: string
  last_pull_at?: string
  last_error?: string
  is_provisioned: boolean
  provisioned_at?: string
  sync_health: string
}

export interface EmployeeSyncStatus {
  employee_id: string
  total_fingerprints: number
  total_templates: number
  biometric_summary: Record<string, { count: number; indices: number[] }>
  devices_available_on: { device_id: string; name: string; serial_number: string }[]
  devices_not_synced_to: { device_id: string; name: string; serial_number: string }[]
  total_devices: number
  synced_device_count: number
  unsynced_device_count: number
  sync_health: string
  last_sync_at?: string
  device_mappings: { device_id: string; device_user_id: string }[]
}

export interface SyncMatrixEmployee {
  employee_id: string
  employee_name: string
  employee_code: string
  department_id?: string
  template_count: number
  devices_synced: number
  total_devices: number
  sync_health: string
  device_status: {
    device_id: string
    device_name: string
    status: string
  }[]
}

export interface SyncMatrix {
  employees: SyncMatrixEmployee[]
  devices: { device_id: string; device_name: string; is_online: boolean }[]
  total_employees: number
  total_devices: number
}

export interface PendingSync {
  device_id: string
  device_name: string
  serial_number: string
  is_online: boolean
  pending_users: number
  pending_templates: number
  failed_syncs: number
  last_error?: string
  sync_health: string
}

export interface SyncEvent {
  employee_id?: string
  employee_name: string
  device_id: string
  device_name: string
  action: string
  status: string
  timestamp: string
}

// ── Enrollment Session Types ──────────────────────────────────

export type EnrollmentStatus =
  | 'waiting_for_fingerprint'
  | 'fingerprint_in_progress'
  | 'fingerprint_captured'
  | 'waiting_for_face'
  | 'face_in_progress'
  | 'face_captured'
  | 'enrollment_complete'
  | 'cancelled'
  | 'failed'

export interface EnrollmentSession {
  id: string
  employee_id: string
  employee_code?: string
  employee_name?: string
  device_id: string | null
  device_name?: string
  device_ip?: string
  status: EnrollmentStatus
  fingerprint_status: string
  face_status: string
  fingerprint_template_count: number
  face_template_count: number
  error_message: string | null
  started_by_username: string | null
  started_at: string | null
  fingerprint_captured_at: string | null
  face_captured_at: string | null
  completed_at: string | null
}

export interface ActiveEnrollmentSession {
  session_id: string
  employee_code: string | null
  employee_name: string | null
  device_name: string | null
  device_ip: string | null
  status: string
  fingerprint_status: string
  face_status: string
  fingerprint_count: number
  face_count: number
  started_at: string | null
}

// ── Employee Status Types ─────────────────────────────────────

export type EmployeeStatusType =
  | 'pending_enrollment'
  | 'enrolled'
  | 'active'
  | 'inactive'
  | 'suspended'
  | 'transferred'
  | 'terminated'
  | 'retired'

export interface StatusTransition {
  id: string
  employee_id: string
  from_status: string
  to_status: string
  reason: string | null
  changed_by_user_id: string | null
  changed_by_username: string | null
  ip_address: string | null
  created_at: string
}

// ── Enrollment WebSocket Event Types ──────────────────────────

export interface EnrollmentEventPayload {
  type: 'session_created' | 'fingerprint_captured' | 'face_captured' | 'enrollment_completed' | 'enrollment_cancelled' | 'enrollment_failed'
  session_id: string
  employee_id: string
  employee_name?: string | null
  device_id?: string | null
  device_name?: string | null
  status: string
  fingerprint_count?: number
  face_count?: number
  started_by?: string | null
}

// ── Device Import Types ───────────────────────────────────────

export interface ImportPreviewItem {
  device_user_id: string
  device_name: string | null
  device_user_name: string
}

export interface DuplicateItem extends ImportPreviewItem {
  matching_employees: { id: string; code: string; name: string; status: string }[]
}

export interface MatchableItem extends ImportPreviewItem {
  suggested_employee: { id: string; code: string; name: string; status: string }
  confidence: 'high' | 'medium' | 'low'
}

export interface OrphanItem extends ImportPreviewItem {
  reason: string
  suggested_action: 'create' | 'ignore' | 'review'
}

export interface ImportPreview {
  total_unmapped: number
  duplicates: { count: number; items: DuplicateItem[] }
  matchable: { count: number; items: MatchableItem[] }
  orphans: { count: number; items: OrphanItem[] }
  no_name: { count: number; items: ImportPreviewItem[] }
  summary: {
    can_auto_link: number
    need_review: number
    can_create: number
    should_ignore: number
  }
}

