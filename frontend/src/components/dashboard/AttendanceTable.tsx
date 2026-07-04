import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { attendanceAPI } from '@/api/client'
import { format } from 'date-fns'
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, Inbox } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { SkeletonRow } from '@/components/ui/SkeletonRow'

type SortField = 'employee_name' | 'department_name' | 'shift_name' | 'check_in' | 'check_out' | 'status' | 'duration_minutes'
type SortDir = 'asc' | 'desc'

export default function AttendanceTable() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('check_in')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const perPage = 15

  const today = format(new Date(), 'yyyy-MM-dd')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['attendance-today', today],
    queryFn: async () => (await attendanceAPI.live({ date: today })).data,
    refetchInterval: 20000,
  })

  const sessions = useMemo(() => {
    if (!data) return []
    const items = Array.isArray(data) ? data : data.items || data.sessions || []
    return items
  }, [data])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions
    const q = search.toLowerCase()
    return sessions.filter(
      (s: any) =>
        (s.employee_name || '').toLowerCase().includes(q) ||
        (s.employee_code || '').toLowerCase().includes(q) ||
        (s.department_name || '').toLowerCase().includes(q) ||
        (s.shift_name || '').toLowerCase().includes(q)
    )
  }, [sessions, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a: any, b: any) => {
      const aVal = a[sortField] ?? ''
      const bVal = b[sortField] ?? ''
      const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage))
  const paged = sorted.slice((page - 1) * perPage, page * perPage)

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={10} className="text-[var(--pz-text-muted)] ml-1 opacity-40" />
    return <ArrowUpDown size={10} className="text-[var(--pz-accent)] ml-1" />
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'present':
      case 'on_time':
      case 'completed':
        return <span className="badge-present">Present</span>
      case 'late':
        return <span className="badge-late">Late</span>
      case 'absent':
        return <span className="badge-absent">Absent</span>
      case 'in_progress':
        return <span className="badge-pending">In Progress</span>
      default:
        return <span className="badge-pending">{status || '--'}</span>
    }
  }

  const formatDuration = (mins: number | null | undefined) => {
    if (mins == null) return '--'
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${h}h ${m.toString().padStart(2, '0')}m`
  }

  const formatTime = (t: string | null | undefined) => {
    if (!t) return '--'
    try {
      return format(new Date(t), 'MMM dd HH:mm')
    } catch {
      return '--'
    }
  }

  if (error) return <ErrorState message="Failed to load attendance" onRetry={() => refetch()} />

  return (
    <div className="card">
      <div className="card-header">
        <h3>Today's Attendance</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pz-text-muted)]" />
            <input
              type="text"
              placeholder="Search employee..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="ops-input pl-7 w-44 py-1 text-[11px]"
            />
          </div>
          <span className="text-[10px] text-[var(--pz-text-muted)]">{filtered.length} records</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="ops-table">
          <thead>
            <tr>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('employee_name')}>
                Employee <SortIcon field="employee_name" />
              </th>
              <th>Staff ID</th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('department_name')}>
                Department <SortIcon field="department_name" />
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('shift_name')}>
                Shift <SortIcon field="shift_name" />
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('check_in')}>
                Clock In <SortIcon field="check_in" />
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('check_out')}>
                Clock Out <SortIcon field="check_out" />
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                Status <SortIcon field="status" />
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('duration_minutes')}>
                Hours <SortIcon field="duration_minutes" />
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRow columns={8} />
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState icon={Inbox} message={search ? 'No matching records' : 'No attendance data for today'} />
                </td>
              </tr>
            ) : (
              paged.map((s: any) => (
                <tr key={s.id || s.session_id || s.employee_id}>
                  <td className="font-medium text-[var(--pz-text)]">{s.employee_name || 'Unknown'}</td>
                  <td className="font-mono text-[var(--pz-text-muted)] text-[11px]">{s.employee_code || '--'}</td>
                  <td>{s.department_name || '--'}</td>
                  <td className="text-[var(--pz-text-muted)]">{s.shift_name || '--'}</td>
                  <td className="font-mono text-[var(--pz-success-500)]">{formatTime(s.check_in)}</td>
                  <td className="font-mono text-[var(--pz-warning-500)]">{formatTime(s.check_out)}</td>
                  <td>{statusBadge(s.status)}</td>
                  <td className="font-mono text-[var(--pz-text-muted)] text-[11px]">{formatDuration(s.duration_minutes)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--pz-border)]">
          <span className="text-[10px] text-[var(--pz-text-muted)]">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="ops-btn ops-btn-ghost p-1 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="ops-btn ops-btn-ghost p-1 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
