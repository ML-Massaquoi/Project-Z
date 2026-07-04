import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, UserCheck, Clock, UserX, Monitor, Bell,
  Fingerprint, Activity, Shield, ArrowRight, Radio, Cpu,
  ChevronLeft, ChevronRight, CalendarDays, BarChart3, AlertTriangle,
} from 'lucide-react'
import { dashboardAPI, attendanceAPI, devicesAPI, employeesAPI, deviceActivityAPI } from '@/api/client'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { format, subDays, addDays, isToday, parseISO } from 'date-fns'
import type { DashboardStats, DashboardChartData, AttendanceLog, Device, Employee } from '@/types'
import { KPIDrillPanel } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { MetricRing } from '@/components/ui/MetricRing'
import { Section, sectionHeader, sectionIcon, cardStyle } from '@/components/ui/CardSection'
import { useConnectionStore } from '@/stores/connectionStore'
import { useAlertStore } from '@/stores/alertStore'
import { AlertDrawer } from '@/components/dashboard/AlertDrawer'
import { WorkforceReadiness } from '@/components/dashboard/WorkforceReadiness'
import { ShiftCoverageWidget } from '@/components/dashboard/ShiftCoverageWidget'
import { UpcomingChangesWidget } from '@/components/dashboard/UpcomingChangesWidget'
import { useDeptSummaryStore } from '@/stores/deptSummaryStore'

/* ── Shared Styles ───────────────────────────────────────── */
const card = cardStyle

const chartTooltipStyle = {
  background: 'var(--pz-surface-2)',
  borderRadius: 10,
  border: '1px solid var(--pz-border)',
  color: 'var(--pz-text)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  fontSize: 13,
  padding: '8px 12px',
}

type DrillKey = 'workforce' | 'present' | 'late' | 'absent' | null

