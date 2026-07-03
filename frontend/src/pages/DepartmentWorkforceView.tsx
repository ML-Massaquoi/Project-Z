import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, UserCheck, Clock, UserX, Calendar,
  ArrowLeft, Download, Search, Sun, Moon, Home, Check, Trash2,
} from 'lucide-react'
import { format } from 'date-fns'
import { workforceAPI, schedulingAPI, shiftTemplatesAPI, shiftAssignmentsAPI } from '@/api/client'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { toast } from 'sonner'
import type { DepartmentEmployee, ShiftTemplate, DepartmentDetail } from '@/types'
import type { RosterGridData } from '@/components/shifts/EnterpriseRosterGrid'
import { EnterpriseRosterGrid } from '@/components/shifts/EnterpriseRosterGrid'
import { Button } from '@/components/ui/button'

const STATUS_COLORS: Record<string, string> = {
  present: 'text-[var(--pz-success-500)]',
  late: 'text-[var(--pz-warning-500)]',
  absent: 'text-[var(--pz-danger-500)]',
  on_leave: 'text-[var(--pz-accent)]',
  off_duty: 'text-[var(--pz-text-muted)]',
  on_time: 'text-[var(--pz-success-500)]',
  early_arrival: 'text-[var(--pz-success-500)]',
}

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '28px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  headerActions: { display: 'flex', alignItems: 'center', gap: '8px' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' },
  card: { background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', boxShadow: 'var(--pz-shadow-sm)', overflow: 'hidden' },
}

