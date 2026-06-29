import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string
  icon: LucideIcon
  color: string
}

export function StatsCard({ title, value, icon: Icon, color }: StatsCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="bg-surface rounded-xl border border-border p-5 flex items-center gap-4"
    >
      <div
        className="p-3 rounded-lg"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold text-text">{value}</p>
        <p className="text-sm text-text-muted">{title}</p>
      </div>
    </motion.div>
  )
}
