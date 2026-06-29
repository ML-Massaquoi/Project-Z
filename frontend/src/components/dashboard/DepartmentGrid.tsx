import { useMemo } from 'react'
import { useDeptSummaryStore } from '@/stores/deptSummaryStore'
import { format } from 'date-fns'
import { Building2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export default function DepartmentGrid() {
  const departments = useDeptSummaryStore((s) => s.departments)

  const deptList = useMemo(() => {
    return Object.values(departments).sort((a, b) => a.department_name.localeCompare(b.department_name))
  }, [departments])

  if (deptList.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3>Department Operations</h3>
        </div>
        <EmptyState icon={Building2} message="No department data available" />
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Department Operations</h3>
        <span className="text-[10px] text-[var(--pz-text-muted)]">{deptList.length} departments</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '380px' }}>
        <table className="ops-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Present</th>
              <th>Late</th>
              <th>Absent</th>
            </tr>
          </thead>
          <tbody>
            {deptList.map((dept) => (
              <tr key={dept.department_id}>
                <td className="font-medium text-[var(--pz-text)]">{dept.department_name}</td>
                <td className="font-mono text-[var(--pz-success-500)] font-semibold">{dept.present_count}</td>
                <td className="font-mono text-[var(--pz-warning-500)] font-semibold">{dept.late_count}</td>
                <td className="font-mono text-[var(--pz-danger-500)] font-semibold">{dept.absent_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function DepartmentTotalsBar() {
  const totals = useDeptSummaryStore((s) => s._totals)
  const departments = useDeptSummaryStore((s) => s.departments)
  const totalExpected = Object.values(departments).reduce((sum, d) => sum + d.expected_count, 0)

  return (
    <div className="flex items-center gap-3 text-[11px] text-[var(--pz-text-muted)] px-4 py-2 bg-[var(--pz-surface-2)] rounded border border-[var(--pz-border)]">
      <span className="text-[var(--pz-text-muted)] text-[10px] uppercase tracking-wider font-medium">Totals</span>
      <span className="text-[var(--pz-success-500)] font-mono font-semibold">{totals.present} Present</span>
      <span className="text-[var(--pz-warning-500)] font-mono font-semibold">{totals.late} Late</span>
      <span className="text-[var(--pz-danger-500)] font-mono font-semibold">{totals.absent} Absent</span>
      <span className="text-[var(--pz-text-muted)]">|</span>
      <span className="text-[var(--pz-text-muted)]">{totalExpected} Expected</span>
    </div>
  )
}
