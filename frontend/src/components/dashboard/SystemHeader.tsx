import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashboardAPI } from '@/api/client'
import { useConnectionStore } from '@/stores/connectionStore'
import { Plane, Wifi, WifiOff, Activity } from 'lucide-react'
import { format } from 'date-fns'

export default function SystemHeader() {
  const [now, setNow] = useState(new Date())
  const connectionStatus = useConnectionStore((s) => s.status)

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => (await dashboardAPI.getStats()).data,
    refetchInterval: 15000,
  })

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const isLive = connectionStatus === 'connected'
  const activeDevices = stats?.active_devices ?? stats?.online_devices ?? 0

  return (
    <header className="bg-white border-b border-[var(--pz-border)] px-5 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg bg-[var(--pz-brand)] flex items-center justify-center shadow-sm">
            <Plane size={17} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-[var(--pz-text)] leading-tight tracking-tight">
              Operations Command Center
            </h1>
            <p className="text-[10px] text-[var(--pz-text-muted)] leading-tight tracking-wider uppercase">
              Workforce Management Platform
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--pz-text-muted)] bg-[var(--pz-surface-2)] px-3 py-1.5 rounded border border-[var(--pz-border)] tabular-nums tracking-tight">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--pz-success-500)] animate-pulse mr-1" />
            <span className="font-semibold text-[var(--pz-text)]">{format(now, 'HH:mm:ss')}</span>
            <span className="text-[var(--pz-text-muted)] mx-0.5">|</span>
            <span className="text-[var(--pz-text-muted)]">{format(now, 'EEE, dd MMM yyyy')}</span>
          </div>

          <div className="flex items-center gap-2 bg-[var(--pz-surface-2)] px-2.5 py-1.5 rounded border border-[var(--pz-border)]">
            <Activity size={12} className="text-[var(--pz-accent)]" />
            <span className="text-[11px] font-medium text-[var(--pz-text-muted)]">
              <span className="text-[var(--pz-text)]">{activeDevices}</span> Active
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-[var(--pz-surface-2)] px-2.5 py-1.5 rounded border border-[var(--pz-border)]">
            {isLive ? (
              <Wifi size={12} className="text-[var(--pz-success-500)]" />
            ) : (
              <WifiOff size={12} className="text-[var(--pz-warning-500)]" />
            )}
            <span className={`text-[11px] font-medium ${isLive ? 'text-[var(--pz-success-500)]' : 'text-[var(--pz-warning-500)]'}`}>
              {isLive ? 'LIVE' : connectionStatus === 'reconnecting' ? 'RECONNECTING' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
