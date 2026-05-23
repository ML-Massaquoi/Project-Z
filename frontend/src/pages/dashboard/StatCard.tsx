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
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-card"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${color}18` }}>
          <Icon size={22} style={{ color }} />
        </div>
        {showTrend && (
          <span
            className={`flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full ${
              isPositive
                ? 'bg-emerald-50 text-emerald-600'
                : isNegative
                ? 'bg-red-50 text-red-500'
                : ''
            }`}
          >
            {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(change!)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-800">{value.toLocaleString()}</p>
      <p className="text-sm text-slate-400 mt-0.5">{label}</p>
    </motion.div>
  )
}
