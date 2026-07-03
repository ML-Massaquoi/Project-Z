import { useState } from 'react'
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
import { Section } from '@/components/ui/CardSection'

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

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--pz-text-muted)',
    marginTop: '4px',
    marginBottom: 0,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  summaryCard: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  iconBox: (gradient: string): React.CSSProperties => ({
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    background: gradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--pz-text-muted)',
    margin: '4px 0 0',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--pz-text)',
    margin: 0,
  },
  statusList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  statusCode: (is5xx: boolean, is4xx: boolean): React.CSSProperties => ({
    width: '48px',
    textAlign: 'center' as const,
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 700,
    color: is5xx ? '#EF4444' : is4xx ? '#F59E0B' : '#10B981',
  }),
  barBg: {
    flex: 1,
    height: '16px',
    background: 'var(--pz-surface-2)',
    border: '1px solid var(--pz-border)',
    borderRadius: '9999px',
    overflow: 'hidden',
  },
  barFill: (is5xx: boolean, is4xx: boolean): React.CSSProperties => ({
    height: '100%',
    borderRadius: '9999px',
    background: is5xx ? '#EF4444' : is4xx ? '#F59E0B' : '#10B981',
    transition: 'width 0.5s',
  }),
  barCount: {
    width: '64px',
    textAlign: 'right' as const,
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--pz-text-secondary)',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '16px 0',
  },
  emptyText: {
    fontSize: '14px',
    color: 'var(--pz-text-muted)',
    margin: 0,
  },
  workerList: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  workerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid var(--pz-border)',
  },
  workerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  workerName: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--pz-text-secondary)',
  },
  workerBeat: (isStale: boolean): React.CSSProperties => ({
    fontSize: '12px',
    color: isStale ? '#EF4444' : 'var(--pz-text-muted)',
    fontWeight: isStale ? 500 : 400,
  }),
  overflowX: {
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    fontSize: '14px',
    borderCollapse: 'collapse' as const,
  },
  tableHeadCell: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    fontWeight: 500,
    color: 'var(--pz-text-muted)',
    fontSize: '12px',
    borderBottom: '1px solid var(--pz-border)',
  },
  tableHeadCellRight: {
    textAlign: 'right' as const,
    padding: '8px 12px',
    fontWeight: 500,
    color: 'var(--pz-text-muted)',
    fontSize: '12px',
    borderBottom: '1px solid var(--pz-border)',
  },
  endpointCell: {
    padding: '8px 12px',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: 'var(--pz-text-secondary)',
    maxWidth: '240px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    borderBottom: '1px solid var(--pz-border)',
  },
  tdRight: {
    padding: '8px 12px',
    textAlign: 'right' as const,
    borderBottom: '1px solid var(--pz-border)',
    fontWeight: 500,
    color: 'var(--pz-text)',
  },
  tdRightSecondary: {
    padding: '8px 12px',
    textAlign: 'right' as const,
    borderBottom: '1px solid var(--pz-border)',
    color: 'var(--pz-text-secondary)',
  },
  tdRightMuted: {
    padding: '8px 12px',
    textAlign: 'right' as const,
    borderBottom: '1px solid var(--pz-border)',
    fontSize: '12px',
    color: 'var(--pz-text-muted)',
  },
  detailGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: '14px',
    color: 'var(--pz-text-muted)',
  },
  detailValue: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--pz-text)',
  },
  lastUpdated: {
    fontSize: '12px',
    color: 'var(--pz-text-muted)',
    textAlign: 'center' as const,
    margin: 0,
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '256px',
  },
  grid2col: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '24px',
  },
  grid3col: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '24px',
  },
}

