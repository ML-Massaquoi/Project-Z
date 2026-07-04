import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Calendar, ChevronLeft, ChevronRight, Clock, Download, Fingerprint, Info, List, Radio, Search } from 'lucide-react'
import { attendanceAPI } from '@/api/client'
import { format, subDays, addDays, parseISO, isToday } from 'date-fns'
import type { AttendanceLog, AttendanceSession } from '@/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table/DataTable'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { Section } from '@/components/ui/CardSection'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

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
  tabs: {
    display: 'flex',
    gap: '4px',
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '3px',
  },
  tab: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    border: 'none',
    background: active ? 'var(--pz-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--pz-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }),
}

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
    header: 'Date/Time',
    cell: ({ getValue }) => (
      <span className="text-[var(--pz-text-tertiary)] font-mono tabular-nums text-sm">
        <div>{format(new Date(getValue() as string), 'MMM dd')}</div>
        <div className="text-[10px]" style={{ color: 'var(--pz-text-muted)' }}>{format(new Date(getValue() as string), 'hh:mm:ss a')}</div>
      </span>
    ),
    size: 130,
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
      return <span className="text-[var(--pz-text-tertiary)] font-mono tabular-nums text-sm">{val ? format(new Date(val), 'MMM dd hh:mm a') : '\u2014'}</span>
    },
    size: 140,
  },
  {
    accessorKey: 'check_out',
    header: 'Check Out',
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return <span className="text-[var(--pz-text-tertiary)] font-mono tabular-nums text-sm">{val ? format(new Date(val), 'MMM dd hh:mm a') : '\u2014'}</span>
    },
    size: 140,
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

  const isViewingToday = isToday(parseISO(historyDate))
  const goToPrevDay = useCallback(() => {
    setHistoryDate(d => format(subDays(parseISO(d), 1), 'yyyy-MM-dd'))
  }, [])
  const goToNextDay = useCallback(() => {
    setHistoryDate(d => format(addDays(parseISO(d), 1), 'yyyy-MM-dd'))
  }, [])
  const goToToday = useCallback(() => {
    setHistoryDate(format(new Date(), 'yyyy-MM-dd'))
    setHistoryPage(1)
  }, [])

  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: ['attendance-live', historyDate],
    queryFn: async () => (await attendanceAPI.live({ limit: 50, target_date: historyDate })).data,
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
      if (!data || data.length === 0) {
        toast.error('No data to export')
        return
      }
      // Export as CSV for easy spreadsheet use
      const keys = Object.keys(data[0])
      const csvRows = [keys.join(','), ...data.map((row: Record<string, unknown>) =>
        keys.map(k => {
          const v = row[k]
          if (v === null || v === undefined) return ''
          const s = String(v)
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
        }).join(',')
      )]
      const csv = csvRows.join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-${tab}-${historyDate}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${data.length} records`)
    } catch {
      toast.error('Failed to export attendance data')
    }
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Attendance</h1>
          <p style={s.headerSubtitle}>Workforce attendance tracking and session management</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={s.tabs}>
            <button style={s.tab(tab === 'live')} onClick={() => { setTab('live'); setSearchValue('') }}>
              <Radio size={14} />
              Live Feed
            </button>
            <button style={s.tab(tab === 'history')} onClick={() => { setTab('history'); setSearchValue('') }}>
              <Calendar size={14} />
              Sessions
            </button>
          </div>

          {/* Date navigation */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <button onClick={goToPrevDay} className="p-1 rounded hover:bg-[var(--pz-surface-3)]" title="Previous day">
              <ChevronLeft size={15} style={{ color: 'var(--pz-text-muted)' }} />
            </button>
            <button onClick={goToToday} className="px-2 py-0.5 text-xs font-semibold rounded hover:bg-[var(--pz-surface-3)]" style={{ color: isViewingToday ? 'var(--pz-accent)' : 'var(--pz-text)' }}>
              {format(parseISO(historyDate), 'MMM d, yyyy')}
            </button>
            <button onClick={goToNextDay} className="p-1 rounded hover:bg-[var(--pz-surface-3)]" title="Next day" disabled={isViewingToday}>
              <ChevronRight size={15} style={{ color: isViewingToday ? 'var(--pz-text-faint)' : 'var(--pz-text-muted)' }} />
            </button>
          </div>

          {!isViewingToday && (
            <button onClick={goToToday} className="text-xs px-2 py-1 rounded font-semibold" style={{ background: 'var(--pz-accent)', color: '#fff' }}>
              Today
            </button>
          )}

          <Button variant="outline" size="md" onClick={handleExport}>
            <Download size={14} />
            Export
          </Button>
        </div>
      </div>

      <Section>
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
                Real-time · {filteredLive.length} records
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
      </Section>

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '32px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={16} style={{ color: 'var(--pz-text-muted)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {[
                  { label: 'Check In', value: selectedSession.check_in ? format(new Date(selectedSession.check_in), 'MMM dd hh:mm a') : '—' },
                  { label: 'Check Out', value: selectedSession.check_out ? format(new Date(selectedSession.check_out), 'MMM dd hh:mm a') : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '20px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '10px', minHeight: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '12px', fontWeight: 400, color: 'var(--pz-text-muted)', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--pz-text)', fontFamily: 'monospace', margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Duration/Late/Overtime */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '32px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Info size={16} style={{ color: 'var(--pz-text-muted)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                {[
                  { label: 'Duration', value: selectedSession.duration_minutes ? `${Math.round(selectedSession.duration_minutes)}m` : '—', color: 'var(--pz-text)' },
                  { label: 'Late', value: selectedSession.late_minutes ? `${selectedSession.late_minutes}m` : '—', color: selectedSession.late_minutes ? '#F59E0B' : 'var(--pz-text-muted)' },
                  { label: 'Overtime', value: selectedSession.overtime_minutes ? `${selectedSession.overtime_minutes}m` : '—', color: selectedSession.overtime_minutes ? '#818CF8' : 'var(--pz-text-muted)' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '20px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '10px', textAlign: 'center', minHeight: '72px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: '18px', fontWeight: 700, color, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Details table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '26px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <List size={13} style={{ color: 'var(--pz-text-muted)' }} />
                </div>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Details</h4>
              </div>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' }}>
                {[
                  ['Department', selectedSession.department_name || '—'],
                  ['Date', selectedSession.date],
                  ['Session ID', selectedSession.id],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '52px', paddingInline: '16px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
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
