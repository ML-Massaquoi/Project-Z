import axios from 'axios'
import type { WSEvent } from '@/types'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000, // 15s — prevents infinite spinner if backend is unreachable
})

// JWT interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && error.config?.responseType !== 'blob') {
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken && !error.config._retry) {
        error.config._retry = true
        try {
          const { data } = await axios.post('/api/v1/auth/refresh', {
            refresh_token: refreshToken,
          })
          localStorage.setItem('access_token', data.access_token)
          localStorage.setItem('refresh_token', data.refresh_token)
          error.config.headers.Authorization = `Bearer ${data.access_token}`
          return api(error.config)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      } else {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

/* ── Auth API ──────────────────────────────────────────── */
export const authAPI = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  refresh: (refresh_token: string) =>
    api.post('/auth/refresh', { refresh_token }),
  me: () => api.get('/auth/me'),
}

/* ── Dashboard API ─────────────────────────────────────── */
export const dashboardAPI = {
  getStats: (params?: { target_date?: string }) =>
    api.get('/dashboard/stats', { params }),
  getCharts: () => api.get('/dashboard/charts'),
}

/* ── Employees API ─────────────────────────────────────── */
export const employeesAPI = {
  list: (params: Record<string, unknown>) => api.get('/employees', { params }),
  get: (id: string) => api.get(`/employees/${id}`),
  create: (data: Record<string, unknown>) => api.post('/employees', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/employees/${id}`, data),
  delete: (id: string) => api.delete(`/employees/${id}`),
  // Device mappings
  listMappings: (id: string) => api.get(`/employees/${id}/device-mappings`),
  createMapping: (id: string, device_id: string, device_user_id: string) =>
    api.post(`/employees/${id}/device-mappings`, null, {
      params: { device_id, device_user_id },
    }),
  deleteMapping: (employeeId: string, mappingId: string) =>
    api.delete(`/employees/${employeeId}/device-mappings/${mappingId}`),
}

/* ── Devices API ───────────────────────────────────────── */
export const devicesAPI = {
  list: () => api.get('/devices'),
  get: (id: string) => api.get(`/devices/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/devices/${id}`, data),
  getDeviceUsers: () => api.get('/device-users'),
  getSDKUsers: (id: string) => api.get(`/devices/${id}/sdk/users`, { timeout: 30000 }),
  importSDKUsers: (id: string) => api.post(`/devices/${id}/sdk/import-users`, null, { timeout: 60000 }),
  testConnection: (id: string) => api.get(`/devices/${id}/sdk/test-connection`, { timeout: 30000 }),
  getUnrecognizedUsers: () => api.get('/devices/unrecognized-users/all'),
  mapToExisting: (device_id: string, device_user_id: string, employee_id: string) =>
    api.post('/devices/unrecognized-users/map-existing', null, {
      params: { device_id, device_user_id, employee_id },
    }),
  mapToNew: (device_id: string, device_user_id: string, full_name: string, employee_code: string, department_id?: string) =>
    api.post('/devices/unrecognized-users/map-new', null, {
      params: { device_id, device_user_id, full_name, employee_code, ...(department_id ? { department_id } : {}) },
    }),
  dismissUnrecognized: (userId: string) =>
    api.post(`/devices/unrecognized-users/${userId}/dismiss`),
  bulkCreateEmployees: () => api.post('/device-users/bulk-create-employees'),
  getImportPreview: () => api.get('/device-users/import-preview'),
  getEmployeeDevices: (employeeId: string) =>
    api.get(`/device-groups/employee/${employeeId}/devices`),
  assignEmployeeDevices: (employeeId: string, deviceIds: string[]) =>
    api.post('/device-groups/employee/assign-devices', { employee_id: employeeId, device_ids: deviceIds }),
  assignEmployeeGroups: (employeeId: string, groupIds: string[]) =>
    api.post('/device-groups/employee/assign-groups', { employee_id: employeeId, group_ids: groupIds }),
}

/* ── Device Health API ─────────────────────────────────── */
export const deviceHealthAPI = {
  overview: () => api.get('/devices/health/summary'),
  fleetHealth: () => api.get('/devices/health/overview'),
  getDeviceHealth: (id: string) => api.get(`/devices/${id}/health`),
  getHealthHistory: (id: string, hours: number = 24) =>
    api.get(`/devices/${id}/health/history`, { params: { hours } }),
  getBiometricCounts: (id: string) => api.get(`/devices/${id}/biometric-counts`),
  probeDevice: (id: string) => api.post(`/devices/${id}/health/probe`),
  probeAll: () => api.post('/devices/health/probe-all'),
}

/* ── Device Discovery API ──────────────────────────────── */
export const deviceDiscoveryAPI = {
  fullScan: (cidr: string = '172.16.40.0/24', port: number = 4370) =>
    api.post('/devices/discovery/scan', { cidr, port }, { timeout: 120000 }),
  quickScan: (cidr: string = '172.16.40.0/24', port: number = 4370) =>
    api.post('/devices/discovery/quick-scan', { cidr, port }, { timeout: 60000 }),
  register: (data: Record<string, unknown>) =>
    api.post('/devices/discovery/register', data),
  updateDevice: (id: string, data: Record<string, unknown>) =>
    api.put(`/devices/discovery/${id}`, data),
  deleteDevice: (id: string) =>
    api.delete(`/devices/discovery/${id}`),
}

/* ── Device Events API ─────────────────────────────────── */
export const deviceEventsAPI = {
  recent: (params?: Record<string, unknown>) =>
    api.get('/scan-events', { params: { per_page: 50, ...params } }),
}

/* ── Attendance API ────────────────────────────────────── */
export const attendanceAPI = {
  live: (params?: Record<string, unknown>) => api.get('/attendance/live', { params }),
  history: (params: Record<string, unknown>) => api.get('/attendance/history', { params }),
}

/* ── Departments API ───────────────────────────────────── */
export const departmentsAPI = {
  list: () => api.get('/departments'),
  create: (data: Record<string, unknown>) => api.post('/departments', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/departments/${id}`, data),
  delete: (id: string) => api.delete(`/departments/${id}`),
}

/* ── Shifts API ────────────────────────────────────────── */
export const shiftsAPI = {
  list: () => api.get('/shifts'),
  create: (data: Record<string, unknown>) => api.post('/shifts', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/shifts/${id}`, data),
  delete: (id: string) => api.delete(`/shifts/${id}`),
}

/* ── Offices API ───────────────────────────────────────── */
export const officesAPI = {
  list: () => api.get('/offices'),
  create: (data: Record<string, unknown>) => api.post('/offices', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/offices/${id}`, data),
}

/* ── Reports API ───────────────────────────────────────── */
export const reportsAPI = {
  attendance: (params: Record<string, unknown>) =>
    api.get('/reports/attendance', { params, responseType: 'blob' }),

  // v2 endpoints
  daily: (params: { date: string; department_id?: string; format?: string }) =>
    api.get('/reports/attendance/daily', { params, responseType: 'blob' }),
  lateness: (params: { start: string; end: string; department_id?: string; format?: string }) =>
    api.get('/reports/attendance/lateness', { params, responseType: 'blob' }),
  absences: (params: { start: string; end: string; department_id?: string; format?: string }) =>
    api.get('/reports/attendance/absences', { params, responseType: 'blob' }),
  overtime: (params: { start: string; end: string; department_id?: string; format?: string }) =>
    api.get('/reports/attendance/overtime', { params, responseType: 'blob' }),
  movement: (params: { start: string; end: string; device_id?: string; format?: string }) =>
    api.get('/reports/attendance/movement', { params, responseType: 'blob' }),
  shiftCompliance: (params: { start: string; end: string; department_id?: string; format?: string }) =>
    api.get('/reports/attendance/shift-compliance', { params, responseType: 'blob' }),
  unknownScans: (params: { start: string; end: string; device_id?: string; format?: string }) =>
    api.get('/reports/attendance/unknown-scans', { params, responseType: 'blob' }),
}

/* ── Users API ─────────────────────────────────────────── */
export const usersAPI = {
  list: () => api.get('/users'),
  create: (data: Record<string, unknown>) => api.post('/users', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/users/change-password', data),
}

/* ── Roles API ─────────────────────────────────────────── */
export const rolesAPI = {
  list: () => api.get('/roles'),
  createRole: (data: Record<string, unknown>) => api.post('/roles', data),
}

/* ── Scan Events API ───────────────────────────────────── */
export const scanEventsAPI = {
  list: (params?: Record<string, unknown>) => api.get('/scan-events', { params }),
  getById: (id: string) => api.get(`/scan-events/${id}`),
}

/* ── Analytics API ─────────────────────────────────────── */
export const analyticsAPI = {
  getDepartmentsSummary: (date?: string) =>
    api.get('/analytics/departments/summary', { params: date ? { date } : {} }),
  getDepartmentSummaryRange: (deptId: string, startDate: string, endDate: string) =>
    api.get(`/analytics/departments/${deptId}/summary`, {
      params: { start_date: startDate, end_date: endDate },
    }),
}

/* ── Reports v2 API ────────────────────────────────────── */
export const reportsV2API = {
  dailyAttendance: (params: Record<string, unknown>) =>
    api.get('/reports/attendance/daily', { params, responseType: 'blob' }),
  lateness: (params: Record<string, unknown>) =>
    api.get('/reports/attendance/lateness', { params }),
  absences: (params: Record<string, unknown>) =>
    api.get('/reports/attendance/absences', { params }),
  overtime: (params: Record<string, unknown>) =>
    api.get('/reports/attendance/overtime', { params }),
  shiftCompliance: (params: Record<string, unknown>) =>
    api.get('/reports/attendance/shift-compliance', { params }),
  scanAudit: (params: Record<string, unknown>) =>
    api.get('/reports/scans/audit', { params }),
  movement: (params: Record<string, unknown>) =>
    api.get('/reports/scans/movement', { params }),
}

/* ── Leave Requests API ────────────────────────────────── */
export const leaveAPI = {
  create: (data: Record<string, unknown>) => api.post('/leave-requests', data),
  list: (params?: Record<string, unknown>) => api.get('/leave-requests', { params }),
  getById: (id: string) => api.get(`/leave-requests/${id}`),
  approve: (id: string) => api.put(`/leave-requests/${id}/approve`),
  reject: (id: string) => api.put(`/leave-requests/${id}/reject`),
}

/* ── Shift Templates API ───────────────────────────────── */
export const shiftTemplatesAPI = {
  list: (params?: Record<string, unknown>) => api.get('/shift-templates', { params }),
  create: (data: Record<string, unknown>) => api.post('/shift-templates', data),
  getById: (id: string) => api.get(`/shift-templates/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/shift-templates/${id}`, data),
  delete: (id: string) => api.delete(`/shift-templates/${id}`),
}

/* ── Department Shift Rules API ────────────────────────── */
export const deptShiftRulesAPI = {
  list: (params?: Record<string, unknown>) => api.get('/department-shift-rules', { params }),
  create: (data: Record<string, unknown>) => api.post('/department-shift-rules', data),
  getById: (id: string) => api.get(`/department-shift-rules/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/department-shift-rules/${id}`, data),
  delete: (id: string) => api.delete(`/department-shift-rules/${id}`),
}

/* ── Employee Shift Assignments API ────────────────────── */
export const shiftAssignmentsAPI = {
  listAssignments: (params?: Record<string, unknown>) =>
    api.get('/employee-shift-assignments', { params }),
  createAssignment: (data: Record<string, unknown>) =>
    api.post('/employee-shift-assignments', data),
  getAssignment: (id: string) => api.get(`/employee-shift-assignments/${id}`),
  updateAssignment: (id: string, data: Record<string, unknown>) =>
    api.put(`/employee-shift-assignments/${id}`, data),
  deleteAssignment: (id: string) => api.delete(`/employee-shift-assignments/${id}`),
  listOverrides: (params?: Record<string, unknown>) =>
    api.get('/employee-shift-overrides', { params }),
  createOverride: (data: Record<string, unknown>) =>
    api.post('/employee-shift-overrides', data),
  getOverride: (id: string) => api.get(`/employee-shift-overrides/${id}`),
  updateOverride: (id: string, data: Record<string, unknown>) =>
    api.put(`/employee-shift-overrides/${id}`, data),
  deleteOverride: (id: string) => api.delete(`/employee-shift-overrides/${id}`),
}

/* ── Audit API ────────────────────────────────────────── */
export const auditAPI = {
  list: (params: Record<string, unknown>) => api.get('/audit-logs', { params }),
  getById: (id: string) => api.get(`/audit-logs/${id}`),
  getActions: () => api.get('/audit-logs/actions'),
  getEntityTypes: () => api.get('/audit-logs/entity-types'),
  getMethods: () => api.get('/audit-logs/methods'),
  getStats: (params?: Record<string, unknown>) => api.get('/audit-logs/stats', { params }),
  export: (params: Record<string, unknown>) =>
    api.get('/audit-logs/export', { params, responseType: params.format === 'json' ? 'json' : 'text' }),
}

/* ── Workforce Planning API ──────────────────────────── */
export const workforceAPI = {
  departmentSummaries: () => api.get('/workforce/departments/summary'),
  departmentDetail: (deptId: string, params?: Record<string, unknown>) =>
    api.get(`/workforce/departments/${deptId}/detail`, { params }),
  departmentRoster: (deptId: string, year: number, month: number) =>
    api.get(`/workforce/departments/${deptId}/roster`, { params: { year, month } }),
  employeeProfile: (empId: string) => api.get(`/workforce/employees/${empId}/profile`),
  employeeCalendar: (empId: string, year: number, month: number) =>
    api.get(`/workforce/employees/${empId}/calendar`, { params: { year, month } }),
  shiftChange: (data: { employee_id: string; shift_template_id: string; start_date: string; end_date: string; reason?: string }) =>
    api.post('/workforce/shift-change', data),
  shiftSwap: (data: { employee_a_id: string; employee_b_id: string; swap_date: string; reason?: string }) =>
    api.post('/workforce/shift-swap', data),
  coverage: (params?: Record<string, unknown>) => api.get('/workforce/coverage', { params }),
  upcomingChanges: (daysAhead?: number) =>
    api.get('/workforce/upcoming-changes', { params: { days_ahead: daysAhead || 7 } }),
  exportRoster: (data: { department_id: string; year: number; month: number; format: string }) =>
    api.post('/workforce/roster/export', data, { responseType: 'blob', timeout: 60000 }),
}

/* ── Settings API ─────────────────────────────────────── */
export const settingsAPI = {
  list: () => api.get('/settings'),
  get: (key: string) => api.get(`/settings/${key}`),
  update: (data: Record<string, string>) => api.put('/settings', data),
}

/* ── Shift Protocols API ─────────────────────────────── */
export const shiftProtocolsAPI = {
  list: () => api.get('/shift-protocols'),
  get: (id: string) => api.get(`/shift-protocols/${id}`),
  create: (data: Record<string, unknown>) => api.post('/shift-protocols', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/shift-protocols/${id}`, data),
  delete: (id: string) => api.delete(`/shift-protocols/${id}`),
  seedPresets: () => api.post('/shift-protocols/seed'),
  // Phase 5: Protocol Steps
  listSteps: (protocolId: string) => api.get(`/scheduling/protocols/${protocolId}/steps`),
  createStep: (protocolId: string, data: Record<string, unknown>) => api.post(`/scheduling/protocols/${protocolId}/steps`, data),
  updateStep: (protocolId: string, stepId: string, data: Record<string, unknown>) => api.put(`/scheduling/protocols/${protocolId}/steps/${stepId}`, data),
  deleteStep: (protocolId: string, stepId: string) => api.delete(`/scheduling/protocols/${protocolId}/steps/${stepId}`),
  reorderSteps: (protocolId: string, data: Record<string, unknown>[]) => api.post(`/scheduling/protocols/${protocolId}/steps/reorder`, data),
}

/* ── Holiday Calendar API ──────────────────────────── */
export const holidaysAPI = {
  list: (params?: Record<string, unknown>) =>
    api.get('/holidays', { params }),
  get: (id: string) => api.get(`/holidays/${id}`),
  create: (data: Record<string, unknown>) => api.post('/holidays', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/holidays/${id}`, data),
  delete: (id: string) => api.delete(`/holidays/${id}`),
}

/* ── Roster Export API ─────────────────────────────── */
export const rosterExportsAPI = {
  csv: (deptId: string, year: number, month: number) =>
    api.get(`/roster-exports/csv/${deptId}`, { params: { year, month }, responseType: 'blob' }),
  excel: (deptId: string, year: number, month: number) =>
    api.get(`/roster-exports/excel/${deptId}`, { params: { year, month }, responseType: 'blob' }),
  pdf: (deptId: string, year: number, month: number) =>
    api.get(`/roster-exports/pdf/${deptId}`, { params: { year, month }, responseType: 'blob' }),
}

/* ── Scheduling API (Phase 5) ───────────────────────── */
export const schedulingAPI = {
  // Department-Protocol assignments
  deptProtocols: (deptId: string) => api.get(`/scheduling/departments/${deptId}/protocols`),
  assignProtocol: (deptId: string, data: Record<string, unknown>) => api.post(`/scheduling/departments/${deptId}/protocols`, data),
  updateDeptProtocol: (deptId: string, assignId: string, data: Record<string, unknown>) => api.put(`/scheduling/departments/${deptId}/protocols/${assignId}`, data),
  removeDeptProtocol: (deptId: string, assignId: string) => api.delete(`/scheduling/departments/${deptId}/protocols/${assignId}`),
  activeProtocol: (deptId: string) => api.get(`/scheduling/departments/${deptId}/active-protocol`),

  // Employee rotation offsets
  getOffset: (empId: string) => api.get(`/scheduling/employees/${empId}/offset`),
  updateOffset: (empId: string, data: Record<string, unknown>) => api.put(`/scheduling/employees/${empId}/offset`, data),
  batchOffsets: (data: Record<string, unknown>[]) => api.post('/scheduling/employees/batch-offset', data),
  deptOffsets: (deptId: string) => api.get(`/scheduling/employees/by-department/${deptId}/offsets`),

  // Roster generation
  generateDepartment: (deptId: string, data: { year: number; month: number }) => api.post(`/scheduling/generate/department/${deptId}`, data),
  generateDepartments: (data: { department_ids: string[]; year: number; month: number }) => api.post('/scheduling/generate/departments', data),
  generateOrganization: (data: { year: number; month: number }) => api.post('/scheduling/generate/organization', data),

  // Publications
  publish: (deptId: string, data: { year: number; month: number }) => api.post(`/scheduling/publish/${deptId}`, data),
  lock: (deptId: string, data: { year: number; month: number }) => api.post(`/scheduling/lock/${deptId}`, data),
  publications: (deptId: string) => api.get(`/scheduling/publications/${deptId}`),
  deletePublication: (deptId: string, pubId: string) => api.delete(`/scheduling/publications/${deptId}/${pubId}`),

  // Shift swaps
  createSwap: (data: Record<string, unknown>) => api.post('/scheduling/swap-requests', data),
  listSwaps: (params?: Record<string, unknown>) => api.get('/scheduling/swap-requests', { params }),
  updateSwap: (id: string, data: Record<string, unknown>) => api.put(`/scheduling/swap-requests/${id}`, data),
  deleteSwap: (id: string) => api.delete(`/scheduling/swap-requests/${id}`),

  // Calendar views
  departmentCalendar: (deptId: string, params: { year: number; month: number }) => api.get(`/scheduling/calendar/${deptId}`, { params }),
  departmentGrid: (deptId: string, params: { year: number; month: number }) => api.get(`/scheduling/calendar/${deptId}/grid`, { params }),
  employeeCalendar: (empId: string, params: { year: number; month: number }) => api.get(`/scheduling/calendar/employee/${empId}`, { params }),
  daySchedule: (deptId: string, date: string) => api.get(`/scheduling/calendar/${deptId}/day/${date}`),

  // Clear calendar (destructive)
  clearCalendar: (deptId: string, params: { year: number; month: number }) => api.delete(`/scheduling/calendar/${deptId}/clear`, { params }),
  clearOrganizationCalendar: (params: { year: number; month: number }) => api.delete('/scheduling/calendar/clear/organization', { params }),

  // Attendance comparison
  comparison: (empId: string, params: { start_date: string; end_date: string }) => api.get(`/scheduling/comparison/${empId}`, { params }),
  dayComparison: (empId: string, date: string) => api.get(`/scheduling/comparison/${empId}/day/${date}`),

  // Multi-month generation
  generateMultiMonth: (deptId: string, data: { year: number; start_month: number; num_months: number }) =>
    api.post(`/scheduling/generate/department/${deptId}/multi-month`, data),
  generateOrgMultiMonth: (data: { year: number; start_month: number; num_months: number }) =>
    api.post('/scheduling/generate/organization/multi-month', data),

  // Snapshot deletion
  deleteSnapshot: (deptId: string, year: number, month: number) =>
    api.delete(`/scheduling/snapshot/${deptId}`, { params: { year, month } }),

  // Rotation Groups
  rotationGroups: (deptId: string) => api.get(`/scheduling/departments/${deptId}/rotation-groups`),
  createRotationGroup: (deptId: string, data: { name: string; protocol_offset?: number; color?: string }) =>
    api.post(`/scheduling/departments/${deptId}/rotation-groups`, data),
  updateRotationGroup: (groupId: string, data: { name?: string; protocol_offset?: number; color?: string; is_active?: boolean }) =>
    api.put(`/scheduling/rotation-groups/${groupId}`, data),
  deleteRotationGroup: (groupId: string) => api.delete(`/scheduling/rotation-groups/${groupId}`),
  autoDistribute: (deptId: string, data: { num_groups: number }) =>
    api.post(`/scheduling/departments/${deptId}/rotation-groups/auto-distribute`, data),
  assignEmployeeToGroup: (groupId: string, employeeId: string) =>
    api.post(`/scheduling/rotation-groups/${groupId}/assign/${employeeId}`),
  removeEmployeeFromGroup: (assignmentId: string) =>
    api.delete(`/scheduling/rotation-groups/assignments/${assignmentId}`),

  // Analytics
  analytics: (deptId: string, params: { year: number; month: number }) => api.get(`/scheduling/analytics/${deptId}`, { params }),
}

/* ── Daily Reports API ───────────────────────────────── */
export const dailyReportsAPI = {
  generate: (data: { report_date: string; department_id?: string }) =>
    api.post('/daily-reports/generate', data),
  list: (params?: Record<string, unknown>) =>
    api.get('/daily-reports/list', { params }),
  getById: (id: string) => api.get(`/daily-reports/${id}`),
  getByDate: (reportDate: string, departmentId?: string) =>
    api.get(`/daily-reports/by-date/${reportDate}`, { params: departmentId ? { department_id: departmentId } : {} }),
  export: (id: string, format: string = 'csv') =>
    api.get(`/daily-reports/${id}/export`, { params: { format }, responseType: 'blob' }),
  delete: (id: string) => api.delete(`/daily-reports/${id}`),
}

/* ── Events API ────────────────────────────────────────── */
export const eventsAPI = {
  replay: (after_event_id: string) =>
    api.get<{ items: WSEvent[] }>('/events/replay', { params: { after_event_id } }),
}

/* ── System Alerts API ─────────────────────────────────── */
export const alertsAPI = {
  list: (params?: {
    skip?: number
    limit?: number
    severity?: string
    category?: string
    acknowledged?: boolean
  }) => api.get('/alerts', { params }),

  getStats: () => api.get('/alerts/stats'),

  getById: (id: string) => api.get(`/alerts/${id}`),

  acknowledge: (id: string, resolutionNote?: string) =>
    api.put(`/alerts/${id}/acknowledge`, { resolution_note: resolutionNote }),

  acknowledgeAll: () => api.post('/alerts/acknowledge-all'),

  purge: () => api.delete('/alerts/purge'),
}

/* ── Data Integrity API ────────────────────────────────── */
export const integrityAPI = {
  findings: (params?: {
    category?: string
    severity?: string
    resolved?: boolean
    limit?: number
  }) => api.get('/integrity/findings', { params }),

  stats: () => api.get('/integrity/stats'),

  run: () => api.post('/integrity/run'),

  resolve: (id: string, note?: string) =>
    api.put(`/integrity/findings/${id}/resolve`, { resolution_note: note }),
}

/* ── Backup API ──────────────────────────────────────── */
export const backupAPI = {
  list: (params?: { page?: number; page_size?: number; status?: string; backup_type?: string }) =>
    api.get('/backups', { params }),
  stats: () => api.get('/backups/stats'),
  trigger: (data: { backup_type?: string; retention_days?: number }) =>
    api.post('/backups/trigger', data),
  get: (id: string) => api.get(`/backups/${id}`),
  delete: (id: string) => api.delete(`/backups/${id}`),
}

/* ── Device Activity API ─────────────────────────────── */
export const deviceActivityAPI = {
  getStatusHistory: (deviceId: string, params?: { hours?: number; limit?: number }) =>
    api.get(`/device-activity/${deviceId}/status-history`, { params }),

  getActivityLogs: (deviceId: string, params?: { activity_type?: string; hours?: number; limit?: number }) =>
    api.get(`/device-activity/${deviceId}/activity-logs`, { params }),

  getFleetSummary: (params?: { hours?: number }) =>
    api.get('/device-activity/fleet/summary', { params }),

  getEmployeeEnrollment: (employeeId: string, params?: { limit?: number }) =>
    api.get(`/device-activity/enrollment/employee/${employeeId}`, { params }),

  getDeviceEnrollment: (deviceId: string, params?: { limit?: number }) =>
    api.get(`/device-activity/enrollment/device/${deviceId}`, { params }),

  getRecentEnrollments: (params?: { limit?: number }) =>
    api.get('/device-activity/enrollment/recent', { params }),
}

/* ── Sync Center API ────────────────────────────────── */
export const syncAPI = {
  overview: () => api.get('/sync/overview'),
  logs: (params?: { device_id?: string; sync_type?: string; status?: string; date_from?: string; date_to?: string; page?: number; per_page?: number }) =>
    api.get('/sync/logs', { params }),
  pending: () => api.get('/sync/pending'),
  matrix: () => api.get('/sync/matrix'),
  deviceSync: (id: string) => api.get(`/sync/${id}`),
  pullUsers: (id: string) => api.post(`/sync/${id}/pull-users`, null, { timeout: 60000 }),
  pullTemplates: (id: string) => api.post(`/sync/${id}/pull-templates`, null, { timeout: 120000 }),
  pushUsers: (id: string, employeeIds?: string[]) => api.post(`/sync/${id}/push-users`, employeeIds, { timeout: 60000 }),
  pushTemplates: (id: string, employeeIds?: string[]) => api.post(`/sync/${id}/push-templates`, employeeIds, { timeout: 120000 }),
  fullSync: (id: string) => api.post(`/sync/${id}/full`, null, { timeout: 180000 }),
  provision: (id: string) => api.post(`/sync/${id}/provision`, null, { timeout: 60000 }),
  reProvision: (id: string) => api.post(`/sync/${id}/re-provision`, null, { timeout: 60000 }),
  initialSync: (id: string) => api.post(`/sync/${id}/initial-sync`, null, { timeout: 180000 }),
  employeeStatus: (id: string) => api.get(`/sync/employee/${id}`),
  pushEmployeeAll: (id: string) => api.post(`/sync/employee/${id}/push-all`, null, { timeout: 60000 }),
  pushEmployeeDevice: (empId: string, devId: string) => api.post(`/sync/employee/${empId}/push/${devId}`),
  employeeRetry: (id: string) => api.post(`/sync/employee/${id}/retry`),
  bulkSyncAll: () => api.post('/sync/bulk/all'),
  bulkSyncDepartment: (deptId: string) => api.post(`/sync/bulk/department/${deptId}`),
  bulkSyncEmployees: (employeeIds: string[]) => api.post('/sync/bulk/employees', employeeIds),
  retryAll: () => api.post('/sync/retry-all'),
}

/* ── Enrollment API ─────────────────────────────────────── */
export const enrollmentAPI = {
  createSession: (data: { employee_id: string; device_id: string }) =>
    api.post('/enrollment/sessions', data),
  beginSession: (sessionId: string) =>
    api.post(`/enrollment/sessions/${sessionId}/begin`),
  sendFingerprint: (data: { session_id: string; template_data: string; finger_index?: number; quality?: number }) =>
    api.post('/enrollment/sessions/fingerprint', data),
  completeSession: (sessionId: string) =>
    api.post('/enrollment/sessions/complete', { session_id: sessionId }),
  cancelSession: (sessionId: string, reason?: string) =>
    api.post('/enrollment/sessions/cancel', { session_id: sessionId, reason }),
  getActiveSessions: (deviceId?: string) =>
    api.get('/enrollment/sessions/active', { params: deviceId ? { device_id: deviceId } : {} }),
  getTemplates: (employeeId: string) =>
    api.get(`/enrollment/templates/${employeeId}`),
  getOnlineDevices: () =>
    api.get('/enrollment/devices/online'),
  wizardCreateAndEnroll: (data: {
    employee_code: string; full_name: string; first_name?: string; last_name?: string;
    middle_name?: string; gender?: string; email?: string; phone?: string;
    position?: string; department_id?: string; employment_type?: string; shift_id?: string; device_id: string;
  }) => api.post('/enrollment/wizard/create-and-enroll', data),
  triggerFace: (sessionId: string) =>
    api.post(`/enrollment/wizard/trigger-face/${sessionId}`),
  wizardPollFingerprint: (sessionId: string, timeout?: number) => {
    const seconds = timeout || 45
    return api.post(
      `/enrollment/wizard/poll-fingerprint/${sessionId}?timeout=${seconds}`,
      null,
      { timeout: (seconds + 120) * 1000 },
    )
  },
  wizardCaptureTemplate: (sessionId: string) =>
    api.post(`/enrollment/wizard/capture-template/${sessionId}`, null, { timeout: 30000 }),
  checkDeviceReadiness: (deviceId: string) =>
    api.get(`/enrollment/devices/${deviceId}/readiness`, { timeout: 20000 }),
}

/* ── Employee Status API ────────────────────────────────── */
export const employeeStatusAPI = {
  transition: (employeeId: string, data: { new_status: string; reason?: string }) =>
    api.patch(`/employees/${employeeId}/status`, data),
  getTransitions: (employeeId: string) =>
    api.get(`/employees/${employeeId}/status/transitions`),
  getAllowedTransitions: (currentStatus: string) =>
    api.get(`/employees/status/transitions/${currentStatus}`),
}