/* ── StatusMiniCard ──────────────────────────────────────── */
function StatusMiniCard({ label, value, color }: { label: string; value: number; color: string }) {
  const dotColors: Record<string, string> = {
    green: '#10B981', amber: '#F59E0B', blue: '#3B82F6', gray: '#64748B', red: '#EF4444',
  }
  const bgColors: Record<string, string> = {
    green: 'rgba(16,185,129,0.08)', amber: 'rgba(245,158,11,0.08)',
    blue: 'rgba(59,130,246,0.08)', gray: 'rgba(100,116,139,0.08)', red: 'rgba(239,68,68,0.08)',
  }
  const dotColor = dotColors[color] || dotColors.gray
  return (
    <div
      className="rounded-xl px-4 py-3 border"
      style={{ background: bgColors[color] || bgColors.gray, borderColor: `${dotColor}18` }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>
          {label}
        </span>
      </div>
      <p className="text-xl font-bold" style={{ color: dotColor }}>{value}</p>
    </div>
  )
}

/* ── Empty State ─────────────────────────────────────────── */
function EmptyState({ icon: Icon, title, desc }: { icon: any; title: string; desc?: string }) {
  return (
    <div className="text-center py-14" style={{ color: 'var(--pz-text-muted)' }}>
      <Icon size={32} className="mx-auto mb-3" style={{ opacity: 0.2 }} />
      <p className="text-sm font-medium">{title}</p>
      {desc && <p className="text-xs mt-1.5" style={{ color: 'var(--pz-text-faint)' }}>{desc}</p>}
    </div>
  )
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '28px',
    padding: '32px',
    flex: 1,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  headerTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  headerSubtitle: {
    fontSize: '13px',
    color: 'var(--pz-text-muted)',
    margin: 0,
  },
}

/* ── Dashboard ───────────────────────────────────────────── */
export default function Dashboard() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drillKey, setDrillKey] = useState<DrillKey>(null)
  const [selectedDate, setSelectedDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'))
  const connectionStatus = useConnectionStore((s) => s.status)
  const alerts = useAlertStore((s) => s.alerts)
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length
  const deptSummaries = useDeptSummaryStore((s) => s.departments)

  const isViewingToday = isToday(parseISO(selectedDate))

  const goToPreviousDay = useCallback(() => {
    setSelectedDate(prev => format(subDays(parseISO(prev), 1), 'yyyy-MM-dd'))
  }, [])

  const goToNextDay = useCallback(() => {
    setSelectedDate(prev => format(addDays(parseISO(prev), 1), 'yyyy-MM-dd'))
  }, [])

  const goToToday = useCallback(() => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'))
  }, [])

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', selectedDate],
    queryFn: async () => (await dashboardAPI.getStats({ target_date: selectedDate })).data,
    refetchInterval: isViewingToday ? 30000 : false,
    staleTime: 0,
    retry: 2,
  })

  const { data: charts, isLoading: chartsLoading } = useQuery<DashboardChartData>({
    queryKey: ['dashboard-charts'],
    queryFn: async () => (await dashboardAPI.getCharts()).data,
    refetchInterval: 60000,
  })

  const { data: liveData } = useQuery({
    queryKey: ['attendance-live', selectedDate],
    queryFn: async () => (await attendanceAPI.live({ limit: 10, target_date: selectedDate })).data,
    enabled: !!selectedDate,
  })

  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await devicesAPI.list()).data,
    refetchInterval: 30000,
  })

  const { data: fleetActivity } = useQuery({
    queryKey: ['fleet-activity'],
    queryFn: async () => (await deviceActivityAPI.getFleetSummary({ hours: 24 })).data,
    refetchInterval: 30000,
  })

  const { data: allEmployees } = useQuery({
    queryKey: ['employees-all'],
    queryFn: async () => (await employeesAPI.list({ limit: 500 })).data,
    enabled: drillKey !== null,
    staleTime: 60000,
  })

  const devices: Device[] = devicesData?.items ?? []
  const onlineDevices = devices.filter((d) => d.is_online).length
  const totalDevices = devices.length

  const drillData = useMemo(() => {
    if (!drillKey || !allEmployees?.items) return null
    const employees: Employee[] = allEmployees.items

    switch (drillKey) {
      case 'workforce':
        return {
          title: 'Total Workforce by Department',
          headers: ['Department', 'Headcount', 'Status'],
          rows: groupByDepartment(employees),
        }
      case 'present': {
        const present = liveData?.items?.filter((l: AttendanceLog) => l.punch_direction === 'in') || []
        return {
          title: 'Currently Present Employees',
          headers: ['Employee', 'Department', 'Since', 'Terminal'],
          rows: present.slice(0, 20).map((l: AttendanceLog) => [
            `${l.employee_name || 'Unknown'} (${l.employee_code || ''})`,
            l.department_name || '\u2014',
            format(new Date(l.timestamp), 'hh:mm a'),
            l.device_name || l.device_ip || '\u2014',
          ]),
        }
      }
      case 'late':
        return {
          title: 'Late Arrivals Today',
          headers: ['Employee', 'Department', 'Scanned', 'Status'],
          rows: (liveData?.items || [])
            .filter((l: AttendanceLog) => l.punch_direction === 'in')
            .slice(0, 20)
            .map((l: AttendanceLog) => [
              `${l.employee_name || 'Unknown'} (${l.employee_code || ''})`,
              l.department_name || '\u2014',
              format(new Date(l.timestamp), 'hh:mm a'),
              'Late',
            ]),
        }
      case 'absent': {
        const presentIds = new Set((liveData?.items || []).map((l: AttendanceLog) => l.employee_id))
        const absent = employees.filter((e) => !presentIds.has(e.id))
        return {
          title: 'Absent Employees Today',
          headers: ['Employee', 'Department', 'Code'],
          rows: absent.slice(0, 20).map((e) => [
            e.full_name,
            e.department_name || '\u2014',
            e.employee_code,
          ]),
        }
      }
      default:
        return null
    }
  }, [drillKey, allEmployees, liveData])

  return (
    <div style={s.page}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Operations Command Center</h1>
          <p style={s.headerSubtitle}>Real-time airport workforce readiness · {format(new Date(), 'EEEE, MMMM d yyyy')}</p>
        </div>
        <div className="flex items-center gap-3">
          {connectionStatus !== 'connected' && (
            <div
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border"
              style={{
                background: connectionStatus === 'reconnecting' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
                color: connectionStatus === 'reconnecting' ? '#FBBF24' : '#F87171',
                borderColor: connectionStatus === 'reconnecting' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
              }}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className="absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{
                      background: connectionStatus === 'reconnecting' ? '#FBBF24' : '#F87171',
                      animation: 'pz-ping 1s cubic-bezier(0,0,0.2,1) infinite',
                    }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ background: connectionStatus === 'reconnecting' ? '#F59E0B' : '#EF4444' }}
                  />
                </span>
                {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'System Degraded'}
              </div>
            )}
            <button
              onClick={() => setDrawerOpen(true)}
              className="relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
              style={{
                background: 'var(--pz-surface-2)',
                border: '1px solid var(--pz-border)',
                color: 'var(--pz-text-secondary)',
              }}
            >
              <Bell size={16} style={{ color: unacknowledgedCount > 0 ? '#FBBF24' : 'var(--pz-text-muted)' }} />
              Alerts
              {unacknowledgedCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1"
                  style={{ background: '#DC2626' }}
                >
                  {unacknowledgedCount}
                </span>
              )}
            </button>
          </div>
        </div>

      {/* ═════════════════════════════════════════════════════════
         ROW 1: Executive KPIs with Drill-down
         ═════════════════════════════════════════════════════════ */}
      <div>
        {/* Date Navigation */}
        <div className="flex items-center justify-center gap-2.5 mb-5">
          <button
            onClick={goToPreviousDay}
            className="p-2 rounded-xl transition-all duration-150"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text-secondary)',
            }}
          >
            <ChevronLeft size={15} />
          </button>
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-xl"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
            }}
          >
            <CalendarDays size={15} style={{ color: 'var(--pz-text-muted)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>
              {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
            </span>
          </div>
          <button
            onClick={goToNextDay}
            disabled={isViewingToday}
            className="p-2 rounded-xl transition-all duration-150 disabled:opacity-30"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text-secondary)',
            }}
          >
            <ChevronRight size={15} />
          </button>
          {!isViewingToday && (
            <button
              onClick={goToToday}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
              style={{
                background: 'rgba(59,130,246,0.1)',
                color: '#60A5FA',
                borderColor: 'rgba(59,130,246,0.2)',
              }}
            >
              Today
            </button>
          )}
        </div>

        <Section delay={0}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
            {([
              { icon: Users, bg: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))', color: '#3B82F6', label: 'Total Workforce', value: stats?.total_employees ?? '—', onClick: () => setDrillKey(drillKey === 'workforce' ? null : 'workforce') },
              { icon: UserCheck, bg: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(52,211,153,0.2))', color: '#10B981', label: 'Present Today', value: stats?.present_today ?? '—', onClick: () => setDrillKey(drillKey === 'present' ? null : 'present') },
              { icon: Clock, bg: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.2))', color: '#F59E0B', label: 'Late Today', value: stats?.late_today ?? '—', onClick: () => setDrillKey(drillKey === 'late' ? null : 'late') },
              { icon: UserX, bg: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(248,113,113,0.2))', color: '#EF4444', label: 'Absent Today', value: stats?.absent_today ?? '—', onClick: () => setDrillKey(drillKey === 'absent' ? null : 'absent') },
              { icon: Monitor, bg: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(129,140,248,0.2))', color: '#6366F1', label: 'Device Fleet', value: totalDevices > 0 ? `${onlineDevices}/${totalDevices}` : '—' },
            ] as const).map((item) => {
              const { icon: Icon, bg, color, label, value } = item
              const clickHandler = 'onClick' in item ? item.onClick : undefined
              return (
              <div key={label}
                onClick={clickHandler}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', padding: '20px', cursor: clickHandler ? 'pointer' : 'default', transition: 'all 0.15s ease' }}
                onMouseEnter={(e) => { if (clickHandler) e.currentTarget.style.borderColor = 'var(--pz-accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--pz-border)' }}
              >
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={18} color={color} />
                </div>
                <div>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, lineHeight: 1.1 }}>{value}</p>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '2px 0 0 0' }}>{label}</p>
                </div>
              </div>
            )
          })}
          </div>

          {/* Drill-down Panel */}
          {drillData && (
            <KPIDrillPanel
              open={!!drillKey}
              title={drillData.title}
              onClose={() => setDrillKey(null)}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--pz-border)' }}>
                      {drillData.headers.map((h: string) => (
                        <th
                          key={h}
                          className="text-left py-3 px-4 text-[11px] font-bold uppercase tracking-wider"
                          style={{ color: 'var(--pz-text-muted)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drillData.rows.length > 0 ? (
                      drillData.rows.map((row: string[], i: number) => (
                        <tr
                          key={i}
                          className="transition-colors"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                        >
                          {row.map((cell: string, j: number) => (
                            <td key={j} className="py-3 px-4 text-sm" style={{ color: 'var(--pz-text-secondary)' }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={drillData.headers.length}
                          className="py-12 text-center text-sm"
                          style={{ color: 'var(--pz-text-muted)' }}
                        >
                          No data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </KPIDrillPanel>
          )}
        </Section>
      </div>

      {/* ═════════════════════════════════════════════════════════
         ROW 1.5: Employee Status Breakdown
         ═════════════════════════════════════════════════════════ */}
      {stats && (
        <Section delay={0.05}>
          {sectionHeader(
            <div style={sectionIcon('#6366F1')}>
              <BarChart3 size={16} style={{ color: '#818CF8' }} />
            </div>,
            'Employee Status Breakdown',
            <a
              href="/employees"
              className="text-xs font-semibold transition-colors"
              style={{ color: 'var(--pz-brand)' }}
            >
              View All
            </a>
          )}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatusMiniCard label="Active" value={stats.employees_active} color="green" />
            <StatusMiniCard label="Pending Enrollment" value={stats.employees_pending_enrollment} color="amber" />
            <StatusMiniCard label="Enrolled" value={stats.employees_enrolled} color="blue" />
            <StatusMiniCard label="Inactive" value={stats.employees_inactive} color="gray" />
            <StatusMiniCard label="Terminated" value={stats.employees_terminated} color="red" />
          </div>
          {stats.active_enrollment_sessions > 0 && (
            <div
              className="mt-4 pt-4 flex items-center gap-2"
              style={{ borderTop: '1px solid var(--pz-border)' }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: '#3B82F6', animation: 'pz-pulse-dot 2s ease-in-out infinite' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--pz-text-muted)' }}>
                {stats.active_enrollment_sessions} active enrollment session{stats.active_enrollment_sessions !== 1 ? 's' : ''} in progress
              </span>
              <a
                href="/enrollment"
                className="ml-auto text-xs font-semibold transition-colors"
                style={{ color: 'var(--pz-brand)' }}
              >
                Monitor
              </a>
            </div>
          )}
        </Section>
      )}

      {/* ═════════════════════════════════════════════════════════
         ROW 2: Operational Health + Widgets
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Department Readiness */}
        {Object.keys(deptSummaries).length > 0 && (
          <Section delay={0.1} className="xl:col-span-2">
            {sectionHeader(
              <div style={sectionIcon('#3B82F6')}>
                <Shield size={16} style={{ color: '#60A5FA' }} />
              </div>,
              'Department Readiness',
              <a
                href="/departments"
                className="text-xs font-semibold flex items-center gap-1.5 transition-colors group"
                style={{ color: 'var(--pz-brand)' }}
              >
                View All
                <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </a>
            )}
            <div className="flex flex-wrap gap-8 justify-center py-4">
              {Object.values(deptSummaries).slice(0, 8).map((dept) => {
                const readiness = dept.expected_count > 0
                  ? Math.round((dept.present_count / dept.expected_count) * 100)
                  : 100
                return (
                  <MetricRing
                    key={dept.department_id}
                    value={readiness}
                    size={92}
                    strokeWidth={6}
                    color="auto"
                    label={dept.department_name}
                    sublabel={`${dept.present_count}/${dept.expected_count}`}
                  />
                )
              })}
            </div>
          </Section>
        )}

        {/* Shift Coverage & Upcoming Changes */}
        <div className="flex flex-col gap-5">
          <Section delay={0.15}>
            <ShiftCoverageWidget />
          </Section>
          <Section delay={0.2}>
            <UpcomingChangesWidget />
          </Section>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════
         ROW 3: Live Operations
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Scan Activity */}
        <Section delay={0.25} className="lg:col-span-2">
          {sectionHeader(
            <div style={sectionIcon('#3B82F6')}>
              <Fingerprint size={16} style={{ color: '#60A5FA' }} />
            </div>,
            'Live Scan Activity',
            <div className="flex items-center gap-3">
              {liveData?.items?.length > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#34D399' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#34D399', animation: 'pz-pulse-dot 2s ease-in-out infinite' }} />
                  Live
                </span>
              )}
              <a
                href="/attendance"
                className="text-xs font-semibold flex items-center gap-1.5 transition-colors group"
                style={{ color: 'var(--pz-brand)' }}
              >
                View All
                <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          )}
          {liveData?.items?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--pz-border)' }}>
                    <th className="text-left py-3.5 px-4 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>Employee</th>
                    <th className="text-left py-3.5 px-4 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>Department</th>
                    <th className="text-left py-3.5 px-4 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>Direction</th>
                    <th className="text-left py-3.5 px-4 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>Date/Time</th>
                    <th className="text-left py-3.5 px-4 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>Terminal</th>
                  </tr>
                </thead>
                <tbody>
                  {liveData.items.slice(0, 8).map((log: AttendanceLog, i: number) => (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-sm border"
                            style={{
                              background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.15))',
                              color: '#60A5FA',
                              borderColor: 'rgba(59,130,246,0.2)',
                            }}
                          >
                            {log.employee_name?.[0] || '?'}
                          </div>
                          <div>
                            <span className="font-semibold text-sm" style={{ color: 'var(--pz-text-secondary)' }}>
                              {log.employee_name || 'Unknown'}
                            </span>
                            <p className="text-[11px]" style={{ color: 'var(--pz-text-muted)' }}>{log.employee_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-sm" style={{ color: 'var(--pz-text-tertiary)' }}>
                        {log.department_name || '\u2014'}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={log.punch_direction === 'in' ? 'in' : 'out'} size="sm" dot={false}>
                          {log.punch_direction?.toUpperCase()}
                        </StatusBadge>
                      </td>
                      <td className="py-3.5 px-4 text-sm font-mono tabular-nums" style={{ color: 'var(--pz-text-tertiary)' }}>
                        <div>{format(new Date(log.timestamp), 'MMM dd')}</div>
                        <div style={{ fontSize: '10px', color: 'var(--pz-text-muted)' }}>{format(new Date(log.timestamp), 'hh:mm:ss a')}</div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono" style={{ color: 'var(--pz-text-faint)' }}>
                        {log.device_name || log.device_ip}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Fingerprint} title="No active scan telemetry" desc="Waiting for biometric push..." />
          )}
        </Section>

        {/* Workforce Telemetry */}
        <Section delay={0.3}>
          {sectionHeader(
            <div style={sectionIcon('#6366F1')}>
              <Activity size={16} style={{ color: '#818CF8' }} />
            </div>,
            'Workforce Telemetry'
          )}
          <WorkforceReadiness />
        </Section>
      </div>

      {/* ═════════════════════════════════════════════════════════
         ROW 4: Analytics
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Trend */}
        <Section delay={0.35} className="lg:col-span-2">
          {sectionHeader(
            <div style={sectionIcon('#10B981')}>
              <Activity size={16} style={{ color: '#34D399' }} />
            </div>,
            'Attendance Trend',
            <span
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
              style={{
                background: 'var(--pz-surface-2)',
                color: 'var(--pz-text-muted)',
                borderColor: 'var(--pz-border)',
              }}
            >
              7-Day
            </span>
          )}
          {chartsLoading ? (
            <div className="skeleton w-full h-[300px] rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={charts?.attendance_overview || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--pz-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                <Line type="monotone" dataKey="present" stroke="#3B82F6" strokeWidth={2.5} dot={false} name="Present" />
                <Line type="monotone" dataKey="absent" stroke="#64748B" strokeWidth={1.5} dot={false} name="Absent" />
                <Line type="monotone" dataKey="late" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="Late" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* By Department */}
        <Section delay={0.4}>
          {sectionHeader(
            <div style={sectionIcon('#06B6D4')}>
              <Users size={16} style={{ color: '#22D3EE' }} />
            </div>,
            'By Department'
          )}
          {chartsLoading ? (
            <div className="skeleton w-full h-[300px] rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={(charts?.department_breakdown || []).slice(0, 6)}
                layout="vertical"
                margin={{ left: 0, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--pz-border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="department_name"
                  type="category"
                  width={100}
                  tick={{ fontSize: 12, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={16} name="Present" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      {/* ═════════════════════════════════════════════════════════
         ROW 5: Device Fleet
         ═════════════════════════════════════════════════════════ */}
      <Section delay={0.45}>
        {sectionHeader(
          <div style={sectionIcon('#8B5CF6')}>
            <Monitor size={16} style={{ color: '#A78BFA' }} />
          </div>,
          'Device Fleet',
          <div className="flex items-center gap-3">
            <span
              className="px-2.5 py-1 rounded-lg text-xs font-semibold border"
              style={{
                background: 'rgba(16,185,129,0.1)',
                color: '#34D399',
                borderColor: 'rgba(16,185,129,0.2)',
              }}
            >
              {onlineDevices}/{totalDevices} online
            </span>
            <a
              href="/devices"
              className="text-xs font-semibold flex items-center gap-1.5 transition-colors group"
              style={{ color: 'var(--pz-brand)' }}
            >
              View All
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>
        )}
        {devices.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center gap-3.5 p-4 rounded-xl transition-all duration-150"
                style={{
                  background: 'var(--pz-surface-2)',
                  border: '1px solid var(--pz-border)',
                }}
              >
                <div
                  className="p-2.5 rounded-xl"
                  style={{
                    background: device.is_online ? 'rgba(16,185,129,0.1)' : 'var(--pz-surface-2)',
                    border: `1px solid ${device.is_online ? 'rgba(16,185,129,0.2)' : 'var(--pz-border)'}`,
                  }}
                >
                  <Monitor size={15} style={{ color: device.is_online ? '#34D399' : 'var(--pz-text-muted)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--pz-text-secondary)' }}>
                    {device.name || `Device ${device.serial_number.slice(-6)}`}
                  </p>
                  <p className="text-xs font-mono" style={{ color: 'var(--pz-text-muted)' }}>
                    {device.ip_address || device.serial_number}
                  </p>
                </div>
                <StatusBadge status={device.is_online ? 'online' : 'offline'} size="sm" pulse={device.is_online} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Monitor} title="No registered devices" />
        )}
      </Section>

      {/* ═════════════════════════════════════════════════════════
         ROW 6: Device Activity & Enrollment Events
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Device Activity Stream */}
        <Section delay={0.5}>
          {sectionHeader(
            <div style={sectionIcon('#3B82F6')}>
              <Radio size={16} style={{ color: '#60A5FA' }} />
            </div>,
            'Device Activity Stream'
          )}
          {!fleetActivity?.recent_activity?.length ? (
            <EmptyState icon={Cpu} title="No recent device activity" desc="Waiting for device events..." />
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {fleetActivity.recent_activity.slice(0, 12).map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-xl transition-colors"
                  style={{
                    background: 'var(--pz-surface-2)',
                    border: '1px solid var(--pz-border)',
                  }}
                >
                  <div
                    className="mt-0.5 p-1.5 rounded-lg"
                    style={{
                      background: item.activity_type === 'attendance_push' ? 'rgba(16,185,129,0.1)' :
                        item.activity_type === 'heartbeat' ? 'rgba(59,130,246,0.1)' :
                        item.activity_type === 'device_disconnected' ? 'rgba(239,68,68,0.1)' :
                        item.activity_type === 'health_probe' ? 'rgba(139,92,246,0.1)' :
                        'rgba(100,116,139,0.1)',
                      color: item.activity_type === 'attendance_push' ? '#34D399' :
                        item.activity_type === 'heartbeat' ? '#60A5FA' :
                        item.activity_type === 'device_disconnected' ? '#F87171' :
                        item.activity_type === 'health_probe' ? '#A78BFA' :
                        '#94A3B8',
                    }}
                  >
                    <Cpu size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color: 'var(--pz-text-secondary)' }}>
                      {item.activity_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[10px] font-mono" style={{ color: 'var(--pz-text-muted)' }}>
                      {item.ip_address || 'Unknown IP'} · {format(new Date(item.created_at), 'MMM dd HH:mm:ss')}
                    </p>
                  </div>
              </div>
            ))}
          </div>
        )
      }
        </Section>

        {/* Activity Summary */}
        <Section delay={0.55}>
          {sectionHeader(
            <div style={sectionIcon('#06B6D4')}>
              <Activity size={16} style={{ color: '#22D3EE' }} />
            </div>,
            'Activity Summary (24h)'
          )}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Heartbeats', key: 'heartbeat', color: '#3B82F6' },
              { label: 'Attendance Pushes', key: 'attendance_push', color: '#10B981' },
              { label: 'Health Probes', key: 'health_probe', color: '#8B5CF6' },
              { label: 'Disconnections', key: 'device_disconnected', color: '#EF4444' },
            ].map(({ label, key, color }) => (
              <div
                key={key}
                className="p-3.5 rounded-xl"
                style={{
                  background: 'var(--pz-surface-2)',
                  border: '1px solid var(--pz-border)',
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>
                  {label}
                </p>
                <p className="text-2xl font-bold mt-1" style={{ color }}>
                  {fleetActivity?.activity_counts?.[key] ?? 0}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Alert Drawer */}
      <AlertDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}

function groupByDepartment(employees: Employee[]) {
  const map = new Map<string, { total: number; active: number }>()
  for (const e of employees) {
    const dept = e.department_name || 'Unassigned'
    const entry = map.get(dept) || { total: 0, active: 0 }
    entry.total++
    if (e.status === 'active') entry.active++
    map.set(dept, entry)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([dept, counts]) => [dept, String(counts.total), `${counts.active} active`])
}
