import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, UserCheck, Clock, UserX,
  Monitor, Wifi, WifiOff, AlertTriangle, Copy,
  Activity, Fingerprint, Radio, Cpu,
} from 'lucide-react'
import { format } from 'date-fns'
import { analyticsAPI, devicesAPI, deviceActivityAPI } from '@/api/client'
import { useScanFeedStore } from '@/stores/scanFeedStore'
import { useDeptSummaryStore } from '@/stores/deptSummaryStore'
import { LiveScanFeed } from '@/components/dashboard/LiveScanFeed'
import { DepartmentActivityPanel } from '@/components/dashboard/DepartmentActivityPanel'
import { UnknownUserPanel } from '@/components/dashboard/UnknownUserPanel'
import { DuplicateScanPanel } from '@/components/dashboard/DuplicateScanPanel'
import type { AttendanceSummary, Device } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'

// ── Stable selectors ──────────────────────────────────────
const selectPresent = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.present
const selectLate    = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.late
const selectAbsent  = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.absent
const selectOnShift = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.onShift
const selectScanCount = (s: ReturnType<typeof useScanFeedStore.getState>) => s.scans.length

export default function LiveMonitor() {
  const today = format(new Date(), 'yyyy-MM-dd')

  const present   = useDeptSummaryStore(selectPresent)
  const late      = useDeptSummaryStore(selectLate)
  const absent    = useDeptSummaryStore(selectAbsent)
  const onShift   = useDeptSummaryStore(selectOnShift)
  const scanCount = useScanFeedStore(selectScanCount)

  // Load initial department summaries
  const { data: summaries } = useQuery<AttendanceSummary[]>({
    queryKey: ['dept-summaries', today],
    queryFn: async () => (await analyticsAPI.getDepartmentsSummary(today)).data,
    refetchInterval: 60000,
  })

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

  // Fleet activity summary
  const { data: fleetActivity } = useQuery({
    queryKey: ['fleet-activity'],
    queryFn: async () => (await deviceActivityAPI.getFleetSummary({ hours: 24 })).data,
    refetchInterval: 30000,
  })

  // Recent enrollments
  const { data: recentEnrollments } = useQuery({
    queryKey: ['recent-enrollments'],
    queryFn: async () => (await deviceActivityAPI.getRecentEnrollments({ limit: 10 })).data,
    refetchInterval: 60000,
  })

  return (
    <div className="space-y-5 pz-slide-up">
      {/* ── Page Header ─────────────────────────────────────── */}
      <PageHeader
        title="Live Operations Monitor"
        subtitle={`Real-time biometric scan feed · ${format(new Date(), 'EEEE, MMMM d yyyy')}`}
        breadcrumbs={[{ label: 'Operations' }, { label: 'Live Monitor' }]}
        badge={
          <div className="flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pz-pulse-dot" />
            Live · {scanCount} scans
          </div>
        }
      />

      {/* ── KPI Row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={UserCheck} label="Present Today" value={present} color="#10B981" />
        <KPICard icon={Clock} label="Late Today" value={late} color="#F59E0B" />
        <KPICard icon={UserX} label="Absent Today" value={absent} color="#EF4444" />
        <KPICard icon={Users} label="On Shift Now" value={onShift} color="#6366F1" />
      </div>

      {/* ── Main Grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live Scan Feed — 2 columns */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="pz-card p-4 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Fingerprint size={15} className="text-blue-400" />
              <h2 className="pz-section-label">Live Scan Feed</h2>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pz-pulse-dot" />
              Real-time
            </div>
          </div>
          <LiveScanFeed maxItems={100} />
        </motion.div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Department Activity */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="pz-card p-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <Users size={15} className="text-blue-400" />
              <h2 className="pz-section-label">Department Activity</h2>
            </div>
            <DepartmentActivityPanel />
          </motion.div>

          {/* Unknown Users */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="pz-card p-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={15} className="text-amber-500" />
              <h2 className="pz-section-label">Unknown Users</h2>
            </div>
            <UnknownUserPanel />
          </motion.div>
        </div>
      </div>

      {/* ── Bottom Row ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Device Fleet Status */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="pz-card p-4"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Monitor size={15} className="text-blue-400" />
              <h2 className="pz-section-label">Device Fleet Status</h2>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-semibold">
              <span className="flex items-center gap-1 text-emerald-400">
                <Wifi size={10} /> {onlineDevices.length} online
              </span>
              <span className="flex items-center gap-1 text-red-400">
                <WifiOff size={10} /> {offlineDevices.length} offline
              </span>
            </div>
          </div>
          <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
            {devices.length === 0 ? (
              <p className="text-xs text-center text-gray-500 py-8">No devices registered</p>
            ) : (
              devices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-2)]/20 hover:border-[var(--pz-border-strong)] transition-colors"
                >
                  <div className={`p-2 rounded-lg ${device.is_online ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-[var(--pz-surface-2)] border border-[var(--pz-border)]'}`}>
                    <Monitor size={14} className={device.is_online ? 'text-emerald-400' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">
                      {device.name || `Device ${device.serial_number.slice(-6)}`}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {device.office_name || 'Unassigned'} · {device.department_name || 'Unassigned'}
                    </p>
                  </div>
                  <StatusBadge status={device.is_online ? 'online' : 'offline'} size="xs" pulse={device.is_online} />
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Device Activity Stream */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="pz-card p-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <Radio size={15} className="text-blue-400" />
            <h2 className="pz-section-label">Device Activity Stream</h2>
          </div>
          <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
            {!fleetActivity?.recent_activity?.length ? (
              <p className="text-xs text-center text-gray-500 py-8">No recent activity</p>
            ) : (
              fleetActivity.recent_activity.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 p-2 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-2)]/20"
                >
                  <div className={`mt-0.5 p-1 rounded ${
                    item.activity_type === 'attendance_push' ? 'bg-emerald-500/10 text-emerald-400' :
                    item.activity_type === 'heartbeat' ? 'bg-blue-500/10 text-blue-400' :
                    item.activity_type === 'device_disconnected' ? 'bg-red-500/10 text-red-400' :
                    'bg-gray-500/10 text-gray-400'
                  }`}>
                    <Cpu size={10} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-gray-300">
                      {item.activity_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {item.ip_address || 'Unknown IP'} · {new Date(item.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Recent Enrollments */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="pz-card p-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <Fingerprint size={15} className="text-blue-400" />
            <h2 className="pz-section-label">Recent Enrollments</h2>
          </div>
          <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
            {!recentEnrollments?.length ? (
              <p className="text-xs text-center text-gray-500 py-8">No recent enrollments</p>
            ) : (
              recentEnrollments.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 p-2 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-2)]/20"
                >
                  <div className={`mt-0.5 p-1 rounded ${
                    item.action === 'enrolled' ? 'bg-emerald-500/10 text-emerald-400' :
                    item.action === 'removed' ? 'bg-red-500/10 text-red-400' :
                    'bg-blue-500/10 text-blue-400'
                  }`}>
                    <Fingerprint size={10} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-gray-300">
                      {item.action} · {item.enrollment_type}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      User {item.device_user_id} · {new Date(item.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
