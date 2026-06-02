import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Fingerprint, Users, UserCheck, Clock, UserX,
  Monitor, Wifi, WifiOff, AlertTriangle, Copy,
  Activity,
} from 'lucide-react'
import { format } from 'date-fns'
import { analyticsAPI, devicesAPI } from '@/api/client'
import { useScanFeedStore } from '@/stores/scanFeedStore'
import { useDeptSummaryStore } from '@/stores/deptSummaryStore'
import { LiveScanFeed } from '@/components/dashboard/LiveScanFeed'
import { DepartmentActivityPanel } from '@/components/dashboard/DepartmentActivityPanel'
import { UnknownUserPanel } from '@/components/dashboard/UnknownUserPanel'
import { DuplicateScanPanel } from '@/components/dashboard/DuplicateScanPanel'
import type { AttendanceSummary, Device } from '@/types'

// ── KPI Card ─────────────────────────────────────────────────
function KPICard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number
  color: string
}) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="p-2.5 rounded-lg flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-100 font-mono tracking-tight">{value}</p>
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{label}</p>
      </div>
    </div>
  )
}

// ── Stable selectors (primitive values only) ──────────────────
const selectPresent = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.present
const selectLate    = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.late
const selectAbsent  = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.absent
const selectOnShift = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.onShift
const selectScanCount = (s: ReturnType<typeof useScanFeedStore.getState>) => s.scans.length

export default function LiveMonitor() {
  const today = format(new Date(), 'yyyy-MM-dd')

  // Stable primitive selectors — no new object/array references
  const present  = useDeptSummaryStore(selectPresent)
  const late     = useDeptSummaryStore(selectLate)
  const absent   = useDeptSummaryStore(selectAbsent)
  const onShift  = useDeptSummaryStore(selectOnShift)
  const scanCount = useScanFeedStore(selectScanCount)

  // Load initial department summaries
  const { data: summaries } = useQuery<AttendanceSummary[]>({
    queryKey: ['dept-summaries', today],
    queryFn: async () => (await analyticsAPI.getDepartmentsSummary(today)).data,
    refetchInterval: 60000,
  })

  // Populate store once on load — use getState() to avoid re-render dependency
  useEffect(() => {
    if (summaries) {
      useDeptSummaryStore.getState().setDepartments(summaries)
    }
  }, [summaries])

  // Devices
  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await devicesAPI.list()).data,
    refetchInterval: 30000,
  })
  const devices: Device[] = devicesData?.items ?? []
  const onlineDevices = devices.filter((d) => d.is_online)
  const offlineDevices = devices.filter((d) => !d.is_online)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-950/20 border border-blue-500/20">
            <Activity size={18} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-100 tracking-tight">Live Operations Monitor</h1>
            <p className="text-[10px] text-gray-400">
              Real-time biometric scan feed · {format(new Date(), 'EEEE, MMMM d yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-950/20 px-2.5 py-1 rounded-full border border-emerald-500/20 font-semibold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live · {scanCount} scans today
        </div>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={UserCheck} label="Present Today"     value={present} color="#10B981" />
        <KPICard icon={Clock}     label="Late Today"        value={late}    color="#F59E0B" />
        <KPICard icon={UserX}     label="Absent Today"      value={absent}  color="#EF4444" />
        <KPICard icon={Users}     label="Currently On Shift" value={onShift} color="#6366F1" />
      </div>

      {/* ── Main Grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Live Scan Feed — 2 columns */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Fingerprint size={15} className="text-[var(--color-primary)]" />
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Live Scan Feed</h2>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-time
            </div>
          </div>
          <LiveScanFeed maxItems={100} />
        </motion.div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Department Activity */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card p-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <Users size={15} className="text-[var(--color-primary)]" />
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Department Activity</h2>
            </div>
            <DepartmentActivityPanel />
          </motion.div>

          {/* Unknown Users */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="card p-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={15} className="text-amber-500" />
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Unknown Users</h2>
            </div>
            <UnknownUserPanel />
          </motion.div>
        </div>
      </div>

      {/* ── Bottom Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Device Status */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-4"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Monitor size={15} className="text-[var(--color-primary)]" />
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Device Status</h2>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1 text-emerald-400">
                <Wifi size={10} /> {onlineDevices.length} online
              </span>
              <span className="flex items-center gap-1 text-red-400">
                <WifiOff size={10} /> {offlineDevices.length} offline
              </span>
            </div>
          </div>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {devices.length === 0 ? (
              <p className="text-xs text-center text-gray-500 py-6">No devices registered</p>
            ) : (
              devices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--color-border)] bg-[#111827]/50 hover:border-gray-700 transition-colors"
                >
                  <div className={`p-2 rounded ${device.is_online ? 'bg-emerald-950/20 border border-emerald-500/20' : 'bg-slate-800/20'}`}>
                    <Monitor size={14} className={device.is_online ? 'text-emerald-400' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">
                      {device.name || `Device ${device.serial_number.slice(-6)}`}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {device.office_name || 'Unassigned'} · {device.department_name || 'Unassigned'}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                    device.is_online
                      ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-800 text-gray-500 border-slate-700'
                  }`}>
                    {device.is_online ? 'Online' : 'Offline'}
                  </span>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Duplicate Scan Activity */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card p-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <Copy size={15} className="text-gray-400" />
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Duplicate Scan Activity</h2>
          </div>
          <DuplicateScanPanel />
        </motion.div>
      </div>
    </div>
  )
}
