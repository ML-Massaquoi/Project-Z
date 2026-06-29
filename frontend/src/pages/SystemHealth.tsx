import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Activity,
  Server,
  Clock,
  Users,
  Cpu,
  RefreshCcw,
  BarChart3,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Zap,
  Timer,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/api/client'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatsCard } from '@/components/dashboard/StatsCard'

interface MetricsSnapshot {
  uptime_seconds: number
  total_requests: number
  total_errors: number
  error_rate_percent: number
  status_codes: Record<string, number>
  endpoints: Record<
    string,
    {
      count: number
      error_count: number
      avg_latency_ms: number
      min_latency_ms: number
      max_latency_ms: number
      last_request_at: string
    }
  >
  websocket: {
    active_connections: number
    total_connected: number
  }
  worker_heartbeats: Record<string, string>
  custom_counters: Record<string, number>
}

interface SystemMetrics {
  devices: { total: number; online: number; offline: number }
  employees: { total: number }
  attendance: { today_sessions: number }
  users: { total: number }
  requests: MetricsSnapshot
  timestamp: string
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${days}d ${hours}h ${minutes}m`
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never'
  const diff = Date.now() - new Date(isoString).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export default function SystemHealth() {
  const [autoRefresh, setAutoRefresh] = useState(true)

  const { data: metrics, isLoading, refetch, dataUpdatedAt } = useQuery<SystemMetrics>({
    queryKey: ['system-metrics'],
    queryFn: async () => {
      const res = await api.get('/metrics')
      return res.data
    },
    refetchInterval: autoRefresh ? 10000 : false,
  })

  // Auto-refresh audit stats
  const { data: auditStats } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: async () => {
      const res = await api.get('/v1/audit-logs/stats')
      return res.data
    },
    refetchInterval: autoRefresh ? 30000 : false,
  })

  const { data: alertStats } = useQuery({
    queryKey: ['alert-stats'],
    queryFn: async () => {
      const res = await api.get('/v1/alerts/stats')
      return res.data
    },
    refetchInterval: autoRefresh ? 30000 : false,
  })

  const { data: deviceHealth } = useQuery({
    queryKey: ['device-health-overview'],
    queryFn: async () => {
      const res = await api.get('/v1/device-health/overview')
      return res.data
    },
    refetchInterval: autoRefresh ? 60000 : false,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCcw className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  const requests = metrics?.requests
  const workerStatuses = requests?.worker_heartbeats || {}
  const topEndpoints = Object.entries(requests?.endpoints || {})
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        description="Real-time observability dashboard for Project Z"
        icon={Activity}
        iconColor="#10B981"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                autoRefresh
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-surface-2 text-text-secondary border border-border hover:bg-[var(--pz-surface-3)]'
              }`}
            >
              {autoRefresh ? '● Live' : '○ Paused'}
            </button>
            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg border border-border bg-surface-2 hover:bg-[var(--pz-surface-3)] text-text-secondary transition-colors"
            >
              <RefreshCcw className="w-4 h-4 text-text-secondary" />
            </button>
          </div>
        }
      />

      {/* System Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Uptime"
          value={formatUptime(requests?.uptime_seconds || 0)}
          icon={Clock}
          color="#10B981"
        />
        <StatsCard
          title="Total Requests"
          value={requests?.total_requests?.toLocaleString() || '0'}
          icon={Globe}
          color="#3B82F6"
        />
        <StatsCard
          title="Error Rate"
          value={`${(requests?.error_rate_percent ?? 0).toFixed(2)}%`}
          icon={(requests?.error_rate_percent ?? 0) > 5 ? AlertTriangle : CheckCircle2}
          color={(requests?.error_rate_percent ?? 0) > 5 ? '#EF4444' : '#10B981'}
        />
        <StatsCard
          title="Active WebSockets"
          value={String(requests?.websocket?.active_connections || 0)}
          icon={Wifi}
          color="#8B5CF6"
        />
      </div>

      {/* Status Codes & Workers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Code Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface rounded-xl border border-border p-6"
        >
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            Status Code Distribution
          </h3>
          <div className="space-y-3">
            {Object.entries(requests?.status_codes || {}).map(([code, count]) => {
              const numericCode = parseInt(code)
              const is4xx = numericCode >= 400 && numericCode < 500
              const is5xx = numericCode >= 500
              const total = Object.values(requests?.status_codes || {}).reduce((a, b) => a + b, 0)
              const pct = total > 0 ? (count / total) * 100 : 0

              return (
                <div key={code} className="flex items-center gap-3">
                  <span
                    className={`w-12 text-center font-mono text-sm font-bold ${
                      is5xx ? 'text-red-400' : is4xx ? 'text-amber-400' : 'text-green-400'
                    }`}
                  >
                    {code}
                  </span>
                  <div className="flex-1 h-4 bg-surface-2 border border-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        is5xx ? 'bg-red-500' : is4xx ? 'bg-amber-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-sm font-medium text-text-secondary">
                    {count.toLocaleString()}
                  </span>
                </div>
              )
            })}
            {Object.keys(requests?.status_codes || {}).length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">No data yet</p>
            )}
          </div>
        </motion.div>

        {/* Worker Heartbeats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface rounded-xl border border-border p-6"
        >
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-purple-400" />
            Worker Heartbeats
          </h3>
          <div className="space-y-2">
            {Object.entries(workerStatuses).map(([worker, lastBeat]) => {
              const lastBeatTime = new Date(lastBeat).getTime()
              const ageSeconds = (Date.now() - lastBeatTime) / 1000
              const isStale = ageSeconds > 600 // 10 minutes

              return (
                <div key={worker} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    {isStale ? (
                      <WifiOff className="w-4 h-4 text-red-400" />
                    ) : (
                      <Wifi className="w-4 h-4 text-green-400" />
                    )}
                    <span className="text-sm font-medium text-text-secondary">{worker}</span>
                  </div>
                  <span className={`text-xs ${isStale ? 'text-red-400 font-medium' : 'text-text-muted'}`}>
                    {formatRelativeTime(lastBeat)}
                  </span>
                </div>
              )
            })}
            {Object.keys(workerStatuses).length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">No worker heartbeats recorded</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Top Endpoints */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-surface rounded-xl border border-border p-6"
      >
        <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          Top Endpoints by Request Count
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium text-text-muted">Endpoint</th>
                <th className="text-right py-2 px-3 font-medium text-text-muted">Requests</th>
                <th className="text-right py-2 px-3 font-medium text-text-muted">Errors</th>
                <th className="text-right py-2 px-3 font-medium text-text-muted">Avg Latency</th>
                <th className="text-right py-2 px-3 font-medium text-text-muted">P95 Latency</th>
                <th className="text-right py-2 px-3 font-medium text-text-muted">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {topEndpoints.map(([endpoint, stats]) => (
                <tr key={endpoint} className="border-b border-border hover:bg-[var(--pz-surface-3)] transition-colors">
                  <td className="py-2 px-3 font-mono text-xs text-text-secondary max-w-xs truncate">{endpoint}</td>
                  <td className="py-2 px-3 text-right font-medium text-text">{stats.count.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={stats.error_count > 0 ? 'text-red-400 font-medium' : 'text-text-muted'}>
                      {stats.error_count.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={stats.avg_latency_ms > 1000 ? 'text-amber-400 font-medium' : 'text-text-secondary'}>
                      {stats.avg_latency_ms.toFixed(1)}ms
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-text-secondary">
                    {stats.max_latency_ms.toFixed(1)}ms
                  </td>
                  <td className="py-2 px-3 text-right text-xs text-text-muted">
                    {formatRelativeTime(stats.last_request_at)}
                  </td>
                </tr>
              ))}
              {topEndpoints.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-text-muted">
                    No endpoint data recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Audit & Alert Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Audit Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-surface rounded-xl border border-border p-6"
        >
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            Audit Activity
          </h3>
          <div className="space-y-3 text-text-secondary">
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Last 24h Events</span>
              <span className="font-medium text-text">{auditStats?.last_24h?.total ?? 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Total Events</span>
              <span className="font-medium text-text">{auditStats?.total_events?.toLocaleString() ?? 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Unique Users (24h)</span>
              <span className="font-medium text-text">{auditStats?.last_24h?.unique_users ?? 'N/A'}</span>
            </div>
          </div>
        </motion.div>

        {/* Alert Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-surface rounded-xl border border-border p-6"
        >
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Active Alerts
          </h3>
          <div className="space-y-3 text-text-secondary">
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Active (Unread)</span>
              <span className="font-medium text-amber-400">{alertStats?.active_count ?? 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Critical</span>
              <span className="font-medium text-red-400">{alertStats?.by_severity?.critical ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Warning</span>
              <span className="font-medium text-amber-400">{alertStats?.by_severity?.warning ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Acknowledged (24h)</span>
              <span className="font-medium text-green-400">{alertStats?.acknowledged_count ?? 0}</span>
            </div>
          </div>
        </motion.div>

        {/* Device Fleet Health */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-surface rounded-xl border border-border p-6"
        >
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-400" />
            Device Fleet Health
          </h3>
          <div className="space-y-3 text-text-secondary">
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Healthy</span>
              <span className="font-medium text-green-400">
                {deviceHealth?.summary?.healthy ?? metrics?.devices?.online ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Degraded</span>
              <span className="font-medium text-amber-400">{deviceHealth?.summary?.degraded ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Critical</span>
              <span className="font-medium text-red-400">{deviceHealth?.summary?.critical ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Offline</span>
              <span className="font-medium text-text-muted">
                {deviceHealth?.summary?.offline ?? metrics?.devices?.offline ?? 0}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Last Updated */}
      {dataUpdatedAt && (
        <p className="text-xs text-text-muted text-center">
          Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
