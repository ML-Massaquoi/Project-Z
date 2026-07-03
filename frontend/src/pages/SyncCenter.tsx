import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, Users, Monitor, CheckCircle2, XCircle,
  AlertTriangle, Clock, Search, Filter, Download,
  ArrowUpDown, Eye, RotateCcw, Zap, Building2,
  ChevronDown, Loader2,
} from 'lucide-react'
import { syncAPI, devicesAPI, employeesAPI } from '@/api/client'
import { Section } from '@/components/ui/CardSection'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmployeeSyncDrawer } from '@/components/sync/EmployeeSyncDrawer'
import { DeviceSyncDrawer } from '@/components/sync/DeviceSyncDrawer'
import type {
  SyncOverview, SyncMatrixEmployee, SyncMatrix,
  PendingSync, SyncLog, Device,
} from '@/types'

type BadgeStatus = 'online' | 'offline' | 'active' | 'inactive' | 'present' | 'late' | 'absent' |
  'on_time' | 'early_departure' | 'overtime' | 'in' | 'out' | 'unknown' |
  'warning' | 'danger' | 'info' | 'success' | 'pending' | 'processing' | 'failed' |
  'synced' | 'degraded' | 'critical'

function mapSyncHealth(health: string): BadgeStatus {
  if (health === 'healthy') return 'synced'
  if (health === 'degraded') return 'degraded'
  if (health === 'critical') return 'critical'
  return 'unknown'
}

function mapSyncStatus(status: string): BadgeStatus {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'failed'
  if (status === 'running') return 'processing'
  if (status === 'partial') return 'warning'
  return 'pending'
}

type Tab = 'overview' | 'employees' | 'devices' | 'activity'

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
  tabBar: {
    display: 'flex',
    gap: '4px',
    padding: '3px',
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
  },
  tab: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    flex: 1,
    padding: '9px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    border: active ? '1px solid var(--pz-border-strong)' : 'none',
    background: active ? 'var(--pz-surface-2)' : 'transparent',
    color: active ? 'var(--pz-text)' : 'var(--pz-text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }),
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '12px',
  },
  summaryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '20px',
  },
  summaryIcon: (bg: string) => ({
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    background: bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  summaryValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
    lineHeight: 1.1,
  },
  summaryLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--pz-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    margin: '2px 0 0 0',
  },
  section: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '20px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--pz-text)',
    margin: 0,
  },
  progressBar: {
    width: '100%',
    height: '10px',
    background: 'var(--pz-surface-2)',
    borderRadius: '5px',
    overflow: 'hidden',
  },
  progressFill: (width: number, color: string) => ({
    height: '100%',
    borderRadius: '5px',
    background: color,
    width: `${width}%`,
    transition: 'all 0.5s ease',
  }),
  cardGrid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginTop: '12px',
  },
  miniCard: {
    padding: '12px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--pz-border)',
  },
  pendingCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid var(--pz-border)',
    background: 'rgba(255,255,255,0.02)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  searchInput: {
    height: '38px',
    paddingLeft: '34px',
    paddingRight: '12px',
    fontSize: '13px',
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    color: 'var(--pz-text)',
    outline: 'none',
    width: '100%',
  },
  selectInput: {
    height: '38px',
    padding: '0 12px',
    fontSize: '13px',
    borderRadius: '10px',
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    color: 'var(--pz-text-secondary)',
    outline: 'none',
  },
  table: {
    width: '100%',
    fontSize: '13px',
    borderCollapse: 'collapse' as const,
  },
  tableHeader: {
    textAlign: 'left' as const,
    padding: '12px 16px',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--pz-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    borderBottom: '1px solid var(--pz-border)',
    background: 'rgba(255,255,255,0.02)',
  },
  tableCell: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    color: 'var(--pz-text-secondary)',
  },
  tableRow: {
    transition: 'background 0.15s ease',
    cursor: 'pointer' as const,
  },
  emptyState: {
    padding: '60px 20px',
    textAlign: 'center' as const,
    color: 'var(--pz-text-muted)',
  },
  deviceCard: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '20px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  kpiPill: (bg: string, color: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '20px',
    fontSize: '10px',
    fontWeight: 600,
    background: bg,
    color,
    border: 'none',
  }),
}

