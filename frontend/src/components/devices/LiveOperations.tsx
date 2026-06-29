import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, User, Fingerprint, Monitor, Clock, ArrowDown, ArrowUp } from 'lucide-react'
import { format } from 'date-fns'
import { deviceEventsAPI } from '@/api/client'
import { eventBus } from '@/lib/eventBus'

interface LiveEvent {
  id: string
  type: string
  device_name: string
  device_ip: string
  employee_name?: string
  employee_code?: string
  details: string
  timestamp: string
}

const EVENT_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  check_in: { icon: <ArrowDown size={12} />, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  check_out: { icon: <ArrowUp size={12} />, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  scan: { icon: <Fingerprint size={12} />, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  user_registered: { icon: <User size={12} />, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  device_restart: { icon: <Monitor size={12} />, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  fingerprint_enrolled: { icon: <Fingerprint size={12} />, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  default: { icon: <Activity size={12} />, color: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
}

function getEventConfig(type: string) {
  if (type === 'IN' || type.includes('check_in')) return EVENT_ICONS.check_in
  if (type === 'OUT' || type.includes('check_out')) return EVENT_ICONS.check_out
  if (type.includes('fingerprint') || type.includes('template')) return EVENT_ICONS.fingerprint_enrolled
  if (type.includes('user') || type.includes('register')) return EVENT_ICONS.user_registered
  if (type.includes('restart') || type.includes('reboot')) return EVENT_ICONS.device_restart
  return EVENT_ICONS.scan
}

export function LiveOperations() {
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])

  // Fetch recent events on mount
  const { data: recentData } = useQuery({
    queryKey: ['device-events-recent'],
    queryFn: async () => (await deviceEventsAPI.recent()).data,
    refetchInterval: 15000,
  })

  // Populate initial events
  useEffect(() => {
    if (recentData?.items) {
      setLiveEvents(recentData.items.slice(0, 50))
    }
  }, [recentData])

  // Subscribe to real-time events via eventBus
  useEffect(() => {
    const unsubs = [
      eventBus.subscribe('scan_event', (event: any) => {
        const data = event.data || event
        const newEvent: LiveEvent = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: data.status || 'scan',
          device_name: data.device_name || 'Unknown Device',
          device_ip: data.device_ip || '',
          employee_name: data.employee_name,
          employee_code: data.employee_code,
          details: data.status === 'IN' ? 'Checked IN' : data.status === 'OUT' ? 'Checked OUT' : data.status || 'Scan',
          timestamp: data.timestamp || new Date().toISOString(),
        }
        setLiveEvents(prev => [newEvent, ...prev].slice(0, 100))
      }),
      eventBus.subscribe('attendance_update', (event: any) => {
        const data = event.data || event
        const newEvent: LiveEvent = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: data.status || 'scan',
          device_name: data.device_name || 'Unknown Device',
          device_ip: data.device_ip || '',
          employee_name: data.employee_name,
          employee_code: data.employee_code,
          details: data.status === 'IN' ? 'Checked IN' : data.status === 'OUT' ? 'Checked OUT' : 'Attendance Update',
          timestamp: data.timestamp || new Date().toISOString(),
        }
        setLiveEvents(prev => [newEvent, ...prev].slice(0, 100))
      }),
      eventBus.subscribe('device_status_update', (event: any) => {
        const data = event.data || event
        const newEvent: LiveEvent = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: 'device_status',
          device_name: data.device_name || 'Unknown Device',
          device_ip: data.ip_address || '',
          details: data.is_online ? 'Device came ONLINE' : 'Device went OFFLINE',
          timestamp: data.timestamp || new Date().toISOString(),
        }
        setLiveEvents(prev => [newEvent, ...prev].slice(0, 100))
      }),
    ]

    return () => unsubs.forEach(unsub => unsub())
  }, [])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Activity size={18} className="text-emerald-400" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--pz-text)]">Live Device Activity</h3>
            <p className="text-[10px] text-[var(--pz-text-muted)]">Real-time events from all connected devices</p>
          </div>
        </div>
        <span className="text-[10px] text-[var(--pz-text-muted)] font-mono">{liveEvents.length} events</span>
      </div>

      {/* Event Stream */}
      <div className="pz-card overflow-hidden max-h-[600px] overflow-y-auto">
        {liveEvents.length === 0 ? (
          <div className="p-16 text-center">
            <Activity size={48} className="mx-auto mb-3 text-[var(--pz-text-muted)] opacity-20 animate-pulse" />
            <p className="text-sm font-medium text-[var(--pz-text-muted)]">Waiting for device events...</p>
            <p className="text-xs text-[var(--pz-text-muted)] mt-1">Events will appear here in real-time</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--pz-border)]/30">
            {liveEvents.map((event) => {
              const config = getEventConfig(event.type)
              return (
                <div key={event.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--pz-surface-2)]/30 transition-colors">
                  <div className={`p-1.5 rounded-lg border flex-shrink-0 ${config.color}`}>
                    {config.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {event.employee_name && (
                        <span className="text-xs font-semibold text-[var(--pz-text)]">{event.employee_name}</span>
                      )}
                      {event.employee_code && (
                        <span className="text-[9px] text-[var(--pz-text-muted)] font-mono">({event.employee_code})</span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--pz-text-muted)] truncate">
                      {event.details} · {event.device_name}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-[var(--pz-text-muted)] font-mono tabular-nums">
                      {format(new Date(event.timestamp), 'HH:mm:ss')}
                    </p>
                    <p className="text-[9px] text-[var(--pz-text-muted)] font-mono">{event.device_ip}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
