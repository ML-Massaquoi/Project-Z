/* ── Core Entity Types ──────────────────────────────────── */

export interface User {
  id: string
  username: string
  email: string
  full_name: string | null
  role: string | null
  role_type: string | null
  avatar_url: string | null
}

export interface Employee {
  id: string
  employee_code: string
  full_name: string
  email: string | null
  phone: string | null
  position: string | null
  status: 'active' | 'inactive' | 'suspended' | 'terminated'
  department_id: string | null
  department_name: string | null
  shift_id: string | null
  shift_name: string | null
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
  is_online: boolean
  is_active: boolean
  last_seen: string | null
  last_activity: string | null
  office_id: string | null
  office_name: string | null
  department_id: string | null
  department_name: string | null
  created_at: string
  updated_at: string
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
  active_devices: number
  online_devices: number
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
  shift_date: string
  check_in: string | null
  check_out: string | null
  status: string
  late_minutes: number
  overtime_minutes: number
  duration_minutes: number
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
  shift_template_id: string | null
  rotation_templates: string[]
  rotation_start_date: string | null
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

