import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Clock, Sun, Moon, Trash2, Users, Pencil, CalendarOff } from 'lucide-react'
import { shiftTemplatesAPI, deptShiftRulesAPI, shiftAssignmentsAPI, departmentsAPI } from '@/api/client'
import { format } from 'date-fns'
import type { ShiftTemplate } from '@/types'
import { PageHeader, TabBar } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table/DataTable'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { motion } from 'framer-motion'
import { Modal } from '@/components/ui/Modal'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

const templateColumns: ColumnDef<ShiftTemplate, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Shift Name',
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <div className={`p-2 rounded-lg ${row.original.is_overnight ? 'bg-indigo-500/10 border border-indigo-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
          {row.original.is_overnight ? <Moon size={14} className="text-indigo-500" /> : <Sun size={14} className="text-amber-500" />}
        </div>
        <div>
          <p className="font-semibold text-[var(--pz-text)]">{row.original.name}</p>
          <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">{row.original.code}</p>
        </div>
      </div>
    ),
    size: 220,
  },
  {
    accessorKey: 'start_time',
    header: 'Start',
    cell: ({ getValue }) => <span className="text-[var(--pz-text-secondary)] font-mono tabular-nums">{getValue() as string}</span>,
    size: 90,
  },
  {
    accessorKey: 'end_time',
    header: 'End',
    cell: ({ getValue }) => <span className="text-[var(--pz-text-secondary)] font-mono tabular-nums">{getValue() as string}</span>,
    size: 90,
  },
  {
    accessorKey: 'working_hours',
    header: 'Hours',
    cell: ({ getValue }) => <span className="text-[var(--pz-text-secondary)]">{(getValue() as number) || '—'}h</span>,
    size: 80,
  },
  {
    accessorKey: 'grace_period_minutes',
    header: 'Grace',
    cell: ({ getValue }) => <span className="text-[var(--pz-text-secondary)]">{getValue() as number}m</span>,
    size: 80,
  },
  {
    accessorKey: 'break_duration_minutes',
    header: 'Break',
    cell: ({ getValue }) => <span className="text-[var(--pz-text-secondary)]">{getValue() as number}m</span>,
    size: 80,
  },
  {
    accessorKey: 'is_overnight',
    header: 'Type',
    cell: ({ getValue }) => (
      <StatusBadge status={getValue() ? 'info' : 'success'} size="xs" dot={false}>
        {getValue() ? 'Overnight' : 'Day'}
      </StatusBadge>
    ),
    size: 100,
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ getValue }) => <StatusBadge status={getValue() ? 'active' : 'inactive'} size="xs" />,
    size: 100,
  },
]

export default function Shifts() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('templates')
  const [searchValue, setSearchValue] = useState('')
  const [selectedShift, setSelectedShift] = useState<ShiftTemplate | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingShift, setEditingShift] = useState<ShiftTemplate | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => shiftTemplatesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-templates'] })
      setSelectedShift(null)
      toast.success('Shift template deleted')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete'),
  })

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['shift-templates'],
    queryFn: async () => (await shiftTemplatesAPI.list()).data,
  })

  const { data: assignmentsData } = useQuery({
    queryKey: ['shift-assignments'],
    queryFn: async () => (await shiftAssignmentsAPI.listAssignments()).data,
  })

  const templates: ShiftTemplate[] = Array.isArray(templatesData) ? templatesData : templatesData?.items ?? []
  const assignments = Array.isArray(assignmentsData) ? assignmentsData : assignmentsData?.items ?? []

  const filtered = useMemo(() => {
    if (!searchValue.trim()) return templates
    const q = searchValue.toLowerCase()
    return templates.filter(t => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
  }, [templates, searchValue])

  const activeTemplatesCount = templates.filter(t => t.is_active).length
  const dayShiftsCount = templates.filter(t => !t.is_overnight).length
  const nightShiftsCount = templates.filter(t => t.is_overnight).length
  const assignedStaffCount = assignments.length

  return (
    <div className="space-y-5 pz-slide-up">
      <PageHeader
        title="Shifts & Schedules"
        subtitle={`Shift template and schedule management · ${templates.length} templates`}
        breadcrumbs={[{ label: 'Workforce' }, { label: 'Shifts & Schedules' }]}
        tabs={
          <TabBar
            tabs={[
              { id: 'templates', label: 'Shift Templates', icon: <Clock size={14} /> },
              { id: 'rules', label: 'Department Rules' },
              { id: 'assignments', label: 'Assignments' },
              { id: 'overrides', label: 'Overrides', icon: <CalendarOff size={14} /> },
            ]}
            activeTab={tab}
            onChange={(t) => { setTab(t); setSearchValue('') }}
          />
        }
        actions={
          <Button variant="default" size="md" onClick={() => setShowCreateModal(true)}>
            <Plus size={15} />
            New Template
          </Button>
        }
      />

      {tab === 'templates' && (
        <>
          {/* Summary Section Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6 animate-fade-in">
            {[
              { label: 'Active Templates', value: activeTemplatesCount, desc: 'Shift templates currently active', icon: Clock, color: 'text-blue-400 bg-blue-500/10' },
              { label: 'Day Shifts', value: dayShiftsCount, desc: 'Configured day shift patterns', icon: Sun, color: 'text-amber-400 bg-amber-500/10' },
              { label: 'Night Shifts', value: nightShiftsCount, desc: 'Configured night shift patterns', icon: Moon, color: 'text-indigo-400 bg-indigo-500/10' },
              { label: 'Assigned Staff', value: assignedStaffCount, desc: 'Employees linked to schedules', icon: Users, color: 'text-emerald-400 bg-emerald-500/10' },
            ].map((c, i) => {
              const Icon = c.icon
              return (
                <div key={i} className="pz-card p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">{c.label}</p>
                    <p className="text-2xl font-bold text-[var(--pz-text)]">{c.value}</p>
                    <p className="text-xs text-[var(--pz-text-tertiary)]">{c.desc}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl ${c.color} flex-shrink-0`}>
                    <Icon size={20} strokeWidth={2} />
                  </div>
                </div>
              )
            })}
          </div>

          <DataTable
            data={filtered}
            columns={templateColumns}
            loading={isLoading}
            onRowClick={(shift) => setSelectedShift(shift)}
            toolbar={
              <FilterBar
                searchValue={searchValue}
                onSearchChange={setSearchValue}
                searchPlaceholder="Search shifts..."
              />
            }
          />
        </>
      )}

      {tab === 'rules' && (
        <DeptShiftRulesTab />
      )}

      {tab === 'assignments' && (
        <ShiftAssignmentsTab />
      )}

      {tab === 'overrides' && (
        <ShiftOverridesTab />
      )}

      {/* Shift Detail Drawer */}
      <DetailDrawer
        open={!!selectedShift}
        onClose={() => setSelectedShift(null)}
        title={selectedShift?.name || ''}
        subtitle={selectedShift?.code}
        width={700}
      >
        {selectedShift && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Status header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
              <div style={{
                padding: '14px', borderRadius: '6px', flexShrink: 0,
                background: selectedShift.is_overnight ? 'rgba(99,102,241,0.10)' : 'rgba(245,158,11,0.10)',
                border: `1px solid ${selectedShift.is_overnight ? 'rgba(99,102,241,0.25)' : 'rgba(245,158,11,0.25)'}`,
              }}>
                {selectedShift.is_overnight
                  ? <Moon size={22} style={{ color: '#818CF8' }} />
                  : <Sun size={22} style={{ color: '#F59E0B' }} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <StatusBadge status={selectedShift.is_active ? 'active' : 'inactive'} size="md" />
                <StatusBadge status={selectedShift.is_overnight ? 'info' : 'success'} size="sm" dot={false}>
                  {selectedShift.is_overnight ? 'Overnight' : 'Day Shift'}
                </StatusBadge>
              </div>
            </div>

            {/* Time windows — 2-col cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Shift Hours</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {[
                  { label: 'Start Time', value: selectedShift.start_time },
                  { label: 'End Time', value: selectedShift.end_time },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '16px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '6px', minHeight: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', fontFamily: 'monospace', margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Check-in/out windows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Check Windows</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {[
                  { label: 'Check-in Window', value: `${selectedShift.checkin_window_start} — ${selectedShift.checkin_window_end}` },
                  { label: 'Check-out Window', value: `${selectedShift.checkout_window_start} — ${selectedShift.checkout_window_end}` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '16px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '6px', minHeight: '72px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace', margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Details table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Details</h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  ['Working Hours', `${selectedShift.working_hours}h`],
                  ['Grace Period', `${selectedShift.grace_period_minutes}m`],
                  ['Break Duration', `${selectedShift.break_duration_minutes}m`],
                  ['Description', selectedShift.description || '—'],
                  ['Created', format(new Date(selectedShift.created_at), 'MMM d, yyyy')],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '44px', paddingInline: '14px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--pz-border)' }}>
              <Button variant="outline" size="md" style={{ flex: 1 }} onClick={() => setEditingShift(selectedShift)}>
                <Pencil size={14} /> Edit
              </Button>
              <Button variant="destructive" size="md" style={{ flex: 1 }}
                onClick={() => { if (confirm('Delete this shift template? This cannot be undone.')) deleteMutation.mutate(selectedShift.id) }}>
                <Trash2 size={14} /> Delete
              </Button>
            </div>

          </div>
        )}
      </DetailDrawer>

      {/* ── Edit Shift Template Modal ────────────────────────────── */}
      {editingShift && (
        <Modal
          open={!!editingShift}
          onClose={() => setEditingShift(null)}
          title="Edit Shift Template"
          description={`Editing ${editingShift.name}`}
          size="md"
          footer={null}
        >
          <EditShiftTemplateForm
            shift={editingShift}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['shift-templates'] })
              setEditingShift(null)
              setSelectedShift(null)
            }}
            onCancel={() => setEditingShift(null)}
          />
        </Modal>
      )}

      {/* ── Create Shift Template Modal ────────────────────────────── */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Shift Template"
        description="Define a new shift with timing windows and rules"
        size="md"
        footer={
          null // footer is inside the form
        }
      >
        <CreateShiftTemplateForm
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['shift-templates'] })
            setShowCreateModal(false)
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>
    </div>
  )
}

