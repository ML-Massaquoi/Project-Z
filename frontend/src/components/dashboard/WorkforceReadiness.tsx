import { useEffect } from 'react'
import { AlertCircle, Clock, ShieldAlert, UserX, Users, Activity, CheckCircle2 } from 'lucide-react'
import { useWorkforceStore } from '@/stores/workforceStore'

export function WorkforceReadiness() {
  const { metrics, initializeBusSubscription } = useWorkforceStore()

  useEffect(() => {
    const unsubscribe = initializeBusSubscription()
    return () => unsubscribe()
  }, [initializeBusSubscription])

  const understaffedCount = metrics.understaffed_departments.length
  const criticalCount = metrics.missing_critical_staff.length

  return (
    <div className="space-y-6">
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] hover:border-[var(--pz-border-strong)] transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <Users size={14} className="text-blue-400" />
            <span className="text-xs text-[var(--pz-text-muted)] font-medium">Scheduled</span>
          </div>
          <p className="text-2xl font-bold font-mono text-[var(--pz-text)] tabular-nums">
            {metrics.expected_count ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] hover:border-[var(--pz-border-strong)] transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <Activity size={14} className="text-emerald-400" />
            <span className="text-xs text-[var(--pz-text-muted)] font-medium">Active</span>
          </div>
          <p className="text-2xl font-bold font-mono text-[var(--pz-text)] tabular-nums">
            {metrics.present_count ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] hover:border-[var(--pz-border-strong)] transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertCircle size={14} className="text-amber-400" />
            <span className="text-xs text-[var(--pz-text-muted)] font-medium">Understaffed</span>
          </div>
          <p className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
            {understaffedCount}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] hover:border-[var(--pz-border-strong)] transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <ShieldAlert size={14} className="text-red-400" />
            <span className="text-xs text-[var(--pz-text-muted)] font-medium">Critical</span>
          </div>
          <p className="text-2xl font-bold font-mono text-red-400 tabular-nums">
            {criticalCount}
          </p>
        </div>
      </div>

      {/* Observability Feed Sections (Divider Separated) */}
      <div className="space-y-5">
        {/* Department Readiness */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-400" />
            <h4 className="text-sm font-semibold text-[var(--pz-text)]">Department Readiness</h4>
          </div>
          {understaffedCount === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2">
              <CheckCircle2 size={14} className="flex-shrink-0" />
              <span>All departments staffing meets nominal levels (&gt;85% readiness)</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {metrics.understaffed_departments.map((dept) => (
                <div key={dept.department_id} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)]">
                  <span className="text-xs font-medium text-[var(--pz-text-secondary)]">{dept.name}</span>
                  <span className="text-xs font-bold font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                    {Math.round(dept.percent)}% Staffed
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Critical Absences */}
        <div className="border-t border-[var(--pz-border)] pt-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <UserX size={16} className="text-red-400" />
            <h4 className="text-sm font-semibold text-[var(--pz-text)]">Missing Critical Personnel</h4>
          </div>
          {criticalCount === 0 ? (
            <p className="text-xs text-[var(--pz-text-muted)] pl-6">No critical staffing alerts reported.</p>
          ) : (
            <div className="space-y-2">
              {metrics.missing_critical_staff.slice(0, 5).map((staff) => (
                <div key={staff.id} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)]">
                  <div>
                    <p className="text-xs font-semibold text-[var(--pz-text-secondary)]">{staff.full_name}</p>
                    <p className="text-[10px] text-[var(--pz-text-muted)]">{staff.position} &middot; {staff.department_name}</p>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase">
                    {staff.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overtime */}
        <div className="border-t border-[var(--pz-border)] pt-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-blue-400" />
            <h4 className="text-sm font-semibold text-[var(--pz-text)]">Overtime Warnings</h4>
          </div>
          {metrics.overtime_escalations.length === 0 ? (
            <p className="text-xs text-[var(--pz-text-muted)] pl-6">No overtime violations detected.</p>
          ) : (
            <div className="space-y-2 max-h-[140px] overflow-y-auto">
              {metrics.overtime_escalations.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)]">
                  <div>
                    <p className="text-xs font-semibold text-[var(--pz-text-secondary)]">{item.employee_name}</p>
                    <p className="text-[10px] text-[var(--pz-text-muted)]">{item.shift_name}</p>
                  </div>
                  <span className="text-[10px] font-bold font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/15">
                    +{item.overtime_minutes}m
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Roster Transitions */}
        <div className="border-t border-[var(--pz-border)] pt-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-indigo-400" />
            <h4 className="text-sm font-semibold text-[var(--pz-text)]">Roster Transitions</h4>
          </div>
          {metrics.shift_transitions.length === 0 ? (
            <p className="text-xs text-[var(--pz-text-muted)] pl-6">No shift transitions pending.</p>
          ) : (
            <div className="space-y-2">
              {metrics.shift_transitions.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs text-[var(--pz-text-secondary)] pb-2 border-b border-[var(--pz-border)]/30 last:border-0 last:pb-0">
                  <span className="text-[var(--pz-text-secondary)]">{item.shift_name} ({item.time})</span>
                  <span className={item.status === 'starting' ? 'text-emerald-400 font-semibold font-mono' : 'text-amber-400 font-semibold font-mono'}>
                    {item.count} {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
