import { useDeptSummaryStore } from '@/stores/deptSummaryStore'
import type { DeptSummaryPayload } from '@/types'

function DeptRow({ dept }: { dept: DeptSummaryPayload }) {
  const attendanceRate =
    dept.expected_count > 0
      ? Math.round((dept.present_count / dept.expected_count) * 100)
      : 0

  const rateColor =
    attendanceRate >= 90
      ? 'bg-emerald-500'
      : attendanceRate >= 70
      ? 'bg-amber-400'
      : 'bg-red-400'

  return (
    <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[#111827]/40 hover:bg-[#1F2937]/30 hover:border-gray-700 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-gray-200 truncate">
          {dept.department_name}
        </p>
        <span className="text-[10px] font-bold text-gray-400 font-mono">
          {dept.present_count}/{dept.expected_count}
        </span>
      </div>

      {/* Attendance rate bar */}
      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${rateColor}`}
          style={{ width: `${attendanceRate}%` }}
        />
      </div>

      {/* Counts row */}
      <div className="flex items-center gap-2.5 text-[9px] font-semibold">
        <span className="text-emerald-400">{dept.present_count} present</span>
        <span className="text-amber-400">{dept.late_count} late</span>
        <span className="text-red-400">{dept.absent_count} absent</span>
        <span className="text-blue-400 ml-auto font-mono">{dept.on_shift_count} on shift</span>
      </div>
    </div>
  )
}

interface DepartmentActivityPanelProps {
  className?: string
}

export function DepartmentActivityPanel({ className = '' }: DepartmentActivityPanelProps) {
  // Select the whole departments object — stable reference, only changes when a dept updates
  const departmentsMap = useDeptSummaryStore((s) => s.departments)
  const departments = Object.values(departmentsMap)

  if (departments.length === 0) {
    return (
      <div className={`flex flex-col items-center py-10 text-[var(--color-slate-400)] ${className}`}>
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