export default function SyncCenter() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const queryClient = useQueryClient()

  // ── Data Fetching ────────────────────────────────────────
  const { data: overview, isLoading: overviewLoading } = useQuery<SyncOverview>({
    queryKey: ['sync-overview'],
    queryFn: async () => (await syncAPI.overview()).data,
    refetchInterval: 30000,
  })

  const { data: matrix, isLoading: matrixLoading } = useQuery<SyncMatrix>({
    queryKey: ['sync-matrix'],
    queryFn: async () => (await syncAPI.matrix()).data,
    refetchInterval: 30000,
  })

  const { data: pendingData } = useQuery<{ devices: PendingSync[] }>({
    queryKey: ['sync-pending'],
    queryFn: async () => (await syncAPI.pending()).data,
    refetchInterval: 15000,
  })

  const { data: logsData } = useQuery<{ items: SyncLog[] }>({
    queryKey: ['sync-logs', dateFrom, dateTo],
    queryFn: async () => (await syncAPI.logs({
      per_page: 50,
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo + 'T23:59:59' } : {}),
    })).data,
    refetchInterval: 15000,
  })

  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await devicesAPI.list()).data,
  })
  const devices: Device[] = devicesData?.items ?? []

  // ── Mutations ────────────────────────────────────────────
  const bulkSyncMutation = useMutation({
    mutationFn: () => syncAPI.bulkSyncAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-overview'] })
      queryClient.invalidateQueries({ queryKey: ['sync-matrix'] })
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] })
    },
  })

  const retryAllMutation = useMutation({
    mutationFn: () => syncAPI.retryAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-overview'] })
      queryClient.invalidateQueries({ queryKey: ['sync-pending'] })
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] })
    },
  })

  const bulkEmployeesMutation = useMutation({
    mutationFn: (employeeIds: string[]) => syncAPI.bulkSyncEmployees(employeeIds),
    onSuccess: () => {
      setSelectedEmployees(new Set())
      queryClient.invalidateQueries({ queryKey: ['sync-matrix'] })
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] })
    },
  })

  // ── Filtered Employees ───────────────────────────────────
  const filteredEmployees = (matrix?.employees ?? []).filter((emp) => {
    const matchesSearch = !search ||
      emp.employee_name.toLowerCase().includes(search.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'synced' && emp.sync_health === 'healthy') ||
      (statusFilter === 'partial' && emp.sync_health === 'degraded') ||
      (statusFilter === 'unsynced' && emp.sync_health === 'critical')
    return matchesSearch && matchesStatus
  })

  const toggleEmployeeSelection = useCallback((id: string) => {
    setSelectedEmployees(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAllEmployees = useCallback(() => {
    if (selectedEmployees.size === filteredEmployees.length) {
      setSelectedEmployees(new Set())
    } else {
      setSelectedEmployees(new Set(filteredEmployees.map(e => e.employee_id)))
    }
  }, [filteredEmployees, selectedEmployees.size])

  const tabs: { key: Tab; label: string; icon: typeof RefreshCw }[] = [
    { key: 'overview', label: 'Overview', icon: RefreshCw },
    { key: 'employees', label: 'Employee Sync', icon: Users },
    { key: 'devices', label: 'Device Sync', icon: Monitor },
    { key: 'activity', label: 'Activity Log', icon: Clock },
  ]

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Synchronization Center</h1>
          <p style={s.headerSubtitle}>Centralized biometric authority — manage device synchronization</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => retryAllMutation.mutate()}
            disabled={retryAllMutation.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: '10px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#F59E0B', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', opacity: retryAllMutation.isPending ? 0.5 : 1 }}
          >
            <RotateCcw size={15} />
            Retry Failed
          </button>
          <button
            onClick={() => bulkSyncMutation.mutate()}
            disabled={bulkSyncMutation.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10B981', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', opacity: bulkSyncMutation.isPending ? 0.5 : 1 }}
          >
            <Zap size={15} />
            {bulkSyncMutation.isPending ? 'Syncing...' : 'Sync All Devices'}
          </button>
        </div>
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────── */}
      <div style={s.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={s.tab(activeTab === tab.key)}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
          >
            {/* Summary Cards */}
            <div style={s.summaryRow}>
              {[
                { icon: Users, bg: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))', color: '#3B82F6', label: 'Total Employees', value: overview?.total_provisioned ?? '—' },
                { icon: Monitor, bg: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(129,140,248,0.2))', color: '#6366F1', label: 'Active Devices', value: overview?.total_devices ?? '—' },
                { icon: CheckCircle2, bg: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(52,211,153,0.2))', color: '#10B981', label: 'Templates Stored', value: overview?.total_templates_stored ?? '—' },
                { icon: AlertTriangle, bg: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.2))', color: '#F59E0B', label: 'Pending Syncs', value: overview?.total_pending_sync ?? '—' },
                { icon: XCircle, bg: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(248,113,113,0.2))', color: '#EF4444', label: 'Failed Syncs', value: overview?.total_failed_syncs ?? '—' },
              ].map(({ icon: Icon, bg, color, label, value }) => (
                <div key={label} style={s.summaryCard}>
                  <div style={s.summaryIcon(bg)}>
                    <Icon size={18} color={color} />
                  </div>
                  <div>
                    <p style={s.summaryValue}>{value}</p>
                    <p style={s.summaryLabel}>{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Sync Progress Overview */}
            {overview && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={s.section}
              >
                <div style={s.sectionHeader}>
                  <Loader2 size={16} color="#3B82F6" />
                  <h3 style={s.sectionTitle}>Sync Health</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Overall Progress */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>Overall Sync Progress</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)' }}>
                        {overview.total_provisioned > 0
                          ? Math.round(((overview.total_templates_stored ?? 0) / (overview.total_provisioned * 10)) * 100)
                          : 0}%
                      </span>
                    </div>
                    <div style={s.progressBar}>
                      <div style={s.progressFill(
                        overview.total_provisioned > 0
                          ? Math.min(100, Math.round(((overview.total_templates_stored ?? 0) / (overview.total_provisioned * 10)) * 100))
                          : 0,
                        'linear-gradient(90deg, #10B981, #3B82F6)'
                      )} />
                    </div>
                  </div>
                  {/* Device Sync Status Bars */}
                  {matrix?.devices && matrix.devices.length > 0 && (
                    <div style={s.cardGrid3}>
                      {matrix.devices.map((dev) => {
                        const syncedCount = matrix.employees.filter(e => {
                          const deviceEntry = e.device_status.find((d: { device_id: string }) => d.device_id === dev.device_id)
                          return deviceEntry?.status === 'synced'
                        }).length
                        const totalCount = matrix.employees.length
                        const pct = totalCount > 0 ? Math.round((syncedCount / totalCount) * 100) : 0
                        return (
                          <div key={dev.device_id} style={s.miniCard}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)' }}>{dev.device_name || 'Device'}</span>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-secondary)' }}>{pct}%</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: 'var(--pz-surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: '3px', width: `${pct}%`, background: pct === 100 ? '#10B981' : pct > 50 ? '#F59E0B' : '#EF4444', transition: 'width 0.5s ease' }} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                              <span style={{ fontSize: '9px', color: 'var(--pz-text-faint)' }}>{syncedCount}/{totalCount} synced</span>
                              <StatusBadge status={dev.is_online ? 'online' : 'offline'} size="xs" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Pending Devices */}
            {pendingData?.devices && pendingData.devices.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={s.section}
              >
                <div style={{ ...s.sectionHeader, gap: '8px' }}>
                  <AlertTriangle size={16} color="#F59E0B" />
                  <h3 style={s.sectionTitle}>Pending Synchronizations</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {pendingData.devices.map((dev) => (
                    <div key={dev.device_id} style={s.pendingCard}>
                      <div style={{ padding: '8px', borderRadius: '8px', background: dev.is_online ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: dev.is_online ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)' }}>
                        <Monitor size={14} color={dev.is_online ? '#10B981' : '#EF4444'} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', margin: 0 }}>{dev.device_name}</p>
                        <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', fontFamily: 'monospace', margin: 0 }}>{dev.serial_number}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '10px', fontWeight: 600 }}>
                        {dev.pending_users > 0 && <span style={{ color: '#F59E0B' }}>{dev.pending_users} pending users</span>}
                        {dev.pending_templates > 0 && <span style={{ color: '#F59E0B' }}>{dev.pending_templates} pending templates</span>}
                        {dev.failed_syncs > 0 && <span style={{ color: '#EF4444' }}>{dev.failed_syncs} failed</span>}
                      </div>
                      <StatusBadge status={dev.is_online ? 'online' : 'offline'} size="xs" />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Sync Matrix Preview */}
            <Section delay={0.1}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={s.sectionHeader}>
                  <ArrowUpDown size={16} color="#3B82F6" />
                  <h3 style={s.sectionTitle}>Sync Matrix Overview</h3>
                </div>
                <button
                  onClick={() => setActiveTab('employees')}
                  style={{ fontSize: '12px', color: '#3B82F6', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer' }}
                >
                  View Full Matrix →
                </button>
              </div>
              {matrix?.devices && matrix.devices.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={{ ...s.tableHeader, textAlign: 'left' }}>Employee</th>
                        {matrix.devices.map((d) => (
                          <th key={d.device_id} style={{ ...s.tableHeader, textAlign: 'center', minWidth: '80px', fontSize: '10px' }}>
                            {d.device_name?.slice(0, 8) || 'Device'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.employees.slice(0, 5).map((emp) => (
                        <tr key={emp.employee_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '8px 12px', color: 'var(--pz-text-secondary)', fontWeight: 500, fontSize: '12px' }}>{emp.employee_name}</td>
                          {emp.device_status.map((ds) => (
                            <td key={ds.device_id} style={{ textAlign: 'center', padding: '8px 8px' }}>
                              <div style={{ width: '20px', height: '20px', borderRadius: '4px', margin: '0 auto', background: ds.status === 'synced' ? 'rgba(16,185,129,0.2)' : 'var(--pz-surface-2)', border: ds.status === 'synced' ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--pz-border)' }}>
                                {ds.status === 'synced' && <CheckCircle2 size={12} color="#10B981" style={{ margin: '3px auto' }} />}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {matrix.employees.length > 5 && (
                    <p style={{ textAlign: 'center', fontSize: '10px', color: 'var(--pz-text-muted)', marginTop: '8px' }}>
                      Showing 5 of {matrix.employees.length} employees
                    </p>
                  )}
                </div>
              )}
            </Section>
          </motion.div>
        )}

        {activeTab === 'employees' && (
          <motion.div
            key="employees"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {/* Toolbar */}
            <div style={s.toolbar}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--pz-text-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={s.searchInput}
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={s.selectInput}
              >
                <option value="all">All Status</option>
                <option value="synced">Synced</option>
                <option value="partial">Partial</option>
                <option value="unsynced">Unsynced</option>
              </select>
              {selectedEmployees.size > 0 && (
                <button
                  onClick={() => bulkEmployeesMutation.mutate(Array.from(selectedEmployees))}
                  disabled={bulkEmployeesMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#3B82F6', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', opacity: bulkEmployeesMutation.isPending ? 0.5 : 1 }}
                >
                  <Zap size={14} />
                  Sync Selected ({selectedEmployees.size})
                </button>
              )}
            </div>

            {/* Employee Table */}
            <Section>
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={{ ...s.tableHeader, width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedEmployees.size === filteredEmployees.length && filteredEmployees.length > 0}
                          onChange={toggleAllEmployees}
                        />
                      </th>
                      <th style={s.tableHeader}>Employee</th>
                      <th style={s.tableHeader}>Department</th>
                      <th style={{ ...s.tableHeader, textAlign: 'center' }}>Templates</th>
                      <th style={{ ...s.tableHeader, textAlign: 'center' }}>Devices</th>
                      <th style={{ ...s.tableHeader, textAlign: 'center' }}>Status</th>
                      <th style={{ ...s.tableHeader, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          <td colSpan={7} style={s.tableCell}><div className="pz-skeleton" style={{ height: '16px', borderRadius: '6px', width: '100%' }} /></td>
                        </tr>
                      ))
                    ) : filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={s.emptyState}>
                          <Users size={32} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                          <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>No employees found</p>
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => (
                        <tr
                          key={emp.employee_id}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s ease', cursor: 'default' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <td style={{ ...s.tableCell, width: '40px', textAlign: 'left' }}>
                            <input
                              type="checkbox"
                              checked={selectedEmployees.has(emp.employee_id)}
                              onChange={() => toggleEmployeeSelection(emp.employee_id)}
                            />
                          </td>
                          <td style={s.tableCell}>
                            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', margin: 0 }}>{emp.employee_name}</p>
                            <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', fontFamily: 'monospace', margin: '2px 0 0' }}>{emp.employee_code}</p>
                          </td>
                          <td style={s.tableCell}>{emp.department_id ? '—' : '—'}</td>
                          <td style={{ ...s.tableCell, textAlign: 'center', fontSize: '12px', fontWeight: 600 }}>{emp.template_count}</td>
                          <td style={{ ...s.tableCell, textAlign: 'center', fontSize: '12px', fontWeight: 600 }}>
                            {emp.devices_synced}/{emp.total_devices}
                          </td>
                          <td style={{ ...s.tableCell, textAlign: 'center' }}>
                            <StatusBadge status={mapSyncHealth(emp.sync_health)} size="xs" />
                          </td>
                          <td style={{ ...s.tableCell, textAlign: 'right' }}>
                            <button
                              onClick={() => setSelectedEmployee(emp.employee_id)}
                              style={{ fontSize: '12px', color: '#3B82F6', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer' }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          </motion.div>
        )}

        {activeTab === 'devices' && (
          <motion.div
            key="devices"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {devices.map((device) => {
                const devSync = overview?.recent_logs?.find(l => l.device_id === device.id)
                return (
                  <motion.div
                    key={device.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={s.deviceCard}
                    onClick={() => setSelectedDevice(device.id)}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--pz-border-strong)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--pz-border)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ padding: '10px', borderRadius: '10px', background: device.is_online ? 'rgba(16,185,129,0.1)' : 'var(--pz-surface-2)', border: device.is_online ? '1px solid rgba(16,185,129,0.2)' : '1px solid var(--pz-border)' }}>
                        <Monitor size={18} color={device.is_online ? '#10B981' : '#6B7280'} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {device.name || `Device ${device.serial_number.slice(-6)}`}
                        </p>
                        <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', fontFamily: 'monospace', margin: 0 }}>{device.ip_address}</p>
                      </div>
                      <StatusBadge status={device.is_online ? 'online' : 'offline'} size="sm" pulse={device.is_online} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '10px' }}>
                      <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--pz-border)' }}>
                        <p style={{ color: 'var(--pz-text-muted)', margin: 0 }}>Last Sync</p>
                        <p style={{ fontWeight: 600, color: 'var(--pz-text-secondary)', margin: '2px 0 0' }}>
                          {devSync?.completed_at ? new Date(devSync.completed_at).toLocaleTimeString() : '—'}
                        </p>
                      </div>
                      <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--pz-border)' }}>
                        <p style={{ color: 'var(--pz-text-muted)', margin: 0 }}>Templates</p>
                        <p style={{ fontWeight: 600, color: 'var(--pz-text-secondary)', margin: '2px 0 0' }}>
                          {devSync?.templates_affected ?? '—'}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}

        {activeTab === 'activity' && (
          <motion.div
            key="activity"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Section>
              {/* Date Range Filters */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid var(--pz-border)', background: 'rgba(255,255,255,0.02)', margin: '-24px -24px 16px -24px', borderRadius: '16px 16px 0 0' }}>
                <Filter size={14} color="var(--pz-text-muted)" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-muted)' }}>Date Range:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}
                />
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo('') }}
                    style={{ fontSize: '12px', color: '#3B82F6', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.tableHeader}>Time</th>
                      <th style={s.tableHeader}>Type</th>
                      <th style={s.tableHeader}>Direction</th>
                      <th style={{ ...s.tableHeader, textAlign: 'center' }}>Status</th>
                      <th style={{ ...s.tableHeader, textAlign: 'center' }}>Users</th>
                      <th style={{ ...s.tableHeader, textAlign: 'center' }}>Templates</th>
                      <th style={{ ...s.tableHeader, textAlign: 'center' }}>Duration</th>
                      <th style={s.tableHeader}>Initiated By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!logsData?.items?.length ? (
                      <tr>
                        <td colSpan={8} style={s.emptyState}>
                          <Clock size={32} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                          <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>No sync activity yet</p>
                        </td>
                      </tr>
                    ) : (
                      logsData.items.map((log) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s ease' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                          <td style={{ ...s.tableCell, fontSize: '12px' }}>
                            {new Date(log.started_at).toLocaleString()}
                          </td>
                          <td style={s.tableCell}>
                            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--pz-text-secondary)', textTransform: 'capitalize' }}>
                              {log.sync_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={s.tableCell}>
                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '20px',
                              background: log.direction === 'push' ? 'rgba(59,130,246,0.1)' : log.direction === 'pull' ? 'rgba(16,185,129,0.1)' : 'rgba(139,92,246,0.1)',
                              color: log.direction === 'push' ? '#3B82F6' : log.direction === 'pull' ? '#10B981' : '#8B5CF6'
                            }}>
                              {log.direction}
                            </span>
                          </td>
                          <td style={{ ...s.tableCell, textAlign: 'center' }}>
                            <StatusBadge status={mapSyncStatus(log.status)} size="xs" />
                          </td>
                          <td style={{ ...s.tableCell, textAlign: 'center', fontSize: '12px' }}>{log.users_affected}</td>
                          <td style={{ ...s.tableCell, textAlign: 'center', fontSize: '12px' }}>{log.templates_affected}</td>
                          <td style={{ ...s.tableCell, textAlign: 'center', fontSize: '12px' }}>
                            {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : '—'}
                          </td>
                          <td style={{ ...s.tableCell, fontSize: '12px', fontFamily: 'monospace' }}>{log.initiated_by}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Drawers ─────────────────────────────────────────── */}
      {selectedEmployee && (
        <EmployeeSyncDrawer
          employeeId={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
      {selectedDevice && (
        <DeviceSyncDrawer
          deviceId={selectedDevice}
          onClose={() => setSelectedDevice(null)}
        />
      )}
    </div>
  )
}
