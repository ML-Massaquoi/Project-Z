import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, UserCheck, Clock, UserX, Calendar, Shield,
  ArrowLeft, Download, Search, Filter, Sun, Moon, Home,
  ShieldCheck, ShieldAlert, Check,
} from 'lucide-react'
import { format } from 'date-fns'
import { workforceAPI, shiftTemplatesAPI, shiftAssignmentsAPI } from '@/api/client'
import { PageHeader } from '@/components/ui/PageHeader'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { RosterPlanner } from '@/components/shifts/RosterPlanner'
import { toast } from 'sonner'
import type { DepartmentEmployee, DepartmentRoster, ShiftTemplate } from '@/types'
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

const SHIFT_LABEL_COLORS: Record<string, string> = {
  D: 'bg-amber-500/10 text-[var(--pz-warning-500)] border-amber-500/20',
  N: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  OFF: 'bg-gray-500/10 text-[var(--pz-text-muted)] border-gray-500/20',
  '—': 'bg-gray-500/10 text-[var(--pz-text-muted)] border-gray-500/20',
}

export default function DepartmentWorkforceView() {
  const { deptId } = useParams<{ deptId: string }>()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [shiftFilter, setShiftFilter] = useState<string>('')
  const [view, setView] = useState<'table' | 'roster'>('table')
  const [rosterMonth, setRosterMonth] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  }))
  const queryClient = useQueryClient()
  const [dayClickState, setDayClickState] = useState<{
    employeeId: string
    employeeName: string
    date: string
    currentLabel: string
  } | null>(null)

  const { data: templatesData } = useQuery({
    queryKey: ['shift-templates-for-roster'],
    queryFn: async () => (await shiftTemplatesAPI.list()).data,
  })
  const templates: ShiftTemplate[] = Array.isArray(templatesData) ? templatesData : templatesData?.items ?? []

  const createOverrideMutation = useMutation({
    mutationFn: (data: { employee_id: string; shift_template_id: string; start_date: string; end_date: string; reason?: string }) =>
      shiftAssignmentsAPI.createOverride(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dept-roster', deptId] })
      toast.success('Shift override saved')
      setDayClickState(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save override'),
  })

  const { data: detail, isLoading } = useQuery<{ department: { id: string; name: string; code: string; office_name: string | null; shift_protocol_name: string | null; head_name: string | null }; employees: DepartmentEmployee[]; total: number; date: string }>({
    queryKey: ['dept-detail', deptId, statusFilter, shiftFilter, search],
    queryFn: async () => (await workforceAPI.departmentDetail(deptId!, {
      status_filter: statusFilter || undefined,
      shift_filter: shiftFilter || undefined,
      search: search || undefined,
    })).data,
    enabled: !!deptId,
    refetchInterval: 30000,
  })

  const { data: roster } = useQuery({
    queryKey: ['dept-roster', deptId, rosterMonth],
    queryFn: async () => (await workforceAPI.departmentRoster(deptId!, rosterMonth.year, rosterMonth.month)).data,
    enabled: !!deptId && view === 'roster',
  })

  const employees: DepartmentEmployee[] = detail?.employees ?? []
  const dept = detail?.department

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

  const handleExport = async () => {
    if (!deptId) return
    try {
      const response = await workforceAPI.exportRoster({
        department_id: deptId,
        year: rosterMonth.year,
        month: rosterMonth.month,
        format: 'xlsx',
      })
      const data = response.data
      const blob = data instanceof Blob ? data : new Blob([data])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `roster_${dept?.name || 'dept'}_${rosterMonth.year}_${rosterMonth.month}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.success('Export downloaded')
    } catch (err: any) {
      console.error('Export failed:', err)
      toast.error(err.response?.data?.detail || 'Failed to export roster')
    }
  }

  return (
    <div className="space-y-5 pz-slide-up">
      <PageHeader
        title={dept?.name || 'Department'}
        subtitle={`${dept?.office_name || ''} · Protocol: ${dept?.shift_protocol_name || 'None'} · ${format(new Date(), 'EEEE, MMMM d yyyy')}`}
        breadcrumbs={[
          { label: 'Workforce', href: '/departments' },
          { label: dept?.name || 'Department' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" onClick={() => navigate('/departments')}>
              <ArrowLeft size={15} />
              Back
            </Button>
            <Button variant="success" size="md" onClick={handleExport}>
              <Download size={15} />
              Export
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard icon={Users} label="Total Staff" value={employees.length} color="#3B82F6" />
        <KPICard icon={UserCheck} label="Present" value={summaryStats.present} color="#10B981" />
        <KPICard icon={Clock} label="Late" value={summaryStats.late} color="#F59E0B" />
        <KPICard icon={UserX} label="Absent" value={summaryStats.absent} color="#EF4444" />
        <KPICard icon={Home} label="Off Duty" value={summaryStats.offDuty} color="#6B7280" />
      </div>

      {/* View Toggle + Filters */}
      <div className="space-y-3">
        {/* View toggle — full row */}
        <div className="flex items-center gap-2 p-1.5 bg-[var(--pz-surface-2)] rounded-xl border border-[var(--pz-border)] w-fit">
          <button
            onClick={() => setView('table')}
            className={`flex items-center gap-2.5 px-6 py-3 rounded-lg text-sm font-semibold transition-all ${
              view === 'table' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-[var(--pz-text-muted)] hover:text-[var(--pz-text)] hover:bg-[var(--pz-surface-3)]'
            }`}
          >
            <Users size={16} />
            Employee Table
          </button>
          <button
            onClick={() => setView('roster')}
            className={`flex items-center gap-2.5 px-6 py-3 rounded-lg text-sm font-semibold transition-all ${
              view === 'roster' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-[var(--pz-text-muted)] hover:text-[var(--pz-text)] hover:bg-[var(--pz-surface-3)]'
            }`}
          >
            <Calendar size={16} />
            Monthly Roster
          </button>
        </div>

        {/* Filters — only when in table view */}
        {view === 'table' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--pz-text-muted)]" />
              <input
                type="text"
                placeholder="Search by name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text-secondary)] focus:outline-none focus:border-blue-500/50 transition-colors"
            >
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="on_leave">On Leave</option>
              <option value="off_duty">Off Duty</option>
            </select>

            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="px-4 py-3 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text-secondary)] focus:outline-none focus:border-blue-500/50 transition-colors"
            >
              <option value="">All Shifts</option>
              <option value="day">Day Shift</option>
              <option value="night">Night Shift</option>
            </select>
          </div>
        )}
      </div>

      {/* Content */}
      {view === 'table' ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="pz-card overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--pz-border)] bg-[var(--pz-surface-2)]/50">
                  <th className="text-left py-3 px-4 pz-section-label sticky left-0 bg-[var(--pz-surface-2)]/50">Employee</th>
                  <th className="text-left py-3 px-4 pz-section-label">ID</th>
                  <th className="text-left py-3 px-4 pz-section-label">Designation</th>
                  <th className="text-left py-3 px-4 pz-section-label">Protocol</th>
                  <th className="text-left py-3 px-4 pz-section-label">Current Shift</th>
                  <th className="text-left py-3 px-4 pz-section-label">Status</th>
                  <th className="text-left py-3 px-4 pz-section-label">Next Shift</th>
                  <th className="text-left py-3 px-4 pz-section-label">Check In</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, i) => (
                  <motion.tr
                    key={emp.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-[var(--pz-border)]/30 hover:bg-[var(--pz-surface-2)]/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/workforce/employee/${emp.id}`)}
                  >
                    <td className="py-3 px-4 sticky left-0 bg-[var(--pz-surface)]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-[10px] font-bold text-[var(--pz-accent)] border border-blue-200">
                          {emp.full_name?.[0] || '?'}
                        </div>
                        <div>
                          <span className="font-semibold text-[var(--pz-text)]">{emp.full_name}</span>
                          <p className="text-[10px] text-[var(--pz-text-muted)]">{emp.employee_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[var(--pz-text-muted)] font-mono text-[10px]">{emp.employee_code}</td>
                    <td className="py-3 px-4 text-[var(--pz-text-muted)]">{emp.position || '—'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5" title={emp.has_individual_override ? 'Individual override active' : 'Using department default protocol'}>
                        {emp.has_individual_override ? (
                          <ShieldAlert size={11} className="text-[var(--pz-warning-500)] flex-shrink-0" />
                        ) : (
                          <ShieldCheck size={11} className="text-[var(--pz-success-500)]/60 flex-shrink-0" />
                        )}
                        <span className={`text-[10px] ${emp.has_individual_override ? 'text-[var(--pz-warning-500)] font-semibold' : 'text-[var(--pz-text-muted)]'}`}>
                          {emp.shift_protocol_name || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${SHIFT_LABEL_COLORS[emp.shift_label] || SHIFT_LABEL_COLORS['—']}`}>
                        {emp.shift_label === 'D' && <Sun size={10} className="mr-1" />}
                        {emp.shift_label === 'N' && <Moon size={10} className="mr-1" />}
                        {emp.current_shift}
                      </span>
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
                      {emp.check_in ? format(new Date(emp.check_in), 'hh:mm a') : '—'}
                    </td>
                  </motion.tr>
                ))}
                {!employees.length && !isLoading && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-[var(--pz-text-muted)]">
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
      ) : (
        <RosterPlanner
          roster={roster}
          year={rosterMonth.year}
          month={rosterMonth.month}
          onMonthChange={(y, m) => setRosterMonth({ year: y, month: m })}
          onExport={handleExport}
          onDayClick={(empId, empName, date, label) => setDayClickState({ employeeId: empId, employeeName: empName, date, currentLabel: label })}
        />
      )}

      {/* ── Shift Day Picker Modal ──────────────────────────── */}
      {dayClickState && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setDayClickState(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              width: '100%', maxWidth: '480px',
              background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)',
              boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 16px 24px', borderBottom: '1px solid var(--pz-border)' }}>
              <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>
                {dayClickState.employeeName}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)', marginTop: '3px', marginBottom: 0 }}>
                {format(new Date(dayClickState.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                <span style={{ marginLeft: '10px' }}>
                  Current: <strong style={{ color: 'var(--pz-text-secondary)' }}>{dayClickState.currentLabel}</strong>
                </span>
              </p>
            </div>

            {/* Body */}
            <div style={{ padding: '16px 24px 24px 24px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Quick Set</p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { label: 'D', name: 'Day', color: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-400' },
                  { label: 'N', name: 'Night', color: 'bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20 text-indigo-400' },
                  { label: 'OFF', name: 'Off', color: 'bg-gray-500/10 hover:bg-gray-500/20 border-gray-500/20 text-gray-400' },
                  { label: 'LV', name: 'Leave', color: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20 text-blue-400' },
                ].map(q => (
                  <button
                    key={q.label}
                    onClick={() => {
                      const templatesForLabel = templates.filter(t => {
                        if (q.label === 'OFF') return t.code.toUpperCase() === 'OFF'
                        if (q.label === 'LV') return t.code.toUpperCase() === 'LV' || t.name.toLowerCase().includes('leave')
                        if (q.label === 'N') return t.is_overnight || t.start_time >= '12:00'
                        if (q.label === 'D') return !t.is_overnight && t.start_time < '12:00' && t.code.toUpperCase() !== 'OFF'
                        return false
                      })
                      const tmpl = templatesForLabel[0]
                      if (!tmpl) { toast.error(`No ${q.name} shift template found`); return }
                      createOverrideMutation.mutate({
                        employee_id: dayClickState.employeeId,
                        shift_template_id: tmpl.id,
                        start_date: dayClickState.date,
                        end_date: dayClickState.date,
                        reason: `Quick set: ${q.label}`,
                      })
                    }}
                    disabled={dayClickState.currentLabel === q.label}
                    className={`flex flex-col items-center gap-1 p-3 rounded border text-xs font-semibold transition-all disabled:opacity-30 ${q.color}`}
                  >
                    <span className="text-sm font-bold">{q.label}</span>
                    <span className="text-[9px] opacity-70">{q.name}</span>
                    {dayClickState.currentLabel === q.label && <Check size={10} className="mt-0.5" />}
                  </button>
                ))}
              </div>

              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Or pick a template</p>
              <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
                {templates.filter(t => t.is_active).map(t => {
                  const isCurrentOverride = templates.find(t2 => {
                    if (dayClickState.currentLabel === 'OFF') return t2.code.toUpperCase() === 'OFF'
                    if (dayClickState.currentLabel === 'LV') return t2.code.toUpperCase() === 'LV'
                    if (dayClickState.currentLabel === 'N') return t2.is_overnight || t2.start_time >= '12:00'
                    if (dayClickState.currentLabel === 'D') return !t2.is_overnight && t2.start_time < '12:00' && t2.code.toUpperCase() !== 'OFF'
                    return false
                  })?.id === t.id

                  return (
                    <button
                      key={t.id}
                      onClick={() => createOverrideMutation.mutate({
                        employee_id: dayClickState.employeeId,
                        shift_template_id: t.id,
                        start_date: dayClickState.date,
                        end_date: dayClickState.date,
                        reason: `Set shift: ${t.name}`,
                      })}
                      className={`w-full flex items-center justify-between p-2.5 rounded border transition-all hover:bg-[var(--pz-surface-2)] ${isCurrentOverride ? 'border-blue-500/30 bg-blue-500/5' : 'border-[var(--pz-border)]'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[8px] font-bold ${
                          t.is_overnight ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            : t.code.toUpperCase() === 'OFF' ? 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {t.code.toUpperCase() === 'OFF' ? 'OFF' : t.is_overnight ? 'N' : 'D'}
                        </span>
                        <div className="text-left">
                          <p className="text-xs font-semibold text-[var(--pz-text)]">{t.name}</p>
                          <p className="text-[9px] text-[var(--pz-text-muted)]">{t.start_time} — {t.end_time} · {t.working_hours}h</p>
                        </div>
                      </div>
                      {isCurrentOverride && <Check size={12} className="text-blue-400" />}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => setDayClickState(null)}
                style={{ width: '100%', height: '38px', borderRadius: '4px', fontSize: '13px', fontWeight: 600, background: 'var(--pz-surface-2)', color: 'var(--pz-text-secondary)', border: '1px solid var(--pz-border)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