function CreateShiftTemplateForm({
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
    start_time: '08:00',
    end_time: '17:00',
    checkin_window_start: '07:30',
    checkin_window_end: '08:30',
    checkout_window_start: '16:30',
    checkout_window_end: '17:30',
    working_hours: 8,
    grace_period_minutes: 15,
    break_duration_minutes: 60,
    is_overnight: false,
    description: '',
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => shiftTemplatesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-templates'] })
      toast.success('Shift template created')
      onSuccess()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create'),
  })

  return (
    <div className="space-y-6">
      {/* Row 1: Basic Info */}
      <div className="grid grid-cols-5 gap-5">
        <div className="col-span-3 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Shift Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Standard Day Shift"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Code *</label>
            <input
              value={form.code}
              onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. DAY_STANDARD"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="Describe the shift purpose and guidelines..."
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
            />
          </div>
          {/* Overnight toggle */}
          <label className="flex items-center gap-3 p-3 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] cursor-pointer hover:bg-[var(--pz-surface-2)] transition-colors">
            <div className="relative">
              <input
                type="checkbox"
                checked={form.is_overnight}
                onChange={(e) => setForm(p => ({ ...p, is_overnight: e.target.checked }))}
                className="sr-only"
              />
              <div className={`w-9 h-5 rounded-full transition-colors ${form.is_overnight ? 'bg-indigo-600' : 'bg-[var(--pz-surface-3)]'}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mt-0.5 ${form.is_overnight ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {form.is_overnight ? <Moon size={14} className="text-indigo-400" /> : <Sun size={14} className="text-amber-400" />}
              <span className="text-xs font-semibold text-[var(--pz-text-secondary)]">
                {form.is_overnight ? 'Overnight shift (spans midnight)' : 'Day shift'}
              </span>
            </div>
          </label>
        </div>

        {/* Right card: Time Windows */}
        <div className="col-span-2 space-y-3">
          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Core Hours</h5>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Start *</label>
                <input type="time" value={form.start_time} onChange={(e) => setForm(p => ({ ...p, start_time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">End *</label>
                <input type="time" value={form.end_time} onChange={(e) => setForm(p => ({ ...p, end_time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Check-in Window</h5>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Window Start</label>
                <input type="time" value={form.checkin_window_start} onChange={(e) => setForm(p => ({ ...p, checkin_window_start: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Window End</label>
                <input type="time" value={form.checkin_window_end} onChange={(e) => setForm(p => ({ ...p, checkin_window_end: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Check-out Window</h5>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Window Start</label>
                <input type="time" value={form.checkout_window_start} onChange={(e) => setForm(p => ({ ...p, checkout_window_start: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Window End</label>
                <input type="time" value={form.checkout_window_end} onChange={(e) => setForm(p => ({ ...p, checkout_window_end: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Numeric config */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Working Hours</label>
          <div className="relative">
            <input type="number" value={form.working_hours} onChange={(e) => setForm(p => ({ ...p, working_hours: +e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--pz-text-muted)] font-medium">hrs</span>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Grace Period</label>
          <div className="relative">
            <input type="number" value={form.grace_period_minutes} onChange={(e) => setForm(p => ({ ...p, grace_period_minutes: +e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--pz-text-muted)] font-medium">min</span>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Break Duration</label>
          <div className="relative">
            <input type="number" value={form.break_duration_minutes} onChange={(e) => setForm(p => ({ ...p, break_duration_minutes: +e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--pz-text-muted)] font-medium">min</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4" style={{ borderTop: '1px solid var(--pz-border)', marginTop: '16px' }}>
        <Button variant="outline" size="lg" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="default" size="lg" className="flex-1" onClick={() => createMutation.mutate(form)}
          disabled={!form.name || !form.code || createMutation.isPending}
          loading={createMutation.isPending}>
          {createMutation.isPending ? 'Creating...' : 'Create Template'}
        </Button>
      </div>
    </div>
  )
}

function EditShiftTemplateForm({
  shift,
  onSuccess,
  onCancel,
}: {
  shift: ShiftTemplate
  onSuccess: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: shift.name,
    code: shift.code,
    start_time: shift.start_time,
    end_time: shift.end_time,
    checkin_window_start: shift.checkin_window_start,
    checkin_window_end: shift.checkin_window_end,
    checkout_window_start: shift.checkout_window_start,
    checkout_window_end: shift.checkout_window_end,
    working_hours: shift.working_hours,
    grace_period_minutes: shift.grace_period_minutes,
    break_duration_minutes: shift.break_duration_minutes,
    is_overnight: shift.is_overnight,
    is_active: shift.is_active,
    description: shift.description || '',
  })

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => shiftTemplatesAPI.update(shift.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-templates'] })
      toast.success('Shift template updated')
      onSuccess()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update'),
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-5">
        <div className="col-span-3 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Shift Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Code *</label>
            <input
              value={form.code}
              onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
            />
          </div>
          <label className="flex items-center gap-3 p-3 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] cursor-pointer hover:bg-[var(--pz-surface-2)] transition-colors">
            <div className="relative">
              <input
                type="checkbox"
                checked={form.is_overnight}
                onChange={(e) => setForm(p => ({ ...p, is_overnight: e.target.checked }))}
                className="sr-only"
              />
              <div className={`w-9 h-5 rounded-full transition-colors ${form.is_overnight ? 'bg-indigo-600' : 'bg-[var(--pz-surface-3)]'}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mt-0.5 ${form.is_overnight ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {form.is_overnight ? <Moon size={14} className="text-indigo-400" /> : <Sun size={14} className="text-amber-400" />}
              <span className="text-xs font-semibold text-[var(--pz-text-secondary)]">
                {form.is_overnight ? 'Overnight shift (spans midnight)' : 'Day shift'}
              </span>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] cursor-pointer hover:bg-[var(--pz-surface-2)] transition-colors">
            <div className="relative">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm(p => ({ ...p, is_active: e.target.checked }))}
                className="sr-only"
              />
              <div className={`w-9 h-5 rounded-full transition-colors ${form.is_active ? 'bg-emerald-600' : 'bg-[var(--pz-surface-3)]'}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mt-0.5 ${form.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
            </div>
            <span className="text-xs font-semibold text-[var(--pz-text-secondary)]">
              {form.is_active ? 'Active' : 'Inactive'}
            </span>
          </label>
        </div>

        <div className="col-span-2 space-y-3">
          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Core Hours</h5>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Start *</label>
                <input type="time" value={form.start_time} onChange={(e) => setForm(p => ({ ...p, start_time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">End *</label>
                <input type="time" value={form.end_time} onChange={(e) => setForm(p => ({ ...p, end_time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Check-in Window</h5>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Window Start</label>
                <input type="time" value={form.checkin_window_start} onChange={(e) => setForm(p => ({ ...p, checkin_window_start: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Window End</label>
                <input type="time" value={form.checkin_window_end} onChange={(e) => setForm(p => ({ ...p, checkin_window_end: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Check-out Window</h5>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Window Start</label>
                <input type="time" value={form.checkout_window_start} onChange={(e) => setForm(p => ({ ...p, checkout_window_start: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Window End</label>
                <input type="time" value={form.checkout_window_end} onChange={(e) => setForm(p => ({ ...p, checkout_window_end: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Working Hours</label>
          <div className="relative">
            <input type="number" value={form.working_hours} onChange={(e) => setForm(p => ({ ...p, working_hours: +e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--pz-text-muted)] font-medium">hrs</span>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Grace Period</label>
          <div className="relative">
            <input type="number" value={form.grace_period_minutes} onChange={(e) => setForm(p => ({ ...p, grace_period_minutes: +e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--pz-text-muted)] font-medium">min</span>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Break Duration</label>
          <div className="relative">
            <input type="number" value={form.break_duration_minutes} onChange={(e) => setForm(p => ({ ...p, break_duration_minutes: +e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50 transition-colors" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--pz-text-muted)] font-medium">min</span>
          </div>
        </div>
      </div>

      <div className="flex gap-4 pt-4" style={{ borderTop: '1px solid var(--pz-border)', marginTop: '16px' }}>
        <Button variant="outline" size="lg" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="default" size="lg" className="flex-1" onClick={() => updateMutation.mutate(form)}
          disabled={!form.name || !form.code || updateMutation.isPending}
          loading={updateMutation.isPending}>
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

function DeptShiftRulesTab() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingRule, setEditingRule] = useState<any>(null)

  const { data: rulesData, isLoading } = useQuery({
    queryKey: ['dept-shift-rules'],
    queryFn: async () => (await deptShiftRulesAPI.list()).data,
  })

  const { data: deptData } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })

  const { data: templatesData } = useQuery({
    queryKey: ['shift-templates-list'],
    queryFn: async () => (await shiftTemplatesAPI.list()).data,
  })

  const rules = Array.isArray(rulesData) ? rulesData : rulesData?.items ?? []
  const departments: any[] = Array.isArray(deptData) ? deptData : deptData?.items ?? []
  const templates = Array.isArray(templatesData) ? templatesData : templatesData?.items ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deptShiftRulesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dept-shift-rules'] })
      toast.success('Rule deleted')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Default shift rules per department — determines which shift template applies to unscheduled employees
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
        >
          <Plus size={14} /> Add Rule
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="pz-card p-4">
              <div className="pz-skeleton h-4 w-48 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule: any, i: number) => (
            <motion.div
              key={rule.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="pz-card p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                  <Clock size={14} className="text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--pz-text)]">{rule.department_name || rule.department_id}</p>
                  <p className="text-[10px] text-[var(--pz-text-muted)]">
                    Shift: <span className="text-[var(--pz-text-secondary)]">{rule.shift_template_name || rule.shift_template_id}</span>
                    {rule.protocol && <span className="ml-2 text-[var(--pz-text-secondary)]">· Protocol: {rule.protocol}</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditingRule(rule)}
                  className="p-1.5 rounded-md text-blue-400 hover:bg-blue-500/10 transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => deleteMutation.mutate(rule.id)}
                  className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          ))}
          {!rules.length && (
            <div className="pz-card p-8 text-center text-gray-500">
              <p className="text-sm">No department shift rules configured</p>
              <p className="text-xs mt-1">Create a rule to set default shifts per department</p>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setShowCreateModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ width: '100%', maxWidth: '720px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden' }}
          >
            <div style={{ padding: '32px 36px 24px 36px', borderBottom: '1px solid var(--pz-border)' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Add Department Shift Rule</h3>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>Set a default shift template for a department.</p>
            </div>
            <div style={{ padding: '32px 36px 36px 36px' }}>
              <CreateDeptRuleForm
                departments={departments}
                templates={templates}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['dept-shift-rules'] })
                  setShowCreateModal(false)
                }}
                onCancel={() => setShowCreateModal(false)}
              />
            </div>
          </motion.div>
        </div>
      )}

      {editingRule && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setEditingRule(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ width: '100%', maxWidth: '720px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden' }}
          >
            <div style={{ padding: '32px 36px 24px 36px', borderBottom: '1px solid var(--pz-border)' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Edit Department Shift Rule</h3>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>Update the default shift for this department.</p>
            </div>
            <div style={{ padding: '32px 36px 36px 36px' }}>
              <EditDeptRuleForm
                rule={editingRule}
                departments={departments}
                templates={templates}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['dept-shift-rules'] })
                  setEditingRule(null)
                }}
                onCancel={() => setEditingRule(null)}
              />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function CreateDeptRuleForm({
  departments,
  templates,
  onSuccess,
  onCancel,
}: {
  departments: any[]
  templates: any[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    department_id: '',
    shift_template_id: '',
    protocol: 'fixed',
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => deptShiftRulesAPI.create(data),
    onSuccess: () => {
      toast.success('Rule created')
      onSuccess()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Department <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.department_id} onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select department</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Default Shift Template <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.shift_template_id} onChange={e => setForm(p => ({ ...p, shift_template_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select shift template</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time} - {t.end_time})</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Protocol</label>
        <select value={form.protocol} onChange={e => setForm(p => ({ ...p, protocol: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="fixed">Fixed (Mon-Fri)</option>
          <option value="rotating">Rotating (2-on/2-off)</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '20px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md" loading={createMutation.isPending} disabled={!form.department_id || !form.shift_template_id || createMutation.isPending} onClick={() => createMutation.mutate(form)}>
          {createMutation.isPending ? 'Creating...' : 'Create Rule'}
        </Button>
      </div>
    </div>
  )
}
function EditDeptRuleForm({
  rule,
  departments,
  templates,
  onSuccess,
  onCancel,
}: {
  rule: any
  departments: any[]
  templates: any[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    department_id: rule.department_id,
    shift_template_id: rule.shift_template_id,
    protocol: rule.protocol || 'fixed',
  })

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => deptShiftRulesAPI.update(rule.id, data),
    onSuccess: () => {
      toast.success('Rule updated')
      onSuccess()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Department <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.department_id} onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select department</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Default Shift Template <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.shift_template_id} onChange={e => setForm(p => ({ ...p, shift_template_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select shift template</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time} - {t.end_time})</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Protocol</label>
        <select value={form.protocol} onChange={e => setForm(p => ({ ...p, protocol: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="fixed">Fixed (Mon-Fri)</option>
          <option value="rotating">Rotating (2-on/2-off)</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '20px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md" loading={updateMutation.isPending} disabled={!form.department_id || !form.shift_template_id || updateMutation.isPending} onClick={() => updateMutation.mutate(form)}>
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

function CreateAssignmentForm({
  employees,
  templates,
  onSuccess,
  onCancel,
}: {
  employees: any[]
  templates: any[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({ employee_id: '', shift_template_id: '', pattern: 'fixed' })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => shiftAssignmentsAPI.createAssignment(data),
    onSuccess: () => { toast.success('Assignment created'); onSuccess() },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Employee <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select employee</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Shift Template <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.shift_template_id} onChange={e => setForm(p => ({ ...p, shift_template_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select shift template</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time} - {t.end_time})</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Pattern</label>
        <select value={form.pattern} onChange={e => setForm(p => ({ ...p, pattern: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="fixed">Fixed (same shift daily)</option>
          <option value="2on2off">2-on / 2-off</option>
          <option value="3on3off">3-on / 3-off</option>
          <option value="weekonweekoff">Week-on / Week-off</option>
        </select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '20px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md" loading={createMutation.isPending} disabled={!form.employee_id || !form.shift_template_id || createMutation.isPending} onClick={() => createMutation.mutate(form)}>
          {createMutation.isPending ? 'Creating...' : 'Create Assignment'}
        </Button>
      </div>
    </div>
  )
}

function EditAssignmentForm({
  assignment,
  employees,
  templates,
  onSuccess,
  onCancel,
}: {
  assignment: any
  employees: any[]
  templates: any[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    employee_id: assignment.employee_id,
    shift_template_id: assignment.shift_template_id,
    pattern: assignment.pattern || 'fixed',
  })

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => shiftAssignmentsAPI.updateAssignment(assignment.id, data),
    onSuccess: () => { toast.success('Assignment updated'); onSuccess() },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Employee <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select employee</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Shift Template <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.shift_template_id} onChange={e => setForm(p => ({ ...p, shift_template_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select shift template</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time} - {t.end_time})</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Pattern</label>
        <select value={form.pattern} onChange={e => setForm(p => ({ ...p, pattern: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="fixed">Fixed (same shift daily)</option>
          <option value="2on2off">2-on / 2-off</option>
          <option value="3on3off">3-on / 3-off</option>
          <option value="weekonweekoff">Week-on / Week-off</option>
        </select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '20px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md" loading={updateMutation.isPending} disabled={!form.employee_id || !form.shift_template_id || updateMutation.isPending} onClick={() => updateMutation.mutate(form)}>
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

function ShiftAssignmentsTab() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<any>(null)

  const { data: assignmentsData, isLoading } = useQuery({
    queryKey: ['shift-assignments'],
    queryFn: async () => (await shiftAssignmentsAPI.listAssignments()).data,
  })

  const { data: empData } = useQuery({
    queryKey: ['employees-list'],
    queryFn: async () => (await import('@/api/client').then(m => m.employeesAPI.list({ per_page: 200 }))).data,
  })

  const { data: templatesData } = useQuery({
    queryKey: ['shift-templates-list'],
    queryFn: async () => (await shiftTemplatesAPI.list()).data,
  })

  const assignments = Array.isArray(assignmentsData) ? assignmentsData : assignmentsData?.items ?? []
  const employees = empData?.items ?? []
  const templates = Array.isArray(templatesData) ? templatesData : templatesData?.items ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: string) => shiftAssignmentsAPI.deleteAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] })
      toast.success('Assignment deleted')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Individual employee shift assignments — overrides department rules
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
        >
          <Plus size={14} /> Add Assignment
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="pz-card p-4">
              <div className="pz-skeleton h-4 w-48 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map((a: any, i: number) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="pz-card p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 flex items-center justify-center text-[10px] font-bold text-blue-400 border border-blue-500/20">
                  {a.employee_name?.[0] || '?'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--pz-text)]">{a.employee_name || 'Unknown'}</p>
                  <p className="text-[10px] text-[var(--pz-text-muted)]">
                    Shift: <span className="text-[var(--pz-text-secondary)]">{a.shift_template_name || a.shift_template_id}</span>
                    {a.pattern && <span className="ml-2 text-[var(--pz-text-secondary)]">· Pattern: {a.pattern}</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditingAssignment(a)}
                  className="p-1.5 rounded-md text-blue-400 hover:bg-blue-500/10 transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => deleteMutation.mutate(a.id)}
                  className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          ))}
          {!assignments.length && (
            <div className="pz-card p-8 text-center text-gray-500">
              <p className="text-sm">No shift assignments configured</p>
              <p className="text-xs mt-1">Assign individual employees to specific shifts</p>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setShowCreateModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ width: '100%', maxWidth: '720px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden' }}
          >
            <div style={{ padding: '32px 36px 24px 36px', borderBottom: '1px solid var(--pz-border)' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Add Shift Assignment</h3>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>Assign an individual employee to a specific shift template.</p>
            </div>
            <div style={{ padding: '32px 36px 36px 36px' }}>
              <CreateAssignmentForm
                employees={employees}
                templates={templates}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['shift-assignments'] })
                  setShowCreateModal(false)
                }}
                onCancel={() => setShowCreateModal(false)}
              />
            </div>
          </motion.div>
        </div>
      )}

      {editingAssignment && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setEditingAssignment(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ width: '100%', maxWidth: '720px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden' }}
          >
            <div style={{ padding: '32px 36px 24px 36px', borderBottom: '1px solid var(--pz-border)' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Edit Shift Assignment</h3>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>Update the shift assignment for this employee.</p>
            </div>
            <div style={{ padding: '32px 36px 36px 36px' }}>
              <EditAssignmentForm
                assignment={editingAssignment}
                employees={employees}
                templates={templates}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['shift-assignments'] })
                  setEditingAssignment(null)
                }}
                onCancel={() => setEditingAssignment(null)}
              />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}


function ShiftOverridesTab() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingOverride, setEditingOverride] = useState<any>(null)

  const { data: overridesData, isLoading } = useQuery({
    queryKey: ['shift-overrides'],
    queryFn: async () => (await shiftAssignmentsAPI.listOverrides()).data,
  })

  const { data: empData } = useQuery({
    queryKey: ['employees-list'],
    queryFn: async () => (await import('@/api/client').then(m => m.employeesAPI.list({ per_page: 200 }))).data,
  })

  const { data: templatesData } = useQuery({
    queryKey: ['shift-templates-list'],
    queryFn: async () => (await shiftTemplatesAPI.list()).data,
  })

  const overrides = Array.isArray(overridesData) ? overridesData : overridesData?.items ?? []
  const employees = empData?.items ?? []
  const templates = Array.isArray(templatesData) ? templatesData : templatesData?.items ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: string) => shiftAssignmentsAPI.deleteOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-overrides'] })
      toast.success('Override deleted')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete'),
  })

  const employeeMap = useMemo(() => {
    const map = new Map<string, any>()
    employees.forEach((e: any) => map.set(e.id, e))
    return map
  }, [employees])

  const templateMap = useMemo(() => {
    const map = new Map<string, any>()
    templates.forEach((t: any) => map.set(t.id, t))
    return map
  }, [templates])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--pz-text-muted)]">
          Temporary shift overrides for specific date ranges (vacation, special assignments, etc.)
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
        >
          <Plus size={14} /> Add Override
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="pz-card p-4">
              <div className="pz-skeleton h-4 w-48 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {overrides.map((o: any, i: number) => {
            const emp = employeeMap.get(o.employee_id)
            const tmpl = templateMap.get(o.shift_template_id)
            const now = new Date()
            const start = new Date(o.start_date)
            const end = new Date(o.end_date)
            const isActive = start <= now && now <= end
            const isPast = end < now

            return (
              <motion.div
                key={o.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="pz-card p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isActive ? 'bg-amber-500/10 border border-amber-500/20' : isPast ? 'bg-gray-500/10 border border-gray-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                    <CalendarOff size={14} className={isActive ? 'text-amber-400' : isPast ? 'text-gray-400' : 'text-emerald-400'} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--pz-text)]">
                      {emp?.full_name || 'Unknown Employee'}
                    </p>
                    <p className="text-[10px] text-[var(--pz-text-muted)]">
                      {tmpl?.name || 'Unknown Shift'} · {o.start_date} → {o.end_date}
                      {isActive && <span className="ml-2 text-amber-400">Active</span>}
                      {isPast && <span className="ml-2 text-gray-500">Expired</span>}
                    </p>
                    {o.reason && (
                      <p className="text-[10px] text-[var(--pz-text-muted)] mt-0.5">Reason: {o.reason}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingOverride(o)}
                    className="p-1.5 rounded-md text-blue-400 hover:bg-blue-500/10 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(o.id)}
                    className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            )
          })}
          {!overrides.length && (
            <div className="pz-card p-8 text-center text-gray-500">
              <p className="text-sm">No shift overrides configured</p>
              <p className="text-xs mt-1">Create overrides for temporary shift changes</p>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setShowCreateModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ width: '100%', maxWidth: '720px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden' }}
          >
            <div style={{ padding: '32px 36px 24px 36px', borderBottom: '1px solid var(--pz-border)' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Add Shift Override</h3>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>Apply a temporary shift change for a specific date range.</p>
            </div>
            <div style={{ padding: '32px 36px 36px 36px' }}>
              <CreateOverrideForm
                employees={employees}
                templates={templates}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['shift-overrides'] })
                  setShowCreateModal(false)
                }}
                onCancel={() => setShowCreateModal(false)}
              />
            </div>
          </motion.div>
        </div>
      )}

      {editingOverride && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setEditingOverride(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ width: '100%', maxWidth: '720px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden' }}
          >
            <div style={{ padding: '32px 36px 24px 36px', borderBottom: '1px solid var(--pz-border)' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Edit Shift Override</h3>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>Modify the temporary shift change.</p>
            </div>
            <div style={{ padding: '32px 36px 36px 36px' }}>
              <EditOverrideForm
                override={editingOverride}
                employees={employees}
                templates={templates}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['shift-overrides'] })
                  setEditingOverride(null)
                }}
                onCancel={() => setEditingOverride(null)}
              />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function CreateOverrideForm({
  employees,
  templates,
  onSuccess,
  onCancel,
}: {
  employees: any[]
  templates: any[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    employee_id: '',
    shift_template_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    reason: '',
    notes: '',
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => shiftAssignmentsAPI.createOverride(data),
    onSuccess: () => {
      toast.success('Override created')
      onSuccess()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Employee <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select employee</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Override Shift Template <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.shift_template_id} onChange={e => setForm(p => ({ ...p, shift_template_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select shift template</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time} - {t.end_time})</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Start Date <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
          </label>
          <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
            className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            End Date <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
          </label>
          <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
            className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Reason</label>
        <input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
          placeholder="e.g. Vacation, Training, Special Assignment"
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Notes</label>
        <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          rows={2} placeholder="Additional notes..."
          className="pz-input w-full" style={{ height: 'auto', minHeight: '72px', fontSize: '14px', resize: 'none' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '20px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md" loading={createMutation.isPending} disabled={!form.employee_id || !form.shift_template_id || createMutation.isPending} onClick={() => createMutation.mutate(form)}>
          {createMutation.isPending ? 'Creating...' : 'Create Override'}
        </Button>
      </div>
    </div>
  )
}

function EditOverrideForm({
  override: o,
  employees,
  templates,
  onSuccess,
  onCancel,
}: {
  override: any
  employees: any[]
  templates: any[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    employee_id: o.employee_id,
    shift_template_id: o.shift_template_id,
    start_date: o.start_date,
    end_date: o.end_date,
    reason: o.reason || '',
    notes: o.notes || '',
  })

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => shiftAssignmentsAPI.updateOverride(o.id, data),
    onSuccess: () => {
      toast.success('Override updated')
      onSuccess()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Employee <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select employee</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Override Shift Template <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <select value={form.shift_template_id} onChange={e => setForm(p => ({ ...p, shift_template_id: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
          <option value="">Select shift template</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time} - {t.end_time})</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Start Date <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
          </label>
          <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
            className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            End Date <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
          </label>
          <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
            className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Reason</label>
        <input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
          className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Notes</label>
        <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          rows={2} className="pz-input w-full" style={{ height: 'auto', minHeight: '72px', fontSize: '14px', resize: 'none' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '20px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md" loading={updateMutation.isPending} disabled={!form.employee_id || !form.shift_template_id || updateMutation.isPending} onClick={() => updateMutation.mutate(form)}>
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
