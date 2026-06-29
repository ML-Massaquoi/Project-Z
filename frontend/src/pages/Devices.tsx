import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, Wifi, WifiOff, Download, Activity, Clock, Zap, RefreshCw, Globe, Radio, Grid3X3, List, Users, FolderOpen, Plus, Edit2, Trash2, ChevronRight, Cpu, Save } from 'lucide-react'
import { devicesAPI, deviceHealthAPI, officesAPI, departmentsAPI } from '@/api/client'
import { format } from 'date-fns'
import type { Device } from '@/types'
import { PageHeader, TabBar } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { KPICard } from '@/components/ui/KPICard'
import { DataTable, type ColumnDef } from '@/components/ui/data-table/DataTable'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DeviceMap } from '@/components/devices/DeviceMap'
import { NetworkDiscovery } from '@/components/devices/NetworkDiscovery'
import { LiveOperations } from '@/components/devices/LiveOperations'

const healthColors: Record<string, string> = {
  healthy: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  degraded: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  offline: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  unknown: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
}

const healthLabels: Record<string, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'Critical',
  offline: 'Offline',
  unknown: 'Unknown',
}

const columns: ColumnDef<Device, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Device',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${row.original.is_online ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-[var(--pz-surface-2)] border border-[var(--pz-border)]'}`}>
          <Monitor size={16} className={row.original.is_online ? 'text-emerald-400' : 'text-[var(--pz-text-muted)]'} />
        </div>
        <div>
          <p className="font-semibold text-[var(--pz-text-secondary)] text-sm">{row.original.name || `Device ${row.original.serial_number.slice(-6)}`}</p>
          <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">{row.original.serial_number}</p>
        </div>
      </div>
    ),
    size: 260,
  },
  {
    accessorKey: 'health_status',
    header: 'Health',
    cell: ({ getValue }) => {
      const status = (getValue() as string) || 'unknown'
      return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${healthColors[status] || healthColors.unknown}`}>
          {healthLabels[status] || status}
        </span>
      )
    },
    size: 110,
  },
  {
    accessorKey: 'is_online',
    header: 'Status',
    cell: ({ getValue }) => (
      <StatusBadge status={getValue() ? 'online' : 'offline'} size="sm" pulse={getValue() as boolean} />
    ),
    size: 110,
  },
  {
    accessorKey: 'avg_response_time_ms',
    header: 'Latency',
    cell: ({ getValue }) => {
      const val = getValue() as number | null
      if (!val) return <span className="text-[var(--pz-text-faint)] text-xs">--</span>
      const color = val < 2000 ? 'text-emerald-400' : val < 5000 ? 'text-amber-400' : 'text-red-400'
      return <span className={`text-xs font-mono ${color}`}>{val}ms</span>
    },
    size: 100,
  },
  {
    accessorKey: 'ip_address',
    header: 'IP Address',
    cell: ({ getValue }) => <span className="text-[var(--pz-text-tertiary)] font-mono text-xs">{(getValue() as string) || '\u2014'}</span>,
    size: 140,
  },
  {
    accessorKey: 'office_name',
    header: 'Office',
    cell: ({ getValue }) => <span className="text-[var(--pz-text-tertiary)] text-sm">{(getValue() as string) || 'Unassigned'}</span>,
  },
  {
    accessorKey: 'department_name',
    header: 'Department',
    cell: ({ getValue }) => <span className="text-[var(--pz-text-tertiary)] text-sm">{(getValue() as string) || 'Unassigned'}</span>,
  },
  {
    accessorKey: 'last_seen',
    header: 'Last Seen',
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      if (!val) return <span className="text-[var(--pz-text-faint)] text-xs">Never</span>
      return <span className="text-[var(--pz-text-tertiary)] text-xs font-mono tabular-nums">{format(new Date(val), 'MMM d, HH:mm')}</span>
    },
    size: 140,
  },
]

