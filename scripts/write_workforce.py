path = r'C:\Users\moses.massaquoi\Documents\Project-Z\frontend\src\pages\DepartmentWorkforceView.tsx'

content = r"""import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, UserCheck, Clock, UserX, Calendar, Shield,
  ArrowLeft, Download, Search, Sun, Moon, Trash2, Edit3,
  ChevronLeft, ChevronRight, Mail, Phone, Briefcase, Info,
} from 'lucide-react'
import { format, addMonths, subMonths } from 'date-fns'
import { workforceAPI, shiftTemplatesAPI, shiftAssignmentsAPI, employeesAPI, schedulingAPI } from '@/api/client'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { RosterPlanner } from '@/components/shifts/RosterPlanner'
import { Modal } from '@/components/ui/Modal'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { DepartmentEmployee, DepartmentRoster, ShiftTemplate, Employee } from '@/types'

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
  N: 'bg-indigo-500/10 text-[var(--pz-accent)] border-indigo-500/20',
  OFF: 'bg-gray-500/10 text-[var(--pz-text-muted)] border-gray-500/20',
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const ASSIGN_CONFIG: Record<string, { bg: string; text: string; border: string; label: string; short: string }> = {
  DAY:     { bg: 'rgba(250,204,21,0.2)', text: 'var(--pz-warning-500)', border: 'rgba(250,204,21,0.3)', label: 'Day Shift',  short: 'D' },
  NIGHT:   { bg: 'rgba(99,102,241,0.2)', text: 'var(--pz-accent)', border: 'rgba(99,102,241,0.3)', label: 'Night Shift', short: 'N' },
  OFF:     { bg: 'rgba(113,113,122,0.15)', text: 'var(--pz-text-secondary)', border: 'rgba(113,113,122,0.2)', label: 'Rest Day',   short: '\u2014' },
  LEAVE:   { bg: 'rgba(34,197,94,0.15)', text: 'var(--pz-success-500)', border: 'rgba(34,197,94,0.25)', label: 'Leave',      short: 'L' },
  HOLIDAY: { bg: 'rgba(236,72,153,0.15)', text: 'var(--pz-danger-500)', border: 'rgba(236,72,153,0.25)', label: 'Holiday',    short: 'H' },
  ABSENT:  { bg: 'rgba(239,68,68,0.15)', text: 'var(--pz-danger-500)', border: 'rgba(239,68,68,0.2)', label: 'Absent',     short: '!' },
}

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '28px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  headerActions: { display: 'flex', alignItems: 'center', gap: '8px' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' },
  toggle: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', background: 'var(--pz-surface-2)', borderRadius: '12px', border: '1px solid var(--pz-border)', width: 'fit-content' },
  card: { background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', boxShadow: 'var(--pz-shadow-sm)', overflow: 'hidden' },
  sectionCard: (noPadding?: boolean) => ({ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '12px', padding: noPadding ? '0' : '24px' }),
}

export default function DepartmentWorkforceView() {
  const { deptId } = useParams<{ deptId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [view, setView] = useState<'table' | 'roster'>('table')
  const [rosterMonth, setRosterMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }))
  const [selectedEmp, setSelectedEmp] = useState<DepartmentEmployee | null>(null)
  const [editingEmp, setEditingEmp] = useState<DepartmentEmployee | null>(null)
  const [deletingEmp, setDeletingEmp] = useState<DepartmentEmployee | null>(null)
  const [dayClickState, setDayClickState] = useState<{ employeeId: string; employeeName: string; date: string; currentLabel: string } | null>(null)

  const { data: templatesData } = useQuery({
    queryKey: ['shift-templates-for-roster'],
    queryFn: async () => (await shiftTemplatesAPI.list()).data,
  })
  const templates: ShiftTemplate[] = Array.isArray(templatesData) ? templatesData : templatesData?.items ?? []

  const createOverrideMutation = useMutation({
    mutationFn: (data: { employee_id: string; shift_template_id: string; start_date: string; end_date: string; reason?: string }) =>
      shiftAssignmentsAPI.createOverride(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dept-roster', deptId] }); toast.success('Shift override saved'); setDayClickState(null) },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save override'),
  })

  const { data: detail, isLoading } = useQuery<{ department: { id: string; name: string; code: string; office_name: string | null; shift_protocol_name: string | null; head_name: string | null }; employees: DepartmentEmployee[]; total: number; date: string }>({
    queryKey: ['dept-detail', deptId, statusFilter, search],
    queryFn: async () => (await workforceAPI.departmentDetail(deptId!, { status_filter: statusFilter || undefined, search: search || undefined })).data,
    enabled: !!deptId,
    refetchInterval: 30000,
  })

  const { data: roster } = useQuery({
    queryKey: ['dept-roster', deptId, rosterMonth],
    queryFn: async () => (await workforceAPI.departmentRoster(deptId!, rosterMonth.year, rosterMonth.month)).data,
    enabled: !!deptId && view === 'roster',
  })

  // Employee calendar data for the selected employee
  const empCalMonth = new Date()
  const { data: empCalendar } = useQuery({
    queryKey: ['emp-calendar', selectedEmp?.id, empCalMonth.getFullYear(), empCalMonth.getMonth() + 1],
    queryFn: () => schedulingAPI.employeeCalendar(selectedEmp!.id, { year: empCalMonth.getFullYear(), month: empCalMonth.getMonth() + 1 }),
    enabled: !!selectedEmp,
    select: (d: any) => d.data as { days: string[]; schedule: Record<string, { assignment: string; shift_start?: string; shift_end?: string; color?: string }>; status?: string },
  })

  const deleteEmpMut = useMutation({
    mutationFn: (id: string) => employeesAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dept-detail', deptId] }); setDeletingEmp(null); toast.success('Employee removed') },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete'),
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
      const response = await workforceAPI.exportRoster({ department_id: deptId, year: rosterMonth.year, month: rosterMonth.month, format: 'xlsx' })
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data])
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
      toast.error(err.response?.data?.detail || 'Failed to export')
    }
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>{dept?.name || 'Department'}</h1>
          <p style={s.headerSubtitle}>{dept?.office_name || ''}{dept?.shift_protocol_name ? ' \u00b7 ' + dept.shift_protocol_name : ''} \u00b7 {format(new Date(), 'EEEE, MMMM d yyyy')}</p>
        </div>
        <div style={s.headerActions}>
          <Button variant="outline" size="md" onClick={() => navigate('/departments')}>
            <ArrowLeft size={15} /> Back
          </Button>
          <Button variant="success" size="md" onClick={handleExport}>
            <Download size={15} /> Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={s.cards}>
        <KPICard icon={Users} label="Total Staff" value={employees.length} color="#3B82F6" />
        <KPICard icon={UserCheck} label="Present" value={summaryStats.present} color="#10B981" />
        <KPICard icon={Clock} label="Late" value={summaryStats.late} color="#F59E0B" />
        <KPICard icon={UserX} label="Absent" value={summaryStats.absent} color="#EF4444" />
        <KPICard icon={Users} label="On Leave" value={summaryStats.onLeave} color="#8B5CF6" />
      </div>

      {/* View Toggle + Filters */}
      <div className="space-y-3">
        <div style={s.toggle}>
          <button onClick={() => setView('table')}
            className={'flex items-center gap-2.5 px-6 py-3 rounded-lg text-sm font-semibold transition-all ' + (view === 'table' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-[var(--pz-text-muted)] hover:text-[var(--pz-text)] hover:bg-[var(--pz-surface-3)]')}>
            <Users size={16} /> Employee Table
          </button>
          <button onClick={() => setView('roster')}
            className={'flex items-center gap-2.5 px-6 py-3 rounded-lg text-sm font-semibold transition-all ' + (view === 'roster' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-[var(--pz-text-muted)] hover:text-[var(--pz-text)] hover:bg-[var(--pz-surface-3)]')}>
            <Calendar size={16} /> Monthly Roster
          </button>
        </div>

        {view === 'table' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--pz-text-muted)]" />
              <input type="text" placeholder="Search by name or ID..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500/50 transition-colors" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text-secondary)] focus:outline-none focus:border-blue-500/50 transition-colors">
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="on_leave">On Leave</option>
              <option value="off_duty">Off Duty</option>
            </select>
          </div>
        )}
      </div>

      {/* Content */}
      {view === 'table' ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={s.card}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--pz-border)] bg-[var(--pz-surface-2)]/50">
                  <th className="text-left py-3 px-4 font-semibold text-[var(--pz-text-muted)] uppercase tracking-wider text-[10px] sticky left-0 bg-[var(--pz-surface-2)]/50">Employee</th>
                  <th className="text-left py-3 px-4 font-semibold text-[var(--pz-text-muted)] uppercase tracking-wider text-[10px]">ID</th>
                  <th className="text-left py-3 px-4 font-semibold text-[var(--pz-text-muted)] uppercase tracking-wider text-[10px]">Position</th>
                  <th className="text-left py-3 px-4 font-semibold text-[var(--pz-text-muted)] uppercase tracking-wider text-[10px]">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-[var(--pz-text-muted)] uppercase tracking-wider text-[10px]">Today's Shift</th>
                  <th className="text-left py-3 px-4 font-semibold text-[var(--pz-text-muted)] uppercase tracking-wider text-[10px]">Check In</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, i) => (
                  <motion.tr key={emp.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                    className="border-b border-[var(--pz-border)]/30 hover:bg-[var(--pz-surface-2)]/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedEmp(emp)}>
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
                      <StatusBadge status={emp.status as any} size="xs">
                        <span className={STATUS_COLORS[emp.status] || 'text-[var(--pz-text-muted)]'}>
                          {emp.status.replace('_', ' ')}
                        </span>
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4">
                      <span className={'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ' + (SHIFT_LABEL_COLORS[emp.shift_label] || 'bg-gray-500/10 text-[var(--pz-text-muted)] border-gray-500/20')}>
                        {emp.shift_label === 'D' && <Sun size={10} className="mr-1" />}
                        {emp.shift_label === 'N' && <Moon size={10} className="mr-1" />}
                        {emp.current_shift}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--pz-text-muted)] font-mono text-[10px]">
                      {emp.check_in ? format(new Date(emp.check_in), 'hh:mm a') : '\u2014'}
                    </td>
                  </motion.tr>
                ))}
                {!employees.length && !isLoading && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-[var(--pz-text-muted)]">
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
        <div style={{ position: 'relative' }}>
          <RosterPlanner
            roster={roster}
            year={rosterMonth.year}
            month={rosterMonth.month}
            onMonthChange={(y, m) => setRosterMonth({ year: y, month: m })}
            onExport={handleExport}
            onDayClick={(empId, empName, date, label) => setDayClickState({ employeeId: empId, employeeName: empName, date, currentLabel: label })}
          />
        </div>
      )}

      {/* Employee Detail Drawer */}
      <DetailDrawer
        open={!!selectedEmp}
        onClose={() => setSelectedEmp(null)}
        title={selectedEmp?.full_name || ''}
        subtitle={selectedEmp ? selectedEmp.employee_code + ' \u00b7 ' + (selectedEmp.position || 'No position') : ''}
        width={680}
      >
        {selectedEmp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Status + Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <StatusBadge status={selectedEmp.status as any} size="sm">
                <span className={STATUS_COLORS[selectedEmp.status]}>{selectedEmp.status.replace('_', ' ')}</span>
              </StatusBadge>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setEditingEmp(selectedEmp); setSelectedEmp(null) }}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-accent)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Edit3 size={13} /> Edit
                </button>
                <button onClick={() => { setDeletingEmp(selectedEmp); setSelectedEmp(null) }}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-danger-500)', color: 'var(--pz-danger-500)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>

            {/* Info section */}
            <div style={{ border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' }}>
              {([
                ['Status', selectedEmp.status.replace('_', ' ')],
                ['Department', selectedEmp.department_name],
                ['Protocol', selectedEmp.shift_protocol_name || '\u2014'],
                ['Today\'s Shift', selectedEmp.current_shift],
                ['Check In', selectedEmp.check_in ? format(new Date(selectedEmp.check_in), 'hh:mm a') : '\u2014'],
              ] as const).map(([label, value], i, arr) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '48px', padding: '10px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none' }}>
                  <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{label}</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Monthly Calendar */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Monthly Schedule</h4>
              </div>
              {empCalendar ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  {empCalendar.days.map(day => {
                    const cell = empCalendar.schedule[day]
                    const d = new Date(day)
                    const cfg = cell ? ASSIGN_CONFIG[cell.assignment] : null
                    return (
                      <div key={day} style={{
                        width: '36px', padding: '4px 2px', borderRadius: '6px', textAlign: 'center',
                        border: '1px solid ' + (cell ? (cfg?.border || 'var(--pz-border)') : 'var(--pz-border)'),
                        background: cell ? (cell.color ? cell.color + '20' : (cfg?.bg || 'var(--pz-surface-2)')) : 'var(--pz-surface-2)',
                      }}>
                        <p style={{ fontSize: '8px', color: 'var(--pz-text-muted)', margin: 0 }}>{format(d, 'EEE')}</p>
                        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{format(d, 'd')}</p>
                        {cell ? (
                          <span style={{ fontSize: '8px', fontWeight: 700, display: 'block', color: cell.color || (cfg?.text || 'var(--pz-text-secondary)') }}>
                            {cfg?.short || cell.assignment.slice(0, 2)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--pz-text-faint)', fontSize: '8px' }}>-</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>No schedule data available.</p>
              )}
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                {Object.entries(ASSIGN_CONFIG).map(([key, cfg]) => (
                  <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '999px', background: cfg.bg, color: cfg.text, border: '1px solid ' + cfg.border }}>
                    {cfg.short} {cfg.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* Edit Employee Modal */}
      {editingEmp && (
        <EditEmployeeModal
          employee={editingEmp}
          onClose={() => setEditingEmp(null)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ['dept-detail', deptId] }); setEditingEmp(null) }}
        />
      )}

      {/* Delete Employee Modal */}
      <Modal
        open={!!deletingEmp}
        onClose={() => setDeletingEmp(null)}
        title="Remove Employee"
        description={deletingEmp ? 'Remove ' + deletingEmp.full_name + ' from the system' : ''}
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button onClick={() => setDeletingEmp(null)}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={() => deletingEmp && deleteEmpMut.mutate(deletingEmp.id)} disabled={deleteEmpMut.isPending}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-danger-500)', color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: deleteEmpMut.isPending ? 0.5 : 1 }}>
              {deleteEmpMut.isPending ? 'Removing...' : 'Remove Employee'}
            </button>
          </div>
        }>
        <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)' }}>
          This will permanently delete <strong>{deletingEmp?.full_name}</strong> and all associated data. This cannot be undone.
        </p>
      </Modal>

      {/* Shift Override Modal */}
      {dayClickState && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setDayClickState(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ width: '100%', maxWidth: '480px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 16px 24px', borderBottom: '1px solid var(--pz-border)' }}>
              <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{dayClickState.employeeName}</p>
              <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)', marginTop: '3px', marginBottom: 0 }}>
                {format(new Date(dayClickState.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                <span style={{ marginLeft: '10px' }}>Current: <strong style={{ color: 'var(--pz-text-secondary)' }}>{dayClickState.currentLabel}</strong></span>
              </p>
            </div>
            <div style={{ padding: '16px 24px 24px 24px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Quick Set</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                {[
                  { label: 'D', name: 'Day', bg: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.12)', color: 'var(--pz-warning-500)' },
                  { label: 'N', name: 'Night', bg: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.12)', color: 'var(--pz-accent)' },
                  { label: 'OFF', name: 'Off', bg: 'rgba(107,114,128,0.08)', border: '1px solid rgba(107,114,128,0.12)', color: 'var(--pz-text-secondary)' },
                  { label: 'LV', name: 'Leave', bg: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.12)', color: 'var(--pz-accent)' },
                ].map(q => (
                  <button key={q.label}
                    onClick={() => {
                      const templatesForLabel = templates.filter(t => {
                        if (q.label === 'OFF') return t.code.toUpperCase() === 'OFF'
                        if (q.label === 'LV') return t.code.toUpperCase() === 'LV' || t.name.toLowerCase().includes('leave')
                        if (q.label === 'N') return t.is_overnight || t.start_time >= '12:00'
                        if (q.label === 'D') return !t.is_overnight && t.start_time < '12:00' && t.code.toUpperCase() !== 'OFF'
                        return false
                      })
                      const tmpl = templatesForLabel[0]
                      if (!tmpl) { toast.error('No ' + q.name + ' shift template found'); return }
                      createOverrideMutation.mutate({ employee_id: dayClickState.employeeId, shift_template_id: tmpl.id, start_date: dayClickState.date, end_date: dayClickState.date, reason: 'Quick set: ' + q.label })
                    }}
                    disabled={dayClickState.currentLabel === q.label}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '12px', borderRadius: '6px', border: q.border, fontSize: '12px', fontWeight: 600, background: q.bg, color: q.color, transition: 'all 0.15s ease', opacity: dayClickState.currentLabel === q.label ? 0.3 : 1, cursor: dayClickState.currentLabel === q.label ? 'not-allowed' : 'pointer' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>{q.label}</span>
                    <span style={{ fontSize: '9px', opacity: 0.7 }}>{q.name}</span>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Or pick a template</p>
              <div style={{ maxHeight: '192px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                {templates.filter(t => t.is_active).map(t => {
                  const codeUpper = t.code.toUpperCase()
                  const isOff = codeUpper === 'OFF'
                  const isNight = t.is_overnight
                  const pillBg = isNight ? 'rgba(99,102,241,0.08)' : isOff ? 'rgba(107,114,128,0.08)' : 'rgba(245,158,11,0.08)'
                  const pillBorder = isNight ? '1px solid rgba(99,102,241,0.12)' : isOff ? '1px solid rgba(107,114,128,0.12)' : '1px solid rgba(245,158,11,0.12)'
                  const pillColor = isNight ? 'var(--pz-accent)' : isOff ? 'var(--pz-text-secondary)' : 'var(--pz-warning-500)'
                  return (
                    <button key={t.id}
                      onClick={() => createOverrideMutation.mutate({ employee_id: dayClickState.employeeId, shift_template_id: t.id, start_date: dayClickState.date, end_date: dayClickState.date, reason: 'Set shift: ' + t.name })}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', borderRadius: '6px', border: '1px solid var(--pz-border)', background: 'transparent', transition: 'all 0.15s ease', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '4px', fontSize: '8px', fontWeight: 700, background: pillBg, border: pillBorder, color: pillColor }}>
                          {isOff ? 'OFF' : isNight ? 'N' : 'D'}
                        </span>
                        <div style={{ textAlign: 'left' }}>
                          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>{t.name}</p>
                          <p style={{ fontSize: '9px', color: 'var(--pz-text-muted)', margin: 0 }}>{t.start_time} \u2014 {t.end_time} \u00b7 {t.working_hours}h</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <button onClick={() => setDayClickState(null)}
                style={{ width: '100%', height: '38px', borderRadius: '4px', fontSize: '13px', fontWeight: 600, background: 'var(--pz-surface-2)', color: 'var(--pz-text-secondary)', border: '1px solid var(--pz-border)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function EditEmployeeModal({ employee, onClose, onSuccess }: { employee: DepartmentEmployee; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    full_name: employee.full_name,
    employee_code: employee.employee_code,
    position: employee.position || '',
  })

  const updateMut = useMutation({
    mutationFn: () => employeesAPI.update(employee.id, {
      full_name: form.full_name,
      employee_code: form.employee_code,
      position: form.position || null,
    }),
    onSuccess: () => { toast.success('Employee updated'); onSuccess() },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update'),
  })

  return (
    <Modal open onClose={onClose} title="Edit Employee" description={'Update ' + employee.full_name} size="sm"
      footer={
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => updateMut.mutate()} disabled={!form.full_name || !form.employee_code || updateMut.isPending}
            style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-accent)', color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: !form.full_name || !form.employee_code || updateMut.isPending ? 0.5 : 1 }}>
            {updateMut.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Info size={15} color="#3B82F6" />
            </div>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Employee Details</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Full Name *</label>
              <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Employee Code *</label>
              <input value={form.employee_code} onChange={e => setForm(p => ({ ...p, employee_code: e.target.value.toUpperCase() }))}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Position</label>
              <input value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} placeholder="e.g. Software Engineer"
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Written {len(content)} bytes')
