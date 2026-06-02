import { Bell, Check, X } from 'lucide-react'
import { useAlertStore } from '@/stores/alertStore'
import { format } from 'date-fns'

interface AlertDrawerProps {
  open: boolean
  onClose: () => void
}

export function AlertDrawer({ open, onClose }: AlertDrawerProps) {
  const { alerts, acknowledgeAlert, clearAll } = useAlertStore()

  if (!open) return null

  const severityColors = {
    INFO: 'border-blue-500/20 bg-blue-950/10 text-blue-400',
    WARNING: 'border-amber-500/20 bg-amber-950/10 text-amber-400',
    CRITICAL: 'border-red-500/20 bg-red-950/10 text-red-400',
    EMERGENCY: 'border-red-600 bg-red-950/30 text-red-500 animate-pulse',
  }

  const unacknowledged = alerts.filter((a) => !a.acknowledged)
  const acknowledged = alerts.filter((a) => a.acknowledged)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm" onClick={onClose} />

      {/* Drawer Container */}
      <div className="fixed right-0 top-0 h-screen w-[420px] bg-[#111827] border-l border-slate-800 z-[101] shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0B0F19]">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[var(--color-primary)]" />
            <h2 className="text-sm font-bold text-gray-100 uppercase tracking-wider">Operational Alert Center</h2>
          </div>
          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              <button
                onClick={clearAll}
                className="text-[10px] font-bold text-gray-400 hover:text-gray-200 border border-slate-800 hover:border-slate-700 px-2.5 py-1 rounded transition-colors cursor-pointer"
              >
                Clear History
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-slate-800 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Active / Unacknowledged Alerts */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
              Active Alerts ({unacknowledged.length})
            </p>
            {unacknowledged.length === 0 ? (
              <p className="text-xs text-gray-400 bg-slate-900/40 p-4 rounded text-center border border-slate-800/50">
                ✓ No active alarm parameters detected.
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
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-black/40 px-1.5 py-0.5 rounded">
                            {alert.severity}
                          </span>
                          <span className="text-[9px] font-mono text-gray-400">
                            {format(new Date(alert.timestamp), 'HH:mm:ss')}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-gray-200 leading-snug">{alert.title}</p>
                        <p className="text-[11px] text-gray-300 mt-1 leading-normal">{alert.message}</p>
                      </div>
                    </div>
                    <div className="flex justify-end mt-3 border-t border-slate-800/40 pt-2">
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#2563EB] hover:bg-blue-500 text-white text-[10px] font-bold transition-colors cursor-pointer"
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
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                Acknowledged History ({acknowledged.length})
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {acknowledged.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 rounded-lg border border-slate-800 bg-[#111827]/40 text-gray-400 flex flex-col"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[9px] font-bold uppercase bg-slate-800 px-1.5 py-0.5 rounded">
                        {alert.severity}
                      </span>
                      <span className="text-[9px] font-mono text-gray-500">
                        {format(new Date(alert.timestamp), 'HH:mm:ss')}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-gray-300 truncate">{alert.title}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{alert.message}</p>
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/30 text-[9px] text-gray-500">
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
