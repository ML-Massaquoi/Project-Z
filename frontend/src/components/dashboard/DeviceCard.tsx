import * as React from 'react'
import { Monitor, Wifi, WifiOff, Activity } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface DeviceCardProps {
  name: string
  serialNumber: string
  ipAddress?: string
  status: 'online' | 'offline' | 'degraded'
  lastSeen?: string
  scanCount?: number
  healthStatus?: string
  onClick?: () => void
  className?: string
}

const statusCfg = {
  online:   { icon: Wifi,    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', badge: 'text-emerald-400', label: 'Online'   },
  offline:  { icon: WifiOff, color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         badge: 'text-red-400',    label: 'Offline'  },
  degraded: { icon: Activity, color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20',     badge: 'text-amber-400',  label: 'Degraded' },
}

export function DeviceCard({ name, serialNumber, ipAddress, status, lastSeen, scanCount, healthStatus, onClick, className }: DeviceCardProps) {
  const cfg = statusCfg[status]
  const StatusIcon = cfg.icon

  return (
    <motion.div
      whileHover={onClick ? { y: -2, scale: 1.01 } : undefined}
      transition={{ duration: 0.15 }}
      className={cn(
        'pz-card p-4 flex flex-col gap-3',
        onClick && 'cursor-pointer pz-card--interactive',
        className,
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className={cn('p-2.5 rounded-xl border', cfg.bg)}>
          <Monitor size={18} className={cfg.color} />
        </div>
        <div className={cn('flex items-center gap-1 text-[11px] font-semibold', cfg.badge)}>
          <span className={cn(
            'w-1.5 h-1.5 rounded-full',
            status === 'online' ? 'bg-emerald-500 pz-pulse-dot' : status === 'offline' ? 'bg-red-500' : 'bg-amber-500',
          )} />
          {cfg.label}
        </div>
      </div>

      {/* Info */}
      <div>
        <p className="text-sm font-semibold text-[var(--pz-text-secondary)] truncate">{name}</p>
        <p className="text-xs text-[var(--pz-text-muted)] font-mono mt-0.5">{ipAddress || serialNumber}</p>
      </div>

      {/* Footer stats */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--pz-border)]/50">
        <div className="text-[11px] text-[var(--pz-text-faint)]">
          {lastSeen ? `Last seen ${lastSeen}` : serialNumber.slice(-8)}
        </div>
        {scanCount !== undefined && (
          <div className="text-[11px] font-semibold text-[var(--pz-text-muted)]">
            {scanCount.toLocaleString()} scans
          </div>
        )}
      </div>
    </motion.div>
  )
}
