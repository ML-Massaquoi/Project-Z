import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Clock } from 'lucide-react'
import { departmentsAPI, analyticsAPI, shiftProtocolsAPI, officesAPI } from '@/api/client'
import { format } from 'date-fns'
import type { Department } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { MetricRing } from '@/components/ui/MetricRing'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { useDeptSummaryStore } from '@/stores/deptSummaryStore'
import { toast } from 'sonner'

export default function Departments() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const today = format(new Date(), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })

  const departments: Department[] = Array.isArray(data) ? data : data?.items ?? []

  const { data: summaries } = useQuery({
    queryKey: ['dept-summaries', today],
    queryFn: async () => (await analyticsAPI.getDepartmentsSummary(today)).data,
    refetchInterval: 60000,
  })

  useEffect(() => {
    if (summaries) {
      useDeptSummaryStore.getState().setDepartments(summaries)
    }
  }, [summaries])

  const deptSummaries = useDeptSummaryStore((s) => s.departments)

  const filtered = departments.filter(d => {
    if (!searchValue.trim()) return true
    const q = searchValue.toLowerCase()
    return d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6 pz-slide-up">
      <PageHeader
        title="Departments"
        subtitle={`Organizational structure · ${departments.length} departments`}
        breadcrumbs={[{ label: 'Workforce' }, { label: 'Departments' }]}
        actions={
          <Button variant="default" size="md" onClick={() => setShowAddModal(true)}>
            <Plus size={15} />
            Add Department
          </Button>
        }
      />

      <FilterBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search departments..."
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pz-card p-6 space-y-4">
              <div className="pz-skeleton h-5 w-36 rounded" />
              <div className="pz-skeleton h-4 w-24 rounded" />
              <div className="pz-skeleton h-16 w-16 rounded-full mx-auto" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((dept, i) => {
            const summary = deptSummaries[dept.id]
            const readiness = summary && summary.expected_count > 0
              ? Math.round((summary.present_count / summary.expected_count) * 100)
              : null

            return (
              <motion.div
                key={dept.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(`/departments/${dept.id}`)}
                className="pz-card pz-card--interactive p-6 cursor-pointer"
              >
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h3 className="text-base font-bold text-[var(--pz-text)]">{dept.name}</h3>
                    <p className="text-sm text-[var(--pz-text-muted)] font-mono mt-1">{dept.code}</p>
                    {dept.office_name && (
                      <p className="text-sm text-[var(--pz-text-muted)] mt-1">{dept.office_name}</p>
                    )}
                  </div>
                  <StatusBadge status={dept.is_active ? 'active' : 'inactive'} size="sm" dot={false} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-shrink-0">
                    {readiness !== null ? (
                      <MetricRing value={readiness} size={72} strokeWidth={5} color="auto" />
                    ) : (
                      <div className="w-[72px] h-[72px] rounded-full bg-[var(--pz-surface-2)] flex items-center justify-center border border-[var(--pz-border)]">
                        <span className="text-sm text-[var(--pz-text-muted)]">—</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-right">
                    <div>
                      <p className="text-[11px] text-[var(--pz-text-muted)] uppercase font-semibold">Headcount</p>
                      <p className="text-base font-bold text-[var(--pz-text)]">{dept.employee_count}</p>
                    </div>
                    {summary && (
                      <>
                        <div>
                          <p className="text-[11px] text-[var(--pz-text-muted)] uppercase font-semibold">Present</p>
                          <p className="text-base font-bold text-emerald-400">{summary.present_count}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-[var(--pz-text-muted)] uppercase font-semibold">Late</p>
                          <p className="text-base font-bold text-amber-400">{summary.late_count}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-[var(--pz-text-muted)] uppercase font-semibold">Absent</p>
                          <p className="text-base font-bold text-red-400">{summary.absent_count}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {dept.head_name && (
                  <div className="mt-4 pt-4 border-t border-[var(--pz-border)] flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[var(--pz-surface-2)] flex items-center justify-center border border-[var(--pz-border)]">
                      <span className="text-[10px] font-bold text-[var(--pz-text-muted)]">{dept.head_name[0]}</span>
                    </div>
                    <span className="text-xs text-[var(--pz-text-muted)]">Head: {dept.head_name}</span>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Detail Drawer */}
      <DetailDrawer
        open={!!selectedDept}
        onClose={() => setSelectedDept(null)}
        title={selectedDept?.name || ''}
        subtitle={selectedDept ? `${selectedDept.code} · ${selectedDept.office_name || 'No Office'}` : ''}
        width={700}
      >
        {selectedDept && (() => {
          const summary = deptSummaries[selectedDept.id]
          const readiness = summary && summary.expected_count > 0
            ? Math.round((summary.present_count / summary.expected_count) * 100) : null
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

              {/* Readiness Ring */}
              <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
                {readiness !== null ? (
                  <MetricRing value={readiness} size={120} strokeWidth={8} color="auto" label="Readiness" />
                ) : (
                  <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)' }}>No readiness data</p>
                )}
              </div>

              {/* Today summary KPIs */}
              {summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Expected', value: summary.expected_count, color: '#3B82F6' },
                    { label: 'Present', value: summary.present_count, color: '#10B981' },
                    { label: 'Late', value: summary.late_count, color: '#F59E0B' },
                    { label: 'Absent', value: summary.absent_count, color: '#EF4444' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: '14px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '6px', textAlign: 'center' }}>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '6px' }}>{label}</p>
                      <p style={{ fontSize: '22px', fontWeight: 700, color, margin: 0 }}>{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Department info table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Information</h4>
                <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', overflow: 'hidden' }}>
                  {[
                    ['Code', selectedDept.code],
                    ['Office', selectedDept.office_name || '—'],
                    ['Head', selectedDept.head_name || '—'],
                    ['Headcount', String(selectedDept.employee_count)],
                    ['Status', selectedDept.is_active ? 'Active' : 'Inactive'],
                    ['Description', selectedDept.description || '—'],
                    ['Created', format(new Date(selectedDept.created_at), 'MMM d, yyyy')],
                  ].map(([label, value], i, arr) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '44px', paddingBlock: '8px', paddingInline: '14px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)', flexShrink: 0 }}>{label}</span>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', textAlign: 'right', maxWidth: '260px' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )
        })()}
      </DetailDrawer>

      {/* Add Department Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Department"
        description="Create a new organizational department"
        size="md"
      >
        <AddDepartmentForm
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['departments'] })
            setShowAddModal(false)
          }}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>
    </div>
  )
}

function AddDepartmentForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    head_name: '',
    office_id: '',
    shift_protocol_id: '',
  })
  const [showNewProtocol, setShowNewProtocol] = useState(false)
  const [newProtocol, setNewProtocol] = useState({
    name: '',
    code: '',
    description: '',
    protocol_type: 'fixed' as 'fixed' | 'rotating' | 'custom',
    working_hours_start: '08:30',
    working_hours_end: '17:00',
    grace_period_minutes: 15,
    include_weekends: false,
    working_days: [1, 2, 3, 4, 5] as number[],
    days_on: 2,
    days_off: 2,
    day_shift_start: '08:00',
    day_shift_end: '20:00',
    night_shift_start: '20:00',
    night_shift_end: '08:00',
    color: '#3b82f6',
  })

  const { data: officesData } = useQuery({
    queryKey: ['offices-list'],
    queryFn: async () => (await officesAPI.list()).data,
  })

  const { data: protocolsData, isLoading: protocolsLoading } = useQuery({
    queryKey: ['shift-protocols-list'],
    queryFn: async () => (await shiftProtocolsAPI.list()).data,
  })

  const offices = Array.isArray(officesData) ? officesData : officesData?.items ?? []
  const protocols = Array.isArray(protocolsData) ? protocolsData : protocolsData?.items ?? []

  const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => departmentsAPI.create({
      ...data,
      office_id: data.office_id || undefined,
      shift_protocol_id: data.shift_protocol_id || undefined,
    }),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['departments'] })
      toast.success('Department created')
      onSuccess()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create'),
  })

  const createProtocolMutation = useMutation({
    mutationFn: (data: typeof newProtocol) => {
      const isRotating = data.protocol_type === 'rotating'
      const payload: Record<string, unknown> = {
        name: data.name, code: data.code, description: data.description || null,
        protocol_type: data.protocol_type, color: data.color,
        grace_period_minutes: data.grace_period_minutes,
        include_weekends: data.include_weekends,
      }
      if (isRotating) {
        payload.days_on = data.days_on
        payload.days_off = data.days_off
        payload.day_shift_start = data.day_shift_start || null
        payload.day_shift_end = data.day_shift_end || null
        payload.night_shift_start = data.night_shift_start || null
        payload.night_shift_end = data.night_shift_end || null
        const rot: string[] = []
        for (let i = 0; i < data.days_on; i++) rot.push('day')
        for (let i = 0; i < data.days_off; i++) rot.push('off')
        for (let i = 0; i < data.days_on; i++) rot.push('night')
        for (let i = 0; i < data.days_off; i++) rot.push('off')
        payload.rotation_shifts = rot
        payload.working_days = data.working_days
      } else {
        payload.working_hours_start = data.working_hours_start || null
        payload.working_hours_end = data.working_hours_end || null
        payload.working_days = data.working_days
      }
      return shiftProtocolsAPI.create(payload)
    },
    onSuccess: async (res) => {
      await queryClient.refetchQueries({ queryKey: ['shift-protocols-list'] })
      const createdId = res.data?.id || res.data?.protocol?.id
      if (createdId) {
        setForm(p => ({ ...p, shift_protocol_id: createdId }))
      }
      setShowNewProtocol(false)
      setNewProtocol({
        name: '', code: '', description: '', protocol_type: 'fixed',
        working_hours_start: '08:30', working_hours_end: '17:00',
        grace_period_minutes: 15, include_weekends: false,
        working_days: [1, 2, 3, 4, 5], days_on: 2, days_off: 2,
        day_shift_start: '08:00', day_shift_end: '20:00',
        night_shift_start: '20:00', night_shift_end: '08:00',
        color: '#3b82f6',
      })
      toast.success('Shift protocol created and assigned to department')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create protocol'),
  })

  const selectedProtocol = protocols.find((p: any) => p.id === form.shift_protocol_id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Name <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
          </label>
          <input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Information Technology"
            className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Code <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
          </label>
          <input value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
            placeholder="e.g. ICT"
            className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Office / Location
        </label>
        <select value={form.office_id} onChange={(e) => setForm(p => ({ ...p, office_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select office</option>
          {offices.map((o: any) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      {/* Shift Protocol Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>
            Default Shift Protocol <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
          </label>
          {!showNewProtocol && (
            <button
              onClick={() => setShowNewProtocol(true)}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
            >
              <Plus size={12} />
              Create New
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
        {showNewProtocol && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/[0.03] space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">New Shift Protocol</span>
              <button
                onClick={() => setShowNewProtocol(false)}
                className="text-[10px] text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)]"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Name *</label>
                <input value={newProtocol.name} onChange={(e) => setNewProtocol(p => ({ ...p, name: e.target.value }))}
                  placeholder="Standard Day Shift"
                  className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Code *</label>
                <input value={newProtocol.code} onChange={(e) => setNewProtocol(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                  placeholder="SDS"
                  className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Type</label>
                <select value={newProtocol.protocol_type}
                  onChange={(e) => setNewProtocol(p => ({ ...p, protocol_type: e.target.value as 'fixed' | 'rotating' | 'custom' }))}
                  className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }}>
                  <option value="fixed">Fixed</option>
                  <option value="rotating">Rotating</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Grace Period (min)</label>
                <input type="number" value={newProtocol.grace_period_minutes}
                  onChange={(e) => setNewProtocol(p => ({ ...p, grace_period_minutes: Number(e.target.value) }))}
                  className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
              </div>
            </div>

            {newProtocol.protocol_type === 'rotating' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Days On</label>
                    <input type="number" min={1} max={7} value={newProtocol.days_on}
                      onChange={(e) => setNewProtocol(p => ({ ...p, days_on: Number(e.target.value) || 1 }))}
                      className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Days Off</label>
                    <input type="number" min={1} max={7} value={newProtocol.days_off}
                      onChange={(e) => setNewProtocol(p => ({ ...p, days_off: Number(e.target.value) || 1 }))}
                      className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Day Shift Start</label>
                    <input type="time" value={newProtocol.day_shift_start}
                      onChange={(e) => setNewProtocol(p => ({ ...p, day_shift_start: e.target.value }))}
                      className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Day Shift End</label>
                    <input type="time" value={newProtocol.day_shift_end}
                      onChange={(e) => setNewProtocol(p => ({ ...p, day_shift_end: e.target.value }))}
                      className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Night Shift Start</label>
                    <input type="time" value={newProtocol.night_shift_start}
                      onChange={(e) => setNewProtocol(p => ({ ...p, night_shift_start: e.target.value }))}
                      className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Night Shift End</label>
                    <input type="time" value={newProtocol.night_shift_end}
                      onChange={(e) => setNewProtocol(p => ({ ...p, night_shift_end: e.target.value }))}
                      className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                  </div>
                </div>
                {/* Rotation pattern preview */}
                <div>
                  <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Rotation: {
                    Array.from({ length: newProtocol.days_on }, () => 'D').join(' ') +
                    ' ' + Array.from({ length: newProtocol.days_off }, () => 'O').join(' ') +
                    ' ' + Array.from({ length: newProtocol.days_on }, () => 'N').join(' ') +
                    ' ' + Array.from({ length: newProtocol.days_off }, () => 'O').join(' ') +
                    ' ↻'
                  }</label>
                  <div className="flex gap-1">
                    {(() => {
                      const seq: { label: string; type: string }[] = []
                      for (let i = 0; i < newProtocol.days_on; i++) seq.push({ label: 'D', type: 'day' })
                      for (let i = 0; i < newProtocol.days_off; i++) seq.push({ label: 'O', type: 'off' })
                      for (let i = 0; i < newProtocol.days_on; i++) seq.push({ label: 'N', type: 'night' })
                      for (let i = 0; i < newProtocol.days_off; i++) seq.push({ label: 'O', type: 'off' })
                      return seq.map((s, i) => (
                        <span key={i} className={`w-7 h-7 flex items-center justify-center rounded-md text-[9px] font-bold border ${
                          s.type === 'day' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                          s.type === 'night' ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' :
                          'bg-zinc-500/15 text-zinc-400 border-zinc-500/20'
                        }`}>{s.label}</span>
                      ))
                    })()}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Start Time</label>
                    <input type="time" value={newProtocol.working_hours_start}
                      onChange={(e) => setNewProtocol(p => ({ ...p, working_hours_start: e.target.value }))}
                      className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">End Time</label>
                    <input type="time" value={newProtocol.working_hours_end}
                      onChange={(e) => setNewProtocol(p => ({ ...p, working_hours_end: e.target.value }))}
                      className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Working Days</label>
                  <div className="flex gap-1">
                    {DAYS_SHORT.map((day, idx) => (
                      <button
                        key={day}
                        onClick={() => setNewProtocol(p => ({
                          ...p,
                          working_days: p.working_days.includes(idx + 1)
                            ? p.working_days.filter(d => d !== idx + 1)
                            : [...p.working_days, idx + 1].sort(),
                        }))}
                        className={`w-9 h-9 rounded-lg text-[10px] font-bold transition-colors ${
                          newProtocol.working_days.includes(idx + 1)
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : 'bg-[var(--pz-surface-2)] text-[var(--pz-text-faint)] border border-[var(--pz-border)]'
                        }`}
                      >
                        {day[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <button
              onClick={() => createProtocolMutation.mutate(newProtocol)}
              disabled={!newProtocol.name || !newProtocol.code || createProtocolMutation.isPending}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-bold transition-all disabled:opacity-50"
            >
              {createProtocolMutation.isPending ? 'Creating Protocol...' : 'Create Protocol & Assign'}
            </button>
          </motion.div>
        )}
        </AnimatePresence>

        {!showNewProtocol && (
          <>
            <select
              value={form.shift_protocol_id}
              onChange={(e) => setForm(p => ({ ...p, shift_protocol_id: e.target.value }))}
              className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}
            >
              {protocolsLoading ? (
                <option>Loading protocols...</option>
              ) : protocols.length === 0 ? (
                <option value="">No protocols — create one above</option>
              ) : (
                <>
                  <option value="">Select protocol</option>
                  {protocols.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </>
              )}
            </select>
            {protocols.length === 0 && !protocolsLoading && (
              <p className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
                No shift protocols exist. Click "Create New" above to define one.
              </p>
            )}
            {selectedProtocol && (
              <div className="mt-3 p-3 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)]/50">
                <div className="flex items-center gap-2 mb-1.5">
                  <Clock size={14} className="text-blue-400" />
                  <span className="text-sm font-semibold text-blue-400">{selectedProtocol.protocol_type}</span>
                  <span className="text-xs text-[var(--pz-text-muted)] font-mono">
                    {selectedProtocol.working_hours_start ?? '—'} – {selectedProtocol.working_hours_end ?? '—'}
                  </span>
                </div>
                {selectedProtocol.description && (
                  <p className="text-sm text-[var(--pz-text-muted)]">{selectedProtocol.description}</p>
                )}
              </div>
            )}
            <p className="text-xs text-[var(--pz-text-faint)] mt-2">
              This protocol applies to all employees in this department by default.
            </p>
          </>
        )}
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Head of Department
        </label>
        <input value={form.head_name} onChange={(e) => setForm(p => ({ ...p, head_name: e.target.value }))}
          placeholder="e.g. Jane Smith"
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Description
        </label>
        <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
          rows={3} placeholder="Department purpose and responsibilities..."
          className="pz-input w-full" style={{ height: 'auto', minHeight: '88px', fontSize: '14px', resize: 'none' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '20px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md"
          loading={createMutation.isPending}
          disabled={!form.name || !form.code || !form.shift_protocol_id || createMutation.isPending}
          onClick={() => createMutation.mutate(form)}>
          {createMutation.isPending ? 'Creating...' : 'Create Department'}
        </Button>
      </div>
    </div>
  )
}
