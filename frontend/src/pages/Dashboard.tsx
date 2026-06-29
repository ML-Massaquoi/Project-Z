import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, UserCheck, Clock, UserX, Monitor, Bell,
  Fingerprint, Activity, Shield, ArrowRight, Radio, Cpu,
  ChevronLeft, ChevronRight, CalendarDays,
} from 'lucide-react'
import { dashboardAPI, attendanceAPI, devicesAPI, employeesAPI, deviceActivityAPI } from '@/api/client'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { format, subDays, addDays, isToday, parseISO } from 'date-fns'
import type { DashboardStats, DashboardChartData, AttendanceLog, Device, Employee } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { KPICard, KPIDrillPanel } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { MetricRing } from '@/components/ui/MetricRing'
import { useConnectionStore } from '@/stores/connectionStore'
import { useAlertStore } from '@/stores/alertStore'
import { AlertDrawer } from '@/components/dashboard/AlertDrawer'
import { WorkforceReadiness } from '@/components/dashboard/WorkforceReadiness'
import { ShiftCoverageWidget } from '@/components/dashboard/ShiftCoverageWidget'
import { UpcomingChangesWidget } from '@/components/dashboard/UpcomingChangesWidget'
import { useDeptSummaryStore } from '@/stores/deptSummaryStore'

const chartTooltipStyle = {
  background: 'var(--pz-surface-1)',
  borderRadius: 'var(--pz-radius-lg)',
  border: '1px solid var(--pz-border-strong)',
  color: 'var(--pz-text)',
  boxShadow: 'var(--pz-shadow-lg)',
  fontSize: '13px',
}

