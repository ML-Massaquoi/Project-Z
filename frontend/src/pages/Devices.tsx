import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, Wifi, WifiOff, Download, Activity, Clock, Zap, RefreshCw, Globe, Radio, Grid3X3, List, FolderOpen, Plus, Edit2, Trash2, ChevronRight, Cpu, Search, ChevronDown } from 'lucide-react'
import { devicesAPI, deviceHealthAPI, officesAPI, departmentsAPI } from '@/api/client'
import { format } from 'date-fns'
import type { Device } from '@/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
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
  offline: 'text-[var(--pz-text-muted)] bg-[var(--pz-surface-2)]/50 border-[var(--pz-border)]',
  unknown: 'text-[var(--pz-text-muted)] bg-[var(--pz-surface-2)]/50 border-[var(--pz-border)]',
}

const healthLabels: Record<string, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'Critical',
  offline: 'Offline',
  unknown: 'Unknown',
}

const s = {
  page: {
    padding: '32px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '28px',
    minHeight: '100%',
    boxSizing: 'border-box' as const,
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
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
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
  section: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  sectionHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--pz-border)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--pz-text)',
    margin: 0,
  },
  tabBar: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: 'var(--pz-surface-2)',
    borderRadius: '10px',
    border: '1px solid var(--pz-border)',
  },
  tabPill: (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    background: active ? 'var(--pz-brand)' : 'transparent',
    color: active ? '#fff' : 'var(--pz-text-muted)',
    transition: 'all 0.12s',
  }),
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  searchInput: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 14px',
    height: '38px',
    borderRadius: '10px',
    background: 'var(--pz-surface-2)',
    border: '1px solid var(--pz-border)',
    color: 'var(--pz-text)',
    fontSize: '13px',
    width: '260px',
    outline: 'none',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  th: {
    padding: '10px 16px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--pz-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    textAlign: 'left' as const,
    borderBottom: '1px solid var(--pz-border)',
    background: 'var(--pz-surface-2)',
  },
  td: {
    padding: '12px 16px',
    fontSize: '13px',
    color: 'var(--pz-text-secondary)',
    borderBottom: '1px solid var(--pz-border)',
  },
  tableRow: (hover: boolean): React.CSSProperties => ({
    cursor: 'pointer',
    background: hover ? 'var(--pz-surface-2)' : 'transparent',
    transition: 'background 0.12s',
  }),
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderTop: '1px solid var(--pz-border)',
  },
  paginationText: {
    fontSize: '12px',
    color: 'var(--pz-text-muted)',
  },
  paginationBtns: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  paginationBtn: (active: boolean): React.CSSProperties => ({
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: `1px solid ${active ? 'var(--pz-brand)' : 'var(--pz-border)'}`,
    background: active ? 'var(--pz-brand)' : 'transparent',
    color: active ? '#fff' : 'var(--pz-text-muted)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  fleetHealthCard: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  viewToggle: {
    display: 'flex',
    gap: '4px',
    padding: '3px',
    background: 'var(--pz-surface-2)',
    borderRadius: '8px',
    border: '1px solid var(--pz-border)',
  },
  viewBtn: (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    background: active ? 'var(--pz-brand)' : 'transparent',
    color: active ? '#fff' : 'var(--pz-text-muted)',
    transition: 'all 0.12s',
  }),
  filterChip: (active: boolean): React.CSSProperties => ({
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 600,
    border: `1px solid ${active ? 'var(--pz-brand)' : 'var(--pz-border)'}`,
    background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
    color: active ? 'var(--pz-brand)' : 'var(--pz-text-muted)',
    cursor: 'pointer',
    transition: 'all 0.12s',
    whiteSpace: 'nowrap' as const,
  }),
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  avatarBox: (online: boolean): React.CSSProperties => ({
    padding: '8px',
    borderRadius: '8px',
    background: online ? 'rgba(16,185,129,0.10)' : 'var(--pz-surface-2)',
    border: `1px solid ${online ? 'rgba(16,185,129,0.25)' : 'var(--pz-border)'}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  deviceName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--pz-text-secondary)',
    margin: 0,
  },
  deviceSerial: {
    fontSize: '10px',
    color: 'var(--pz-text-muted)',
    fontFamily: 'monospace',
    margin: '2px 0 0',
  },
  healthPill: (status: string): React.CSSProperties => {
    const map: Record<string, { bg: string; fg: string; border: string }> = {
      healthy: { bg: 'rgba(16,185,129,0.1)', fg: '#10B981', border: 'rgba(16,185,129,0.25)' },
      degraded: { bg: 'rgba(245,158,11,0.1)', fg: '#F59E0B', border: 'rgba(245,158,11,0.25)' },
      critical: { bg: 'rgba(239,68,68,0.1)', fg: '#EF4444', border: 'rgba(239,68,68,0.25)' },
      offline: { bg: 'rgba(107,114,128,0.1)', fg: '#9CA3AF', border: 'rgba(107,114,128,0.25)' },
    }
    const c = map[status] || map.offline
    return {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: '20px',
      fontSize: '10px',
      fontWeight: 700,
      letterSpacing: '0.03em',
      textTransform: 'uppercase' as const,
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.border}`,
    }
  },
  emptyState: {
    padding: '48px 20px',
    textAlign: 'center' as const,
    color: 'var(--pz-text-muted)',
  },
  toolRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid var(--pz-border)',
  },
}

