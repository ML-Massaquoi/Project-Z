import { Bell, Check, X } from 'lucide-react'
import { useAlertStore } from '@/stores/alertStore'
import { format } from 'date-fns'

interface AlertDrawerProps {
  open: boolean
  onClose: () => void
}

export function AlertDrawer({ open, onClose }: AlertDrawerProps) {
  const { alerts, acknowledgeAlert, acknowledgeAlertServer, acknowledgeAllServer, clearAll } = useAlertStore()

  if (!open) return null

  const severityColors = {
    INFO: 'border-blue-200 bg-blue-50 text-blue-700',
    WARNING: 'border-amber-200 bg-amber-50 text-amber-700',
    CRITICAL: 'border-red-200 bg-red-50 text-red-700',
    EMERGENCY: 'border-red-300 bg-red-100 text-red-800 animate-pulse',
  }

  const unacknowledged = alerts.filter((a) => !a.acknowledged)
  const acknowledged = alerts.filter((a) => a.acknowledged)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-[100] backdrop-blur-sm" onClick={onClose} />

      {/* Drawer Container */}
      <div className="fixed right-0 top-0 h-screen w-[420px] bg-white border-l border-[var(--pz-border)] z-[101] shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="p-4 border-b border-[var(--pz-border)] flex items-center justify-between bg-[var(--pz-surface-2)]">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[var(--pz-brand)]" />
            <h2 className="text-sm font-bold text-[var(--pz-text)] uppercase tracking-wider">Alert Center</h2>
          </div>
          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              <button
                onClick={() => {
                  clearAll()
                  acknowledgeAllServer()
                }}
                className="text-[10px] font-bold text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] border border-[var(--pz-border)] hover:border-[var(--pz-border-strong)] px-2.5 py-1 rounded transition-colors cursor-pointer"
              >
                Clear History
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--pz-surface-3)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Active / Unacknowledged Alerts */}
          <div>
            <p className="text-[10px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider mb-2">
              Active Alerts ({unacknowledged.length})
            </p>
            {unacknowledged.length === 0 ? (
              <p className="text-xs text-[var(--pz-text-muted)] bg-[var(--pz-surface-2)] p-4 rounded text-center border border-[var(--pz-border)]">
                No active alerts detected.
              </p>
            ) : (
              <div className="space-y-2.5">
                {unacknowledged.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border flex flex-col justify-between ${severityColors[alert.severity]}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-black/5 px-1.5 py-0.5 rounded">
                            {alert.severity}
                          </span>
                          <span className="text-[9px] font-mono text-[var(--pz-text-muted)]">
                            {format(new Date(alert.timestamp), 'HH:mm:ss')}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-[var(--pz-text)] leading-snug">{alert.title}</p>
                        <p className="text-[11px] text-[var(--pz-text-secondary)] mt-1 leading-normal">{alert.message}</p>
                      </div>
                    </div>
                    <div className="flex justify-end mt-3 border-t border-black/5 pt-2">
                      <button
                        onClick={() => {
                          acknowledgeAlert(alert.id)
                          acknowledgeAlertServer(alert.id)
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--pz-brand)] hover:bg-[var(--pz-accent)] text-white text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        <Check size={10} /> Acknowledge
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acknowledged History */}
          {acknowledged.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider mb-2">
                Acknowledged History ({acknowledged.length})
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {acknowledged.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-2)] text-[var(--pz-text-muted)] flex flex-col"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[9px] font-bold uppercase bg-[var(--pz-surface-3)] px-1.5 py-0.5 rounded">
                        {alert.severity}
                      </span>
                      <span className="text-[9px] font-mono text-[var(--pz-text-muted)]">
                        {format(new Date(alert.timestamp), 'HH:mm:ss')}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[var(--pz-text-secondary)] truncate">{alert.title}</p>
                    <p className="text-[10px] text-[var(--pz-text-muted)] mt-0.5 truncate">{alert.message}</p>
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[var(--pz-border)] text-[9px] text-[var(--pz-text-muted)]">
                      <span>Ack: {alert.acknowledged_by}</span>
                      <span>{format(new Date(alert.acknowledged_at || ''), 'HH:mm:ss')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
