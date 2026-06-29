import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Sun, Moon, Home, Users } from 'lucide-react'
import { workforceAPI } from '@/api/client'
import type { ShiftCoverage } from '@/types'

export function ShiftCoverageWidget() {
  const { data, isLoading } = useQuery<ShiftCoverage>({
    queryKey: ['shift-coverage'],
    queryFn: async () => (await workforceAPI.coverage()).data,
    refetchInterval: 60000,
  })

  if (isLoading) {
    return (
      <div className="pz-card p-5">
        <div className="skeleton h-4 w-28 rounded mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="pz-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[var(--pz-text)]">Shift Coverage</h3>
        <span className="text-[10px] text-[var(--pz-text-muted)] font-mono bg-[var(--pz-surface-2)] px-2 py-1 rounded-md">
          {data.time}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Day Shift */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/10 hover:border-amber-500/20 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/15">
              <Sun size={13} className="text-amber-400" />
            </div>
            <span className="text-xs font-semibold text-amber-400">Day</span>
          </div>
          <p className="text-xl font-bold text-amber-400 tabular-nums">{data.day_shift}</p>
          <div className="mt-2.5">
            <div className="w-full bg-amber-500/10 rounded-full h-1.5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${data.day_coverage}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="bg-amber-500 h-1.5 rounded-full"
              />
            </div>
            <p className="text-[10px] text-[var(--pz-text-muted)] mt-1.5 font-medium">{data.day_coverage}% coverage</p>
          </div>
        </motion.div>

        {/* Night Shift */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/10 hover:border-indigo-500/20 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/15">
              <Moon size={13} className="text-indigo-400" />
            </div>
            <span className="text-xs font-semibold text-indigo-400">Night</span>
          </div>
          <p className="text-xl font-bold text-indigo-400 tabular-nums">{data.night_shift}</p>
          <div className="mt-2.5">
            <div className="w-full bg-indigo-500/10 rounded-full h-1.5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${data.night_coverage}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="bg-indigo-500 h-1.5 rounded-full"
              />
            </div>
            <p className="text-[10px] text-[var(--pz-text-muted)] mt-1.5 font-medium">{data.night_coverage}% coverage</p>
          </div>
        </motion.div>

        {/* Off Duty */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-3.5 rounded-xl bg-gray-500/5 border border-gray-500/10 hover:border-gray-500/20 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2.5">
            <div className="p-1.5 rounded-lg bg-gray-500/15">
              <Home size={13} className="text-gray-400" />
            </div>
            <span className="text-xs font-semibold text-gray-400">Off</span>
          </div>
          <p className="text-xl font-bold text-gray-400 tabular-nums">{data.off_duty}</p>
          <div className="mt-2.5">
            <div className="w-full bg-gray-500/10 rounded-full h-1.5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${((data.total_employees - data.off_duty) / data.total_employees) * 100}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="bg-gray-500 h-1.5 rounded-full"
              />
            </div>
            <p className="text-[10px] text-[var(--pz-text-muted)] mt-1.5 font-medium">
              {data.total_employees - data.off_duty} on duty
            </p>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--pz-border)]">
        <Users size={13} className="text-blue-400" />
        <span className="text-xs text-[var(--pz-text-muted)]">
          <span className="font-bold text-blue-400">{data.present_now}</span> present now
        </span>
        <span className="text-xs text-[var(--pz-text-faint)]">&middot;</span>
        <span className="text-xs text-[var(--pz-text-muted)]">
          <span className="font-bold text-[var(--pz-text-secondary)]">{data.total_employees}</span> total
        </span>
      </div>
    </div>
  )
}
