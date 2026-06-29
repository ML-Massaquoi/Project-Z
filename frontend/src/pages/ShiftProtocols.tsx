import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { shiftProtocolsAPI } from '@/api/client'
import { extractErrorMessage } from '@/lib/utils'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Layers,
  Plus,
  Edit3,
  Trash2,
  Clock,
  Sun,
  Moon,
  Sunrise,
  RefreshCw,
  CheckCircle2,
  Copy,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonCard } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn } from '@/lib/utils'
import type { ShiftProtocol } from '@/types'

type FormData = {
  name: string; code: string; description: string; protocol_type: 'fixed' | 'rotating' | 'custom';
  working_days: number[]; grace_period_minutes: number; include_weekends: boolean;
  working_hours_start: string; working_hours_end: string;
  days_on: number; days_off: number;
  day_shift_start: string; day_shift_end: string;
  night_shift_start: string; night_shift_end: string;
  color: string;
}

function defaultForm(): FormData {
  return {
    name: '', code: '', description: '', protocol_type: 'fixed',
    working_days: [1, 2, 3, 4, 5] as number[],
    grace_period_minutes: 15, include_weekends: false,
    working_hours_start: '08:30', working_hours_end: '17:00',
    days_on: 2, days_off: 2,
    day_shift_start: '08:00', day_shift_end: '20:00',
    night_shift_start: '20:00', night_shift_end: '08:00',
    color: '#3b82f6',
  }
}

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PROTOCOL_COLORS: Record<string, string> = {
  fixed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  rotating: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  custom: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
}