export default function DepartmentWorkforceView() {
  const { deptId } = useParams<{ deptId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [shiftFilter, setShiftFilter] = useState<string>('')
  const [gridMonth, setGridMonth] = useState(() => new Date())
  const [dayClickState, setDayClickState] = useState<{
    employeeId: string; employeeName: string; date: string; currentLabel: string
  } | null>(null)
  const [confirmClearGrid, setConfirmClearGrid] = useState(false)

  const clearGridCalendarMut = useMutation({
    mutationFn: () => schedulingAPI.clearCalendar(deptId!, { year: gridMonth.getFullYear(), month: gridMonth.getMonth() + 1 }),
    onSuccess: () => {
      toast.success('Calendar cleared')
      queryClient.invalidateQueries({ queryKey: ['dept-detail', deptId] })
      queryClient.invalidateQueries({ queryKey: ['dept-grid'] })
      setConfirmClearGrid(false)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to clear calendar'),
  })

  const { data: templatesData } = useQuery({
    queryKey: ['shift-templates-for-roster'],
    queryFn: async () => (await shiftTemplatesAPI.list()).data,
  })
  const templates: ShiftTemplate[] = Array.isArray(templatesData) ? templatesData : templatesData?.items ?? []

  const createOverrideMutation = useMutation({
    mutationFn: (data: { employee_id: string; shift_template_id: string; start_date: string; end_date: string; reason?: string }) =>
      shiftAssignmentsAPI.createOverride(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dept-detail', deptId] })
      toast.success('Shift override saved')
      setDayClickState(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save override'),
  })

  /* ── Department detail (always loaded) ─────────── */
  const { data: detail, isLoading } = useQuery<DepartmentDetail>({
    queryKey: ['dept-detail', deptId, statusFilter, shiftFilter, search],
    queryFn: async () => (await workforceAPI.departmentDetail(deptId!, {
      status_filter: statusFilter || undefined,
      shift_filter: shiftFilter || undefined,
      search: search || undefined,
    })).data,
    enabled: !!deptId,
    refetchInterval: 30000,
  })

  const employees: DepartmentEmployee[] = detail?.employees ?? []
  const dept = detail?.department
  const isRotating = dept?.protocol_type === 'rotating'

  /* ── Roster grid data (only for rotating depts) ── */
  const { data: gridData, isLoading: gridLoading } = useQuery<RosterGridData>({
    queryKey: ['dept-grid', deptId, gridMonth.getFullYear(), gridMonth.getMonth() + 1],
    queryFn: async () => (await schedulingAPI.departmentGrid(deptId!, {
      year: gridMonth.getFullYear(),
      month: gridMonth.getMonth() + 1,
    })).data,
    enabled: !!deptId && isRotating,
  })

  const summaryStats = useMemo(() => {
    if (!employees.length) return { present: 0, late: 0, absent: 0, offDuty: 0, onLeave: 0 }
    return {
      present: employees.filter(e => e.status === 'present').length,
      late: employees.filter(e => e.status === 'late').length,
      absent: employees.filter(e => e.status === 'absent').length,
      offDuty: employees.filter(e => e.status === 'off_duty').length,
      onLeave: employees.filter(e => e.status === 'on_leave').length,
    }
  }, [employees])

  const handleGridExport = async (fmt: 'csv' | 'excel' | 'pdf') => {
    if (!deptId) return
    try {
      const { rosterExportsAPI } = await import('@/api/client')
      const fn = rosterExportsAPI[fmt]
      const res = await fn(deptId, gridMonth.getFullYear(), gridMonth.getMonth() + 1)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `roster_${dept?.name || deptId}_${gridMonth.getFullYear()}_${gridMonth.getMonth() + 1}.${fmt === 'excel' ? 'xlsx' : fmt}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.success(`Exported as ${fmt.toUpperCase()}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Export failed')
    }
  }

  return (
    <div style={s.page}>
      {/* ── Header ──────────────────────────────── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>{dept?.name || 'Department'}</h1>
          <p style={s.headerSubtitle}>
            {[dept?.office_name, `Protocol: ${dept?.shift_protocol_name || 'None'}`, format(new Date(), 'EEEE, MMMM d yyyy')]
              .filter(Boolean).join(' \u00B7 ')}
          </p>
        </div>
        <div style={s.headerActions}>
          <Button variant="outline" size="md" onClick={() => navigate('/departments')}>
            <ArrowLeft size={15} /> Back
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────── */}
      <div style={s.cards}>
        <KPICard icon={Users} label="Total Staff" value={employees.length} color="#3B82F6" />
        <KPICard icon={UserCheck} label="Present" value={summaryStats.present} color="#10B981" />
        <KPICard icon={Clock} label="Late" value={summaryStats.late} color="#F59E0B" />
        <KPICard icon={UserX} label="Absent" value={summaryStats.absent} color="#EF4444" />
        <KPICard icon={Home} label="Off Duty" value={summaryStats.offDuty} color="#6B7280" />
      </div>

      {/* ── Content ──────────────────────────────── */}
      {isRotating ? (
        /* ── Rotating department → Enterprise Roster Grid ─── */
        <>
          <EnterpriseRosterGrid
            data={gridData}
            loading={isLoading || gridLoading}
            month={gridMonth}
            onMonthChange={setGridMonth}
            onExport={handleGridExport}
          />
          {deptId && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              {confirmClearGrid ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>Remove all roster entries for this month?</span>
                  <button onClick={() => { setConfirmClearGrid(false); clearGridCalendarMut.mutate() }} disabled={clearGridCalendarMut.isPending}
                    style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--pz-danger-500)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    {clearGridCalendarMut.isPending ? 'Clearing...' : 'Yes, Clear'}
                  </button>
                  <button onClick={() => setConfirmClearGrid(false)}
                    style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmClearGrid(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--pz-danger-500)'; (e.currentTarget as HTMLElement).style.color = 'var(--pz-danger-500)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--pz-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--pz-text-muted)' }}>
                  <Trash2 size={13} /> Clear Month
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        /* ── Fixed department → Employee Table ───────────── */
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--pz-text-muted)]" />
              <input type="text" placeholder="Search by name or ID..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500/50 transition-colors" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-4 py-3 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text-secondary)] focus:outline-none">
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="on_leave">On Leave</option>
              <option value="off_duty">Off Duty</option>
            </select>
            <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}
              className="px-4 py-3 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text-secondary)] focus:outline-none">
              <option value="">All Shifts</option>
              <option value="day">Day</option>
              <option value="night">Night</option>
            </select>
          </div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={s.card}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--pz-border)] bg-[var(--pz-surface-2)]/50">
                    <th className="text-left py-3 px-4 pz-section-label sticky left-0 bg-[var(--pz-surface-2)]/50">Employee</th>
                    <th className="text-left py-3 px-4 pz-section-label">ID</th>
                    <th className="text-left py-3 px-4 pz-section-label">Designation</th>
                    <th className="text-left py-3 px-4 pz-section-label">Current Shift</th>
                    <th className="text-left py-3 px-4 pz-section-label">Status</th>
                    <th className="text-left py-3 px-4 pz-section-label">Next Shift</th>
                    <th className="text-left py-3 px-4 pz-section-label">Check In</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, i) => (
                    <motion.tr key={emp.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-[var(--pz-border)]/30 hover:bg-[var(--pz-surface-2)]/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/workforce/employee/${emp.id}`)}>
                      <td className="py-3 px-4 sticky left-0 bg-[var(--pz-surface)]">
                        <div className="flex items-center gap-2.5">
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.15))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--pz-accent)', border: '1px solid rgba(59,130,246,0.3)' }}>
                            {emp.full_name?.[0] || '?'}
                          </div>
                          <div>
                            <span className="font-semibold text-[var(--pz-text)]">{emp.full_name}</span>
                            <p className="text-[10px] text-[var(--pz-text-muted)]">{emp.employee_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[var(--pz-text-muted)] font-mono text-[10px]">{emp.employee_code}</td>
                      <td className="py-3 px-4 text-[var(--pz-text-muted)]">{emp.position || '\u2014'}</td>
                      <td className="py-3 px-4">
                        <span className="text-[var(--pz-text-secondary)] font-semibold text-[11px]">{emp.current_shift}</span>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={emp.status as any} size="xs">
                          <span className={STATUS_COLORS[emp.status] || 'text-[var(--pz-text-muted)]'}>
                            {emp.status.replace('_', ' ')}
                          </span>
                        </StatusBadge>
                      </td>
                      <td className="py-3 px-4 text-[var(--pz-text-muted)]">{emp.next_shift}</td>
                      <td className="py-3 px-4 text-[var(--pz-text-muted)] font-mono text-[10px]">
                        {emp.check_in ? format(new Date(emp.check_in), 'hh:mm a') : '\u2014'}
                      </td>
                    </motion.tr>
                  ))}
                  {!employees.length && !isLoading && (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-[var(--pz-text-muted)]">
                        <Users size={32} className="mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">No employees found</p>
                        <p className="text-xs mt-1">Adjust filters or assign employees to this department</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}
