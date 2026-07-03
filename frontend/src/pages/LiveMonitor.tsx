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
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'

// ── Stable selectors ──────────────────────────────────────
const selectPresent = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.present
const selectLate    = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.late
const selectAbsent  = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.absent
const selectOnShift = (s: ReturnType<typeof useDeptSummaryStore.getState>) => s._totals.onShift
const selectScanCount = (s: ReturnType<typeof useScanFeedStore.getState>) => s.scans.length

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '28px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  liveBadge: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: 'var(--pz-success)', background: 'rgba(16,185,129,0.1)', padding: '6px 14px', borderRadius: '9999px', border: '1px solid rgba(16,185,129,0.2)', fontWeight: 600 },
  liveDot: { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--pz-success)', flexShrink: 0 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' },
  mainGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
  card: { background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' },
  cardPad: { padding: '16px' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
  cardTitleRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  cardSectionLabel: { fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: 0 },
  rtBadge: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 600, color: 'var(--pz-success)' },
  rightCol: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  scrollArea: { maxHeight: '240px', overflowY: 'auto' as const, paddingRight: '4px' },
  deviceRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'border-color 0.15s' },
  iconOnline: { padding: '8px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' },
  iconOffline: { padding: '8px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' },
  deviceInfo: { flex: 1, minWidth: 0 },
  deviceName: { fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, margin: 0 },
  deviceMeta: { fontSize: '10px', color: 'var(--pz-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, margin: 0 },
  activityRow: { display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'rgba(255,255,255,0.02)' },
  activityText: { fontSize: '10px', fontWeight: 500, color: 'var(--pz-text-secondary)', margin: 0 },
  activityMeta: { fontSize: '10px', color: 'var(--pz-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, margin: 0 },
  fleetStats: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '10px', fontWeight: 600 },
  onlineStat: { display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--pz-success)' },
  offlineStat: { display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--pz-danger)' },
  emptyState: { fontSize: '12px', textAlign: 'center' as const, color: 'var(--pz-text-muted)', padding: '32px 0' },
}

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
    <div style={s.page}>
      {/* ── Page Header ─────────────────────────────────────── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Live Operations Monitor</h1>
          <p style={s.headerSubtitle}>
            Real-time biometric scan feed · {format(new Date(), 'EEEE, MMMM d yyyy')}
          </p>
        </div>
        <div style={s.liveBadge}>
          <span className="pz-pulse-dot" style={s.liveDot} />
          Live · {scanCount} scans
        </div>
      </div>

      {/* ── KPI Row ──────────────────────────────────────────── */}
      <div style={s.kpiGrid}>
        <KPICard icon={UserCheck} label="Present Today" value={present} color="#10B981" />
        <KPICard icon={Clock} label="Late Today" value={late} color="#F59E0B" />
        <KPICard icon={UserX} label="Absent Today" value={absent} color="#EF4444" />
        <KPICard icon={Users} label="On Shift Now" value={onShift} color="#6366F1" />
      </div>

      {/* ── Main Grid ────────────────────────────────────────── */}
      <div style={s.mainGrid}>
        {/* Live Scan Feed — 2 columns */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ ...s.card, ...s.cardPad, gridColumn: 'span 2' }}
        >
          <div style={s.cardHeader}>
            <div style={s.cardTitleRow}>
              <Fingerprint size={15} style={{ color: 'var(--pz-accent)' }} />
              <h2 style={s.cardSectionLabel}>Live Scan Feed</h2>
            </div>
            <div style={s.rtBadge}>
              <span className="pz-pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--pz-success)', flexShrink: 0 }} />
              Real-time
            </div>
          </div>
          <LiveScanFeed maxItems={100} />
        </motion.div>

        {/* Right column */}
        <div style={s.rightCol}>
          {/* Department Activity */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            style={{ ...s.card, ...s.cardPad }}
          >
            <div style={{ ...s.cardTitleRow, marginBottom: '16px' }}>
              <Users size={15} style={{ color: 'var(--pz-accent)' }} />
              <h2 style={s.cardSectionLabel}>Department Activity</h2>
            </div>
            <DepartmentActivityPanel />
          </motion.div>

          {/* Unknown Users */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            style={{ ...s.card, ...s.cardPad }}
          >
            <div style={{ ...s.cardTitleRow, marginBottom: '16px' }}>
              <AlertTriangle size={15} style={{ color: '#F59E0B' }} />
              <h2 style={s.cardSectionLabel}>Unknown Users</h2>
            </div>
            <UnknownUserPanel />
          </motion.div>
        </div>
      </div>

      {/* ── Bottom Row ───────────────────────────────────────── */}
      <div style={s.mainGrid}>
        {/* Device Fleet Status */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ ...s.card, ...s.cardPad }}
        >
          <div style={s.cardHeader}>
            <div style={s.cardTitleRow}>
              <Monitor size={15} style={{ color: 'var(--pz-accent)' }} />
              <h2 style={s.cardSectionLabel}>Device Fleet Status</h2>
            </div>
            <div style={s.fleetStats}>
              <span style={s.onlineStat}>
                <Wifi size={10} /> {onlineDevices.length} online
              </span>
              <span style={s.offlineStat}>
                <WifiOff size={10} /> {offlineDevices.length} offline
              </span>
            </div>
          </div>
          <div style={s.scrollArea}>
            {devices.length === 0 ? (
              <p style={s.emptyState}>No devices registered</p>
            ) : (
              devices.map((device) => (
                <div
                  key={device.id}
                  style={s.deviceRow}
                >
                  <div style={device.is_online ? s.iconOnline : s.iconOffline}>
                    <Monitor size={14} style={{ color: device.is_online ? 'var(--pz-success)' : 'var(--pz-text-muted)' }} />
                  </div>
                  <div style={s.deviceInfo}>
                    <p style={s.deviceName}>
                      {device.name || `Device ${device.serial_number.slice(-6)}`}
                    </p>
                    <p style={s.deviceMeta}>
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
          style={{ ...s.card, ...s.cardPad }}
        >
          <div style={{ ...s.cardTitleRow, marginBottom: '16px' }}>
            <Radio size={15} style={{ color: 'var(--pz-accent)' }} />
            <h2 style={s.cardSectionLabel}>Device Activity Stream</h2>
          </div>
          <div style={s.scrollArea}>
            {!fleetActivity?.recent_activity?.length ? (
              <p style={s.emptyState}>No recent activity</p>
            ) : (
              fleetActivity.recent_activity.map((item: any) => (
                <div
                  key={item.id}
                  style={s.activityRow}
                >
                  <div style={{
                    marginTop: '2px', padding: '4px', borderRadius: '4px',
                    background: item.activity_type === 'attendance_push' ? 'rgba(16,185,129,0.1)' :
                      item.activity_type === 'heartbeat' ? 'rgba(59,130,246,0.1)' :
                      item.activity_type === 'device_disconnected' ? 'rgba(239,68,68,0.1)' :
                      'rgba(107,114,128,0.1)',
                    color: item.activity_type === 'attendance_push' ? 'var(--pz-success)' :
                      item.activity_type === 'heartbeat' ? 'var(--pz-accent)' :
                      item.activity_type === 'device_disconnected' ? 'var(--pz-danger)' :
                      'var(--pz-text-muted)',
                  }}>
                    <Cpu size={10} />
                  </div>
                  <div style={s.deviceInfo}>
                    <p style={s.activityText}>
                      {item.activity_type.replace(/_/g, ' ')}
                    </p>
                    <p style={s.activityMeta}>
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
          style={{ ...s.card, ...s.cardPad }}
        >
          <div style={{ ...s.cardTitleRow, marginBottom: '16px' }}>
            <Fingerprint size={15} style={{ color: 'var(--pz-accent)' }} />
            <h2 style={s.cardSectionLabel}>Recent Enrollments</h2>
          </div>
          <div style={s.scrollArea}>
            {!recentEnrollments?.length ? (
              <p style={s.emptyState}>No recent enrollments</p>
            ) : (
              recentEnrollments.map((item: any) => (
                <div
                  key={item.id}
                  style={s.activityRow}
                >
                  <div style={{
                    marginTop: '2px', padding: '4px', borderRadius: '4px',
                    background: item.action === 'enrolled' ? 'rgba(16,185,129,0.1)' :
                      item.action === 'removed' ? 'rgba(239,68,68,0.1)' :
                      'rgba(59,130,246,0.1)',
                    color: item.action === 'enrolled' ? 'var(--pz-success)' :
                      item.action === 'removed' ? 'var(--pz-danger)' :
                      'var(--pz-accent)',
                  }}>
                    <Fingerprint size={10} />
                  </div>
                  <div style={s.deviceInfo}>
                    <p style={s.activityText}>
                      {item.action} · {item.enrollment_type}
                    </p>
                    <p style={s.activityMeta}>
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
