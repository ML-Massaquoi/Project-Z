import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, UserCheck, Clock, UserX, Monitor, Bell,
  Fingerprint, Activity, Shield, ArrowRight, Radio, Cpu,
  ChevronLeft, ChevronRight, CalendarDays, AlertTriangle,
  Wifi, WifiOff, Eye, BarChart3, TrendingUp,
} from 'lucide-react'
import { dashboardAPI, attendanceAPI, devicesAPI, employeesAPI, deviceActivityAPI } from '@/api/client'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { format, subDays, addDays, isToday, parseISO } from 'date-fns'
import type { DashboardStats, DashboardChartData, AttendanceLog, Device, Employee } from '@/types'
import { KPICard, KPIDrillPanel } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { MetricRing } from '@/components/ui/MetricRing'
import { Section, SectionHeader } from '@/components/ui/CardSection'
import { useConnectionStore } from '@/stores/connectionStore'
import { useAlertStore } from '@/stores/alertStore'
import { AlertDrawer } from '@/components/dashboard/AlertDrawer'
import { WorkforceReadiness } from '@/components/dashboard/WorkforceReadiness'
import { ShiftCoverageWidget } from '@/components/dashboard/ShiftCoverageWidget'
import { UpcomingChangesWidget } from '@/components/dashboard/UpcomingChangesWidget'
import { useDeptSummaryStore } from '@/stores/deptSummaryStore'

/* ── Shared Styles ───────────────────────────────────────── */
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

