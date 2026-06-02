import { create } from 'zustand'
import type { WorkforceMetrics, CriticalStaffMember } from '@/types'
import { eventBus } from '@/lib/eventBus'

interface WorkforceState {
  metrics: WorkforceMetrics
  setMetrics: (metrics: WorkforceMetrics) => void
  updateMetrics: (update: Partial<WorkforceMetrics>) => void
  initializeBusSubscription: () => () => void
}

const defaultMetrics: WorkforceMetrics = {
  expected_count: 0,
  present_count: 0,
  late_count: 0,
  absent_count: 0,
  on_shift_count: 0,
  understaffed_departments: [],
  missing_critical_staff: [],
  overtime_escalations: [],
  shift_transitions: [],
}

export const useWorkforceStore = create<WorkforceState>((set, get) => ({
  metrics: defaultMetrics,
  setMetrics: (metrics) => set({ metrics }),
  updateMetrics: (update) => set((state) => ({ metrics: { ...state.metrics, ...update } })),

  initializeBusSubscription: () => {
    // 1. Subscribe to workforce status update
    const unsubscribeStatus = eventBus.subscribe('workforce_status_update', (event) => {
      const data = event.data as unknown as Partial<WorkforceMetrics>
      get().updateMetrics(data)
    })

    // 2. Subscribe to employee absent alerts
    const unsubscribeAbsent = eventBus.subscribe('employee_absent', (event) => {
      const data = event.data as Record<string, unknown>
      const staff: CriticalStaffMember = {
        id: (data.employee_id as string) || String(Math.random()),
        employee_code: (data.employee_code as string) || 'N/A',
        full_name: (data.employee_name as string) || 'Unknown Critical Member',
        position: (data.position as string) || 'Security Guard',
        department_name: (data.department_name as string) || 'Aviation Security',
        status: 'absent',
      }
      
      const current = get().metrics.missing_critical_staff
      if (!current.some((s) => s.employee_code === staff.employee_code)) {
        get().updateMetrics({
          missing_critical_staff: [staff, ...current].slice(0, 50),
          absent_count: get().metrics.absent_count + 1,
        })
      }
    })

    // 3. Subscribe to employee late alerts
    const unsubscribeLate = eventBus.subscribe('employee_late', (event) => {
      const data = event.data as Record<string, unknown>
      const staff: CriticalStaffMember = {
        id: (data.employee_id as string) || String(Math.random()),
        employee_code: (data.employee_code as string) || 'N/A',
        full_name: (data.employee_name as string) || 'Unknown Critical Member',
        position: (data.position as string) || 'Aviation Safety Officer',
        department_name: (data.department_name as string) || 'Ground Operations',
        status: 'late',
      }

      const current = get().metrics.missing_critical_staff
      const updated = current.some((s) => s.employee_code === staff.employee_code)
        ? current.map((s) => s.employee_code === staff.employee_code ? { ...s, status: 'late' as const } : s)
        : [staff, ...current]

      get().updateMetrics({
        missing_critical_staff: updated.slice(0, 50),
        late_count: get().metrics.late_count + 1,
      })
    })

    // 4. Subscribe to department summary update
    const unsubscribeDept = eventBus.subscribe('department_summary_update', (event) => {
      const d = event.data as any
      const totalExpected = d.expected_count || 0
      const totalPresent = d.present_count || 0
      const percent = totalExpected > 0 ? (totalPresent / totalExpected) * 100 : 100

      const currentUnderstaffed = get().metrics.understaffed_departments
      let updated = [...currentUnderstaffed]

      if (percent < 85) {
        const item = { department_id: d.department_id, name: d.department_name, percent }
        if (!updated.some((u) => u.department_id === d.department_id)) {
          updated.push(item)
        } else {
          updated = updated.map((u) => u.department_id === d.department_id ? item : u)
        }
      } else {
        updated = updated.filter((u) => u.department_id !== d.department_id)
      }

      get().updateMetrics({
        understaffed_departments: updated,
      })
    })

    // 5. Subscribe to overtime escalations
    const unsubscribeOvertime = eventBus.subscribe('attendance_update', (event) => {
      const d = event.data as any
      if (d.overtime_minutes && d.overtime_minutes > 0) {
        const item = {
          employee_name: d.employee_name || 'Employee',
          shift_name: d.shift_name || 'Active Shift',
          overtime_minutes: d.overtime_minutes,
        }
        const currentOvertime = get().metrics.overtime_escalations
        if (!currentOvertime.some((o) => o.employee_name === item.employee_name)) {
          get().updateMetrics({
            overtime_escalations: [item, ...currentOvertime].slice(0, 50),
          })
        }
      }
    })

    return () => {
      unsubscribeStatus()
      unsubscribeAbsent()
      unsubscribeLate()
      unsubscribeDept()
      unsubscribeOvertime()
    }
  },
}))
