import * as React from 'react'
import { Monitor, type LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface StatusCardProps {
  title: string
  status: 'online' | 'offline' | 'degraded' | 'warning' | 'unknown'
  subtitle?: string
  detail?: string
  icon?: LucideIcon
  lastSeen?: string
  onClick?: () => void
  className?: string
}

const statusConfig = {
  online:   { dot: 'bg-emerald-500', badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: 'Online',   pulse: true  },
  offline:  { dot: 'bg-red-500',     badge: 'text-red-400 bg-red-500/10 border-red-500/20',             label: 'Offline',  pulse: false },
  degraded: { dot: 'bg-amber-500',   badge: 'text-amber-400 bg-amber-500/10 border-amber-500/20',       label: 'Degraded', pulse: true  },
  warning:  { dot: 'bg-amber-400',   badge: 'text-amber-400 bg-amber-500/10 border-amber-500/20',       label: 'Warning',  pulse: true  },
  unknown:  { dot: 'bg-gray-500',    badge: 'text-gray-400 bg-gray-500/10 border-gray-500/20',          label: 'Unknown',  pulse: false },
}

export function StatusCard({ title, status, subtitle, detail, icon: Icon = Monitor, lastSeen, onClick, className }: StatusCardProps) {
  const cfg = statusConfig[status]

  return (
    <motion.div
      whileHover={onClick ? { y: -1 } : undefined}
      transition={{ duration: 0.15 }}
      className={cn(
        'flex items-center gap-3.5 p-4 rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface-2)]/50',
        'hover:bg-[var(--pz-surface-2)]/70 hover:border-[var(--pz-border-strong)] transition-all',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
    >
      <div className={cn(
        'p-2.5 rounded-xl border flex-shrink-0',
        status === 'online'   ? 'bg-emerald-500/10 border-emerald-500/20'
        : status === 'offline' ? 'bg-[var(--pz-surface-2)] border-[var(--pz-border)]'
        : 'bg-amber-500/10 border-amber-500/20',
      )}>
        <Icon size={16} className={status === 'online' ? 'text-emerald-400' : status === 'offline' ? 'text-[var(--pz-text-muted)]' : 'text-amber-400'} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--pz-text-secondary)] truncate">{title}</p>
        {subtitle && <p className="text-xs text-[var(--pz-text-muted)] font-mono truncate">{subtitle}</p>}
        {lastSeen && <p className="text-[11px] text-[var(--pz-text-faint)] mt-0.5">Last seen: {lastSeen}</p>}
      </div>

      <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold border flex-shrink-0', cfg.badge)}>
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot, cfg.pulse && 'pz-pulse-dot')} />
        {cfg.label}
      </div>
    </motion.div>
  )
}