export default function SystemHealth() {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [hoveredToggle, setHoveredToggle] = useState(false)
  const [hoveredRefresh, setHoveredRefresh] = useState(false)
  const [hoveredEndpoint, setHoveredEndpoint] = useState<string | null>(null)

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
      <div style={s.loadingContainer}>
        <RefreshCcw size={24} style={{ animation: 'spin 1s linear infinite', color: '#3B82F6' }} />
      </div>
    )
  }

  const requests = metrics?.requests
  const workerStatuses = requests?.worker_heartbeats || {}
  const topEndpoints = Object.entries(requests?.endpoints || {})
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)

  const errorRateHigh = (requests?.error_rate_percent ?? 0) > 5

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>System Health</h1>
          <p style={s.subtitle}>Real-time observability dashboard for Project Z</p>
        </div>
        <div style={s.headerActions}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.12s',
              border: autoRefresh ? '1px solid rgba(16,185,129,0.2)' : '1px solid var(--pz-border)',
              background: hoveredToggle
                ? (autoRefresh ? 'rgba(16,185,129,0.15)' : 'var(--pz-surface-3)')
                : (autoRefresh ? 'rgba(16,185,129,0.08)' : 'var(--pz-surface-2)'),
              color: autoRefresh ? '#10B981' : 'var(--pz-text-secondary)',
            }}
            onMouseEnter={() => setHoveredToggle(true)}
            onMouseLeave={() => setHoveredToggle(false)}
          >
            {autoRefresh ? '● Live' : '○ Paused'}
          </button>
          <button
            onClick={() => refetch()}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              border: '1px solid var(--pz-border)',
              background: hoveredRefresh ? 'var(--pz-surface-3)' : 'var(--pz-surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.12s',
            }}
            onMouseEnter={() => setHoveredRefresh(true)}
            onMouseLeave={() => setHoveredRefresh(false)}
          >
            <RefreshCcw size={16} style={{ color: 'var(--pz-text-secondary)' }} />
          </button>
        </div>
      </div>

      {/* System Overview Cards */}
      <div style={s.summaryGrid}>
        <div style={s.summaryCard}>
          <div style={s.iconBox('linear-gradient(135deg, #10B981, #059669)')}>
            <Clock size={18} style={{ color: '#fff' }} />
          </div>
          <div>
            <p style={s.statValue}>{formatUptime(requests?.uptime_seconds || 0)}</p>
            <p style={s.statLabel}>Uptime</p>
          </div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.iconBox('linear-gradient(135deg, #3B82F6, #2563EB)')}>
            <Globe size={18} style={{ color: '#fff' }} />
          </div>
          <div>
            <p style={s.statValue}>{requests?.total_requests?.toLocaleString() || '0'}</p>
            <p style={s.statLabel}>Total Requests</p>
          </div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.iconBox(
            errorRateHigh
              ? 'linear-gradient(135deg, #EF4444, #DC2626)'
              : 'linear-gradient(135deg, #10B981, #059669)'
          )}>
            {errorRateHigh
              ? <AlertTriangle size={18} style={{ color: '#fff' }} />
              : <CheckCircle2 size={18} style={{ color: '#fff' }} />
            }
          </div>
          <div>
            <p style={s.statValue}>{`${(requests?.error_rate_percent ?? 0).toFixed(2)}%`}</p>
            <p style={s.statLabel}>Error Rate</p>
          </div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.iconBox('linear-gradient(135deg, #8B5CF6, #6D28D9)')}>
            <Wifi size={18} style={{ color: '#fff' }} />
          </div>
          <div>
            <p style={s.statValue}>{String(requests?.websocket?.active_connections || 0)}</p>
            <p style={s.statLabel}>Active WebSockets</p>
          </div>
        </div>
      </div>

      {/* Status Codes & Workers */}
      <div style={s.grid2col}>
        {/* Status Code Distribution */}
        <Section delay={0}>
          <div style={s.sectionHeader}>
            <BarChart3 size={20} style={{ color: '#60A5FA' }} />
            <h3 style={s.sectionTitle}>Status Code Distribution</h3>
          </div>
          <div style={s.statusList}>
            {Object.entries(requests?.status_codes || {}).map(([code, count]) => {
              const numericCode = parseInt(code)
              const is4xx = numericCode >= 400 && numericCode < 500
              const is5xx = numericCode >= 500
              const total = Object.values(requests?.status_codes || {}).reduce((a, b) => a + b, 0)
              const pct = total > 0 ? (count / total) * 100 : 0

              return (
                <div key={code} style={s.statusRow}>
                  <span style={s.statusCode(is5xx, is4xx)}>
                    {code}
                  </span>
                  <div style={s.barBg}>
                    <div style={{ ...s.barFill(is5xx, is4xx), width: `${pct}%` }} />
                  </div>
                  <span style={s.barCount}>
                    {count.toLocaleString()}
                  </span>
                </div>
              )
            })}
            {Object.keys(requests?.status_codes || {}).length === 0 && (
              <div style={s.emptyState}>
                <p style={s.emptyText}>No data yet</p>
              </div>
            )}
          </div>
        </Section>

        {/* Worker Heartbeats */}
        <Section delay={0.1}>
          <div style={s.sectionHeader}>
            <Cpu size={20} style={{ color: '#A78BFA' }} />
            <h3 style={s.sectionTitle}>Worker Heartbeats</h3>
          </div>
          <div style={s.workerList}>
            {Object.entries(workerStatuses).map(([worker, lastBeat], idx, arr) => {
              const lastBeatTime = new Date(lastBeat).getTime()
              const ageSeconds = (Date.now() - lastBeatTime) / 1000
              const isStale = ageSeconds > 600
              const isLast = idx === arr.length - 1

              return (
                <div key={worker} style={isLast ? {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                } : s.workerRow}>
                  <div style={s.workerInfo}>
                    {isStale ? (
                      <WifiOff size={16} style={{ color: '#EF4444', flexShrink: 0 }} />
                    ) : (
                      <Wifi size={16} style={{ color: '#10B981', flexShrink: 0 }} />
                    )}
                    <span style={s.workerName}>{worker}</span>
                  </div>
                  <span style={s.workerBeat(isStale)}>
                    {formatRelativeTime(lastBeat)}
                  </span>
                </div>
              )
            })}
            {Object.keys(workerStatuses).length === 0 && (
              <div style={s.emptyState}>
                <p style={s.emptyText}>No worker heartbeats recorded</p>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* Top Endpoints */}
      <Section delay={0.2}>
        <div style={s.sectionHeader}>
          <Zap size={20} style={{ color: '#FBBF24' }} />
          <h3 style={s.sectionTitle}>Top Endpoints by Request Count</h3>
        </div>
        <div style={s.overflowX}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.tableHeadCell}>Endpoint</th>
                <th style={s.tableHeadCellRight}>Requests</th>
                <th style={s.tableHeadCellRight}>Errors</th>
                <th style={s.tableHeadCellRight}>Avg Latency</th>
                <th style={s.tableHeadCellRight}>P95 Latency</th>
                <th style={s.tableHeadCellRight}>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {topEndpoints.map(([endpoint, stats]) => (
                <tr
                  key={endpoint}
                  style={{
                    background: hoveredEndpoint === endpoint ? 'var(--pz-surface-3)' : 'transparent',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={() => setHoveredEndpoint(endpoint)}
                  onMouseLeave={() => setHoveredEndpoint(null)}
                >
                  <td style={s.endpointCell}>{endpoint}</td>
                  <td style={s.tdRight}>{stats.count.toLocaleString()}</td>
                  <td style={{
                    ...s.tdRight,
                    color: stats.error_count > 0 ? '#EF4444' : 'var(--pz-text-muted)',
                    fontWeight: stats.error_count > 0 ? 500 : 400,
                  }}>
                    {stats.error_count.toLocaleString()}
                  </td>
                  <td style={{
                    ...s.tdRight,
                    color: stats.avg_latency_ms > 1000 ? '#F59E0B' : 'var(--pz-text-secondary)',
                    fontWeight: stats.avg_latency_ms > 1000 ? 500 : 400,
                  }}>
                    {stats.avg_latency_ms.toFixed(1)}ms
                  </td>
                  <td style={s.tdRightSecondary}>
                    {stats.max_latency_ms.toFixed(1)}ms
                  </td>
                  <td style={s.tdRightMuted}>
                    {formatRelativeTime(stats.last_request_at)}
                  </td>
                </tr>
              ))}
              {topEndpoints.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--pz-text-muted)' }}>
                    No endpoint data recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Audit & Alert Stats Row */}
      <div style={s.grid3col}>
        {/* Audit Stats */}
        <Section delay={0.3}>
          <div style={s.sectionHeader}>
            <CheckCircle2 size={20} style={{ color: '#34D399' }} />
            <h3 style={s.sectionTitle}>Audit Activity</h3>
          </div>
          <div style={s.detailGroup}>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Last 24h Events</span>
              <span style={s.detailValue}>{auditStats?.last_24h?.total ?? 'N/A'}</span>
            </div>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Total Events</span>
              <span style={s.detailValue}>{auditStats?.total_events?.toLocaleString() ?? 'N/A'}</span>
            </div>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Unique Users (24h)</span>
              <span style={s.detailValue}>{auditStats?.last_24h?.unique_users ?? 'N/A'}</span>
            </div>
          </div>
        </Section>

        {/* Alert Stats */}
        <Section delay={0.35}>
          <div style={s.sectionHeader}>
            <AlertTriangle size={20} style={{ color: '#FBBF24' }} />
            <h3 style={s.sectionTitle}>Active Alerts</h3>
          </div>
          <div style={s.detailGroup}>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Active (Unread)</span>
              <span style={{ ...s.detailValue, color: '#F59E0B' }}>{alertStats?.active_count ?? 'N/A'}</span>
            </div>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Critical</span>
              <span style={{ ...s.detailValue, color: '#EF4444' }}>{alertStats?.by_severity?.critical ?? 0}</span>
            </div>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Warning</span>
              <span style={{ ...s.detailValue, color: '#F59E0B' }}>{alertStats?.by_severity?.warning ?? 0}</span>
            </div>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Acknowledged (24h)</span>
              <span style={{ ...s.detailValue, color: '#10B981' }}>{alertStats?.acknowledged_count ?? 0}</span>
            </div>
          </div>
        </Section>

        {/* Device Fleet Health */}
        <Section delay={0.4}>
          <div style={s.sectionHeader}>
            <Server size={20} style={{ color: '#60A5FA' }} />
            <h3 style={s.sectionTitle}>Device Fleet Health</h3>
          </div>
          <div style={s.detailGroup}>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Healthy</span>
              <span style={{ ...s.detailValue, color: '#10B981' }}>
                {deviceHealth?.summary?.healthy ?? metrics?.devices?.online ?? 0}
              </span>
            </div>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Degraded</span>
              <span style={{ ...s.detailValue, color: '#F59E0B' }}>{deviceHealth?.summary?.degraded ?? 0}</span>
            </div>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Critical</span>
              <span style={{ ...s.detailValue, color: '#EF4444' }}>{deviceHealth?.summary?.critical ?? 0}</span>
            </div>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Offline</span>
              <span style={{ ...s.detailValue, color: 'var(--pz-text-muted)' }}>
                {deviceHealth?.summary?.offline ?? metrics?.devices?.offline ?? 0}
              </span>
            </div>
          </div>
        </Section>
      </div>

      {/* Last Updated */}
      {dataUpdatedAt && (
        <p style={s.lastUpdated}>
          Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