type DrillKey = 'workforce' | 'present' | 'late' | 'absent' | null

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
    queryKey: ['attendance-live'],
    queryFn: async () => (await attendanceAPI.live({ limit: 10 })).data,
    refetchInterval: 15000,
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
    <div className="space-y-8">
      {/* ── Page Header ─────────────────────────────────────── */}
      <PageHeader
        title="Operations Command Center"
        subtitle={`Real-time airport workforce readiness \u00b7 ${format(new Date(), 'EEEE, MMMM d yyyy')}`}
        breadcrumbs={[{ label: 'Operations' }, { label: 'Dashboard' }]}
        actions={
          <div className="flex items-center gap-3">
            {connectionStatus !== 'connected' && (
              <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border
                ${connectionStatus === 'reconnecting'
                  ? 'bg-amber-500/5 text-amber-400 border-amber-500/20'
                  : 'bg-red-500/5 text-red-400 border-red-500/20'
                }`}>
                <span className="relative flex h-2 w-2">
                  <span className={`pz-ping absolute inline-flex h-full w-full rounded-full opacity-75
                    ${connectionStatus === 'reconnecting' ? 'bg-amber-400' : 'bg-red-400'}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2
                    ${connectionStatus === 'reconnecting' ? 'bg-amber-500' : 'bg-red-500'}`} />
                </span>
                {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'System Degraded'}
              </div>
            )}
            <button
              onClick={() => setDrawerOpen(true)}
              className="relative flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-sm font-semibold text-[var(--pz-text-secondary)] transition-all"
            >
              <Bell size={16} className={unacknowledgedCount > 0 ? 'text-amber-400' : 'text-[var(--pz-text-muted)]'} />
              Alerts
              {unacknowledgedCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center px-1">
                  {unacknowledgedCount}
                </span>
              )}
            </button>
          </div>
        }
      />

      {/* ═════════════════════════════════════════════════════════
         ROW 1: Executive KPIs with Drill-down
         ═════════════════════════════════════════════════════════ */}
      <div>
        {/* Date Navigation Bar */}
        <div className="flex items-center justify-center gap-3 mb-5">
          <button
            onClick={goToPreviousDay}
            className="p-2 rounded-lg bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-[var(--pz-text-secondary)] transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)]">
            <CalendarDays size={16} className="text-[var(--pz-text-muted)]" />
            <span className="text-sm font-semibold text-[var(--pz-text)]">
              {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
            </span>
          </div>
          <button
            onClick={goToNextDay}
            className="p-2 rounded-lg bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-[var(--pz-text-secondary)] transition-all"
          >
            <ChevronRight size={16} />
          </button>
          {!isViewingToday && (
            <button
              onClick={goToToday}
              className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-semibold border border-blue-500/20 hover:bg-blue-500/20 transition-all"
            >
              Today
            </button>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={`grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-5 ${drillKey ? 'mb-1' : ''}`}
        >
          <KPICard
            icon={Users} label="Total Workforce"
            value={stats?.total_employees ?? '\u2014'}
            change={stats?.trends.employees_change} color="#3B82F6"
            loading={statsLoading}
            onClick={() => setDrillKey(drillKey === 'workforce' ? null : 'workforce')}
          />
          <KPICard
            icon={UserCheck} label="Present Today"
            value={stats?.present_today ?? '\u2014'}
            change={stats?.trends.present_change} color="#10B981"
            loading={statsLoading}
            onClick={() => setDrillKey(drillKey === 'present' ? null : 'present')}
          />
          <KPICard
            icon={Clock} label="Late Today"
            value={stats?.late_today ?? '\u2014'}
            change={stats?.trends.late_change} color="#F59E0B"
            loading={statsLoading}
            onClick={() => setDrillKey(drillKey === 'late' ? null : 'late')}
          />
          <KPICard
            icon={UserX} label="Absent Today"
            value={stats?.absent_today ?? '\u2014'}
            subtitle={stats?.expected_today ? `${stats.expected_today} expected` : undefined}
            change={stats?.trends.absent_change} color="#EF4444"
            loading={statsLoading}
            onClick={() => setDrillKey(drillKey === 'absent' ? null : 'absent')}
          />
          <KPICard
            icon={Monitor} label="Device Fleet"
            value={totalDevices > 0 ? `${onlineDevices}/${totalDevices}` : '\u2014'}
            color="#6366F1" loading={statsLoading} suffix="online"
          />
        </motion.div>

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
                  <tr className="border-b border-[var(--pz-border)]">
                    {drillData.headers.map((h: string) => (
                      <th key={h} className="text-left py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drillData.rows.length > 0 ? (
                    drillData.rows.map((row: string[], i: number) => (
                      <tr key={i} className="border-b border-[var(--pz-border)]/20 hover:bg-[var(--pz-surface-2)]/30 transition-colors">
                        {row.map((cell: string, j: number) => (
                          <td key={j} className="py-3 px-4 text-sm text-[var(--pz-text-secondary)]">{cell}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={drillData.headers.length} className="py-12 text-center text-sm text-[var(--pz-text-muted)]">
                        No data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </KPIDrillPanel>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════
         ROW 1.5: Employee Status Breakdown (Enrollment Status)
         ═════════════════════════════════════════════════════════ */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <Users size={16} className="text-indigo-500" />
            </div>
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Employee Status Breakdown</h3>
            <a href="/employees" className="ml-auto text-xs text-blue-500 hover:text-blue-400 font-semibold">View All</a>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatusMiniCard label="Active" value={stats.employees_active} color="green" />
            <StatusMiniCard label="Pending Enrollment" value={stats.employees_pending_enrollment} color="amber" />
            <StatusMiniCard label="Enrolled" value={stats.employees_enrolled} color="blue" />
            <StatusMiniCard label="Inactive" value={stats.employees_inactive} color="gray" />
            <StatusMiniCard label="Terminated" value={stats.employees_terminated} color="red" />
          </div>
          {stats.active_enrollment_sessions > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {stats.active_enrollment_sessions} active enrollment session{stats.active_enrollment_sessions !== 1 ? 's' : ''} in progress
              </span>
              <a href="/enrollment" className="ml-auto text-xs text-blue-500 hover:text-blue-400 font-semibold">Monitor</a>
            </div>
          )}
        </motion.div>
      )}

      {/* ═════════════════════════════════════════════════════════
         ROW 2: Operational Health + Widgets
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Department Readiness */}
        {Object.keys(deptSummaries).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="pz-card p-6 xl:col-span-2"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <Shield size={18} className="text-blue-400" />
                </div>
                <h3 className="text-base font-bold text-[var(--pz-text)]">Department Readiness</h3>
              </div>
              <a href="/departments" className="text-sm text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 transition-colors group">
                View All <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
            <div className="flex flex-wrap gap-10 justify-center py-4">
              {Object.values(deptSummaries).slice(0, 8).map((dept) => {
                const readiness = dept.expected_count > 0
                  ? Math.round((dept.present_count / dept.expected_count) * 100)
                  : 100
                return (
                  <MetricRing
                    key={dept.department_id}
                    value={readiness}
                    size={96}
                    strokeWidth={6}
                    color="auto"
                    label={dept.department_name}
                    sublabel={`${dept.present_count}/${dept.expected_count}`}
                  />
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Shift Coverage & Upcoming Changes */}
        <div className="flex flex-col gap-5">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <ShiftCoverageWidget />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <UpcomingChangesWidget />
          </motion.div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════
         ROW 3: Live Operations
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="pz-card p-6 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <Fingerprint size={18} className="text-blue-400" />
              </div>
              <h3 className="text-base font-bold text-[var(--pz-text)]">Live Scan Activity</h3>
              {liveData?.items?.length > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pz-pulse-dot" />
                  Live
                </span>
              )}
            </div>
            <a href="/attendance" className="text-sm text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 transition-colors group">
              View All <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--pz-border)]">
                  <th className="text-left py-3.5 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Employee</th>
                  <th className="text-left py-3.5 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Department</th>
                  <th className="text-left py-3.5 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Direction</th>
                  <th className="text-left py-3.5 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Time</th>
                  <th className="text-left py-3.5 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Terminal</th>
                </tr>
              </thead>
              <tbody>
                {liveData?.items?.length ? (
                  liveData.items.slice(0, 8).map((log: AttendanceLog, i: number) => (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-[var(--pz-border)]/20 hover:bg-[var(--pz-surface-2)]/30 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 flex items-center justify-center text-xs font-bold text-blue-400 border border-blue-500/20">
                            {log.employee_name?.[0] || '?'}
                          </div>
                          <div>
                            <span className="font-semibold text-[var(--pz-text-secondary)] text-sm">{log.employee_name || 'Unknown'}</span>
                            <p className="text-[11px] text-[var(--pz-text-muted)]">{log.employee_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-sm text-[var(--pz-text-tertiary)]">{log.department_name || '\u2014'}</td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={log.punch_direction === 'in' ? 'in' : 'out'} size="sm" dot={false}>
                          {log.punch_direction?.toUpperCase()}
                        </StatusBadge>
                      </td>
                      <td className="py-3.5 px-4 text-sm text-[var(--pz-text-tertiary)] font-mono tabular-nums">
                        {format(new Date(log.timestamp), 'hh:mm a')}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[var(--pz-text-faint)] font-mono">{log.device_name || log.device_ip}</td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-[var(--pz-text-muted)]">
                      <Fingerprint size={32} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">No active scan telemetry</p>
                      <p className="text-xs mt-1.5 text-[var(--pz-text-faint)]">Waiting for biometric push...</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Workforce Telemetry */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="pz-card p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <Activity size={18} className="text-indigo-400" />
            </div>
            <h3 className="text-base font-semibold tracking-tight text-[var(--pz-text)]">Workforce Telemetry</h3>
          </div>
          <WorkforceReadiness />
        </motion.div>
      </div>

      {/* ═════════════════════════════════════════════════════════
         ROW 4: Analytics
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="pz-card p-6 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <Activity size={18} className="text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold tracking-tight text-[var(--pz-text)]">Attendance Trend</h3>
            </div>
            <span className="text-xs text-[var(--pz-text-muted)] bg-[var(--pz-surface-2)] px-3 py-1.5 rounded-lg font-semibold border border-[var(--pz-border)]">
              7-Day
            </span>
          </div>
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
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="pz-card p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <Users size={18} className="text-cyan-400" />
            </div>
            <h3 className="text-base font-semibold tracking-tight text-[var(--pz-text)]">By Department</h3>
          </div>
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
        </motion.div>
      </div>

      {/* ═════════════════════════════════════════════════════════
         ROW 5: Device Fleet
         ═════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="pz-card p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Monitor size={18} className="text-violet-400" />
            </div>
            <h3 className="text-base font-semibold tracking-tight text-[var(--pz-text)]">Device Fleet</h3>
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {onlineDevices}/{totalDevices} online
            </span>
          </div>
          <a href="/devices" className="text-sm text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 transition-colors group">
            View All <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </a>
        </div>
        {devices.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {devices.map((device) => (
              <div key={device.id} className="flex items-center gap-3.5 p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] hover:border-[var(--pz-border-strong)] hover:bg-[var(--pz-surface-2)]/70 transition-all">
                <div className={`p-2.5 rounded-xl ${device.is_online ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-[var(--pz-surface-2)] border border-[var(--pz-border)]'}`}>
                  <Monitor size={16} className={device.is_online ? 'text-emerald-400' : 'text-[var(--pz-text-muted)]'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--pz-text-secondary)] truncate">
                    {device.name || `Device ${device.serial_number.slice(-6)}`}
                  </p>
                  <p className="text-xs text-[var(--pz-text-muted)] font-mono">{device.ip_address || device.serial_number}</p>
                </div>
                <StatusBadge status={device.is_online ? 'online' : 'offline'} size="sm" pulse={device.is_online} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-[var(--pz-text-muted)]">
            <Monitor size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No registered devices</p>
          </div>
        )}
      </motion.div>

      {/* ═════════════════════════════════════════════════════════
         ROW 6: Device Activity & Enrollment Events
         ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Device Activity Stream */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="pz-card p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <Radio size={18} className="text-blue-400" />
            </div>
            <h3 className="text-base font-semibold tracking-tight text-[var(--pz-text)]">Device Activity Stream</h3>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {!fleetActivity?.recent_activity?.length ? (
              <div className="text-center py-12 text-[var(--pz-text-muted)]">
                <Cpu size={32} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No recent device activity</p>
                <p className="text-xs mt-1.5 text-[var(--pz-text-faint)]">Waiting for device events...</p>
              </div>
            ) : (
              fleetActivity.recent_activity.slice(0, 12).map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface-2)]/20 hover:border-[var(--pz-border-strong)] transition-colors"
                >
                  <div className={`mt-0.5 p-1.5 rounded-lg ${
                    item.activity_type === 'attendance_push' ? 'bg-emerald-500/10 text-emerald-400' :
                    item.activity_type === 'heartbeat' ? 'bg-blue-500/10 text-blue-400' :
                    item.activity_type === 'device_disconnected' ? 'bg-red-500/10 text-red-400' :
                    item.activity_type === 'health_probe' ? 'bg-violet-500/10 text-violet-400' :
                    'bg-gray-500/10 text-gray-400'
                  }`}>
                    <Cpu size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--pz-text-secondary)]">
                      {item.activity_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">
                      {item.ip_address || 'Unknown IP'} · {new Date(item.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Activity Summary */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="pz-card p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <Activity size={18} className="text-cyan-400" />
            </div>
            <h3 className="text-base font-semibold tracking-tight text-[var(--pz-text)]">Activity Summary (24h)</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Heartbeats', key: 'heartbeat', color: 'blue' },
              { label: 'Attendance Pushes', key: 'attendance_push', color: 'emerald' },
              { label: 'Health Probes', key: 'health_probe', color: 'violet' },
              { label: 'Disconnections', key: 'device_disconnected', color: 'red' },
            ].map(({ label, key, color }) => (
              <div key={key} className="p-3 rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface-2)]/20">
                <p className="text-[10px] text-[var(--pz-text-muted)] font-semibold uppercase tracking-wider">{label}</p>
                <p className={`text-2xl font-bold mt-1 text-${color}-400`}>
                  {fleetActivity?.activity_counts?.[key] ?? 0}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
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

function StatusMiniCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, { bg: string; text: string; dot: string }> = {
    green: { bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
    gray: { bg: 'bg-gray-50 dark:bg-gray-900/50', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' },
    red: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  }
  const c = colorMap[color] || colorMap.gray
  return (
    <div className={`rounded-lg px-3 py-2 ${c.bg} border border-transparent`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className={`text-xl font-bold ${c.text}`}>{value}</p>
    </div>
  )
}
