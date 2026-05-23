import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
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
