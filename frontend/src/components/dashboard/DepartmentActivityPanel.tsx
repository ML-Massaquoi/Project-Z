import { useDeptSummaryStore } from '@/stores/deptSummaryStore'
import type { DeptSummaryPayload } from '@/types'

function DeptRow({ dept }: { dept: DeptSummaryPayload }) {
  const attendanceRate =
    dept.expected_count > 0
      ? Math.round((dept.present_count / dept.expected_count) * 100)
      : 0

  const rateColor =
    attendanceRate >= 90
      ? 'bg-[var(--pz-success-500)]'
      : attendanceRate >= 70
      ? 'bg-[var(--pz-warning-400)]'
      : 'bg-[var(--pz-danger-400)]'

  return (
    <div className="p-3 rounded-lg border border-[var(--pz-border)] bg-white hover:bg-[var(--pz-surface-2)] transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-[var(--pz-text)] truncate">
          {dept.department_name}
        </p>
        <span className="text-[10px] font-bold text-[var(--pz-text-muted)] font-mono">
          {dept.present_count}/{dept.expected_count}
        </span>
      </div>

      {/* Attendance rate bar */}
      <div className="w-full h-1 bg-[var(--pz-surface-3)] rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${rateColor}`}
          style={{ width: `${attendanceRate}%` }}
        />
      </div>

      {/* Counts row */}
      <div className="flex items-center gap-2.5 text-[9px] font-semibold">
        <span className="text-[var(--pz-success-500)]">{dept.present_count} present</span>
        <span className="text-[var(--pz-warning-500)]">{dept.late_count} late</span>
        <span className="text-[var(--pz-danger-500)]">{dept.absent_count} absent</span>
        <span className="text-[var(--pz-accent)] ml-auto font-mono">{dept.on_shift_count} on shift</span>
      </div>
    </div>
  )
}

interface DepartmentActivityPanelProps {
  className?: string
}

export function DepartmentActivityPanel({ className = '' }: DepartmentActivityPanelProps) {
  const departmentsMap = useDeptSummaryStore((s) => s.departments)
  const departments = Object.values(departmentsMap)

  if (departments.length === 0) {
    return (
      <div className={`flex flex-col items-center py-10 text-[var(--pz-text-muted)] ${className}`}>
        <p className="text-sm">No department data yet</p>
        <p className="text-xs mt-1">Updates in real-time as employees scan</p>
      </div>
    )
  }

  return (
    <div className={`space-y-2 overflow-y-auto max-h-[400px] pr-1 ${className}`}>
      {departments
        .sort((a, b) => b.present_count - a.present_count)
        .map((dept) => (
          <DeptRow key={dept.department_id} dept={dept} />
        ))}
    </div>
  )
}
