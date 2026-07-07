import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Clock, Sun, Moon, Trash2, Users, Pencil, CalendarOff, Calendar, Settings2, Layers, RefreshCw, Edit3, Info, Copy } from 'lucide-react'
import { shiftTemplatesAPI, deptShiftRulesAPI, shiftAssignmentsAPI, departmentsAPI, shiftProtocolsAPI } from '@/api/client'
import { format } from 'date-fns'
import type { ShiftTemplate, ShiftProtocol } from '@/types'
import { extractErrorMessage } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonCard } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TabBar } from '@/components/ui/PageHeader'
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

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '28px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '24px' },
  card: { padding: '20px', borderRadius: '10px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
}

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
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Shifts & Schedules</h1>
          <p style={s.headerSubtitle}>Shift template and schedule management · {templates.length} templates</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <TabBar
            tabs={[
              { id: 'templates', label: 'Shift Templates', icon: <Clock size={14} /> },
              { id: 'protocols', label: 'Protocols', icon: <Layers size={14} /> },
              { id: 'rules', label: 'Department Rules' },
              { id: 'assignments', label: 'Assignments' },
              { id: 'overrides', label: 'Overrides', icon: <CalendarOff size={14} /> },
            ]}
            activeTab={tab}
            onChange={(t) => { setTab(t); setSearchValue('') }}
          />
          <Button variant="default" size="md" onClick={() => setShowCreateModal(true)}>
            <Plus size={15} />
            New Template
          </Button>
        </div>
      </div>

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
                <div key={i} style={s.card}>
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

      {tab === 'protocols' && (
        <ShiftProtocolsTab />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
              <div style={{
                padding: '18px', borderRadius: '10px', flexShrink: 0,
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Shift Hours</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {[
                  { label: 'Start Time', value: selectedShift.start_time },
                  { label: 'End Time', value: selectedShift.end_time },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '20px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '10px', minHeight: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', fontFamily: 'monospace', margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Check-in/out windows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Check Windows</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {[
                  { label: 'Check-in Window', value: `${selectedShift.checkin_window_start} — ${selectedShift.checkin_window_end}` },
                  { label: 'Check-out Window', value: `${selectedShift.checkout_window_start} — ${selectedShift.checkout_window_end}` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '20px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '10px', minHeight: '72px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace', margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Details table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Details</h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' }}>
                {[
                  ['Working Hours', `${selectedShift.working_hours}h`],
                  ['Grace Period', `${selectedShift.grace_period_minutes}m`],
                  ['Break Duration', `${selectedShift.break_duration_minutes}m`],
                  ['Description', selectedShift.description || '—'],
                  ['Created', format(new Date(selectedShift.created_at), 'MMM d, yyyy')],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '52px', paddingInline: '16px', paddingBlock: '12px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '16px', paddingTop: '8px', borderTop: '1px solid var(--pz-border)' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '4px 0' }}>

      {/* Basic Information Section */}
      <div style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(37,99,235,0.12)', display: 'flex' }}>
            <Clock size={18} color="#2563EB" />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)' }}>Basic Information</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Shift Name <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Standard Day Shift"
              style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Code <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <input value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. DAY_STANDARD"
              style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ marginTop: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Description</label>
          <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
            rows={2} placeholder="Describe the shift purpose and guidelines..."
            style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginTop: '20px', display: 'flex', gap: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--pz-border)', cursor: 'pointer', flex: 1 }}>
            <div style={{ position: 'relative' }}>
              <input type="checkbox" checked={form.is_overnight}
                onChange={(e) => setForm(p => ({ ...p, is_overnight: e.target.checked }))}
                style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0 }} />
              <div style={{ width: '36px', height: '20px', borderRadius: '10px', background: form.is_overnight ? '#4F46E5' : 'var(--pz-surface-3)', transition: 'background 0.2s' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transform: form.is_overnight ? 'translateX(20px)' : 'translateX(4px)', marginTop: '3px', transition: 'transform 0.2s' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {form.is_overnight ? <Moon size={14} color="#818CF8" /> : <Sun size={14} color="#F59E0B" />}
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>
                {form.is_overnight ? 'Overnight shift (spans midnight)' : 'Day shift'}
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Schedule Windows Section */}
      <div style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(245,158,11,0.12)', display: 'flex' }}>
            <Calendar size={18} color="#F59E0B" />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)' }}>Schedule Windows</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <h5 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Core Hours</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>Start *</label>
                <input type="time" value={form.start_time} onChange={(e) => setForm(p => ({ ...p, start_time: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>End *</label>
                <input type="time" value={form.end_time} onChange={(e) => setForm(p => ({ ...p, end_time: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <h5 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Check-in Window</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>Window Start</label>
                <input type="time" value={form.checkin_window_start} onChange={(e) => setForm(p => ({ ...p, checkin_window_start: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>Window End</label>
                <input type="time" value={form.checkin_window_end} onChange={(e) => setForm(p => ({ ...p, checkin_window_end: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <h5 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Check-out Window</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>Window Start</label>
                <input type="time" value={form.checkout_window_start} onChange={(e) => setForm(p => ({ ...p, checkout_window_start: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>Window End</label>
                <input type="time" value={form.checkout_window_end} onChange={(e) => setForm(p => ({ ...p, checkout_window_end: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Section */}
      <div style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(139,92,246,0.12)', display: 'flex' }}>
            <Settings2 size={18} color="#8B5CF6" />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)' }}>Configuration</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Working Hours</label>
            <div style={{ position: 'relative' }}>
              <input type="number" value={form.working_hours} onChange={(e) => setForm(p => ({ ...p, working_hours: +e.target.value }))}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--pz-text-muted)', fontWeight: 500 }}>hrs</span>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Grace Period</label>
            <div style={{ position: 'relative' }}>
              <input type="number" value={form.grace_period_minutes} onChange={(e) => setForm(p => ({ ...p, grace_period_minutes: +e.target.value }))}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--pz-text-muted)', fontWeight: 500 }}>min</span>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Break Duration</label>
            <div style={{ position: 'relative' }}>
              <input type="number" value={form.break_duration_minutes} onChange={(e) => setForm(p => ({ ...p, break_duration_minutes: +e.target.value }))}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--pz-text-muted)', fontWeight: 500 }}>min</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '4px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md" onClick={() => createMutation.mutate(form)}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '4px 0' }}>

      {/* Basic Information Section */}
      <div style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(37,99,235,0.12)', display: 'flex' }}>
            <Clock size={18} color="#2563EB" />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)' }}>Basic Information</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Shift Name <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Code <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <input value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ marginTop: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Description</label>
          <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
            rows={2}
            style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginTop: '20px', display: 'flex', gap: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--pz-border)', cursor: 'pointer', flex: 1 }}>
            <div style={{ position: 'relative' }}>
              <input type="checkbox" checked={form.is_overnight}
                onChange={(e) => setForm(p => ({ ...p, is_overnight: e.target.checked }))}
                style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0 }} />
              <div style={{ width: '36px', height: '20px', borderRadius: '10px', background: form.is_overnight ? '#4F46E5' : 'var(--pz-surface-3)', transition: 'background 0.2s' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transform: form.is_overnight ? 'translateX(20px)' : 'translateX(4px)', marginTop: '3px', transition: 'transform 0.2s' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {form.is_overnight ? <Moon size={14} color="#818CF8" /> : <Sun size={14} color="#F59E0B" />}
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>
                {form.is_overnight ? 'Overnight shift (spans midnight)' : 'Day shift'}
              </span>
            </div>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--pz-border)', cursor: 'pointer', flex: 1 }}>
            <div style={{ position: 'relative' }}>
              <input type="checkbox" checked={form.is_active}
                onChange={(e) => setForm(p => ({ ...p, is_active: e.target.checked }))}
                style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0 }} />
              <div style={{ width: '36px', height: '20px', borderRadius: '10px', background: form.is_active ? '#059669' : 'var(--pz-surface-3)', transition: 'background 0.2s' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transform: form.is_active ? 'translateX(20px)' : 'translateX(4px)', marginTop: '3px', transition: 'transform 0.2s' }} />
              </div>
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>
              {form.is_active ? 'Active' : 'Inactive'}
            </span>
          </label>
        </div>
      </div>

      {/* Schedule Windows Section */}
      <div style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(245,158,11,0.12)', display: 'flex' }}>
            <Calendar size={18} color="#F59E0B" />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)' }}>Schedule Windows</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <h5 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Core Hours</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>Start *</label>
                <input type="time" value={form.start_time} onChange={(e) => setForm(p => ({ ...p, start_time: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>End *</label>
                <input type="time" value={form.end_time} onChange={(e) => setForm(p => ({ ...p, end_time: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <h5 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Check-in Window</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>Window Start</label>
                <input type="time" value={form.checkin_window_start} onChange={(e) => setForm(p => ({ ...p, checkin_window_start: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>Window End</label>
                <input type="time" value={form.checkin_window_end} onChange={(e) => setForm(p => ({ ...p, checkin_window_end: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <h5 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Check-out Window</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>Window Start</label>
                <input type="time" value={form.checkout_window_start} onChange={(e) => setForm(p => ({ ...p, checkout_window_start: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px' }}>Window End</label>
                <input type="time" value={form.checkout_window_end} onChange={(e) => setForm(p => ({ ...p, checkout_window_end: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Section */}
      <div style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(139,92,246,0.12)', display: 'flex' }}>
            <Settings2 size={18} color="#8B5CF6" />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)' }}>Configuration</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Working Hours</label>
            <div style={{ position: 'relative' }}>
              <input type="number" value={form.working_hours} onChange={(e) => setForm(p => ({ ...p, working_hours: +e.target.value }))}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--pz-text-muted)', fontWeight: 500 }}>hrs</span>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Grace Period</label>
            <div style={{ position: 'relative' }}>
              <input type="number" value={form.grace_period_minutes} onChange={(e) => setForm(p => ({ ...p, grace_period_minutes: +e.target.value }))}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--pz-text-muted)', fontWeight: 500 }}>min</span>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Break Duration</label>
            <div style={{ position: 'relative' }}>
              <input type="number" value={form.break_duration_minutes} onChange={(e) => setForm(p => ({ ...p, break_duration_minutes: +e.target.value }))}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--pz-text-muted)', fontWeight: 500 }}>min</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '4px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md" onClick={() => updateMutation.mutate(form)}
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
        <p className="text-xs" style={{ color: 'var(--pz-text-muted)' }}>
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
            <div key={i} className="p-4" style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px' }}>
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
              className="p-4 flex items-center justify-between" style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px' }}
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
            <div className="p-8 text-center" style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', color: 'var(--pz-text-muted)' }}>
              <p className="text-sm">No department shift rules configured</p>
              <p className="text-xs mt-1">Create a rule to set default shifts per department</p>
            </div>
          )}
        </div>
      )}

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add Department Shift Rule"
        description="Set a default shift template for a department."
        size="md"
      >
        <CreateDeptRuleForm
          departments={departments}
          templates={templates}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dept-shift-rules'] })
            setShowCreateModal(false)
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>

      <Modal
        open={!!editingRule}
        onClose={() => setEditingRule(null)}
        title="Edit Department Shift Rule"
        description="Update the default shift for this department."
        size="md"
      >
        {editingRule && (
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
        )}
      </Modal>
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
          {createMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

function ShiftProtocolsTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  type ProtoForm = {
    name: string; code: string; description: string; protocol_type: 'fixed' | 'rotating' | 'custom';
    working_days: number[]; grace_period_minutes: number; include_weekends: boolean;
    working_hours_start: string; working_hours_end: string;
    days_on: number; days_off: number;
    day_shift_start: string; day_shift_end: string;
    night_shift_start: string; night_shift_end: string;
    color: string; cycle_length: number; default_shift_supervisor: string;
  }

  function defaultForm(): ProtoForm {
    return {
      name: '', code: '', description: '', protocol_type: 'fixed',
      working_days: [1, 2, 3, 4, 5] as number[],
      grace_period_minutes: 15, include_weekends: false,
      working_hours_start: '08:30', working_hours_end: '17:00',
      days_on: 2, days_off: 2,
      day_shift_start: '08:00', day_shift_end: '20:00',
      night_shift_start: '20:00', night_shift_end: '08:00',
      color: '#3b82f6', cycle_length: 14, default_shift_supervisor: '',
    }
  }

  const [form, setForm] = useState<ProtoForm>(() => defaultForm())

  const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const PROTOCOL_COLORS: Record<string, string> = {
    fixed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    rotating: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    custom: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  }

  const { data, isLoading } = useQuery({
    queryKey: ['shift-protocols'],
    queryFn: () => shiftProtocolsAPI.list(),
    select: (d) => d.data,
  })

  const seedMut = useMutation({
    mutationFn: () => shiftProtocolsAPI.seedPresets(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-protocols'] })
      toast.success('Preset protocols created')
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => shiftProtocolsAPI.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shift-protocols'] }); setModalOpen(false); toast.success('Protocol created') },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => shiftProtocolsAPI.update(id as string, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shift-protocols'] }); setModalOpen(false); toast.success('Protocol updated') },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => shiftProtocolsAPI.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shift-protocols'] }); setDeleteId(null); toast.success('Protocol removed') },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      working_days: f.working_days.includes(day)
        ? f.working_days.filter((d) => d !== day)
        : [...f.working_days, day].sort(),
    }))
  }

  const protocols = data || []

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
        {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (protocols.length === 0) {
    return (
      <div style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', padding: '48px' }}>
        <EmptyState
          icon={<Layers size={28} />}
          title="No shift protocols"
          description="Create your first protocol or seed preset templates"
          action={
            <div className="flex gap-3">
              <button
                onClick={() => seedMut.mutate()}
                disabled={seedMut.isPending}
                className="px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-sm font-semibold text-[var(--pz-text-secondary)] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw size={15} className={seedMut.isPending ? 'animate-spin' : ''} />
                Seed Presets
              </button>
              <button
                onClick={() => { setForm(defaultForm()); setEditId(null); setModalOpen(true) }}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <Plus size={15} />
                Create Protocol
              </button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '20px' }}>
        <button
          onClick={() => seedMut.mutate()}
          disabled={seedMut.isPending}
          style={{ padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: seedMut.isPending ? 0.5 : 1 }}
        >
          <RefreshCw size={15} className={seedMut.isPending ? 'animate-spin' : ''} />
          Seed Presets
        </button>
        <button
          onClick={() => { setForm(defaultForm()); setEditId(null); setModalOpen(true) }}
          style={{ padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-accent)', border: 'none', fontSize: '14px', fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={15} />
          Add Protocol
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
        {protocols.map((protocol: ShiftProtocol, i: number) => (
          <motion.div
            key={protocol.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', padding: '20px', position: 'relative' }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ backgroundColor: `${protocol.color || '#3b82f6'}15`, borderColor: `${protocol.color || '#3b82f6'}25` }}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: protocol.color || '#3b82f6' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--pz-text)]">{protocol.name}</h3>
                  <p className="text-xs text-[var(--pz-text-muted)] font-mono">{protocol.code}</p>
                </div>
              </div>
              <StatusBadge status={protocol.is_active ? 'success' : 'danger'} size="xs">
                {protocol.is_active ? 'Active' : 'Inactive'}
              </StatusBadge>
            </div>

            <Badge className={cn(PROTOCOL_COLORS[protocol.protocol_type])} size="sm">
              {protocol.protocol_type}
            </Badge>

            <div className="flex flex-wrap gap-4 mt-3 text-xs text-[var(--pz-text-secondary)]">
              {protocol.protocol_type === 'rotating' ? (
                <>
                  {protocol.day_shift_start && (
                    <div className="flex items-center gap-1.5">
                      <Sun size={13} style={{ color: 'var(--pz-warning-500)' }} />
                      <span className="font-medium">Day:</span> {protocol.day_shift_start} &ndash; {protocol.day_shift_end}
                    </div>
                  )}
                  {protocol.night_shift_start && (
                    <div className="flex items-center gap-1.5">
                      <Moon size={13} style={{ color: 'var(--pz-accent)' }} />
                      <span className="font-medium">Night:</span> {protocol.night_shift_start} &ndash; {protocol.night_shift_end}
                    </div>
                  )}
                  {protocol.days_on != null && (
                    <span className="flex items-center gap-1">
                      <RefreshCw size={12} style={{ color: 'var(--pz-accent)' }} />
                      {protocol.days_on}on/{protocol.days_off}off
                    </span>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Clock size={13} className="text-[var(--pz-text-muted)]" />
                  {protocol.working_hours_start} &ndash; {protocol.working_hours_end}
                </div>
              )}
              {protocol.grace_period_minutes != null && protocol.grace_period_minutes > 0 && (
                <span>Grace: {protocol.grace_period_minutes}m</span>
              )}
              {protocol.cycle_length != null && (
                <span className="flex items-center gap-1">
                  <RefreshCw size={12} />
                  Cycle: {protocol.cycle_length}d
                </span>
              )}
            </div>

            <div className="flex gap-1 mt-2">
              {protocol.protocol_type === 'rotating' && protocol.days_on != null ? (
                (() => {
                  const seq: { label: string; type: string }[] = []
                  for (let i = 0; i < (protocol.days_on ?? 2); i++) seq.push({ label: 'D', type: 'day' })
                  for (let i = 0; i < (protocol.days_off ?? 2); i++) seq.push({ label: 'O', type: 'off' })
                  for (let i = 0; i < (protocol.days_on ?? 2); i++) seq.push({ label: 'N', type: 'night' })
                  for (let i = 0; i < (protocol.days_off ?? 2); i++) seq.push({ label: 'O', type: 'off' })
                  return (
                    <div className="flex gap-1">
                      {seq.map((s, i) => (
                        <span key={i} className={cn(
                          'w-6 h-6 flex items-center justify-center rounded-md text-[9px] font-bold border',
                          s.type === 'day' ? 'bg-amber-500/15 text-[var(--pz-warning-500)] border-amber-500/20' :
                          s.type === 'night' ? 'bg-indigo-500/15 text-[var(--pz-accent)] border-indigo-500/20' :
                          'bg-zinc-500/15 text-[var(--pz-text-secondary)] border-zinc-500/20'
                        )}>{s.label}</span>
                      ))}
                      <span className="text-[11px] text-[var(--pz-text-muted)] self-center ml-0.5">↻</span>
                    </div>
                  )
                })()
              ) : (
                DAYS_SHORT.map((day, idx) => (
                  <span key={day} className={cn(
                    'w-7 h-7 flex items-center justify-center rounded-md text-[10px] font-semibold',
                    protocol.working_days?.includes(idx + 1)
                      ? 'bg-blue-500/15 text-[var(--pz-accent)]'
                      : 'bg-[var(--pz-surface-2)] text-[var(--pz-text-faint)]'
                  )}>
                    {day[0]}
                  </span>
                ))
              )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--pz-border)]">
              <span className="text-xs text-[var(--pz-text-muted)] truncate max-w-[200px]">{protocol.description || '\u2014'}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => {
                  setEditId(protocol.id)
                  setForm({
                    name: protocol.name, code: protocol.code ?? '', description: protocol.description ?? '',
                    protocol_type: protocol.protocol_type, working_days: protocol.working_days ?? [1, 2, 3, 4, 5],
                    grace_period_minutes: protocol.grace_period_minutes ?? 15, include_weekends: protocol.include_weekends ?? false,
                    working_hours_start: protocol.working_hours_start ?? '08:30', working_hours_end: protocol.working_hours_end ?? '17:00',
                    days_on: protocol.days_on ?? 2, days_off: protocol.days_off ?? 2,
                    day_shift_start: protocol.day_shift_start ?? '08:00', day_shift_end: protocol.day_shift_end ?? '20:00',
                    night_shift_start: protocol.night_shift_start ?? '20:00', night_shift_end: protocol.night_shift_end ?? '08:00',
                    color: protocol.color ?? '#3b82f6', cycle_length: protocol.cycle_length ?? 14,
                    default_shift_supervisor: protocol.default_shift_supervisor ?? '',
                  })
                  setModalOpen(true)
                }} className="p-1.5 rounded-lg hover:bg-[var(--pz-surface-2)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] transition-colors">
                  <Edit3 size={14} />
                </button>
                <button onClick={() => setDeleteId(protocol.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--pz-text-muted)] hover:text-red-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Edit Protocol' : 'Create Shift Protocol'}
        description="Define the shift rules and schedule pattern for this protocol"
        size="md"
        footer={
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button
              onClick={() => setModalOpen(false)}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!form.name.trim() || !form.code.trim()) {
                  toast.error('Name and code are required')
                  return
                }
                const isRotating = form.protocol_type === 'rotating'
                const payload: Record<string, unknown> = {
                  name: form.name, code: form.code,
                  description: form.description || null,
                  protocol_type: form.protocol_type, color: form.color,
                  grace_period_minutes: form.grace_period_minutes,
                  include_weekends: form.include_weekends,
                  cycle_length: form.cycle_length,
                  default_shift_supervisor: form.default_shift_supervisor || null,
                }
                if (isRotating) {
                  payload.days_on = form.days_on
                  payload.days_off = form.days_off
                  payload.day_shift_start = form.day_shift_start || null
                  payload.day_shift_end = form.day_shift_end || null
                  payload.night_shift_start = form.night_shift_start || null
                  payload.night_shift_end = form.night_shift_end || null
                  const rot: string[] = []
                  for (let i = 0; i < form.days_on; i++) rot.push('day')
                  for (let i = 0; i < form.days_off; i++) rot.push('off')
                  for (let i = 0; i < form.days_on; i++) rot.push('night')
                  for (let i = 0; i < form.days_off; i++) rot.push('off')
                  payload.rotation_shifts = rot
                  payload.working_days = form.working_days
                } else {
                  payload.working_hours_start = form.working_hours_start || null
                  payload.working_hours_end = form.working_hours_end || null
                  payload.working_days = form.working_days
                }
                if (editId) updateMut.mutate({ id: editId, ...payload })
                else createMut.mutate(payload)
              }}
              disabled={createMut.isPending || updateMut.isPending}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--pz-accent), rgba(37,99,235,0.8))', color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: createMut.isPending || updateMut.isPending ? 0.5 : 1 }}
            >
              {createMut.isPending || updateMut.isPending ? 'Saving...' : editId ? 'Update Protocol' : 'Create Protocol'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Details */}
          <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Info size={15} color="#3B82F6" />
              </div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Details</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Protocol Name *</label>
                <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard Day Shift"
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Code *</label>
                <input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. DAY_STANDARD"
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginTop: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Description</label>
              <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                placeholder="Describe when and how this shift protocol is used..."
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginTop: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px', display: 'block' }}>Schedule Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                {(['fixed', 'rotating', 'custom'] as const).map((t) => (
                  <button key={t} onClick={() => { const f = defaultForm(); setForm(p => ({ ...f, name: p.name, code: p.code, description: p.description, protocol_type: t, color: p.color })) }}
                    style={{
                      padding: '10px 16px', borderRadius: '12px', fontSize: '12px', fontWeight: 700,
                      border: form.protocol_type !== t ? '1px solid var(--pz-border)' : 'none', cursor: 'pointer',
                      ...(form.protocol_type === t
                        ? t === 'fixed' ? { background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff' }
                          : t === 'rotating' ? { background: 'linear-gradient(135deg, #9333EA, #7E22CE)', color: '#fff' }
                            : { background: 'linear-gradient(135deg, #06B6D4, #0891B2)', color: '#fff' }
                        : { background: 'var(--pz-surface-1)', color: 'var(--pz-text-muted)' })
                    }}>
                    {t === 'fixed' ? 'Fixed' : t === 'rotating' ? 'Rotating' : 'Custom'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Clock size={15} color="#F59E0B" />
              </div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Schedule</p>
            </div>
            {(form.protocol_type === 'fixed' || form.protocol_type === 'custom') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)' }}>
                  <h5 style={{ fontSize: '12px', fontWeight: 700,color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px 0' }}>Working Hours</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Start</label>
                      <input type="time" value={form.working_hours_start || ''} onChange={(e) => setForm(f => ({ ...f, working_hours_start: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>End</label>
                      <input type="time" value={form.working_hours_end || ''} onChange={(e) => setForm(f => ({ ...f, working_hours_end: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Grace Period</label>
                    <input type="number" value={form.grace_period_minutes} onChange={(e) => setForm(f => ({ ...f, grace_period_minutes: parseInt(e.target.value) || 0 }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)' }}>
                  <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px 0' }}>Working Days</h5>
                  <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: '0 0 8px 0' }}>Days employee is expected to work</p>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {DAYS_SHORT.map((day, idx) => (
                      <button key={day} onClick={() => toggleDay(idx + 1)} style={{
                        flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '10px', fontWeight: 700, border: 'none', cursor: 'pointer',
                        ...(form.working_days.includes(idx + 1)
                          ? { background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff' }
                          : { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)' })
                      }}>{day[0]}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {form.protocol_type === 'rotating' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)' }}>
                    <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px 0' }}>Day Shift</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div><label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Start</label>
                        <input type="time" value={form.day_shift_start || ''} onChange={(e) => setForm(f => ({ ...f, day_shift_start: e.target.value }))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} /></div>
                      <div><label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>End</label>
                        <input type="time" value={form.day_shift_end || ''} onChange={(e) => setForm(f => ({ ...f, day_shift_end: e.target.value }))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} /></div>
                    </div>
                  </div>
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)' }}>
                    <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px 0' }}>Night Shift</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div><label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Start</label>
                        <input type="time" value={form.night_shift_start || ''} onChange={(e) => setForm(f => ({ ...f, night_shift_start: e.target.value }))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} /></div>
                      <div><label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>End</label>
                        <input type="time" value={form.night_shift_end || ''} onChange={(e) => setForm(f => ({ ...f, night_shift_end: e.target.value }))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} /></div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)' }}>
                    <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px 0' }}>Rotation Pattern</h5>
                    <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: '0 0 8px 0' }}>Days worked before switching shift type</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div><label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Days On</label>
                        <input type="number" min={1} max={7} value={form.days_on} onChange={(e) => setForm(f => ({ ...f, days_on: parseInt(e.target.value) || 1 }))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} /></div>
                      <div><label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Days Off</label>
                        <input type="number" min={1} max={7} value={form.days_off} onChange={(e) => setForm(f => ({ ...f, days_off: parseInt(e.target.value) || 1 }))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} /></div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Sequence Preview</label>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {(() => {
                          const seq: { label: string; type: string }[] = []
                          for (let i = 0; i < form.days_on; i++) seq.push({ label: 'D', type: 'day' })
                          for (let i = 0; i < form.days_off; i++) seq.push({ label: 'O', type: 'off' })
                          for (let i = 0; i < form.days_on; i++) seq.push({ label: 'N', type: 'night' })
                          for (let i = 0; i < form.days_off; i++) seq.push({ label: 'O', type: 'off' })
                          return seq.map((s, i) => (
                            <span key={i} style={{
                              width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              borderRadius: '6px', fontSize: '10px', fontWeight: 700, border: '1px solid',
                              ...(s.type === 'day' ? { background: 'rgba(245,158,11,0.15)', color: 'var(--pz-warning-500)', borderColor: 'rgba(245,158,11,0.2)' } :
                                s.type === 'night' ? { background: 'rgba(99,102,241,0.15)', color: 'var(--pz-accent)', borderColor: 'rgba(99,102,241,0.2)' } :
                                { background: 'rgba(113,113,122,0.15)', color: 'var(--pz-text-secondary)', borderColor: 'rgba(113,113,122,0.2)' })
                            }}>{s.label}</span>
                          ))
                        })()}
                        <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)', alignSelf: 'center', marginLeft: '4px' }}>↻</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)' }}>
                    <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px 0' }}>Grace & Coverage</h5>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Grace Period</label>
                      <input type="number" value={form.grace_period_minutes} onChange={(e) => setForm(f => ({ ...f, grace_period_minutes: parseInt(e.target.value) || 0 }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ paddingTop: '12px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Working Days</label>
                      <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: '0 0 6px 0' }}>Days per week the rotation covers</p>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {DAYS_SHORT.map((day, idx) => (
                          <button key={day} onClick={() => toggleDay(idx + 1)} style={{
                            flex: 1, padding: '8px 0', borderRadius: '8px', fontSize: '9px', fontWeight: 700, border: 'none', cursor: 'pointer',
                            ...(form.working_days.includes(idx + 1)
                              ? { background: 'linear-gradient(135deg, #9333EA, #7E22CE)', color: '#fff' }
                              : { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)' })
                          }}>{day[0]}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Configuration */}
          <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Info size={15} color="#6366F1" />
              </div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Configuration</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Accent Color</label>
                <input type="color" value={form.color} onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                  style={{ width: '40px', height: '40px', borderRadius: '10px', border: '1px solid var(--pz-border)', cursor: 'pointer', padding: '2px', background: 'var(--pz-surface-1)' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Cycle Length (days)</label>
                <input type="number" min={1} max={90} value={form.cycle_length} onChange={(e) => setForm(f => ({ ...f, cycle_length: parseInt(e.target.value) || 14 }))}
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Default Shift Supervisor</label>
                <input value={form.default_shift_supervisor} onChange={(e) => setForm(f => ({ ...f, default_shift_supervisor: e.target.value }))} placeholder="Employee name (optional)"
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Remove Protocol"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button onClick={() => setDeleteId(null)}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={() => deleteId && deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-danger-500)', color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: deleteMut.isPending ? 0.5 : 1 }}>
              {deleteMut.isPending ? 'Removing...' : 'Remove'}
            </button>
          </div>
        }
      >
        <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)' }}>
          This will permanently delete this shift protocol. This action cannot be undone.
        </p>
      </Modal>
    </>
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
        <p className="text-xs" style={{ color: 'var(--pz-text-muted)' }}>
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
            <div key={i} className="p-4" style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px' }}>
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
              className="p-4 flex items-center justify-between" style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px' }}
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
            <div className="p-8 text-center" style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', color: 'var(--pz-text-muted)' }}>
              <p className="text-sm">No shift assignments configured</p>
              <p className="text-xs mt-1">Assign individual employees to specific shifts</p>
            </div>
          )}
        </div>
      )}

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add Shift Assignment"
        description="Assign an individual employee to a specific shift template."
        size="md"
      >
        <CreateAssignmentForm
          employees={employees}
          templates={templates}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['shift-assignments'] })
            setShowCreateModal(false)
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>

      <Modal
        open={!!editingAssignment}
        onClose={() => setEditingAssignment(null)}
        title="Edit Shift Assignment"
        description="Update the shift assignment for this employee."
        size="md"
      >
        {editingAssignment && (
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
        )}
      </Modal>
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
            <div key={i} className="p-4" style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px' }}>
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
                className="p-4 flex items-center justify-between" style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px' }}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isActive ? 'bg-amber-500/10 border border-amber-500/20' : isPast ? 'bg-gray-500/10 border border-gray-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                    <CalendarOff size={14} style={{ color: isActive ? '#F59E0B' : isPast ? 'var(--pz-text-muted)' : '#10B981' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--pz-text)]">
                      {emp?.full_name || 'Unknown Employee'}
                    </p>
                    <p className="text-[10px] text-[var(--pz-text-muted)]">
                      {tmpl?.name || 'Unknown Shift'} · {o.start_date} → {o.end_date}
                      {isActive && <span className="ml-2 text-amber-400">Active</span>}
                      {isPast && <span className="ml-2" style={{ color: 'var(--pz-text-muted)' }}>Expired</span>}
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
            <div className="p-8 text-center" style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', color: 'var(--pz-text-muted)' }}>
              <p className="text-sm">No shift overrides configured</p>
              <p className="text-xs mt-1">Create overrides for temporary shift changes</p>
            </div>
          )}
        </div>
      )}

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add Shift Override"
        description="Apply a temporary shift change for a specific date range."
        size="md"
      >
        <CreateOverrideForm
          employees={employees}
          templates={templates}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['shift-overrides'] })
            setShowCreateModal(false)
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>

      <Modal
        open={!!editingOverride}
        onClose={() => setEditingOverride(null)}
        title="Edit Shift Override"
        description="Modify the temporary shift change."
        size="md"
      >
        {editingOverride && (
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
        )}
      </Modal>
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
