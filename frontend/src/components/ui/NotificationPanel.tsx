import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, CheckCheck, AlertTriangle, Info, AlertCircle, Clock } from 'lucide-react'
import { useAlertStore } from '@/stores/alertStore'
import { format } from 'date-fns'
import type { OperationalAlert, AlertSeverity } from '@/types'

const severityIcon: Record<AlertSeverity, typeof AlertTriangle> = {
  INFO: Info,
  WARNING: AlertTriangle,
  CRITICAL: AlertCircle,
  EMERGENCY: AlertCircle,
}

const severityColor: Record<AlertSeverity, string> = {
  INFO: 'text-blue-400',
  WARNING: 'text-amber-400',
  CRITICAL: 'text-red-400',
  EMERGENCY: 'text-red-500',
}

const severityBg: Record<AlertSeverity, string> = {
  INFO: 'bg-blue-500/10 border-blue-500/20',
  WARNING: 'bg-amber-500/10 border-amber-500/20',
  CRITICAL: 'bg-red-500/10 border-red-500/20',
  EMERGENCY: 'bg-red-500/15 border-red-500/30',
}

export function NotificationPanel() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const alerts = useAlertStore((s) => s.alerts)
  const acknowledgeAlert = useAlertStore((s) => s.acknowledgeAlert)
  const acknowledgeAlertServer = useAlertStore((s) => s.acknowledgeAlertServer)
  const clearAll = useAlertStore((s) => s.clearAll)
  const acknowledgeAllServer = useAlertStore((s) => s.acknowledgeAllServer)
  const unacknowledged = alerts.filter((a) => !a.acknowledged)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2.5 rounded-xl hover:bg-[var(--pz-surface-2)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unacknowledged.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center px-1 border-2 border-[var(--pz-surface-1)]">
            {unacknowledged.length > 99 ? '99+' : unacknowledged.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-full right-0 mt-2 w-[420px] max-h-[600px] flex flex-col rounded-2xl border border-[var(--pz-border)] bg-[var(--pz-surface-1)] shadow-2xl"
            style={{ zIndex: 80 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--pz-border)]">
              <div className="flex items-center gap-2.5">
                <Bell size={16} className="text-[var(--pz-text-muted)]" />
                <span className="text-sm font-bold text-[var(--pz-text)]">Notifications</span>
                {unacknowledged.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold">
                    {unacknowledged.length} new
                  </span>
                )}
              </div>
              {unacknowledged.length > 0 && (
                <button
                  onClick={() => {
                    clearAll()
                    acknowledgeAllServer()
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] hover:bg-[var(--pz-surface-2)] transition-all"
                >
                  <CheckCheck size={13} />
                  Dismiss all
                </button>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto py-2">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-[var(--pz-text-muted)]">
                  <Bell size={28} className="opacity-20 mb-3" />
                  <p className="text-sm font-medium">No notifications</p>
                  <p className="text-xs mt-1">Alerts will appear here in real-time</p>
                </div>
              ) : (
                alerts.slice(0, 100).map((alert) => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={() => {
                      acknowledgeAlert(alert.id)
                      acknowledgeAlertServer(alert.id)
                    }}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AlertItem({ alert, onAcknowledge }: { alert: OperationalAlert; onAcknowledge: () => void }) {
  const Icon = severityIcon[alert.severity] || Info
  return (
    <div
      className={`mx-2 px-4 py-3 rounded-xl mb-1 border transition-all ${
        alert.acknowledged
          ? 'opacity-60'
          : severityBg[alert.severity] || 'bg-[var(--pz-surface-2)]/50 border-[var(--pz-border)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon size={16} className={`mt-0.5 flex-shrink-0 ${severityColor[alert.severity]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-semibold ${alert.acknowledged ? 'text-[var(--pz-text-tertiary)]' : 'text-[var(--pz-text-secondary)]'}`}>
              {alert.title}
            </p>
            {!alert.acknowledged && (
              <button
                onClick={onAcknowledge}
                className="p-1 rounded-lg hover:bg-[var(--pz-surface-2)] text-[var(--pz-text-faint)] hover:text-[var(--pz-text-muted)] transition-colors flex-shrink-0"
                title="Dismiss"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <p className="text-xs text-[var(--pz-text-tertiary)] mt-0.5 leading-relaxed">{alert.message}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <Clock size={10} className="text-[var(--pz-text-faint)]" />
            <span className="text-[10px] text-[var(--pz-text-faint)] font-mono">
              {format(new Date(alert.timestamp), 'MMM d, HH:mm')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
