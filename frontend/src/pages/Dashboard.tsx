import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, UserCheck, Clock, UserX, Monitor,
  TrendingUp, TrendingDown, Fingerprint,
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

const CHART_COLORS = ['#2563EB', '#6366F1', '#06B6D4', '#10B981', '#F59E0B', '#EF4444']

// ── Skeleton ─────────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
}

export default function Dashboard() {
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
    <div className="space-y-6 animate-fade-in">
      {/* ── KPI Cards Row ────────────────────────────────── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4"
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
            <StatCard icon={Users} label="Total Employees" value={stats.total_employees} change={stats.trends.employees_change} color="#2563EB" delay={0} />
            <StatCard icon={UserCheck} label="Present Today" value={stats.present_today} change={stats.trends.present_change} color="#10B981" delay={1} />
            <StatCard icon={Clock} label="Late Today" value={stats.late_today} change={stats.trends.late_change} color="#F59E0B" delay={2} />
            <StatCard icon={UserX} label="Absent Today" value={stats.absent_today} change={stats.trends.absent_change} color="#EF4444" delay={3} />
            <StatCard icon={Monitor} label="Active Devices" value={stats.active_devices} change={undefined} color="#6366F1" delay={4} />
          </>
        ) : null}
      </motion.div>

      {/* ── Charts Row ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Attendance Overview Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card p-5 lg:col-span-1"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--color-slate-800)]">Attendance Overview</h3>
            <span className="text-xs text-[var(--color-slate-400)] bg-[var(--color-slate-50)] px-2 py-1 rounded-md">This Week</span>
          </div>
          {chartsLoading ? (
            <Skeleton className="w-full h-52" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={charts?.attendance_overview || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Legend iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey="present" stroke="#2563EB" strokeWidth={2.5} dot={false} name="Present" />
                <Line type="monotone" dataKey="absent" stroke="#94A3B8" strokeWidth={2} dot={false} name="Absent" />
                <Line type="monotone" dataKey="late" stroke="#F59E0B" strokeWidth={2} dot={false} name="Late" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* Department Donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card p-5"
        >
          <h3 className="font-semibold text-[var(--color-slate-800)] mb-4">Attendance by Department</h3>
          {chartsLoading ? (
            <Skeleton className="w-full h-52" />
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={charts?.department_breakdown || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="count"
                    nameKey="department_name"
                    paddingAngle={3}
                  >
                    {(charts?.department_breakdown || []).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {(charts?.department_breakdown || []).slice(0, 5).map((dept, i) => (
                  <div key={dept.department_id} className="flex items-center gap-1.5 text-xs text-[var(--color-slate-500)]">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    {dept.department_name} ({dept.percentage}%)
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Recent Attendance Feed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--color-slate-800)]">Recent Attendance</h3>
            <a href="/attendance" className="text-xs text-[var(--color-primary)] font-medium hover:underline">View All</a>
          </div>
          <div className="space-y-3 max-h-[280px] overflow-y-auto">
            {liveData?.items?.length ? (
              liveData.items.map((log: AttendanceLog) => (
                <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--color-slate-50)] transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--color-primary-light)] to-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-[var(--color-primary)]">
                      {log.employee_name?.[0] || '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-slate-700)] truncate">
                      {log.employee_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-[var(--color-slate-400)] truncate">
                      {log.department_name || 'No Department'}
                    </p>
                  </div>
                  <span className={log.punch_direction === 'in' ? 'badge-in' : 'badge-out'}>
                    {log.punch_direction === 'in' ? 'IN' : 'OUT'}
                  </span>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-[var(--color-slate-600)]">
                      {format(new Date(log.timestamp), 'hh:mm a')}
                    </p>
                    <p className="text-[10px] text-[var(--color-slate-400)]">
                      {log.device_ip || log.device_name}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-[var(--color-slate-400)]">
                <Fingerprint size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No attendance records yet</p>
                <p className="text-xs mt-1">Records will appear when devices push data</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Bottom Row ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's Attendance Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="card p-5 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--color-slate-800)]">Today's Attendance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider">Employee</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider">Department</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider">Time</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider">Device</th>
                </tr>
              </thead>
              <tbody>
                {liveData?.items?.length ? (
                  liveData.items.slice(0, 6).map((log: AttendanceLog) => (
                    <tr key={log.id} className="border-b border-[var(--color-slate-50)] hover:bg-[var(--color-slate-50)] transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                            <span className="text-xs font-semibold text-[var(--color-primary)]">{log.employee_name?.[0]}</span>
                          </div>
                          <span className="font-medium text-[var(--color-slate-700)]">{log.employee_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-[var(--color-slate-500)]">{log.department_name || '—'}</td>
                      <td className="py-3 px-3">
                        <span className={log.punch_direction === 'in' ? 'badge-in' : 'badge-out'}>
                          {log.punch_direction?.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[var(--color-slate-500)]">
                        {format(new Date(log.timestamp), 'hh:mm a')}
                      </td>
                      <td className="py-3 px-3 text-[var(--color-slate-400)] text-xs">{log.device_ip || log.device_name}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[var(--color-slate-400)]">
                      <p className="text-sm">No attendance data for today</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Device Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--color-slate-800)]">Device Status</h3>
            <a href="/devices" className="text-xs text-[var(--color-primary)] font-medium hover:underline">View All</a>
          </div>
          <div className="space-y-3">
            {devicesData?.items?.length ? (
              devicesData.items.slice(0, 5).map((device: Device) => (
                <div key={device.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-slate-50)] border border-[var(--color-border)]">
                  <div className="p-2 rounded-lg bg-white">
                    <Monitor size={18} className="text-[var(--color-slate-500)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-slate-700)] truncate">
                      {device.name || `Device ${device.serial_number}`}
                    </p>
                    <p className="text-xs text-[var(--color-slate-400)]">{device.ip_address || device.serial_number}</p>
                  </div>
                  <span className={device.is_online ? 'badge-online' : 'badge-offline'}>
                    {device.is_online ? 'Online' : 'Offline'}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-[var(--color-slate-400)]">
                <Monitor size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No devices registered</p>
                <p className="text-xs mt-1">Devices auto-register when they connect</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
