import * as React from 'react'
import { AlertTriangle, Info, AlertCircle, Zap, CheckCircle, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

export interface AlertCardProps {
  title: string
  message: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY'
  timestamp?: string
  acknowledged?: boolean
  onAcknowledge?: () => void
  onDismiss?: () => void
  source?: string
  className?: string
}

const severityConfig = {
  INFO:      { icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-500/8 border-blue-500/20',    label: 'Info'      },
  WARNING:   { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/20',  label: 'Warning'   },
  CRITICAL:  { icon: AlertCircle,   color: 'text-red-400',    bg: 'bg-red-500/8 border-red-500/20',      label: 'Critical'  },
  EMERGENCY: { icon: Zap,           color: 'text-red-300',    bg: 'bg-red-500/12 border-red-400/30',     label: 'Emergency' },
}

export function AlertCard({ title, message, severity, timestamp, acknowledged, onAcknowledge, onDismiss, source, className }: AlertCardProps) {
  const cfg = severityConfig[severity] || severityConfig.INFO
  const Icon = cfg.icon

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      className={cn(
        'relative flex gap-3 p-4 rounded-xl border transition-all',
        cfg.bg,
        acknowledged && 'opacity-50',
        className,
      )}
    >
      <div className={cn('flex-shrink-0 mt-0.5', cfg.color)}>
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm font-semibold', cfg.color)}>{title}</p>
          {onDismiss && (
            <button onClick={onDismiss} className="text-[var(--pz-text-faint)] hover:text-[var(--pz-text-muted)] transition-colors flex-shrink-0">
              <X size={14} />
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--pz-text-secondary)] mt-0.5 leading-relaxed">{message}</p>

        <div className="flex items-center justify-between mt-2 gap-2">
          <div className="flex items-center gap-2">
            {source && <span className="text-[10px] text-[var(--pz-text-faint)] font-mono">{source}</span>}
            {timestamp && (
              <span className="text-[10px] text-[var(--pz-text-faint)]">
                {format(new Date(timestamp), 'HH:mm')}
              </span>
            )}
          </div>
          {!acknowledged && onAcknowledge && (
            <button
              onClick={onAcknowledge}
              className="flex items-center gap-1 text-[11px] font-semibold text-[var(--pz-text-secondary)] hover:text-[var(--pz-text)] transition-colors px-2 py-0.5 rounded-md hover:bg-[var(--pz-surface-2)]"
            >
              <CheckCircle size={12} /> Acknowledge
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
