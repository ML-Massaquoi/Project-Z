import { useState, useEffect, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { type LucideIcon, TrendingUp, TrendingDown, Minus, X } from 'lucide-react'

interface KPICardProps {
  icon: LucideIcon
  label: string
  value: number | string
  change?: number
  color: string
  gradient?: string
  loading?: boolean
  onClick?: () => void
  suffix?: string
  subtitle?: string
  children?: ReactNode
}

const GRADIENT_MAP: Record<string, string> = {
  '#3B82F6': 'from-blue-500/15 via-blue-500/5 to-transparent',
  '#10B981': 'from-emerald-500/15 via-emerald-500/5 to-transparent',
  '#F59E0B': 'from-amber-500/15 via-amber-500/5 to-transparent',
  '#EF4444': 'from-red-500/15 via-red-500/5 to-transparent',
  '#6366F1': 'from-indigo-500/15 via-indigo-500/5 to-transparent',
}

function AnimatedCounter({ value, duration = 600 }: { value: number | string; duration?: number }) {
  const [display, setDisplay] = useState(0)
  const prevRef = useRef(0)
  const numVal = typeof value === 'number' ? value : parseInt(String(value)) || 0

  useEffect(() => {
    const start = prevRef.current
    const end = numVal
    const startTime = performance.now()

    if (start === end) {
      setDisplay(end)
      return
    }

    const frame = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(start + (end - start) * eased))
      if (progress < 1) requestAnimationFrame(frame)
    }
    prevRef.current = end
    requestAnimationFrame(frame)
  }, [numVal, duration])

  return <>{typeof value === 'string' && isNaN(numVal) ? value : display}</>
}

export function KPICard({
  icon: Icon,
  label,
  value,
  change,
  color,
  gradient,
  loading = false,
  onClick,
  suffix,
  subtitle,
}: KPICardProps) {
  const gradClass = gradient || GRADIENT_MAP[color] || 'from-blue-600/10 to-transparent'

  if (loading) {
    return (
      <div className="pz-card p-6 space-y-4 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br opacity-30" />
        <div className="flex items-center gap-3">
          <div className="skeleton w-11 h-11 rounded-xl" />
          <div className="skeleton h-3.5 w-24 rounded" />
        </div>
        <div className="skeleton h-9 w-20 rounded" />
        <div className="skeleton h-3 w-28 rounded" />
      </div>
    )
  }

  const TrendIcon = change === undefined ? null : change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus
  const trendColor = change === undefined ? '' : change > 0 ? 'text-emerald-400' : change < 0 ? 'text-red-400' : 'text-[var(--pz-text-muted)]'
  const trendBg = change === undefined ? '' : change > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : change < 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-[var(--pz-surface-2)] border-[var(--pz-border)]'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`pz-card p-6 flex flex-col gap-4 overflow-hidden relative group
        ${onClick ? 'pz-card--interactive cursor-pointer' : ''}`}
      onClick={onClick}
      whileHover={onClick ? { y: -2, transition: { duration: 0.2 } } : undefined}
    >
      {/* Gradient background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradClass} opacity-80`} />

      {/* Glow dot */}
      <div
        className="absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-[0.07] blur-2xl"
        style={{ backgroundColor: color }}
      />

      {/* Header */}
      <div className="flex items-center gap-3 relative z-10">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border shadow-sm"
          style={{
            backgroundColor: `${color}15`,
            borderColor: `${color}25`,
            boxShadow: `0 0 20px ${color}15`,
          }}
        >
          <Icon size={20} style={{ color }} strokeWidth={1.75} />
        </div>
        <span className="text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider leading-tight">
          {label}
        </span>
      </div>

      {/* Value */}
      <div className="flex items-end gap-2.5 relative z-10">
        <span className="text-[34px] font-bold text-[var(--pz-text)] tabular-nums tracking-tight leading-none">
          <AnimatedCounter value={value} />
        </span>
        {suffix && (
          <span className="text-sm text-[var(--pz-text-muted)] font-medium mb-1">{suffix}</span>
        )}
        {onClick && (
          <span className="ml-auto text-[11px] text-blue-400/60 group-hover:text-blue-400 font-semibold transition-colors flex items-center gap-1">
            View
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:translate-x-0.5 transition-transform">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        )}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div className="relative z-10">
          <span className="text-[11px] text-[var(--pz-text-muted)] font-medium">{subtitle}</span>
        </div>
      )}

      {/* Trend */}
      {change !== undefined && TrendIcon && (
        <div className="flex items-center gap-2 relative z-10">
          <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${trendBg} ${trendColor}`}>
            <TrendIcon size={12} />
            {Math.abs(change)}%
          </span>
          <span className="text-[11px] text-[var(--pz-text-muted)]">vs yesterday</span>
        </div>
      )}
    </motion.div>
  )
}

/* ── KPI Drill Down Panel ───────────────────────────────────── */

export function KPIDrillPanel({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="pz-card p-6 border-l-4" style={{ borderLeftColor: 'var(--pz-border-strong)' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-[var(--pz-text)]">{title}</h3>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[var(--pz-surface-2)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
