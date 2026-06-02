import { create } from 'zustand'
import type { AttendanceSummary, DeptSummaryPayload, UnknownUserPayload } from '@/types'

interface DeptSummaryState {
  departments: Record<string, DeptSummaryPayload>
  unknownUsers: UnknownUserPayload[]
  // Cached totals — recomputed only when departments changes
  _totals: { present: number; late: number; absent: number; onShift: number }
  updateDepartment: (payload: DeptSummaryPayload) => void
  setDepartments: (summaries: AttendanceSummary[]) => void
  prependUnknownUser: (payload: UnknownUserPayload) => void
}

function computeTotals(
  departments: Record<string, DeptSummaryPayload>
): { present: number; late: number; absent: number; onShift: number } {
  const depts = Object.values(departments)
  return {
    present: depts.reduce((sum, d) => sum + d.present_count, 0),
    late: depts.reduce((sum, d) => sum + d.late_count, 0),
    absent: depts.reduce((sum, d) => sum + d.absent_count, 0),
    onShift: depts.reduce((sum, d) => sum + d.on_shift_count, 0),
  }
}

export const useDeptSummaryStore = create<DeptSummaryState>((set) => ({
  departments: {},
  unknownUsers: [],
  _totals: { present: 0, late: 0, absent: 0, onShift: 0 },

  updateDepartment: (payload) =>
    set((state) => {
      const departments = {
        ...state.departments,
        [payload.department_id]: payload,
      }
      return { departments, _totals: computeTotals(departments) }
    }),

  setDepartments: (summaries) =>
    set(() => {
      const departments: Record<string, DeptSummaryPayload> = {}
      for (const s of summaries) {
        departments[s.department_id] = {
          department_id: s.department_id,
          department_name: s.department_name,
          summary_date: s.summary_date,
          expected_count: s.expected_count,
          present_count: s.present_count,
          late_count: s.late_count,
          absent_count: s.absent_count,
          on_leave_count: s.on_leave_count,
          vacation_count: s.vacation_count,
          overtime_count: s.overtime_count,
          on_shift_count: s.on_shift_count,
        }
      }
      return { departments, _totals: computeTotals(departments) }
    }),

  prependUnknownUser: (payload) =>
    set((state) => ({
      unknownUsers: [payload, ...state.unknownUsers].slice(0, 200),
    })),
}))
