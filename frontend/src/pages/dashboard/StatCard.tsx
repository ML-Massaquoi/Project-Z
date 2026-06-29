import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: number
  change?: number
  color: string
  delay: number
}

export const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut', delay: delay * 0.07 },
  }),
}

export function StatCard({ icon: Icon, label, value, change, color, delay }: StatCardProps) {
  const isPositive = change !== undefined && change > 0
  const isNegative = change !== undefined && change < 0
  const showTrend = change !== undefined && change !== 0

  return (
    <motion.div
      custom={delay}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="card p-4 flex flex-col justify-between"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
          <Icon size={18} style={{ color }} />
        </div>
        {showTrend && (
          <span
            className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
              isPositive
                ? 'bg-[var(--pz-success-50)] text-[var(--pz-success-500)] border-emerald-500/30'
                : isNegative
                ? 'bg-[var(--pz-danger-50)] text-[var(--pz-danger-500)] border-red-500/30'
                : 'bg-[var(--pz-surface-3)] text-[var(--pz-text-muted)] border-[var(--pz-border)]'
            }`}
          >
            {isPositive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            {Math.abs(change!)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-xl font-bold text-[var(--pz-text)] font-mono tracking-tight">{value.toLocaleString()}</p>
        <p className="text-[11px] text-[var(--pz-text-muted)] font-medium mt-0.5 uppercase tracking-wider">{label}</p>
      </div>
    </motion.div>
  )
}