export default function Devices() {
  const [tab, setTab] = useState('registry')
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [searchValue, setSearchValue] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 15
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await devicesAPI.list()).data,
    refetchInterval: 30000,
  })

  const { data: healthOverview } = useQuery({
    queryKey: ['device-health-overview'],
    queryFn: async () => (await deviceHealthAPI.fleetHealth()).data,
    refetchInterval: 60000,
  })

  const { data: deviceHealthDetail } = useQuery({
    queryKey: ['device-health', selectedDevice?.id],
    queryFn: async () => (await deviceHealthAPI.getDeviceHealth(selectedDevice!.id)).data,
    enabled: !!selectedDevice,
  })

  const { data: healthHistory } = useQuery({
    queryKey: ['device-health-history', selectedDevice?.id],
    queryFn: async () => (await deviceHealthAPI.getHealthHistory(selectedDevice!.id, 24)).data,
    enabled: !!selectedDevice,
  })

  const { data: biometricCounts } = useQuery({
    queryKey: ['device-biometric-counts', selectedDevice?.id],
    queryFn: async () => (await deviceHealthAPI.getBiometricCounts(selectedDevice!.id)).data,
    enabled: !!selectedDevice,
  })

  const probeMutation = useMutation({
    mutationFn: (deviceId: string) => deviceHealthAPI.probeDevice(deviceId),
    onSuccess: () => {
      toast.success('Device probed successfully')
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['device-health'] })
    },
    onError: () => toast.error('Probe failed'),
  })

  const probeAllMutation = useMutation({
    mutationFn: () => deviceHealthAPI.probeAll(),
    onSuccess: (data) => {
      toast.success(`Probed ${data.data.probed_count} devices`)
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['device-health-overview'] })
    },
    onError: () => toast.error('Probe all failed'),
  })

  const devices: Device[] = data?.items ?? []
  const onlineCount = devices.filter(d => d.is_online).length
  const offlineCount = devices.filter(d => !d.is_online).length
  const healthyCount = devices.filter(d => d.health_status === 'healthy').length
  const degradedCount = devices.filter(d => d.health_status === 'degraded').length
  const criticalCount = devices.filter(d => d.health_status === 'critical').length

  const filtered = useMemo(() => {
    let result = devices
    if (searchValue.trim()) {
      const q = searchValue.toLowerCase()
      result = result.filter(d =>
        (d.name?.toLowerCase().includes(q)) ||
        d.serial_number.toLowerCase().includes(q) ||
        (d.ip_address?.toLowerCase().includes(q)) ||
        (d.office_name?.toLowerCase().includes(q))
      )
    }
    if (filterValues.status === 'online') result = result.filter(d => d.is_online)
    if (filterValues.status === 'offline') result = result.filter(d => !d.is_online)
    if (filterValues.health === 'healthy') result = result.filter(d => d.health_status === 'healthy')
    if (filterValues.health === 'degraded') result = result.filter(d => d.health_status === 'degraded')
    if (filterValues.health === 'critical') result = result.filter(d => d.health_status === 'critical')
    return result
  }, [devices, searchValue, filterValues])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginatedDevices = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleExport = async () => {
    try {
      const blob = new Blob([JSON.stringify(devices, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `devices-export-${format(new Date(), 'yyyy-MM-dd')}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Device data exported')
    } catch {
      toast.error('Failed to export devices')
    }
  }

  return (
    <div className="space-y-5 pz-slide-up">
      <PageHeader
        title="Device Management"
        subtitle={`Fleet management for biometric terminals \u00b7 ${devices.length} devices`}
        breadcrumbs={[{ label: 'Infrastructure' }, { label: 'Devices' }]}
        tabs={
          <TabBar
            tabs={[
              { id: 'registry', label: 'Registry', icon: <List size={14} /> },
              { id: 'map', label: 'Device Map', icon: <Grid3X3 size={14} /> },
              { id: 'groups', label: 'Groups', icon: <FolderOpen size={14} /> },
              { id: 'discovery', label: 'Discovery', icon: <Globe size={14} /> },
              { id: 'live', label: 'Live Operations', icon: <Radio size={14} /> },
            ]}
            activeTab={tab}
            onChange={(t) => { setTab(t); setSearchValue('') }}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            {tab === 'registry' && (
              <Button variant="outline" size="md"
                onClick={() => probeAllMutation.mutate()}
                disabled={probeAllMutation.isPending}
                loading={probeAllMutation.isPending}>
                <RefreshCw size={15} className={probeAllMutation.isPending ? 'animate-spin' : ''} />
                Probe All
              </Button>
            )}
          </div>
        }
      />

      {/* ── Registry Tab ──────────────────────────────────── */}
      {tab === 'registry' && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <KPICard icon={Monitor} label="Total" value={devices.length} color="#6366F1" loading={isLoading} />
            <KPICard icon={Wifi} label="Online" value={onlineCount} color="#10B981" loading={isLoading} />
            <KPICard icon={WifiOff} label="Offline" value={offlineCount} color="#EF4444" loading={isLoading} />
            <KPICard icon={Activity} label="Healthy" value={healthyCount} color="#10B981" loading={isLoading} />
            <KPICard icon={Clock} label="Degraded" value={degradedCount} color="#F59E0B" loading={isLoading} />
            <KPICard icon={Zap} label="Critical" value={criticalCount} color="#EF4444" loading={isLoading} />
          </div>

          {/* Fleet Health Bar */}
          {healthOverview && (
            <div className="pz-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Fleet Health</span>
                <span className="text-sm font-bold text-[var(--pz-text-secondary)]">{healthOverview.fleet_health_percent}%</span>
              </div>
              <div className="w-full h-2 bg-[var(--pz-surface-3)] rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${healthOverview.fleet_health_percent}%` }} />
              </div>
              <div className="flex items-center gap-4 mt-2 text-[10px] text-[var(--pz-text-muted)]">
                <span>Avg Latency: {healthOverview.avg_response_time_ms ? `${healthOverview.avg_response_time_ms}ms` : '--'}</span>
                <span>Online: {healthOverview.online_count}/{healthOverview.total_devices}</span>
              </div>
            </div>
          )}

          {/* View Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 p-1 bg-[var(--pz-surface-2)] rounded-lg border border-[var(--pz-border)]">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-[var(--pz-text-muted)] hover:text-[var(--pz-text)]'}`}
              >
                <List size={13} /> List
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'map' ? 'bg-blue-600 text-white' : 'text-[var(--pz-text-muted)] hover:text-[var(--pz-text)]'}`}
              >
                <Grid3X3 size={13} /> Map
              </button>
            </div>
          </div>

          {viewMode === 'list' ? (
            <DataTable
              data={paginatedDevices}
              columns={columns}
              loading={isLoading}
              onRowClick={(device) => setSelectedDevice(device)}
              enablePagination
              totalRows={filtered.length}
              currentPage={page}
              onPageChange={setPage}
              totalPages={totalPages}
              searchValue={searchValue}
              onSearchChange={(v) => { setSearchValue(v); setPage(1) }}
              searchPlaceholder="Search by name, serial, IP..."
              toolbar={
                <div className="flex items-center gap-2 ml-auto">
                  <select
                    value={filterValues.health || ''}
                    onChange={(e) => { setFilterValues(prev => ({ ...prev, health: e.target.value })); setPage(1) }}
                    className="px-3 py-2 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs font-semibold text-[var(--pz-text-secondary)]"
                  >
                    <option value="">All Health</option>
                    <option value="healthy">Healthy</option>
                    <option value="degraded">Degraded</option>
                    <option value="critical">Critical</option>
                  </select>
                  <Button variant="outline" size="md" onClick={handleExport}>
                    <Download size={15} />
                    Export
                  </Button>
                </div>
              }
            />
          ) : (
            <DeviceMap devices={filtered} onSelectDevice={(d) => setSelectedDevice(d)} />
          )}
        </>
      )}

      {/* ── Map Tab ───────────────────────────────────────── */}
      {tab === 'map' && (
        <DeviceMap devices={devices} onSelectDevice={(d) => setSelectedDevice(d)} />
      )}

      {/* ── Discovery Tab ─────────────────────────────────── */}
      {tab === 'discovery' && <NetworkDiscovery />}

      {/* ── Groups Tab ────────────────────────────────────── */}
      {tab === 'groups' && <DeviceGroups />}

      {/* ── Live Operations Tab ───────────────────────────── */}
      {tab === 'live' && <LiveOperations />}

      {/* ── Device Detail Drawer ──────────────────────── */}
      <DetailDrawer
        open={!!selectedDevice}
        onClose={() => setSelectedDevice(null)}
        width={740}
        title={selectedDevice?.name || `Device ${selectedDevice?.serial_number.slice(-6) || ''}`}
        subtitle={selectedDevice?.serial_number}
      >
        {selectedDevice && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

            {/* ── Header: Status + Actions ───────────────── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', paddingBottom: '24px', borderBottom: '1px solid var(--pz-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                <div style={{
                  padding: '16px', borderRadius: '6px',
                  background: selectedDevice.is_online ? 'rgba(16,185,129,0.10)' : 'var(--pz-surface-2)',
                  border: `1px solid ${selectedDevice.is_online ? 'rgba(16,185,129,0.25)' : 'var(--pz-border)'}`,
                  flexShrink: 0,
                }}>
                  <Monitor size={28} style={{ color: selectedDevice.is_online ? '#10B981' : 'var(--pz-text-muted)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <StatusBadge status={selectedDevice.is_online ? 'online' : 'offline'} size="md" pulse={selectedDevice.is_online} />
                  <span className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${healthColors[selectedDevice.health_status] || healthColors.unknown}`}>
                    {healthLabels[selectedDevice.health_status] || selectedDevice.health_status}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <Button variant="outline" size="sm" onClick={() => setEditingDevice(selectedDevice)}>
                  <Edit2 size={13} /> Edit
                </Button>
                <Button variant="default" size="sm"
                  onClick={() => probeMutation.mutate(selectedDevice.id)}
                  disabled={probeMutation.isPending}
                  loading={probeMutation.isPending}>
                  <RefreshCw size={13} className={probeMutation.isPending ? 'animate-spin' : ''} />
                  Probe
                </Button>
              </div>
            </div>

            {/* ── Health Metrics ─────────────────────────── */}
            {deviceHealthDetail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                  Health Metrics
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
                  {[
                    ['Uptime 24h', deviceHealthDetail.uptime_24h_percent != null ? `${deviceHealthDetail.uptime_24h_percent}%` : '--'],
                    ['Uptime 7d', deviceHealthDetail.uptime_7d_percent != null ? `${deviceHealthDetail.uptime_7d_percent}%` : '--'],
                    ['Avg Latency', deviceHealthDetail.avg_response_time_ms ? `${deviceHealthDetail.avg_response_time_ms}ms` : '--'],
                    ['Checks (24h)', String(deviceHealthDetail.total_checks_24h || 0)],
                    ['Consecutive Failures', String(deviceHealthDetail.consecutive_failures || 0)],
                    ['Last Health Check', deviceHealthDetail.last_health_check ? format(new Date(deviceHealthDetail.last_health_check), 'MMM d, HH:mm') : 'Never'],
                  ].map(([label, value]) => (
                    <div key={label} style={{
                      padding: '16px', borderRadius: '6px',
                      background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)',
                      minHeight: '90px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    }}>
                      <p style={{ fontSize: '12px', fontWeight: 400, color: 'var(--pz-text-muted)', margin: 0 }}>{label}</p>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace', margin: 0 }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Biometric Counts ───────────────────────── */}
            {biometricCounts && biometricCounts.total > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                  Biometric Data
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Fingerprints', value: biometricCounts.fingerprint || 0, color: '#6366F1' },
                    { label: 'Face', value: biometricCounts.face || 0, color: '#10B981' },
                    { label: 'Cards', value: biometricCounts.card || 0, color: '#F59E0B' },
                    { label: 'PIN', value: biometricCounts.pin || 0, color: '#EF4444' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{
                      padding: '12px', borderRadius: '6px',
                      background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)',
                      textAlign: 'center',
                    }}>
                      <p style={{ fontSize: '20px', fontWeight: 700, color, fontFamily: 'monospace', margin: 0 }}>{value}</p>
                      <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 0' }}>{label}</p>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-muted)' }}>Total Templates</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{biometricCounts.total}</span>
                </div>
              </div>
            )}

            {/* ── Recent Health Checks ────────────────────── */}
            {healthHistory && healthHistory.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                  Recent Health Checks
                </h4>
                <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', overflow: 'hidden', maxHeight: '260px', overflowY: 'auto' }}>
                  {healthHistory.slice(0, 20).map((log: { id: string; check_result: string; response_time_ms: number | null; created_at: string }, i: number) => (
                    <div key={log.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      paddingBlock: '10px', paddingInline: '14px',
                      borderBottom: '1px solid var(--pz-border)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: log.check_result === 'success' ? '#10B981' : '#EF4444' }} />
                        <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)', fontFamily: 'monospace' }}>
                          {format(new Date(log.created_at), 'HH:mm:ss')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: log.check_result === 'success' ? '#10B981' : '#EF4444' }}>
                          {log.check_result.toUpperCase()}
                        </span>
                        {log.response_time_ms && (
                          <span style={{ fontSize: '11px', color: 'var(--pz-text-muted)', fontFamily: 'monospace' }}>
                            {log.response_time_ms}ms
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Configuration ───────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                Configuration
              </h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  ['Serial Number', selectedDevice.serial_number],
                  ['Platform', selectedDevice.platform || '—'],
                  ['Model', selectedDevice.model || '—'],
                  ['Firmware', selectedDevice.firmware_version || '—'],
                  ['Active', selectedDevice.is_active ? 'Yes' : 'No'],
                  ['Registered', format(new Date(selectedDevice.created_at), 'MMM d, yyyy')],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    height: '44px', paddingInline: '14px',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Network Information ─────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                Network Information
              </h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  ['IP Address', selectedDevice.ip_address || '—'],
                  ['Office', selectedDevice.office_name || 'Unassigned'],
                  ['Department', selectedDevice.department_name || 'Unassigned'],
                  ['Last Seen', selectedDevice.last_seen ? format(new Date(selectedDevice.last_seen), 'MMM d, yyyy HH:mm') : 'Never'],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    height: '44px', paddingInline: '14px',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </DetailDrawer>

      {/* ── Edit Device Modal ─────────────────────────────── */}
      <EditDeviceModal
        device={editingDevice}
        onClose={() => setEditingDevice(null)}
      />
    </div>
  )
}

// ── Edit Device Modal ──────────────────────────────────────
function EditDeviceModal({ device, onClose }: { device: Device | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [officeId, setOfficeId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [locationDescription, setLocationDescription] = useState('')

  const { data: officesData } = useQuery({
    queryKey: ['offices'],
    queryFn: async () => (await officesAPI.list()).data,
  })

  const { data: departmentsData } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })

  useEffect(() => {
    if (device) {
      setName(device.name || '')
      setOfficeId(device.office_id || '')
      setDepartmentId(device.department_id || '')
      setLocationDescription('')
    }
  }, [device])

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => devicesAPI.update(device!.id, data),
    onSuccess: () => {
      toast.success('Device updated successfully')
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      onClose()
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Failed to update device'),
  })

  const offices: any[] = officesData?.items ?? officesData ?? []
  const departments: any[] = departmentsData?.items ?? departmentsData ?? []

  const handleSave = () => {
    const data: Record<string, unknown> = {}
    if (name.trim()) data.name = name.trim()
    data.office_id = officeId || null
    data.department_id = departmentId || null
    if (locationDescription.trim()) data.location_description = locationDescription.trim()
    updateMutation.mutate(data)
  }

  return (
    <Modal
      open={!!device}
      onClose={onClose}
      title="Edit Device"
      description={device ? `Updating ${device.serial_number}` : ''}
      size="md"
      onConfirm={handleSave}
      confirmLabel="Save Changes"
      confirmLoading={updateMutation.isPending}
    >
      <div className="space-y-4">
        <Input
          label="Device Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. I.T Department Device"
        />
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--pz-text-secondary)] uppercase tracking-wide">Office</label>
            <select
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
              className="h-11 px-3.5 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-1)] text-sm text-[var(--pz-text)]"
            >
              <option value="">No Office</option>
              {offices.map((o: any) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--pz-text-secondary)] uppercase tracking-wide">Department</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="h-11 px-3.5 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-1)] text-sm text-[var(--pz-text)]"
            >
              <option value="">No Department</option>
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
        <Input
          label="Location Description"
          value={locationDescription}
          onChange={(e) => setLocationDescription(e.target.value)}
          placeholder="e.g. Main lobby entrance"
          hint="Optional physical location description"
        />
      </div>
    </Modal>
  )
}

// ── Device Groups Component ───────────────────────────────
function DeviceGroups() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<any>(null)
  const queryClient = useQueryClient()

  const { data: groupsData, isLoading } = useQuery({
    queryKey: ['device-groups'],
    queryFn: async () => {
      const res = await fetch('/api/v1/device-groups', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      })
      return res.json()
    },
  })

  const groups = groupsData?.items || []

  const deleteMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await fetch(`/api/v1/device-groups/${groupId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      })
      if (!res.ok) throw new Error('Failed to delete')
    },
    onSuccess: () => {
      toast.success('Group deleted')
      queryClient.invalidateQueries({ queryKey: ['device-groups'] })
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--pz-text-primary)]">Device Groups</h3>
          <p className="text-sm text-[var(--pz-text-muted)]">Organize devices into groups for bulk operations</p>
        </div>
        <Button variant="default" size="md" onClick={() => setShowCreateModal(true)}>
          <Plus size={15} /> Create Group
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-xl bg-[var(--pz-surface-2)] animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-[var(--pz-border)]">
          <FolderOpen size={40} className="mx-auto text-[var(--pz-text-faint)] mb-3" />
          <p className="text-sm text-[var(--pz-text-muted)]">No device groups yet</p>
          <p className="text-xs text-[var(--pz-text-faint)] mt-1">Create a group to organize devices by location or purpose</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group: any) => (
            <div
              key={group.id}
              className="relative group p-5 rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface-1)] hover:border-[var(--pz-accent)] transition-all cursor-pointer"
              onClick={() => setEditingGroup(group)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: group.color ? `${group.color}20` : 'var(--pz-surface-3)' }}
                  >
                    <FolderOpen size={20} style={{ color: group.color || 'var(--pz-text-muted)' }} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-[var(--pz-text-primary)]">{group.name}</h4>
                    {group.description && (
                      <p className="text-[10px] text-[var(--pz-text-muted)] mt-0.5">{group.description}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm('Delete this group? Devices will be unassigned.')) {
                      deleteMutation.mutate(group.id)
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 transition-opacity"
                >
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>

              <div className="flex items-center gap-4 pt-3 border-t border-[var(--pz-border)]">
                <div className="flex items-center gap-1.5">
                  <Cpu size={12} className="text-[var(--pz-text-muted)]" />
                  <span className="text-xs text-[var(--pz-text-secondary)]">
                    <span className="font-semibold">{group.device_count}</span> devices
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Wifi size={12} className="text-emerald-400" />
                  <span className="text-xs text-[var(--pz-text-secondary)]">
                    <span className="font-semibold text-emerald-400">{group.online_count}</span> online
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[var(--pz-border)] bg-[var(--pz-surface-1)] p-6 space-y-4">
            <h3 className="text-lg font-semibold text-[var(--pz-text-primary)]">Create Device Group</h3>
            <p className="text-sm text-[var(--pz-text-muted)]">Form implementation coming soon</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
