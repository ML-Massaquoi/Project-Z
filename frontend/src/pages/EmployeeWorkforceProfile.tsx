import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Clock, UserCheck, AlertTriangle,
  Sun, Moon, Briefcase, TrendingUp, Edit3, Trash2, Save, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { format, addMonths, subMonths } from 'date-fns'
import { toast } from 'sonner'
import { workforceAPI, schedulingAPI, employeesAPI, departmentsAPI } from '@/api/client'
import { Modal } from '@/components/ui/Modal'
import type { EmployeeProfile } from '@/types'
import type { Department } from '@/types'

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
  card: { background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', padding: '20px' },
  sectionLabel: { fontSize: '13px', fontWeight: 700, color: 'var(--pz-text)', letterSpacing: '0.02em', margin: 0 },
}

type SchedCalEntry = {
  id: string
  entry_date: string
  assignment: string
  pair_name: string | null
  shift_start: string | null
  shift_end: string | null
  is_overridden: boolean
}

type SchedCalData = {
  employee_id: string
  year: number
  month: number
  entries: SchedCalEntry[]
  total: number
}

export default function EmployeeWorkforceProfile() {
  const { empId } = useParams<{ empId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const calYear = calMonth.getFullYear()
  const calMonthNum = calMonth.getMonth() + 1

  const { data: profile, isLoading: profileLoading } = useQuery<EmployeeProfile>({
    queryKey: ['emp-profile', empId],
    queryFn: async () => (await workforceAPI.employeeProfile(empId!)).data,
    enabled: !!empId,
  })

  const { data: schedCal, isLoading: calLoading } = useQuery<SchedCalData>({
    queryKey: ['sched-emp-cal', empId, calYear, calMonthNum],
    queryFn: async () => (await schedulingAPI.employeeCalendar(empId!, { year: calYear, month: calMonthNum })).data,
    enabled: !!empId,
  })

  const { data: deptsData } = useQuery({
    queryKey: ['depts-for-edit'],
    queryFn: () => departmentsAPI.list(),
    select: d => (Array.isArray(d.data) ? d.data : d.data?.items ?? []) as Department[],
  })

  const emp = profile?.employee
  const summary = profile?.attendance_summary
  const assignment = profile?.current_assignment

  const updateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => employeesAPI.update(empId!, data),
    onSuccess: () => {
      toast.success('Employee updated')
      qc.invalidateQueries({ queryKey: ['emp-profile', empId] })
      setShowEdit(false)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Update failed'),
  })

  const deleteMut = useMutation({
    mutationFn: () => employeesAPI.delete(empId!),
    onSuccess: () => {
      toast.success('Employee deleted')
      navigate('/departments')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Delete failed'),
  })

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>{emp?.full_name || 'Employee'}</h1>
          <p style={s.headerSubtitle}>{`Workforce Profile \u00B7 ${emp?.employee_code || ''}`}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setShowEdit(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-accent)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            <Edit3 size={13} /> Edit
          </button>
          <button onClick={() => setShowDelete(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', color: 'var(--pz-danger-500)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            <Trash2 size={13} /> Delete
          </button>
          <button onClick={() => navigate(-1)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer' }}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column */}
        <div className="space-y-5">
          {/* Employee Info */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={s.card}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-lg font-bold" style={{ color: '#fff' }}>
                {emp?.full_name?.[0] || '?'}
              </div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--pz-text)', margin: 0 }}>{emp?.full_name}</h3>
                <p className="text-[10px] font-mono" style={{ color: 'var(--pz-text-muted)', margin: 0 }}>{emp?.employee_code}</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span style={{ color: 'var(--pz-text-muted)' }}>Department</span>
                <span style={{ color: 'var(--pz-text-secondary)', fontWeight: 500 }}>{emp?.department_name || 'Unassigned'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--pz-text-muted)' }}>Designation</span>
                <span style={{ color: 'var(--pz-text-secondary)' }}>{emp?.position || '\u2014'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--pz-text-muted)' }}>Phone</span>
                <span style={{ color: 'var(--pz-text-secondary)' }}>{emp?.phone || '\u2014'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--pz-text-muted)' }}>Status</span>
                <span style={{ fontWeight: 600, color: emp?.status === 'active' ? '#34D399' : '#F87171' }}>
                  {emp?.status}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Attendance Summary */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={s.card}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={15} style={{ color: '#60A5FA' }} />
              <h3 style={s.sectionLabel}>This Month</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)' }}>
                <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0, marginBottom: '4px' }}>Present</p>
                <p className="text-lg font-bold" style={{ color: '#34D399', margin: 0 }}>{summary?.present_this_month ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.1)' }}>
                <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0, marginBottom: '4px' }}>Late</p>
                <p className="text-lg font-bold" style={{ color: '#FBBF24', margin: 0 }}>{summary?.late_this_month ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)' }}>
                <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0, marginBottom: '4px' }}>Absences</p>
                <p className="text-lg font-bold" style={{ color: '#F87171', margin: 0 }}>{summary?.absences_this_month ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.1)' }}>
                <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0, marginBottom: '4px' }}>OT Hours</p>
                <p className="text-lg font-bold" style={{ color: '#818CF8', margin: 0 }}>{summary?.overtime_hours ?? 0}</p>
              </div>
            </div>
          </motion.div>

          {/* Current Assignment */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} style={s.card}>
            <div className="flex items-center gap-2 mb-4">
              <Briefcase size={15} style={{ color: '#60A5FA' }} />
              <h3 style={s.sectionLabel}>Current Assignment</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--pz-border)' }}>
                <div className="p-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  {assignment?.current_shift_label === 'N' ? <Moon size={14} style={{ color: '#818CF8' }} /> : <Sun size={14} style={{ color: '#FBBF24' }} />}
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0 }}>Current Shift</p>
                  <p className="text-xs font-semibold" style={{ color: 'var(--pz-text-secondary)', margin: 0 }}>{assignment?.current_shift || 'Unassigned'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--pz-border)' }}>
                <div className="p-2 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <Clock size={14} style={{ color: '#60A5FA' }} />
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0 }}>Next Shift</p>
                  <p className="text-xs font-semibold" style={{ color: 'var(--pz-text-secondary)', margin: 0 }}>{assignment?.next_shift || '\u2014'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--pz-border)' }}>
                <div className="p-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <Calendar size={14} style={{ color: '#34D399' }} />
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0 }}>Next Working Day</p>
                  <p className="text-xs font-semibold" style={{ color: 'var(--pz-text-secondary)', margin: 0 }}>
                    {assignment?.next_working_day ? format(new Date(assignment.next_working_day), 'EEE, MMM d') : '\u2014'}
                  </p>
                </div>
              </div>
              <div className="mt-2 p-2 rounded text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ fontSize: '10px', color: 'var(--pz-text-muted)' }}>Roster Type: </span>
                <span className="text-[10px] font-semibold capitalize" style={{ color: '#60A5FA' }}>{assignment?.roster_type || 'unassigned'}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Column: Calendar from Scheduling Engine */}
        <div className="lg:col-span-2">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} style={s.card}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={s.sectionLabel}>
                {emp?.full_name ? `${emp.full_name}'s Schedule` : 'Shift Schedule'}
              </h3>
            </div>

            {/* Month Navigator */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setCalMonth(subMonths(calMonth, 1))}
                style={{ padding: '6px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', color: 'var(--pz-text-muted)', cursor: 'pointer' }}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)' }}>
                {format(calMonth, 'MMMM yyyy')}
              </span>
              <button onClick={() => setCalMonth(addMonths(calMonth, 1))}
                style={{ padding: '6px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', color: 'var(--pz-text-muted)', cursor: 'pointer' }}>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-4">
              {Object.entries(ASSIGN_CONFIG).map(([key, cfg]) => (
                <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                  {cfg.short} {cfg.label}
                </span>
              ))}
            </div>

            {/* Calendar Grid */}
            {(() => {
              const entryMap: Record<string, SchedCalEntry> = {}
              if (schedCal?.entries) {
                for (const e of schedCal.entries) {
                  entryMap[e.entry_date] = e
                }
              }
              const daysInMonth = new Date(calYear, calMonthNum, 0).getDate()
              const allDays = Array.from({ length: daysInMonth }, (_, i) => {
                const d = new Date(calYear, calMonthNum - 1, i + 1)
                return format(d, 'yyyy-MM-dd')
              })
              const hasData = schedCal && schedCal.total > 0

              if (calLoading) {
                return (
                  <div className="grid grid-cols-7 gap-1.5">
                    {Array.from({ length: 35 }).map((_, i) => (
                      <div key={i} className="pz-skeleton h-16 rounded-lg" />
                    ))}
                  </div>
                )
              }

              if (!hasData) {
                return (
                  <div style={{ padding: '48px', textAlign: 'center' }}>
                    <Calendar size={36} style={{ margin: '0 auto 12px', opacity: 0.3, color: 'var(--pz-text-muted)' }} />
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>No schedule data</p>
                    <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', marginTop: '4px' }}>Generate a roster in Roster Management to see the schedule.</p>
                  </div>
                )
              }

              return (
                <div className="grid grid-cols-7 gap-1.5">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <div key={d} className="text-center text-[10px] font-semibold text-[var(--pz-text-muted)] py-1">{d}</div>
                  ))}
                  {Array.from({ length: (new Date(calYear, calMonthNum - 1, 1).getDay() + 6) % 7 }).map((_, i) => (
                    <div key={`e-${i}`} />
                  ))}
                  {allDays.map((day, i) => {
                    const d = new Date(day)
                    const entry = entryMap[day]
                    const assignment = entry?.assignment || ''
                    const cfg = assignment ? ASSIGN_CONFIG[assignment] : null
                    const isToday = day === format(new Date(), 'yyyy-MM-dd')
                    return (
                      <motion.div key={day} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.005 }}
                        style={{
                          position: 'relative', padding: '8px 4px', borderRadius: '8px', textAlign: 'center',
                          border: '1px solid ' + (isToday ? 'rgba(59,130,246,0.5)' : (cfg?.border || 'var(--pz-border)')),
                          background: isToday ? 'rgba(59,130,246,0.08)' : (cfg?.bg || 'var(--pz-surface-2)'),
                          opacity: entry ? 1 : 0.4,
                        }}>
                        <p style={{ fontSize: '10px', color: isToday ? 'var(--pz-accent)' : 'var(--pz-text-muted)', margin: 0, fontWeight: isToday ? 700 : 400 }}>{d.getDate()}</p>
                        {entry ? (
                          <span style={{ fontSize: '9px', fontWeight: 700, display: 'block', marginTop: '2px', color: cfg?.text || 'var(--pz-text-secondary)' }}>
                            {cfg?.short || assignment.slice(0, 2)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--pz-text-faint)', fontSize: '9px' }}>-</span>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              )
            })()}
          </motion.div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEdit && emp && (
        <EditEmployeeModal
          employee={emp}
          departments={deptsData ?? []}
          onSave={(data) => updateMut.mutate(data)}
          onClose={() => setShowEdit(false)}
          saving={updateMut.isPending}
        />
      )}

      {/* Delete Confirmation */}
      {showDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setShowDelete(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            style={{ width: '100%', maxWidth: '400px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <AlertTriangle size={36} style={{ color: 'var(--pz-danger-500)', margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 8px' }}>Delete Employee?</h3>
              <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 }}>
                This will permanently delete {emp?.full_name}. This action cannot be undone.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', padding: '16px 24px', borderTop: '1px solid var(--pz-border)' }}>
              <button onClick={() => setShowDelete(false)}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--pz-danger-500)', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: deleteMut.isPending ? 0.5 : 1 }}>
                {deleteMut.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function EditEmployeeModal({
  employee, departments, onSave, onClose, saving,
}: {
  employee: EmployeeProfile['employee']
  departments: Department[]
  onSave: (data: Record<string, unknown>) => void
  onClose: () => void
  saving: boolean
}) {
  const [name, setName] = useState(employee.full_name || '')
  const [code, setCode] = useState(employee.employee_code || '')
  const [position, setPosition] = useState(employee.position || '')
  const [deptId, setDeptId] = useState(employee.department_id || '')

  return (
    <Modal open onClose={onClose} title={`Edit ${employee.full_name}`} size="md"
      footer={
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => onSave({ full_name: name, employee_code: code, position: position || null, department_id: deptId || null })}
            disabled={!name || !code || saving}
            style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-accent)', color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: !name || !code || saving ? 0.5 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Edit3 size={15} color="#3B82F6" />
            </div>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Employee Details</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Full Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Employee Code *</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value)}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Position</label>
              <input type="text" value={position} onChange={e => setPosition(e.target.value)} placeholder="e.g. Software Engineer"
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Department</label>
              <select value={deptId} onChange={e => setDeptId(e.target.value)}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none' }}>
                <option value="">Unassigned</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
