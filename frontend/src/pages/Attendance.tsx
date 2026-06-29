import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Fingerprint, Calendar, Download, Radio } from 'lucide-react'
import { attendanceAPI } from '@/api/client'
import { format } from 'date-fns'
import type { AttendanceLog, AttendanceSession } from '@/types'
import { PageHeader, TabBar } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table/DataTable'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/* ── Live Feed Columns ───────────────────────────────────── */
const liveColumns: ColumnDef<AttendanceLog, unknown>[] = [
  {
    accessorKey: 'employee_name',
    header: 'Employee',
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 text-blue-400 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold">{row.original.employee_name?.[0] || '?'}</span>
        </div>
        <div>
          <p className="font-semibold text-[var(--pz-text-secondary)] text-sm">{row.original.employee_name || 'Unknown'}</p>
          <p className="text-[10px] text-[var(--pz-text-muted)]">{row.original.employee_code}</p>
        </div>
      </div>
    ),
    size: 220,
  },
  {
    accessorKey: 'department_name',
    header: 'Department',
    cell: ({ getValue }) => <span className="text-[var(--pz-text-tertiary)] text-sm">{(getValue() as string) || '\u2014'}</span>,
  },
  {
    accessorKey: 'punch_direction',
    header: 'Direction',
    cell: ({ getValue }) => {
      const dir = getValue() as string
      return <StatusBadge status={dir === 'in' ? 'in' : 'out'} size="xs" dot={false}>{dir?.toUpperCase()}</StatusBadge>
    },
    size: 100,
  },
  {
    accessorKey: 'timestamp',
    header: 'Time',
    cell: ({ getValue }) => (
      <span className="text-[var(--pz-text-tertiary)] font-mono tabular-nums text-sm">
        {format(new Date(getValue() as string), 'hh:mm:ss a')}
      </span>
    ),
    size: 120,
  },
  {
    accessorKey: 'device_name',
    header: 'Terminal',
    cell: ({ row }) => (
      <span className="text-[var(--pz-text-faint)] font-mono text-xs">
        {row.original.device_ip || row.original.device_name || '\u2014'}
      </span>
    ),
    size: 140,
  },
  {
    accessorKey: 'verify_type',
    header: 'Verify',
    cell: ({ getValue }) => (
      <span className="text-[var(--pz-text-faint)] capitalize text-xs">{getValue() as string}</span>
    ),
    size: 100,
  },
]

/* ── Session Columns ─────────────────────────────────────── */
const sessionColumns: ColumnDef<AttendanceSession, unknown>[] = [
  {
    accessorKey: 'employee_name',
    header: 'Employee',
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 text-blue-400 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold">{row.original.employee_name?.[0] || '?'}</span>
        </div>
        <div>
          <p className="font-semibold text-[var(--pz-text-secondary)] text-sm">{row.original.employee_name}</p>
          <p className="text-[10px] text-[var(--pz-text-muted)]">{row.original.employee_code}</p>
        </div>
      </div>
    ),
    size: 200,
  },
  {
    accessorKey: 'department_name',
    header: 'Department',
    cell: ({ getValue }) => <span className="text-[var(--pz-text-tertiary)] text-sm">{(getValue() as string) || '\u2014'}</span>,
  },
  {
    accessorKey: 'check_in',
    header: 'Check In',
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return <span className="text-[var(--pz-text-tertiary)] font-mono tabular-nums text-sm">{val ? format(new Date(val), 'hh:mm a') : '\u2014'}</span>
    },
    size: 100,
  },
  {
    accessorKey: 'check_out',
    header: 'Check Out',
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return <span className="text-[var(--pz-text-tertiary)] font-mono tabular-nums text-sm">{val ? format(new Date(val), 'hh:mm a') : '\u2014'}</span>
    },
    size: 100,
  },
  {
    accessorKey: 'duration_minutes',
    header: 'Duration',
    cell: ({ getValue }) => {
      const val = getValue() as number | null
      if (!val) return <span className="text-[var(--pz-text-muted)]">\u2014</span>
      const h = Math.floor(val / 60)
      const m = Math.round(val % 60)
      return <span className="text-[var(--pz-text-tertiary)] font-mono tabular-nums text-sm">{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>
    },
    size: 100,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const status = getValue() as string
      return <StatusBadge status={status as 'on_time' | 'late' | 'absent' | 'early_departure'} size="xs" dot={false}>{status.replace(/_/g, ' ')}</StatusBadge>
    },
    size: 120,
  },
  {
    accessorKey: 'late_minutes',
    header: 'Late',
    cell: ({ getValue }) => {
      const val = getValue() as number | null
      if (!val) return <span className="text-[var(--pz-text-muted)]">\u2014</span>
      return <span className="text-amber-400 font-mono text-[11px] font-semibold">{val}m</span>
    },
    size: 80,
  },
]