const healthFilters = ['', 'healthy', 'degraded', 'critical']
const healthFilterLabels: Record<string, string> = {
  '': 'All',
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'Critical',
}

const summaryCards = [
  { icon: Monitor, label: 'Total', key: 'total' as const, gradient: 'linear-gradient(135deg, #6366F1, #4F46E5)' },
  { icon: Wifi, label: 'Online', key: 'online' as const, gradient: 'linear-gradient(135deg, #10B981, #059669)' },
  { icon: WifiOff, label: 'Offline', key: 'offline' as const, gradient: 'linear-gradient(135deg, #EF4444, #DC2626)' },
  { icon: Activity, label: 'Healthy', key: 'healthy' as const, gradient: 'linear-gradient(135deg, #10B981, #059669)' },
  { icon: Clock, label: 'Degraded', key: 'degraded' as const, gradient: 'linear-gradient(135deg, #F59E0B, #D97706)' },
  { icon: Zap, label: 'Critical', key: 'critical' as const, gradient: 'linear-gradient(135deg, #EF4444, #DC2626)' },
]

export default function Devices() {
  const [tab, setTab] = useState('registry')
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [searchValue, setSearchValue] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [page, setPage] = useState(1)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
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

  const countMap: Record<string, number> = {
    total: devices.length,
    online: onlineCount,
    offline: offlineCount,
    healthy: healthyCount,
    degraded: degradedCount,
    critical: criticalCount,
  }

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

  const tabIcons: Record<string, React.ReactNode> = {
    registry: <List size={14} />,
    map: <Grid3X3 size={14} />,
    groups: <FolderOpen size={14} />,
    discovery: <Globe size={14} />,
    live: <Radio size={14} />,
  }

  const tabLabels: Record<string, string> = {
    registry: 'Registry',
    map: 'Device Map',
    groups: 'Groups',
    discovery: 'Discovery',
    live: 'Live Operations',
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>Device Management</h1>
          <p style={s.subtitle}>
            Fleet management for biometric terminals &middot; {devices.length} devices
          </p>
        </div>
        <div style={s.searchRow}>
          <div style={s.searchInput}>
            <Search size={15} style={{ color: 'var(--pz-text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => { setSearchValue(e.target.value); setPage(1) }}
              placeholder="Search by name, serial, IP..."
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--pz-text)',
                fontSize: '13px',
                outline: 'none',
                width: '100%',
                height: '100%',
              }}
            />
          </div>
          {tab === 'registry' && (
            <Button variant="outline" size="md"
              onClick={() => probeAllMutation.mutate()}
              disabled={probeAllMutation.isPending}
              loading={probeAllMutation.isPending}>
              <RefreshCw size={15} className={probeAllMutation.isPending ? 'animate-spin' : ''} />
              Probe All
            </Button>
          )}
          <Button variant="outline" size="md" onClick={handleExport}>
            <Download size={15} />
            Export
          </Button>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={s.tabBar}>
        {Object.keys(tabLabels).map((t) => (
          <button
            key={t}
            style={s.tabPill(tab === t)}
            onClick={() => { setTab(t); setSearchValue('') }}
          >
            {tabIcons[t]}
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* ── Registry Tab ──────────────────────────────────── */}
      {tab === 'registry' && (
        <>
          {/* Summary Cards */}
          <div style={s.summaryGrid}>
            {summaryCards.map(({ icon: Icon, label, key, gradient }) => (
              <div key={key} style={s.summaryCard}>
                <div style={s.iconBox(gradient)}>
                  <Icon size={18} style={{ color: '#fff' }} />
                </div>
                <div>
                  <p style={s.statValue}>{isLoading ? '...' : countMap[key]}</p>
                  <p style={s.statLabel}>{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Fleet Health */}
          {healthOverview && (
            <div style={s.fleetHealthCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Fleet Health
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text-secondary)' }}>
                  {healthOverview.fleet_health_percent}%
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--pz-surface-3)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#10B981', borderRadius: '4px', transition: 'width 0.5s', width: `${healthOverview.fleet_health_percent}%` }} />
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--pz-text-muted)' }}>
                <span>Avg Latency: {healthOverview.avg_response_time_ms ? `${healthOverview.avg_response_time_ms}ms` : '--'}</span>
                <span>Online: {healthOverview.online_count}/{healthOverview.total_devices}</span>
              </div>
            </div>
          )}

          {/* Device Registry Section */}
          <div style={s.section}>
            <div style={s.sectionHeader}>
              <Monitor size={18} style={{ color: 'var(--pz-brand)' }} />
              <h2 style={s.sectionTitle}>Device Registry</h2>
            </div>

            {/* Toolbar: filter chips + view toggle */}
            <div style={s.toolRow}>
              <div style={s.filterRow}>
                {healthFilters.map((f) => (
                  <button
                    key={f}
                    style={s.filterChip(filterValues.health === f || (!filterValues.health && f === ''))}
                    onClick={() => { setFilterValues(prev => ({ ...prev, health: f || '' })); setPage(1) }}
                  >
                    {healthFilterLabels[f]}
                  </button>
                ))}
              </div>
              <div style={s.viewToggle}>
                <button
                  onClick={() => setViewMode('list')}
                  style={s.viewBtn(viewMode === 'list')}
                >
                  <List size={13} /> List
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  style={s.viewBtn(viewMode === 'map')}
                >
                  <Grid3X3 size={13} /> Map
                </button>
              </div>
            </div>

            {viewMode === 'list' ? (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Device</th>
                        <th style={s.th}>Health</th>
                        <th style={s.th}>Status</th>
                        <th style={s.th}>Latency</th>
                        <th style={s.th}>IP Address</th>
                        <th style={s.th}>Office</th>
                        <th style={s.th}>Department</th>
                        <th style={s.th}>Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedDevices.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ ...s.td, textAlign: 'center', padding: '48px 16px' }}>
                            <div style={s.emptyState}>
                              <Monitor size={40} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', margin: '0 0 4px' }}>
                                No Devices Found
                              </p>
                              <p style={{ fontSize: '13px', margin: 0 }}>
                                {searchValue || filterValues.health ? 'Try adjusting your search or filters' : 'No devices registered yet'}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedDevices.map((device) => {
                          const isHovered = hoveredRow === device.id
                          return (
                            <tr
                              key={device.id}
                              style={s.tableRow(isHovered)}
                              onClick={() => setSelectedDevice(device)}
                              onMouseEnter={() => setHoveredRow(device.id)}
                              onMouseLeave={() => setHoveredRow(null)}
                            >
                              <td style={s.td}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={s.avatarBox(device.is_online)}>
                                    <Monitor size={16} style={{ color: device.is_online ? '#10B981' : 'var(--pz-text-muted)', display: 'block' }} />
                                  </div>
                                  <div>
                                    <p style={s.deviceName}>{device.name || `Device ${device.serial_number.slice(-6)}`}</p>
                                    <p style={s.deviceSerial}>{device.serial_number}</p>
                                  </div>
                                </div>
                              </td>
                              <td style={s.td}>
                                <span style={s.healthPill(device.health_status || 'unknown')}>
                                  {healthLabels[device.health_status] || 'Unknown'}
                                </span>
                              </td>
                              <td style={s.td}>
                                <StatusBadge status={device.is_online ? 'online' : 'offline'} size="sm" pulse={device.is_online} />
                              </td>
                              <td style={s.td}>
                                {device.avg_response_time_ms != null ? (
                                  <span style={{
                                    fontSize: '12px',
                                    fontFamily: 'monospace',
                                    color: device.avg_response_time_ms < 2000 ? '#10B981' : device.avg_response_time_ms < 5000 ? '#F59E0B' : '#EF4444',
                                  }}>
                                    {device.avg_response_time_ms}ms
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '12px', color: 'var(--pz-text-faint)' }}>&mdash;</span>
                                )}
                              </td>
                              <td style={s.td}>
                                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--pz-text-muted)' }}>
                                  {device.ip_address || '\u2014'}
                                </span>
                              </td>
                              <td style={s.td}>
                                <span style={{ fontSize: '13px', color: 'var(--pz-text-muted)' }}>
                                  {device.office_name || 'Unassigned'}
                                </span>
                              </td>
                              <td style={s.td}>
                                <span style={{ fontSize: '13px', color: 'var(--pz-text-muted)' }}>
                                  {device.department_name || 'Unassigned'}
                                </span>
                              </td>
                              <td style={s.td}>
                                <span style={{ fontSize: '12px', color: 'var(--pz-text-faint)', fontFamily: 'monospace' }}>
                                  {device.last_seen ? format(new Date(device.last_seen), 'MMM d, HH:mm') : 'Never'}
                                </span>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={s.pagination}>
                    <p style={s.paginationText}>
                      Showing {(page - 1) * pageSize + 1}&ndash;{Math.min(page * pageSize, filtered.length)} of {filtered.length}
                    </p>
                    <div style={s.paginationBtns}>
                      <button
                        style={s.paginationBtn(false)}
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                      >
                        <ChevronDown size={13} style={{ transform: 'rotate(90deg)' }} />
                      </button>
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        const start = Math.max(1, Math.min(page - 3, totalPages - 6))
                        return start + i
                      }).map(p => (
                        <button key={p} style={s.paginationBtn(p === page)} onClick={() => setPage(p)}>
                          {p}
                        </button>
                      ))}
                      <button
                        style={s.paginationBtn(false)}
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      >
                        <ChevronDown size={13} style={{ transform: 'rotate(-90deg)' }} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '20px' }}>
                <DeviceMap devices={filtered} onSelectDevice={(d) => setSelectedDevice(d)} />
              </div>
            )}
          </div>
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
                  padding: '20px', borderRadius: '10px',
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ width: '28px', height: '3px', borderRadius: '2px', background: '#10B981', marginBottom: '6px' }} />
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                  Health Metrics
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px' }}>
                  {[
                    ['Uptime 24h', deviceHealthDetail.uptime_24h_percent != null ? `${deviceHealthDetail.uptime_24h_percent}%` : '--'],
                    ['Uptime 7d', deviceHealthDetail.uptime_7d_percent != null ? `${deviceHealthDetail.uptime_7d_percent}%` : '--'],
                    ['Avg Latency', deviceHealthDetail.avg_response_time_ms ? `${deviceHealthDetail.avg_response_time_ms}ms` : '--'],
                    ['Checks (24h)', String(deviceHealthDetail.total_checks_24h || 0)],
                    ['Consecutive Failures', String(deviceHealthDetail.consecutive_failures || 0)],
                    ['Last Health Check', deviceHealthDetail.last_health_check ? format(new Date(deviceHealthDetail.last_health_check), 'MMM d, HH:mm') : 'Never'],
                  ].map(([label, value]) => (
                    <div key={label} style={{
                      padding: '20px', borderRadius: '10px',
                      background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)',
                      minHeight: '96px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ width: '28px', height: '3px', borderRadius: '2px', background: '#6366F1', marginBottom: '6px' }} />
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                  Biometric Data
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  {[
                    { label: 'Fingerprints', value: biometricCounts.fingerprint || 0, color: '#6366F1' },
                    { label: 'Face', value: biometricCounts.face || 0, color: '#10B981' },
                    { label: 'Cards', value: biometricCounts.card || 0, color: '#F59E0B' },
                    { label: 'PIN', value: biometricCounts.pin || 0, color: '#EF4444' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{
                      padding: '16px', borderRadius: '10px',
                      background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)',
                      textAlign: 'center',
                    }}>
                      <p style={{ fontSize: '20px', fontWeight: 700, color, fontFamily: 'monospace', margin: 0 }}>{value}</p>
                      <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 0' }}>{label}</p>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-muted)' }}>Total Templates</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{biometricCounts.total}</span>
                </div>
              </div>
            )}

            {/* ── Recent Health Checks ────────────────────── */}
            {healthHistory && healthHistory.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ width: '28px', height: '3px', borderRadius: '2px', background: '#F59E0B', marginBottom: '6px' }} />
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                  Recent Health Checks
                </h4>
                <div style={{ border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden', maxHeight: '260px', overflowY: 'auto' }}>
                  {healthHistory.slice(0, 20).map((log: { id: string; check_result: string; response_time_ms: number | null; created_at: string }, i: number) => (
                    <div key={log.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      paddingBlock: '10px', paddingInline: '16px',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ width: '28px', height: '3px', borderRadius: '2px', background: '#3B82F6', marginBottom: '6px' }} />
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                Configuration
              </h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' }}>
                {[
                  ['Serial Number', selectedDevice.serial_number],
                  ['Platform', selectedDevice.platform || '\u2014'],
                  ['Model', selectedDevice.model || '\u2014'],
                  ['Firmware', selectedDevice.firmware_version || '\u2014'],
                  ['Active', selectedDevice.is_active ? 'Yes' : 'No'],
                  ['Registered', format(new Date(selectedDevice.created_at), 'MMM d, yyyy')],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    minHeight: '52px', paddingInline: '16px',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ width: '28px', height: '3px', borderRadius: '2px', background: '#06B6D4', marginBottom: '6px' }} />
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                Network Information
              </h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' }}>
                {[
                  ['IP Address', selectedDevice.ip_address || '\u2014'],
                  ['Office', selectedDevice.office_name || 'Unassigned'],
                  ['Department', selectedDevice.department_name || 'Unassigned'],
                  ['Last Seen', selectedDevice.last_seen ? format(new Date(selectedDevice.last_seen), 'MMM d, yyyy HH:mm') : 'Never'],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    minHeight: '52px', paddingInline: '16px',
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

  const offices: any[] = officesData?.items ?? officesData ?? []
  const departments: any[] = departmentsData?.items ?? departmentsData ?? []

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Monitor size={16} style={{ color: 'var(--pz-accent)' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Device Information</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Input
              label="Device Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. I.T Department Device"
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Office</label>
                <select
                  value={officeId}
                  onChange={(e) => setOfficeId(e.target.value)}
                  style={{ minHeight: '52px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--pz-border)', backgroundColor: 'var(--pz-surface-1)', color: 'var(--pz-text)', fontSize: '14px', outline: 'none' }}
                >
                  <option value="">No Office</option>
                  {offices.map((o: any) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department</label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  style={{ minHeight: '52px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--pz-border)', backgroundColor: 'var(--pz-surface-1)', color: 'var(--pz-text)', fontSize: '14px', outline: 'none' }}
                >
                  <option value="">No Department</option>
                  {departments.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Globe size={16} style={{ color: 'var(--pz-accent)' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</span>
          </div>
          <Input
            label="Location Description"
            value={locationDescription}
            onChange={(e) => setLocationDescription(e.target.value)}
            placeholder="e.g. Main lobby entrance"
            hint="Optional physical location description"
          />
        </div>
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

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Device Group"
        description="Form implementation coming soon"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '32px 24px' }}>
          <FolderOpen size={40} style={{ color: 'var(--pz-text-muted)' }} />
          <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', margin: 0, textAlign: 'center', lineHeight: '1.5' }}>
            Device group management will be available in a future release.
          </p>
        </div>
      </Modal>
    </div>
  )
}
