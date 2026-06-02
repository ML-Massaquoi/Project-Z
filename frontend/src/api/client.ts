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
    if (error.response?.status === 401) {
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
  getStats: () => api.get('/dashboard/stats'),
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
  getSDKUsers: (id: string) => api.get(`/devices/${id}/sdk/users`),
  importSDKUsers: (id: string) => api.post(`/devices/${id}/sdk/import-users`),
  getUnrecognizedUsers: () => api.get('/devices/unrecognized-users/all'),
  mapToExisting: (device_id: string, device_user_id: string, employee_id: string) =>
    api.post('/devices/unrecognized-users/map-existing', null, {
      params: { device_id, device_user_id, employee_id },
    }),
  mapToNew: (device_id: string, device_user_id: string, full_name: string, employee_code: string, department_id?: string) =>
    api.post('/devices/unrecognized-users/map-new', null, {
      params: { device_id, device_user_id, full_name, employee_code, ...(department_id ? { department_id } : {}) },
    }),
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

/* ── Events API ────────────────────────────────────────── */
export const eventsAPI = {
  replay: (after_event_id: string) =>
    api.get<{ items: WSEvent[] }>('/events/replay', { params: { after_event_id } }),
}

