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

/* ── WebSocket Event Types ─────────────────────────────── */

export interface WSEvent {
  event: string
  data: Record<string, unknown>
}

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
