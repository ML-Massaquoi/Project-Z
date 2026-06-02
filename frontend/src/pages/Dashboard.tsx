import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, UserCheck, Clock, UserX, Monitor,
  TrendingUp, TrendingDown, Fingerprint, Bell, ShieldAlert, Wifi, WifiOff, AlertTriangle
} from 'lucide-react'
import { dashboardAPI, attendanceAPI, devicesAPI } from '@/api/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { format } from 'date-fns'
import type { DashboardStats, DashboardChartData, AttendanceLog, Device } from '@/types'
import { StatCard, cardVariants } from '@/pages/dashboard/StatCard'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { ErrorState } from '@/components/ui/ErrorState'
import { useConnectionStore } from '@/stores/connectionStore'
import { useAlertStore } from '@/stores/alertStore'
import { AlertDrawer } from '@/components/dashboard/AlertDrawer'
import { WorkforceReadiness } from '@/components/dashboard/WorkforceReadiness'

const CHART_COLORS = ['#3B82F6', '#6366F1', '#06B6D4', '#10B981', '#F59E0B', '#EF4444']

// ── Skeleton ─────────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
}

export default function Dashboard() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const connectionStatus = useConnectionStore((s) => s.status)
  const lastHeartbeat = useConnectionStore((s) => s.lastHeartbeat)
  const alerts = useAlertStore((s) => s.alerts)
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => (await dashboardAPI.getStats()).data,
    refetchInterval: 30000,
    staleTime: 0,
    retry: 2,
  })

  // Fetch chart data
  const { data: charts, isLoading: chartsLoading } = useQuery<DashboardChartData>({
    queryKey: ['dashboard-charts'],
    queryFn: async () => (await dashboardAPI.getCharts()).data,
    refetchInterval: 60000,
  })

  // Fetch live attendance
  const { data: liveData } = useQuery({
    queryKey: ['attendance-live'],
    queryFn: async () => (await attendanceAPI.live({ limit: 8 })).data,
    refetchInterval: 15000,
  })

  // Fetch devices
  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await devicesAPI.list()).data,
    refetchInterval: 30000,
  })

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Operational Status Banner ── */}
      {connectionStatus !== 'connected' && (
        <div className={`p-3 rounded-lg border text-xs font-semibold flex items-center justify-between ${
          connectionStatus === 'replaying'
            ? 'bg-blue-950/20 text-blue-400 border-blue-500/20'
            : connectionStatus === 'reconnecting'
            ? 'bg-amber-950/20 text-amber-400 border-amber-500/20 animate-pulse'
            : 'bg-red-950/20 text-red-400 border-red-500/20'
        }`}>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                connectionStatus === 'replaying' ? 'bg-blue-400' : connectionStatus === 'reconnecting' ? 'bg-amber-400' : 'bg-red-400'
              }`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                connectionStatus === 'replaying' ? 'bg-blue-500' : connectionStatus === 'reconnecting' ? 'bg-amber-500' : 'bg-red-500'
              }`} />
            </span>
            <span>
              {connectionStatus === 'replaying'
                ? 'REPLAY Telemetry Recovery Active: Replaying missed clock-ins...'
                : connectionStatus === 'reconnecting'
                ? 'Biometric Handshake Interrupted: Reconnecting to terminal socket...'
                : 'Degraded Mode: Offline sync error. Stale operations state.'}
            </span>
          </div>
          {lastHeartbeat && (
            <span className="text-[10px] text-gray-500 font-mono">Last Sync: {format(new Date(lastHeartbeat), 'HH:mm:ss')}</span>
          )}
        </div>
      )}

      {/* ── Dashboard Header with Actions ── */}
      <div className="flex items-center justify-between bg-[#111827]/40 p-3.5 rounded-lg border border-slate-800">
        <div>
          <h2 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Operational Command Console</h2>
          <p className="text-[10px] text-gray-500">Real-time airport workforce readiness logs</p>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          className="relative flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-gray-200 transition-colors cursor-pointer"
        >
          <Bell size={14} className={unacknowledgedCount > 0 ? 'text-amber-400 animate-bounce' : 'text-gray-400'} />
          Alert Center
          {unacknowledgedCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center px-1">
              {unacknowledgedCount}
            </span>
          )}
        </button>
      </div>

      {/* ── KPI Cards Row ────────────────────────────────── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3"
      >
        {statsLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))
        ) : statsError ? (
          <div className="col-span-full">
            <ErrorState message="Failed to load stats" onRetry={refetchStats} />
          </div>
        ) : stats ? (
          <>
            <StatCard icon={Users} label="Total Employees" value={stats.total_employees} change={stats.trends.employees_change} color="#3B82F6" delay={0} />
            <StatCard icon={UserCheck} label="Present Today" value={stats.present_today} change={stats.trends.present_change} color="#10B981" delay={1} />
            <StatCard icon={Clock} label="Late Today" value={stats.late_today} change={stats.trends.late_change} color="#F59E0B" delay={2} />
            <StatCard icon={UserX} label="Absent Today" value={stats.absent_today} change={stats.trends.absent_change} color="#EF4444" delay={3} />
            <StatCard icon={Monitor} label="Active Devices" value={stats.active_devices} change={undefined} color="#6366F1" delay={4} />
          </>
        ) : null}
      </motion.div>

      {/* ── Live Workforce State Monitoring ── */}
      <div className="bg-[#111827]/20 border border-slate-800 p-4 rounded-lg space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Live Workforce State Telemetry</h3>
        <WorkforceReadiness />
      </div>

      {/* ── Charts Row ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Attendance Overview Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card p-4 lg:col-span-1 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Attendance Overview</h3>
            <span className="text-[10px] text-gray-400 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded font-medium">This Week</span>
          </div>
          {chartsLoading ? (
            <Skeleton className="w-full h-52" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={charts?.attendance_overview || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#111827', borderRadius: '8px', border: '1px solid #374151', color: '#F9FAFB', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }} />
                <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                <Line type="monotone" dataKey="present" stroke="#3B82F6" strokeWidth={2} dot={false} name="Present" />
                <Line type="monotone" dataKey="absent" stroke="#6B7280" strokeWidth={1.5} dot={false} name="Absent" />
                <Line type="monotone" dataKey="late" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="Late" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* Department Donut */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card p-4"
        >
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Attendance by Department</h3>
          {chartsLoading ? (
            <Skeleton className="w-full h-52" />
          ) : (
            <div className="flex flex-col items-center justify-between h-[220px]">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={charts?.department_breakdown || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    dataKey="count"
                    nameKey="department_name"
                    paddingAngle={3}
                  >
                    {(charts?.department_breakdown || []).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#111827', borderRadius: '8px', border: '1px solid #374151', color: '#F9FAFB' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2.5 justify-center overflow-y-auto max-h-[60px] pr-1">
                {(charts?.department_breakdown || []).slice(0, 4).map((dept, i) => (
                  <div key={dept.department_id} className="flex items-center gap-1 text-[10px] text-gray-300">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="truncate max-w-[80px]">{dept.department_name}</span> ({dept.percentage.toFixed(1)}%)
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Recent Attendance Feed */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card p-4"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Activity Feed</h3>
            <a href="/attendance" className="text-[10px] text-[var(--color-primary)] hover:text-blue-400 font-semibold uppercase tracking-wider hover:underline">View All</a>
          </div>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {liveData?.items?.length ? (
              liveData.items.slice(0, 8).map((log: AttendanceLog) => (
                <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/30 border-b border-slate-800/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[var(--color-primary)] border border-blue-500/20">
                    {log.employee_name?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">
                      {log.employee_name || 'Unknown'}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {log.department_name || 'No Department'}
                    </p>
                  </div>
                  <span className={log.punch_direction === 'in' ? 'badge-in' : 'badge-out'}>
                    {log.punch_direction === 'in' ? 'IN' : 'OUT'}
                  </span>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] font-semibold text-gray-300 font-mono">
                      {format(new Date(log.timestamp), 'hh:mm a')}
                    </p>
                    <p className="text-[9px] text-gray-500 truncate max-w-[70px]">
                      {log.device_name}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-gray-500">
                <Fingerprint size={28} className="mx-auto mb-2 opacity-20 animate-pulse" />
                <p className="text-xs">No active scan telemetry</p>
                <p className="text-[10px] mt-1 text-gray-500">Waiting for biometric push...</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Bottom Row ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's Attendance Table */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="card p-4 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today's Attendance Registry</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Employee</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Department</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Direction</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Time</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Terminal ID</th>
                </tr>
              </thead>
              <tbody>
                {liveData?.items?.length ? (
                  liveData.items.slice(0, 6).map((log: AttendanceLog) => (
                    <tr key={log.id} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 flex items-center justify-center text-[10px] font-bold text-[var(--color-primary)] border border-blue-500/20">
                            {log.employee_name?.[0]}
                          </div>
                          <span className="font-semibold text-gray-200">{log.employee_name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-gray-400">{log.department_name || '—'}</td>
                      <td className="py-2 px-3">
                        <span className={log.punch_direction === 'in' ? 'badge-in' : 'badge-out'}>
                          {log.punch_direction?.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-400 font-mono">
                        {format(new Date(log.timestamp), 'hh:mm a')}
                      </td>
                      <td className="py-2 px-3 text-gray-500 font-mono">{log.device_name || log.device_ip}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-gray-500">
                      <p className="text-xs">No active telemetry records registered today</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Device Status */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="card p-4"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Device Health Status</h3>
            <a href="/devices" className="text-[10px] text-[var(--color-primary)] hover:text-blue-400 font-semibold uppercase tracking-wider hover:underline">View All</a>
          </div>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {devicesData?.items?.length ? (
              devicesData.items.slice(0, 4).map((device: Device) => (
                <div key={device.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#111827]/50 border border-[var(--color-border)] hover:border-gray-700 transition-colors">
                  <div className="p-2 rounded bg-[#1F2937] border border-slate-800">
                    <Monitor size={14} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">
                      {device.name || `Device ${device.serial_number}`}
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono">{device.ip_address || device.serial_number}</p>
                  </div>
                  <span className={device.is_online ? 'badge-online' : 'badge-offline'}>
                    {device.is_online ? 'Online' : 'Offline'}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-gray-500">
                <Monitor size={28} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs">No registered biometric devices</p>
                <p className="text-[10px] mt-1 text-gray-500">Terminals register on network handshake</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
      <AlertDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