export default function Attendance() {
  const [tab, setTab] = useState('live')
  const [historyDate, setHistoryDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [historyPage, setHistoryPage] = useState(1)
  const [searchValue, setSearchValue] = useState('')
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null)

  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: ['attendance-live'],
    queryFn: async () => (await attendanceAPI.live({ limit: 50 })).data,
    refetchInterval: 10000,
    enabled: tab === 'live',
  })

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['attendance-history', historyDate, historyPage],
    queryFn: async () => (await attendanceAPI.history({ target_date: historyDate, page: historyPage, per_page: 20 })).data,
    enabled: tab === 'history',
  })

  const filteredLive = useMemo(() => {
    if (!liveData?.items) return []
    if (!searchValue.trim()) return liveData.items
    const q = searchValue.toLowerCase()
    return liveData.items.filter((log: AttendanceLog) =>
      log.employee_name?.toLowerCase().includes(q) ||
      log.employee_code?.toLowerCase().includes(q) ||
      log.department_name?.toLowerCase().includes(q)
    )
  }, [liveData?.items, searchValue])

  const filteredHistory = useMemo(() => {
    if (!historyData?.items) return []
    if (!searchValue.trim()) return historyData.items
    const q = searchValue.toLowerCase()
    return historyData.items.filter((s: AttendanceSession) =>
      s.employee_name?.toLowerCase().includes(q) ||
      s.employee_code?.toLowerCase().includes(q) ||
      s.department_name?.toLowerCase().includes(q)
    )
  }, [historyData?.items, searchValue])

  const handleExport = async () => {
    try {
      const data = tab === 'live' ? filteredLive : filteredHistory
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-${tab}-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Attendance data exported')
    } catch {
      toast.error('Failed to export attendance data')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="Workforce attendance tracking and session management"
        breadcrumbs={[{ label: 'Operations' }, { label: 'Attendance' }]}
        tabs={
          <TabBar
            tabs={[
              { id: 'live', label: 'Live Feed', icon: <Radio size={14} /> },
              { id: 'history', label: 'Sessions', icon: <Calendar size={14} /> },
            ]}
            activeTab={tab}
            onChange={(t) => { setTab(t); setSearchValue('') }}
          />
        }
        actions={
          <Button variant="outline" size="md" onClick={handleExport}>
            <Download size={14} />
            Export
          </Button>
        }
      />

      {tab === 'live' ? (
        <DataTable
          data={filteredLive}
          columns={liveColumns}
          loading={liveLoading}
          enablePagination={false}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search employees, departments..."
          toolbar={
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold ml-auto flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pz-pulse-dot" />
              Real-time \u00b7 {filteredLive.length} records
            </div>
          }
          emptyState={
            <div className="flex flex-col items-center py-8 text-[var(--pz-text-muted)]">
              <Fingerprint size={36} className="mb-3 opacity-20" />
              <p className="text-sm font-medium">No live attendance data</p>
              <p className="text-xs mt-1 text-[var(--pz-text-faint)]">Records appear in real-time as employees scan</p>
            </div>
          }
        />
      ) : (
        <DataTable
          data={filteredHistory}
          columns={sessionColumns}
          loading={historyLoading}
          onRowClick={(session) => setSelectedSession(session)}
          enablePagination={historyData?.pages > 1}
          totalRows={historyData?.total}
          totalPages={historyData?.pages}
          currentPage={historyPage}
          onPageChange={(page) => setHistoryPage(page)}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search employees..."
          toolbar={
            <span className="text-xs text-[var(--pz-text-muted)] ml-auto">
              {historyData?.total ?? 0} sessions
            </span>
          }
          emptyState={
            <div className="flex flex-col items-center py-8 text-[var(--pz-text-muted)]">
              <Calendar size={36} className="mb-3 opacity-20" />
              <p className="text-sm font-medium">No attendance sessions for this date</p>
              <p className="text-xs mt-1 text-[var(--pz-text-faint)]">Select a different date to view records</p>
            </div>
          }
        />
      )}

      {/* Session Detail Drawer */}
      <DetailDrawer
        open={!!selectedSession}
        onClose={() => setSelectedSession(null)}
        title={selectedSession?.employee_name || 'Session Details'}
        subtitle={selectedSession ? `${selectedSession.employee_code} · ${selectedSession.date}` : ''}
        width={680}
      >
        {selectedSession && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
              <StatusBadge status={selectedSession.status as 'on_time' | 'late' | 'absent'} size="md">
                {selectedSession.status.replace(/_/g, ' ')}
              </StatusBadge>
              {selectedSession.is_complete && (
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#10B981' }}>Complete</span>
              )}
            </div>

            {/* Check in / out */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {[
                { label: 'Check In', value: selectedSession.check_in ? format(new Date(selectedSession.check_in), 'hh:mm a') : '—' },
                { label: 'Check Out', value: selectedSession.check_out ? format(new Date(selectedSession.check_out), 'hh:mm a') : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '16px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '6px', minHeight: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: '12px', fontWeight: 400, color: 'var(--pz-text-muted)', margin: 0 }}>{label}</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', fontFamily: 'monospace', margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Duration/Late/Overtime */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {[
                { label: 'Duration', value: selectedSession.duration_minutes ? `${Math.round(selectedSession.duration_minutes)}m` : '—', color: 'var(--pz-text)' },
                { label: 'Late', value: selectedSession.late_minutes ? `${selectedSession.late_minutes}m` : '—', color: selectedSession.late_minutes ? '#F59E0B' : 'var(--pz-text-muted)' },
                { label: 'Overtime', value: selectedSession.overtime_minutes ? `${selectedSession.overtime_minutes}m` : '—', color: selectedSession.overtime_minutes ? '#818CF8' : 'var(--pz-text-muted)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: '16px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '6px', textAlign: 'center', minHeight: '72px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{label}</p>
                  <p style={{ fontSize: '18px', fontWeight: 700, color, margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Details table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Details</h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  ['Department', selectedSession.department_name || '—'],
                  ['Date', selectedSession.date],
                  ['Session ID', selectedSession.id],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '44px', paddingInline: '14px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </DetailDrawer>
    </div>
  )
}
