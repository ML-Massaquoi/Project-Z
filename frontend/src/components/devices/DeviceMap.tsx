import { Monitor, Wifi, WifiOff, AlertTriangle, Clock } from 'lucide-react'
import { format } from 'date-fns'
import type { Device } from '@/types'

interface Props {
  devices: Device[]
  onSelectDevice?: (device: Device) => void
}

const statusConfig: Record<string, { bg: string; border: string; icon: React.ReactNode; label: string }> = {
  online: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', icon: <Wifi size={16} className="text-emerald-400" />, label: 'Online' },
  offline: { bg: 'bg-red-500/5', border: 'border-red-500/20', icon: <WifiOff size={16} className="text-red-400" />, label: 'Offline' },
  warning: { bg: 'bg-amber-500/5', border: 'border-amber-500/20', icon: <AlertTriangle size={16} className="text-amber-400" />, label: 'Warning' },
  syncing: { bg: 'bg-blue-500/5', border: 'border-blue-500/20', icon: <Monitor size={16} className="text-blue-400" />, label: 'Syncing' },
}

function getDeviceStatus(device: Device): string {
  if (!device.is_online) return 'offline'
  if (device.health_status === 'degraded' || device.health_status === 'critical') return 'warning'
  return 'online'
}

export function DeviceMap({ devices, onSelectDevice }: Props) {
  if (!devices.length) {
    return (
      <div className="pz-card p-16 text-center">
        <Monitor size={48} className="mx-auto mb-3 text-[var(--pz-text-muted)] opacity-20" />
        <p className="text-sm font-medium text-[var(--pz-text-muted)]">No devices registered</p>
        <p className="text-xs text-[var(--pz-text-muted)] mt-1">Add devices from the Discovery tab or register manually</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {devices.map((device) => {
        const status = getDeviceStatus(device)
        const config = statusConfig[status]

        return (
          <button
            key={device.id}
            onClick={() => onSelectDevice?.(device)}
            className={`pz-card p-4 text-left hover:shadow-lg hover:shadow-black/10 transition-all cursor-pointer group ${config.bg} border ${config.border}`}
          >
            {/* Status indicator */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {config.icon}
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--pz-text-muted)]">
                  {config.label}
                </span>
              </div>
              {device.is_online && (
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </div>

            {/* Device info */}
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-[var(--pz-text)] group-hover:text-blue-400 transition-colors truncate">
                {device.name || `Device ${device.serial_number?.slice(-6)}`}
              </h4>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Monitor size={11} className="text-[var(--pz-text-muted)] flex-shrink-0" />
                  <span className="text-[10px] text-[var(--pz-text-muted)] truncate">{device.model || 'Unknown Model'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--pz-text-muted)] font-mono">{device.ip_address || 'No IP'}</span>
                </div>
              </div>

              {/* Meta row */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--pz-border)]/50">
                <div className="flex items-center gap-1.5">
                  <Clock size={10} className="text-[var(--pz-text-muted)]" />
                  <span className="text-[9px] text-[var(--pz-text-muted)]">
                    {device.last_seen ? format(new Date(device.last_seen), 'MMM d, HH:mm') : 'Never'}
                  </span>
                </div>
                {device.avg_response_time_ms != null && (
                  <span className={`text-[9px] font-mono font-bold ${device.avg_response_time_ms < 2000 ? 'text-emerald-400' : device.avg_response_time_ms < 5000 ? 'text-amber-400' : 'text-red-400'}`}>
                    {device.avg_response_time_ms}ms
                  </span>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