const ROTATION_LABELS: Record<string, { label: string; color: string }> = {
  day: { label: 'Day', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  night: { label: 'Night', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' },
  off: { label: 'Off', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' },
}

export default function ShiftProtocols() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(() => defaultForm())

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shift Protocols"
        subtitle="Define shift patterns and scheduling rules"
        breadcrumbs={[{ label: 'Operations' }, { label: 'Shift Protocols' }]}
        actions={
          <div className="flex items-center gap-3">
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
              Add Protocol
            </button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : protocols.length === 0 ? (
        <div className="pz-card p-12">
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {protocols.map((protocol: ShiftProtocol, i: number) => (
            <motion.div
              key={protocol.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="pz-card p-5 relative group hover:border-[var(--pz-border)]/80 transition-all"
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
                        <Sun size={13} className="text-amber-400" />
                        <span className="font-medium">Day:</span> {protocol.day_shift_start} &ndash; {protocol.day_shift_end}
                      </div>
                    )}
                    {protocol.night_shift_start && (
                      <div className="flex items-center gap-1.5">
                        <Moon size={13} className="text-indigo-400" />
                        <span className="font-medium">Night:</span> {protocol.night_shift_start} &ndash; {protocol.night_shift_end}
                      </div>
                    )}
                    {protocol.days_on != null && (
                      <span className="flex items-center gap-1">
                        <RefreshCw size={12} className="text-purple-400" />
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
              </div>

              <div className="flex gap-1 mt-2">
                {protocol.protocol_type === 'rotating' && protocol.days_on != null ? (
                  /* Show rotation sequence preview */
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
                            s.type === 'day' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                            s.type === 'night' ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' :
                            'bg-zinc-500/15 text-zinc-400 border-zinc-500/20'
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
                        ? 'bg-blue-500/15 text-blue-400'
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
                      color: protocol.color ?? '#3b82f6',
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
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Edit Protocol' : 'Create Shift Protocol'}
        description="Define the shift rules and schedule pattern for this protocol"
        size="md"
        footer={
          <div className="flex gap-3 w-full">
            <button
              onClick={() => setModalOpen(false)}
              className="flex-1 px-5 py-3 rounded-xl bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-sm font-semibold text-[var(--pz-text-secondary)] transition-colors"
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
                  name: form.name,
                  code: form.code,
                  description: form.description || null,
                  protocol_type: form.protocol_type,
                  color: form.color,
                  grace_period_minutes: form.grace_period_minutes,
                  include_weekends: form.include_weekends,
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
              className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              {createMut.isPending || updateMut.isPending ? 'Saving...' : editId ? 'Update Protocol' : 'Create Protocol'}
            </button>
          </div>
        }
      >
        {/* Basic Info — full width */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Protocol Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Standard Day Shift"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Code *</label>
            <input
              value={form.code}
              onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. DAY_STANDARD"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-1.5 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Describe when and how this shift protocol is used..."
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Protocol Type Selector */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-[var(--pz-text-secondary)] mb-2 block">Schedule Type</label>
          <div className="grid grid-cols-3 gap-2">
            {(['fixed', 'rotating', 'custom'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  const f = defaultForm()
                  setForm(p => ({ ...f, name: p.name, code: p.code, description: p.description, protocol_type: t, color: p.color }))
                }}
                className={cn(
                  'px-3 py-2.5 rounded-xl text-xs font-bold transition-all border',
                  form.protocol_type === t
                    ? t === 'fixed' ? 'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-600/20'
                      : t === 'rotating' ? 'bg-purple-600 text-white border-purple-500 shadow-sm shadow-purple-600/20'
                        : 'bg-cyan-600 text-white border-cyan-500 shadow-sm shadow-cyan-600/20'
                    : 'bg-[var(--pz-surface-2)] border-[var(--pz-border)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)]'
                )}
              >
                {t === 'fixed' ? 'Fixed' : t === 'rotating' ? 'Rotating' : 'Custom'}
              </button>
            ))}
          </div>
        </div>

        {/* Fixed / Custom Schedule Rules */}
        {(form.protocol_type === 'fixed' || form.protocol_type === 'custom') && (
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
              <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Working Hours</h5>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Start</label>
                  <input
                    type="time"
                    value={form.working_hours_start || ''}
                    onChange={(e) => setForm(f => ({ ...f, working_hours_start: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">End</label>
                  <input
                    type="time"
                    value={form.working_hours_end || ''}
                    onChange={(e) => setForm(f => ({ ...f, working_hours_end: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Grace Period</label>
                <div className="relative">
                  <input
                    type="number"
                    value={form.grace_period_minutes}
                    onChange={(e) => setForm(f => ({ ...f, grace_period_minutes: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-[var(--pz-text-muted)] font-medium">min</span>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
              <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Working Days</h5>
              <p className="text-[10px] text-[var(--pz-text-muted)] -mt-1">Days employee is expected to work</p>
              <div className="flex gap-1.5">
                {DAYS_SHORT.map((day, idx) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(idx + 1)}
                    className={cn(
                      'flex-1 py-2.5 rounded-lg text-[10px] font-bold transition-all',
                      form.working_days.includes(idx + 1)
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                        : 'bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] hover:bg-[var(--pz-surface-3)]'
                    )}
                  >
                    {day[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Rotating Schedule Rules */}
        {form.protocol_type === 'rotating' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
                <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Day Shift</h5>
                <div className="flex items-center gap-2">
                  <Sun size={16} className="text-amber-400 shrink-0" />
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <div>
                      <label className="text-[10px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Start</label>
                      <input
                        type="time"
                        value={form.day_shift_start || ''}
                        onChange={(e) => setForm(f => ({ ...f, day_shift_start: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[var(--pz-text-muted)] mb-1 block">End</label>
                      <input
                        type="time"
                        value={form.day_shift_end || ''}
                        onChange={(e) => setForm(f => ({ ...f, day_shift_end: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
                <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Night Shift</h5>
                <div className="flex items-center gap-2">
                  <Moon size={16} className="text-indigo-400 shrink-0" />
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <div>
                      <label className="text-[10px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Start</label>
                      <input
                        type="time"
                        value={form.night_shift_start || ''}
                        onChange={(e) => setForm(f => ({ ...f, night_shift_start: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[var(--pz-text-muted)] mb-1 block">End</label>
                      <input
                        type="time"
                        value={form.night_shift_end || ''}
                        onChange={(e) => setForm(f => ({ ...f, night_shift_end: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
                <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Rotation Pattern</h5>
                <p className="text-[10px] text-[var(--pz-text-muted)] -mt-1">Days worked before switching shift type</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Days On</label>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={form.days_on}
                      onChange={(e) => setForm(f => ({ ...f, days_on: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Days Off</label>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={form.days_off}
                      onChange={(e) => setForm(f => ({ ...f, days_off: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                </div>

                {/* Preview rotation sequence */}
                <div className="mt-2">
                  <label className="text-[10px] font-semibold text-[var(--pz-text-muted)] mb-1.5 block">Sequence Preview</label>
                  <div className="flex gap-1 flex-wrap">
                    {(() => {
                      const seq: { label: string; type: string }[] = []
                      for (let i = 0; i < form.days_on; i++) seq.push({ label: 'D', type: 'day' })
                      for (let i = 0; i < form.days_off; i++) seq.push({ label: 'O', type: 'off' })
                      for (let i = 0; i < form.days_on; i++) seq.push({ label: 'N', type: 'night' })
                      for (let i = 0; i < form.days_off; i++) seq.push({ label: 'O', type: 'off' })
                      return seq.map((s, i) => (
                        <span
                          key={i}
                          className={cn(
                            'w-7 h-7 flex items-center justify-center rounded-md text-[10px] font-bold border',
                            s.type === 'day' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                            s.type === 'night' ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' :
                            'bg-zinc-500/15 text-zinc-400 border-zinc-500/20'
                          )}
                        >
                          {s.label}
                        </span>
                      ))
                    })()}
                    <span className="text-xs text-[var(--pz-text-muted)] self-center ml-1">↻</span>
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
                <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Grace & Coverage</h5>
                <div>
                  <label className="text-[10px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Grace Period</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={form.grace_period_minutes}
                      onChange={(e) => setForm(f => ({ ...f, grace_period_minutes: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-[var(--pz-text-muted)] font-medium">min</span>
                  </div>
                </div>
                <div className="pt-1">
                  <label className="text-[10px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Working Days</label>
                  <p className="text-[10px] text-[var(--pz-text-muted)] mb-1.5">Days per week the rotation covers</p>
                  <div className="flex gap-1.5">
                    {DAYS_SHORT.map((day, idx) => (
                      <button
                        key={day}
                        onClick={() => toggleDay(idx + 1)}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-[9px] font-bold transition-all',
                          form.working_days.includes(idx + 1)
                            ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
                            : 'bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)]'
                        )}
                      >
                        {day[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Remove Protocol"
        size="sm"
        footer={
          <div className="flex gap-3 w-full">
            <button
              onClick={() => setDeleteId(null)}
              className="flex-1 px-5 py-3 rounded-xl bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-sm font-semibold text-[var(--pz-text-secondary)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
              disabled={deleteMut.isPending}
              className="flex-1 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {deleteMut.isPending ? 'Removing...' : 'Remove'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-[var(--pz-text-muted)]">
          This will permanently delete this shift protocol. This action cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
