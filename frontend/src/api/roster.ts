/**
 * Project Z – Roster API Client
 * FIA Shift Pair Management + Monthly Roster Generation
 */
import api from './client'

// ── Types ──────────────────────────────────────────────────────

export interface ShiftPairMember {
  slot_index: number
  employee_id: string
  employee_code: string
  employee_name: string
  position?: string
}

export interface ShiftPair {
  id: string
  department_id: string
  protocol_id: string
  name: string
  rotation_start_date: string
  color: string
  notes?: string
  is_active: boolean
  members: ShiftPairMember[]
  created_at: string
}

export interface RosterSnapshot {
  id: string
  department_id: string
  department_name: string
  year: number
  month: number
  generated_at: string
  created_at: string
}

export interface CalendarCell {
  assignment: 'DAY' | 'NIGHT' | 'OFF' | 'LEAVE' | 'ABSENT' | 'HOLIDAY' | 'ADMIN'
  shift_start?: string
  shift_end?: string
  is_overridden: boolean
  entry_id: string
}

export interface CalendarEmployee {
  id: string
  code: string
  name: string
  pair_name?: string
  schedule: Record<string, CalendarCell>  // key = "YYYY-MM-DD"
}

export interface CalendarResponse {
  snapshot_id: string | null
  department_name: string
  year: number
  month: number
  days: string[]
  employees: CalendarEmployee[]
}

// ── Pair CRUD ──────────────────────────────────────────────────

export const rosterAPI = {
  // Pairs
  listPairs: (departmentId: string) =>
    api.get<{ items: ShiftPair[]; total: number }>(`/roster/pairs`, {
      params: { department_id: departmentId },
    }),

  createPair: (data: {
    department_id: string
    protocol_id: string
    name: string
    rotation_start_date: string
    color?: string
    notes?: string
  }) => api.post<ShiftPair>('/roster/pairs', data),

  updatePair: (pairId: string, data: Partial<{
    name: string
    rotation_start_date: string
    color: string
    notes: string
    is_active: boolean
  }>) => api.put<ShiftPair>(`/roster/pairs/${pairId}`, data),

  deletePair: (pairId: string) => api.delete(`/roster/pairs/${pairId}`),

  // Pair members
  addMember: (pairId: string, employeeId: string, slotIndex: 0 | 1) =>
    api.post(`/roster/pairs/${pairId}/members`, {
      employee_id: employeeId,
      slot_index: slotIndex,
    }),

  removeMember: (pairId: string, employeeId: string) =>
    api.delete(`/roster/pairs/${pairId}/members/${employeeId}`),

  // Roster generation
  generateRoster: (departmentId: string, year: number, month: number) =>
    api.post('/roster/generate', {
      department_id: departmentId,
      year,
      month,
    }),

  listSnapshots: (departmentId: string) =>
    api.get<{ items: RosterSnapshot[]; total: number }>('/roster/snapshots', {
      params: { department_id: departmentId },
    }),

  // Calendar view
  getCalendar: (departmentId: string, year: number, month: number) =>
    api.get<CalendarResponse>('/roster/calendar', {
      params: { department_id: departmentId, year, month },
    }),

  // Override a single entry
  overrideEntry: (entryId: string, assignment: string, reason?: string) =>
    api.put(`/roster/entries/${entryId}`, { assignment, reason }),

  // Employee schedule
  getEmployeeSchedule: (employeeId: string, year: number, month: number) =>
    api.get(`/roster/employee/${employeeId}`, { params: { year, month } }),
}