/* ── ConnectionBadge ─────────────────────────────────────── */
function ConnectionBadge({ status }: { status: string }) {
  if (status === 'connected') return null
  const isReconnecting = status === 'reconnecting'
  return (
    <div
      className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border"
      style={{
        background: isReconnecting ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
        color: isReconnecting ? '#FBBF24' : '#F87171',
        borderColor: isReconnecting ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
      }}
    >
      {isReconnecting ? <Wifi size={14} /> : <WifiOff size={14} />}
      <span>{isReconnecting ? 'Reconnecting' : 'Degraded'}</span>
    </div>
  )
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
    <div className="flex flex-col gap-6 p-8 flex-1">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-bold tracking-tight m-0" style={{ color: 'var(--pz-text)' }}>
            Operations Dashboard
          </h1>
          <p className="text-[13px] m-0" style={{ color: 'var(--pz-text-muted)' }}>
            Real-time attendance &amp; workforce overview · {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionBadge status={connectionStatus} />
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

      {/* ── Date Navigation ─────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2.5">
        <button
          onClick={goToPreviousDay}
          className="p-2 rounded-xl transition-all duration-150 hover:bg-[var(--pz-surface-2)]"
          style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-text-secondary)' }}
        >
          <ChevronLeft size={15} />
        </button>
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-xl"
          style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}
        >
          <CalendarDays size={15} style={{ color: 'var(--pz-text-muted)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>
            {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
          </span>
        </div>
        <button
          onClick={goToNextDay}
          disabled={isViewingToday}
          className="p-2 rounded-xl transition-all duration-150 hover:bg-[var(--pz-surface-2)] disabled:opacity-30"
          style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-text-secondary)' }}
        >
          <ChevronRight size={15} />
        </button>
        {!isViewingToday && (
          <button
            onClick={goToToday}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:brightness-110"
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

      {/* ═════════════════════════════════════════════════════════
         ROW 1: KPI Cards
         ═════════════════════════════════════════════════════════ */}
      <Section delay={0}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            icon={Users}
            label="Total Workforce"
            value={stats?.total_employees ?? '—'}
            color="#3B82F6"
            onClick={() => setDrillKey(drillKey === 'workforce' ? null : 'workforce')}
            subtitle={stats ? `${stats.employees_active} active` : undefined}
          />
          <KPICard
            icon={UserCheck}
            label="Present Today"
            value={stats?.present_today ?? '—'}
            color="#10B981"
            onClick={() => setDrillKey(drillKey === 'present' ? null : 'present')}
            subtitle={stats ? `${Math.round((stats.present_today / (stats.total_employees || 1)) * 100)}% attendance` : undefined}
          />
          <KPICard
            icon={Clock}
            label="Late Today"
            value={stats?.late_today ?? '—'}
            color="#F59E0B"
            onClick={() => setDrillKey(drillKey === 'late' ? null : 'late')}
          />
          <KPICard
            icon={UserX}
            label="Absent Today"
            value={stats?.absent_today ?? '—'}
            color="#EF4444"
            onClick={() => setDrillKey(drillKey === 'absent' ? null : 'absent')}
          />
          <KPICard
            icon={Monitor}
            label="Device Fleet"
            value={totalDevices > 0 ? onlineDevices : '—'}
            color="#6366F1"
            suffix={totalDevices > 0 ? `/ ${totalDevices}` : undefined}
            subtitle={totalDevices > 0 ? `${Math.round((onlineDevices / totalDevices) * 100)}% online` : undefined}
          />
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
                        className="transition-colors hover:bg-[var(--pz-surface-2)]/50"
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

      {/* Employee Status Bar */}
      {stats && (
        <Section delay={0.05}>
          <SectionHeader
            icon={
              <div className="p-2.5 rounded-xl border" style={{ background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.15)' }}>
                <BarChart3 size={15} style={{ color: '#818CF8' }} />
              </div>
            }
            title="Employee Roster"
            action={
              <a
                href="/employees"
                className="text-xs font-semibold transition-colors hover:brightness-110"
                style={{ color: 'var(--pz-brand)' }}
              >
                View All
              </a>
            }
          />
          <div className="flex flex-wrap gap-4">
            {[
              { label: 'Active', value: stats.employees_active, color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
              { label: 'Pending Enroll', value: stats.employees_pending_enrollment, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
              { label: 'Enrolled', value: stats.employees_enrolled, color: '#3B82F6', bg: 'rgba(59,130,246,0.08)' },
              { label: 'Inactive', value: stats.employees_inactive, color: '#64748B', bg: 'rgba(100,116,139,0.08)' },
              { label: 'Terminated', value: stats.employees_terminated, color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
            ].map(({ label, value, color, bg }) => (
              <div
                key={label}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl border flex-1 min-w-[120px]"
                style={{ background: bg, borderColor: `${color}18` }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <div>
                  <p className="text-lg font-bold leading-tight" style={{ color }}>{value}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider leading-tight mt-0.5" style={{ color: 'var(--pz-text-muted)' }}>
                    {label}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {stats.active_enrollment_sessions > 0 && (
            <div className="mt-4 pt-4 flex items-center gap-2" style={{ borderTop: '1px solid var(--pz-border)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: '#3B82F6', animation: 'pz-pulse-dot 2s ease-in-out infinite' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--pz-text-muted)' }}>
                {stats.active_enrollment_sessions} active enrollment session{stats.active_enrollment_sessions !== 1 ? 's' : ''} in progress
              </span>
              <a href="/enrollment" className="ml-auto text-xs font-semibold transition-colors" style={{ color: 'var(--pz-brand)' }}>
                Monitor
              </a>
            </div>
          )}
        </Section>
      )}

      {/* ═════════════════════════════════════════════════════════
         ROW 2: Charts
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section delay={0.1} className="lg:col-span-2">
          <SectionHeader
            icon={
              <div className="p-2.5 rounded-xl border" style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.15)' }}>
                <TrendingUp size={15} style={{ color: '#34D399' }} />
              </div>
            }
            title="Attendance Trend (7 Days)"
            action={
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-text-muted)', borderColor: 'var(--pz-border)' }}>
                This Week
              </span>
            }
          />
          {chartsLoading ? (
            <div className="skeleton w-full h-[280px] rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={charts?.attendance_overview || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--pz-border)" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line type="monotone" dataKey="present" stroke="#3B82F6" strokeWidth={2.5} dot={false} name="Present" />
                <Line type="monotone" dataKey="absent" stroke="#64748B" strokeWidth={1.5} dot={false} name="Absent" />
                <Line type="monotone" dataKey="late" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="Late" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section delay={0.15}>
          <SectionHeader
            icon={
              <div className="p-2.5 rounded-xl border" style={{ background: 'rgba(6,182,212,0.08)', borderColor: 'rgba(6,182,212,0.15)' }}>
                <Users size={15} style={{ color: '#22D3EE' }} />
              </div>
            }
            title="By Department"
          />
          {chartsLoading ? (
            <div className="skeleton w-full h-[280px] rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={(charts?.department_breakdown || []).slice(0, 6)}
                layout="vertical"
                margin={{ left: 0, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--pz-border)" strokeOpacity={0.5} horizontal={false} />
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
         ROW 3: Department Readiness + Shift Coverage
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {Object.keys(deptSummaries).length > 0 && (
          <Section delay={0.2} className="xl:col-span-2">
            <SectionHeader
              icon={
                <div className="p-2.5 rounded-xl border" style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.15)' }}>
                  <Shield size={15} style={{ color: '#60A5FA' }} />
                </div>
              }
              title="Department Readiness"
              action={
                <a href="/departments" className="text-xs font-semibold flex items-center gap-1 transition-colors group" style={{ color: 'var(--pz-brand)' }}>
                  View All
                  <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                </a>
              }
            />
            <div className="flex flex-wrap gap-6 justify-center py-2">
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

        <div className="flex flex-col gap-5">
          <Section delay={0.25}>
            <ShiftCoverageWidget />
          </Section>
          <Section delay={0.3}>
            <UpcomingChangesWidget />
          </Section>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════
         ROW 4: Live Scan Activity + Workforce Telemetry
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section delay={0.35} className="lg:col-span-2">
          <SectionHeader
            icon={
              <div className="p-2.5 rounded-xl border" style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.15)' }}>
                <Fingerprint size={15} style={{ color: '#60A5FA' }} />
              </div>
            }
            title="Live Scan Activity"
            action={
              <div className="flex items-center gap-3">
                {liveData?.items?.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#34D399' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#34D399', animation: 'pz-pulse-dot 2s ease-in-out infinite' }} />
                    Live
                  </span>
                )}
                <a href="/attendance" className="text-xs font-semibold flex items-center gap-1 transition-colors group" style={{ color: 'var(--pz-brand)' }}>
                  View All
                  <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>
            }
          />
          {liveData?.items?.length ? (
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--pz-border)' }}>
                    <th className="text-left py-3.5 px-6 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>Employee</th>
                    <th className="text-left py-3.5 px-4 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>Department</th>
                    <th className="text-left py-3.5 px-4 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>Direction</th>
                    <th className="text-left py-3.5 px-4 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>Time</th>
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
                      className="transition-colors hover:bg-[var(--pz-surface-2)]/50"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                    >
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border"
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

        <Section delay={0.4}>
          <SectionHeader
            icon={
              <div className="p-2.5 rounded-xl border" style={{ background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.15)' }}>
                <Activity size={15} style={{ color: '#818CF8' }} />
              </div>
            }
            title="Workforce Telemetry"
          />
          <WorkforceReadiness />
        </Section>
      </div>

      {/* ═════════════════════════════════════════════════════════
         ROW 5: Device Fleet
         ═════════════════════════════════════════════════════════ */}
      <Section delay={0.45}>
        <SectionHeader
          icon={
            <div className="p-2.5 rounded-xl border" style={{ background: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.15)' }}>
              <Monitor size={15} style={{ color: '#A78BFA' }} />
            </div>
          }
          title="Device Fleet"
          action={
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold border" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', borderColor: 'rgba(16,185,129,0.2)' }}>
                {onlineDevices}/{totalDevices} online
              </span>
              <a href="/devices" className="text-xs font-semibold flex items-center gap-1 transition-colors group" style={{ color: 'var(--pz-brand)' }}>
                View All
                <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          }
        />
        {devices.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center gap-3.5 p-4 rounded-xl transition-all duration-150 hover:brightness-110"
                style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}
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
                    {device.name || `Device ${device.serial_number?.slice(-6) || ''}`}
                  </p>
                  <p className="text-xs font-mono truncate" style={{ color: 'var(--pz-text-muted)' }}>
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
         ROW 6: Device Activity
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section delay={0.5}>
          <SectionHeader
            icon={
              <div className="p-2.5 rounded-xl border" style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.15)' }}>
                <Radio size={15} style={{ color: '#60A5FA' }} />
              </div>
            }
            title="Device Activity Stream"
          />
          {!fleetActivity?.recent_activity?.length ? (
            <EmptyState icon={Cpu} title="No recent device activity" desc="Waiting for device events..." />
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {fleetActivity.recent_activity.slice(0, 12).map((item: any) => {
                const colors: Record<string, { bg: string; color: string }> = {
                  attendance_push: { bg: 'rgba(16,185,129,0.1)', color: '#34D399' },
                  heartbeat: { bg: 'rgba(59,130,246,0.1)', color: '#60A5FA' },
                  device_disconnected: { bg: 'rgba(239,68,68,0.1)', color: '#F87171' },
                  health_probe: { bg: 'rgba(139,92,246,0.1)', color: '#A78BFA' },
                }
                const style = colors[item.activity_type] || { bg: 'rgba(100,116,139,0.1)', color: '#94A3B8' }
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-xl transition-colors hover:brightness-110"
                    style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}
                  >
                    <div className="mt-0.5 p-1.5 rounded-lg" style={{ background: style.bg, color: style.color }}>
                      <Cpu size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold capitalize" style={{ color: 'var(--pz-text-secondary)' }}>
                        {item.activity_type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[10px] font-mono" style={{ color: 'var(--pz-text-muted)' }}>
                        {item.ip_address || 'Unknown'} &middot; {format(new Date(item.created_at), 'MMM dd HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        <Section delay={0.55}>
          <SectionHeader
            icon={
              <div className="p-2.5 rounded-xl border" style={{ background: 'rgba(6,182,212,0.08)', borderColor: 'rgba(6,182,212,0.15)' }}>
                <Activity size={15} style={{ color: '#22D3EE' }} />
              </div>
            }
            title="Activity Summary (24h)"
          />
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
                style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}
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
