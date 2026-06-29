import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CalendarClock, ArrowRight, Clock, AlertTriangle, UserCheck, RotateCcw } from 'lucide-react'
import { workforceAPI } from '@/api/client'
import type { UpcomingChange } from '@/types'

export function UpcomingChangesWidget() {
  const { data, isLoading } = useQuery<{ changes: UpcomingChange[]; total: number; period: string }>({
    queryKey: ['upcoming-changes'],
    queryFn: async () => (await workforceAPI.upcomingChanges()).data,
    refetchInterval: 30000,
  })

  if (isLoading) {
    return (
      <div className="pz-card p-5">
        <div className="skeleton h-4 w-24 rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}
        </div>
      </div>
    )
  }

  const changes: UpcomingChange[] = data?.changes ?? []

  const isShiftChange = (c: UpcomingChange) => c.type === 'shift_change'
  const isReturning = (c: UpcomingChange) => c.type === 'returning_from_leave'

  return (
    <div className="pz-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[var(--pz-text)]">Upcoming Changes</h3>
        <CalendarClock size={15} className="text-[var(--pz-text-muted)]" />
      </div>

      {changes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <CalendarClock size={22} className="text-[var(--pz-text-faint)]" />
          <p className="text-xs text-[var(--pz-text-muted)]">No upcoming schedule changes</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {changes.map((change, idx) => (
            <motion.div
              key={`${change.employee_id}-${change.type}-${idx}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04, ease: 'easeOut' }}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                isShiftChange(change)
                  ? 'bg-amber-500/5 border-amber-500/15'
                  : 'bg-emerald-500/5 border-emerald-500/15'
              }`}
            >
              {/* Left indicator */}
              <div className={`w-1 h-8 rounded-full shrink-0 mt-1 ${
                isShiftChange(change) ? 'bg-amber-500' : 'bg-emerald-500'
              }`} />

              {/* Icon */}
              <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                isShiftChange(change)
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'bg-emerald-500/15 text-emerald-400'
              }`}>
                {isShiftChange(change) ? <ArrowRight size={13} /> : <RotateCcw size={13} />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[var(--pz-text-secondary)] truncate">
                  {change.employee_name}
                </p>
                <p className="text-[10px] text-[var(--pz-text-muted)] mt-0.5">
                  {isShiftChange(change)
                    ? `→ ${change.new_shift} (${change.department_name})`
                    : `Returning from ${change.leave_type ?? 'leave'} · ${change.department_name}`
                  }
                </p>
              </div>

              {/* Date */}
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                <Clock size={10} className="text-[var(--pz-text-muted)]" />
                <span className="text-[10px] font-mono font-medium text-[var(--pz-text-muted)]">
                  {isShiftChange(change)
                    ? change.effective_date ?? 'TBD'
                    : change.return_date ?? 'TBD'
                  }
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {changes.some(isShiftChange) && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20"
        >
          <AlertTriangle size={13} className="text-amber-400 shrink-0" />
          <span className="text-[10px] text-amber-300 font-semibold">
            {changes.filter(isShiftChange).length} shift change{changes.filter(isShiftChange).length > 1 ? 's' : ''} pending
          </span>
        </motion.div>
      )}
    </div>
  )
}
