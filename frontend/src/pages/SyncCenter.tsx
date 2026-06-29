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
import { PageHeader } from '@/components/ui/PageHeader'
import { KPICard } from '@/components/ui/KPICard'
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
    <div className="space-y-5 pz-slide-up">
      <PageHeader
        title="Synchronization Center"
        subtitle="Centralized biometric authority — manage device synchronization"
        breadcrumbs={[{ label: 'Infrastructure' }, { label: 'Sync Center' }]}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => retryAllMutation.mutate()}
              disabled={retryAllMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              <RotateCcw size={15} className={retryAllMutation.isPending ? 'animate-spin' : ''} />
              Retry Failed
            </button>
            <button
              onClick={() => bulkSyncMutation.mutate()}
              disabled={bulkSyncMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              <Zap size={15} className={bulkSyncMutation.isPending ? 'animate-spin' : ''} />
              {bulkSyncMutation.isPending ? 'Syncing...' : 'Sync All Devices'}
            </button>
          </div>
        }
      />

      {/* ── Tab Bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-[var(--pz-surface-1)] rounded-xl border border-[var(--pz-border)]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex-1 justify-center
              ${activeTab === tab.key
                ? 'bg-[var(--pz-surface-2)] text-[var(--pz-text)] shadow-sm border border-[var(--pz-border-strong)]'
                : 'text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)]'
              }`}
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
            className="space-y-5"
          >
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              <KPICard icon={Users} label="Total Employees" value={overview?.total_provisioned ?? '—'} color="#3B82F6" loading={overviewLoading} />
              <KPICard icon={Monitor} label="Active Devices" value={overview?.total_devices ?? '—'} color="#6366F1" loading={overviewLoading} />
              <KPICard icon={CheckCircle2} label="Templates Stored" value={overview?.total_templates_stored ?? '—'} color="#10B981" loading={overviewLoading} />
              <KPICard icon={AlertTriangle} label="Pending Syncs" value={overview?.total_pending_sync ?? '—'} color="#F59E0B" loading={overviewLoading} />
              <KPICard icon={XCircle} label="Failed Syncs" value={overview?.total_failed_syncs ?? '—'} color="#EF4444" loading={overviewLoading} />
            </div>

            {/* Sync Progress Overview */}
            {overview && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="pz-card p-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Loader2 size={16} className="text-blue-400" />
                  <h3 className="text-sm font-semibold text-[var(--pz-text)]">Sync Health</h3>
                </div>
                <div className="space-y-3">
                  {/* Overall Progress */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-[var(--pz-text-muted)]">Overall Sync Progress</span>
                      <span className="text-xs font-bold text-[var(--pz-text-secondary)]">
                        {overview.total_provisioned > 0
                          ? Math.round(((overview.total_templates_stored ?? 0) / (overview.total_provisioned * 10)) * 100)
                          : 0}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-[var(--pz-surface-3)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${overview.total_provisioned > 0
                            ? Math.min(100, Math.round(((overview.total_templates_stored ?? 0) / (overview.total_provisioned * 10)) * 100))
                            : 0}%`,
                          background: 'linear-gradient(90deg, #10B981, #3B82F6)',
                        }}
                      />
                    </div>
                  </div>
                  {/* Device Sync Status Bars */}
                  {matrix?.devices && matrix.devices.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                      {matrix.devices.map((dev) => {
                        const syncedCount = matrix.employees.filter(e => {
                          const deviceEntry = e.device_status.find((d: { device_id: string }) => d.device_id === dev.device_id)
                          return deviceEntry?.status === 'synced'
                        }).length
                        const totalCount = matrix.employees.length
                        const pct = totalCount > 0 ? Math.round((syncedCount / totalCount) * 100) : 0
                        return (
                          <div key={dev.device_id} className="p-3 rounded-lg bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)]">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-semibold text-[var(--pz-text-muted)] truncate">{dev.device_name || 'Device'}</span>
                              <span className="text-[10px] font-bold text-[var(--pz-text-secondary)]">{pct}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-[var(--pz-surface-3)] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  background: pct === 100 ? '#10B981' : pct > 50 ? '#F59E0B' : '#EF4444',
                                }}
                              />
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[9px] text-[var(--pz-text-faint)]">{syncedCount}/{totalCount} synced</span>
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
                className="pz-card p-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle size={16} className="text-amber-400" />
                  <h3 className="text-sm font-semibold text-[var(--pz-text)]">Pending Synchronizations</h3>
                </div>
                <div className="space-y-2">
                  {pendingData.devices.map((dev) => (
                    <div key={dev.device_id} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface-2)]/20">
                      <div className={`p-2 rounded-lg ${dev.is_online ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                        <Monitor size={14} className={dev.is_online ? 'text-emerald-400' : 'text-red-400'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--pz-text-secondary)]">{dev.device_name}</p>
                        <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">{dev.serial_number}</p>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-semibold">
                        {dev.pending_users > 0 && <span className="text-amber-400">{dev.pending_users} pending users</span>}
                        {dev.pending_templates > 0 && <span className="text-amber-400">{dev.pending_templates} pending templates</span>}
                        {dev.failed_syncs > 0 && <span className="text-red-400">{dev.failed_syncs} failed</span>}
                      </div>
                      <StatusBadge status={dev.is_online ? 'online' : 'offline'} size="xs" />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Sync Matrix Preview */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="pz-card p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ArrowUpDown size={16} className="text-blue-400" />
                  <h3 className="text-sm font-semibold text-[var(--pz-text)]">Sync Matrix Overview</h3>
                </div>
                <button
                  onClick={() => setActiveTab('employees')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                >
                  View Full Matrix →
                </button>
              </div>
              {matrix?.devices && matrix.devices.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--pz-border)]">
                        <th className="text-left py-2 px-3 text-[10px] font-bold text-[var(--pz-text-muted)] uppercase">Employee</th>
                        {matrix.devices.map((d) => (
                          <th key={d.device_id} className="text-center py-2 px-2 text-[10px] font-bold text-[var(--pz-text-muted)] uppercase min-w-[80px]">
                            {d.device_name?.slice(0, 8) || 'Device'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.employees.slice(0, 5).map((emp) => (
                        <tr key={emp.employee_id} className="border-b border-[var(--pz-border)]/50">
                          <td className="py-2 px-3 text-[var(--pz-text-secondary)] font-medium">{emp.employee_name}</td>
                          {emp.device_status.map((ds) => (
                            <td key={ds.device_id} className="text-center py-2 px-2">
                              <div className={`w-5 h-5 rounded mx-auto ${
                                ds.status === 'synced' ? 'bg-emerald-500/20 border border-emerald-500/30' :
                                'bg-[var(--pz-surface-2)] border border-[var(--pz-border)]'
                              }`}>
                                {ds.status === 'synced' && <CheckCircle2 size={12} className="text-emerald-400 mx-auto mt-0.5" />}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {matrix.employees.length > 5 && (
                    <p className="text-center text-[10px] text-[var(--pz-text-muted)] mt-2">
                      Showing 5 of {matrix.employees.length} employees
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}

        {activeTab === 'employees' && (
          <motion.div
            key="employees"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {/* Toolbar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pz-text-muted)]" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text-secondary)] focus:outline-none"
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
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-semibold hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                >
                  <Zap size={14} />
                  Sync Selected ({selectedEmployees.size})
                </button>
              )}
            </div>

            {/* Employee Table */}
            <div className="pz-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--pz-border)] bg-[var(--pz-surface-2)]/30">
                      <th className="text-left py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedEmployees.size === filteredEmployees.length && filteredEmployees.length > 0}
                          onChange={toggleAllEmployees}
                          className="rounded border-[var(--pz-border)]"
                        />
                      </th>
                      <th className="text-left py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Employee</th>
                      <th className="text-left py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Department</th>
                      <th className="text-center py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Templates</th>
                      <th className="text-center py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Devices</th>
                      <th className="text-center py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Status</th>
                      <th className="text-right py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b border-[var(--pz-border)]/50">
                          <td colSpan={7} className="py-4 px-4"><div className="skeleton h-4 rounded w-full" /></td>
                        </tr>
                      ))
                    ) : filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center text-[var(--pz-text-muted)]">
                          <Users size={32} className="mx-auto mb-3 opacity-20" />
                          <p className="text-sm font-medium">No employees found</p>
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => (
                        <tr
                          key={emp.employee_id}
                          className="border-b border-[var(--pz-border)]/50 hover:bg-[var(--pz-surface-2)]/30 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={selectedEmployees.has(emp.employee_id)}
                              onChange={() => toggleEmployeeSelection(emp.employee_id)}
                              className="rounded border-[var(--pz-border)]"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="text-sm font-semibold text-[var(--pz-text-secondary)]">{emp.employee_name}</p>
                              <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">{emp.employee_code}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-[var(--pz-text-muted)]">{emp.department_id ? '—' : '—'}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-xs font-semibold text-[var(--pz-text-secondary)]">{emp.template_count}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-xs font-semibold text-[var(--pz-text-secondary)]">
                              {emp.devices_synced}/{emp.total_devices}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <StatusBadge
                              status={mapSyncHealth(emp.sync_health)}
                              size="xs"
                            />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => setSelectedEmployee(emp.employee_id)}
                              className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
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
            </div>
          </motion.div>
        )}

        {activeTab === 'devices' && (
          <motion.div
            key="devices"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {devices.map((device) => {
                const devSync = overview?.recent_logs?.find(l => l.device_id === device.id)
                return (
                  <motion.div
                    key={device.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="pz-card p-5 hover:border-[var(--pz-border-strong)] transition-all cursor-pointer"
                    onClick={() => setSelectedDevice(device.id)}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2.5 rounded-xl ${device.is_online ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-[var(--pz-surface-2)] border border-[var(--pz-border)]'}`}>
                        <Monitor size={18} className={device.is_online ? 'text-emerald-400' : 'text-gray-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--pz-text-secondary)] truncate">
                          {device.name || `Device ${device.serial_number.slice(-6)}`}
                        </p>
                        <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">{device.ip_address}</p>
                      </div>
                      <StatusBadge status={device.is_online ? 'online' : 'offline'} size="sm" pulse={device.is_online} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="p-2 rounded-lg bg-[var(--pz-surface-2)]/30 border border-[var(--pz-border)]/50">
                        <p className="text-[var(--pz-text-muted)]">Last Sync</p>
                        <p className="font-semibold text-[var(--pz-text-secondary)] mt-0.5">
                          {devSync?.completed_at ? new Date(devSync.completed_at).toLocaleTimeString() : '—'}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-[var(--pz-surface-2)]/30 border border-[var(--pz-border)]/50">
                        <p className="text-[var(--pz-text-muted)]">Templates</p>
                        <p className="font-semibold text-[var(--pz-text-secondary)] mt-0.5">
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
            className="pz-card overflow-hidden"
          >
            {/* Date Range Filters */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--pz-border)] bg-[var(--pz-surface-2)]/30">
              <Filter size={14} className="text-[var(--pz-text-muted)]" />
              <span className="text-xs font-semibold text-[var(--pz-text-muted)]">Date Range:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-[var(--pz-surface-1)] border border-[var(--pz-border)] text-xs text-[var(--pz-text-secondary)] font-mono"
              />
              <span className="text-xs text-[var(--pz-text-muted)]">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-[var(--pz-surface-1)] border border-[var(--pz-border)] text-xs text-[var(--pz-text-secondary)] font-mono"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo('') }}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--pz-border)] bg-[var(--pz-surface-2)]/30">
                    <th className="text-left py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Time</th>
                    <th className="text-left py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Type</th>
                    <th className="text-left py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Direction</th>
                    <th className="text-center py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Status</th>
                    <th className="text-center py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Users</th>
                    <th className="text-center py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Templates</th>
                    <th className="text-center py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Duration</th>
                    <th className="text-left py-3 px-4 text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Initiated By</th>
                  </tr>
                </thead>
                <tbody>
                  {!logsData?.items?.length ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-[var(--pz-text-muted)]">
                        <Clock size={32} className="mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">No sync activity yet</p>
                      </td>
                    </tr>
                  ) : (
                    logsData.items.map((log) => (
                      <tr key={log.id} className="border-b border-[var(--pz-border)]/50 hover:bg-[var(--pz-surface-2)]/30">
                        <td className="py-3 px-4 text-xs text-[var(--pz-text-muted)]">
                          {new Date(log.started_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs font-medium text-[var(--pz-text-secondary)] capitalize">
                            {log.sync_type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            log.direction === 'push' ? 'bg-blue-500/10 text-blue-400' :
                            log.direction === 'pull' ? 'bg-emerald-500/10 text-emerald-400' :
                            'bg-violet-500/10 text-violet-400'
                          }`}>
                            {log.direction}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge status={mapSyncStatus(log.status)} size="xs" />
                        </td>
                        <td className="py-3 px-4 text-center text-xs text-[var(--pz-text-secondary)]">
                          {log.users_affected}
                        </td>
                        <td className="py-3 px-4 text-center text-xs text-[var(--pz-text-secondary)]">
                          {log.templates_affected}
                        </td>
                        <td className="py-3 px-4 text-center text-xs text-[var(--pz-text-muted)]">
                          {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-[var(--pz-text-muted)] font-mono">
                          {log.initiated_by}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
