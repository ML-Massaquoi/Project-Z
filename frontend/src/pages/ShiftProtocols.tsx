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
  Info,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonCard } from '@/components/ui/skeleton'
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
  cycle_length: number;
  default_shift_supervisor: string;
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
    cycle_length: 14,
    default_shift_supervisor: '',
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

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '24px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  headerActions: { display: 'flex', alignItems: 'center', gap: '12px' },
  card: { background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', boxShadow: 'var(--pz-shadow-sm)' },
  protocolCard: { background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', boxShadow: 'var(--pz-shadow-sm)', padding: '20px', position: 'relative' as const },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' },
  skeletonGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' },
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
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Shift Protocols</h1>
          <p style={s.headerSubtitle}>Define shift patterns and scheduling rules</p>
        </div>
        <div style={s.headerActions}>
          <button
            onClick={() => seedMut.mutate()}
            disabled={seedMut.isPending}
            style={{ padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px', opacity: seedMut.isPending ? 0.5 : 1 }}
          >
            <RefreshCw size={15} className={seedMut.isPending ? 'animate-spin' : ''} />
            Seed Presets
          </button>
          <button
            onClick={() => { setForm(defaultForm()); setEditId(null); setModalOpen(true) }}
            style={{ padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-accent)', border: 'none', fontSize: '14px', fontWeight: 600, color: '#fff', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={15} />
            Add Protocol
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={s.skeletonGrid}>
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : protocols.length === 0 ? (
        <div style={{ ...s.card, padding: '48px' }}>
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
        <div style={s.grid}>
          {protocols.map((protocol: ShiftProtocol, i: number) => (
            <motion.div
              key={protocol.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              style={s.protocolCard}
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

              {protocol.default_shift_supervisor && (
                <div className="text-xs text-[var(--pz-text-secondary)] mt-1">
                  Supervisor: {protocol.default_shift_supervisor}
                </div>
              )}

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
                      color: protocol.color ?? '#3b82f6',
                      cycle_length: protocol.cycle_length ?? 14,
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
      )}

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
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer', transition: 'all 0.15s' }}
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
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--pz-accent), rgba(37,99,235,0.8))', color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: createMut.isPending || updateMut.isPending ? 0.5 : 1, transition: 'all 0.15s' }}
            >
              {createMut.isPending || updateMut.isPending ? 'Saving...' : editId ? 'Update Protocol' : 'Create Protocol'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* ── Section: Details ── */}
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
                <input
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Standard Day Shift"
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Code *</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. DAY_STANDARD"
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ marginTop: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Describe when and how this shift protocol is used..."
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginTop: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px', display: 'block' }}>Schedule Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                {(['fixed', 'rotating', 'custom'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      const f = defaultForm()
                      setForm(p => ({ ...f, name: p.name, code: p.code, description: p.description, protocol_type: t, color: p.color }))
                    }}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: form.protocol_type !== t ? '1px solid var(--pz-border)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      ...(form.protocol_type === t
                        ? t === 'fixed' ? { background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff', boxShadow: '0 1px 3px rgba(37,99,235,0.3)' }
                          : t === 'rotating' ? { background: 'linear-gradient(135deg, #9333EA, #7E22CE)', color: '#fff', boxShadow: '0 1px 3px rgba(147,51,234,0.3)' }
                            : { background: 'linear-gradient(135deg, #06B6D4, #0891B2)', color: '#fff', boxShadow: '0 1px 3px rgba(6,182,212,0.3)' }
                        : { background: 'var(--pz-surface-1)', color: 'var(--pz-text-muted)' }
                      )
                    }}
                  >
                    {t === 'fixed' ? 'Fixed' : t === 'rotating' ? 'Rotating' : 'Custom'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Section: Schedule ── */}
          <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Clock size={15} color="#F59E0B" />
              </div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Schedule</p>
            </div>

            {/* Fixed / Custom Schedule Rules */}
            {(form.protocol_type === 'fixed' || form.protocol_type === 'custom') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Working Hours</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Start</label>
                      <input
                        type="time"
                        value={form.working_hours_start || ''}
                        onChange={(e) => setForm(f => ({ ...f, working_hours_start: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>End</label>
                      <input
                        type="time"
                        value={form.working_hours_end || ''}
                        onChange={(e) => setForm(f => ({ ...f, working_hours_end: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Grace Period</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        value={form.grace_period_minutes}
                        onChange={(e) => setForm(f => ({ ...f, grace_period_minutes: parseInt(e.target.value) || 0 }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: 'var(--pz-text-muted)', fontWeight: 500 }}>min</span>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Working Days</h5>
                  <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0 }}>Days employee is expected to work</p>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {DAYS_SHORT.map((day, idx) => (
                      <button
                        key={day}
                        onClick={() => toggleDay(idx + 1)}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          borderRadius: '10px',
                          fontSize: '10px',
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          ...(form.working_days.includes(idx + 1)
                            ? { background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff', boxShadow: '0 1px 3px rgba(37,99,235,0.3)' }
                            : { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)' }
                          )
                        }}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Day Shift</h5>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sun size={16} style={{ color: 'var(--pz-warning-500)', flexShrink: 0 }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', flex: 1 }}>
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Start</label>
                          <input
                            type="time"
                            value={form.day_shift_start || ''}
                            onChange={(e) => setForm(f => ({ ...f, day_shift_start: e.target.value }))}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>End</label>
                          <input
                            type="time"
                            value={form.day_shift_end || ''}
                            onChange={(e) => setForm(f => ({ ...f, day_shift_end: e.target.value }))}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Night Shift</h5>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Moon size={16} style={{ color: 'var(--pz-accent)', flexShrink: 0 }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', flex: 1 }}>
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Start</label>
                          <input
                            type="time"
                            value={form.night_shift_start || ''}
                            onChange={(e) => setForm(f => ({ ...f, night_shift_start: e.target.value }))}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>End</label>
                          <input
                            type="time"
                            value={form.night_shift_end || ''}
                            onChange={(e) => setForm(f => ({ ...f, night_shift_end: e.target.value }))}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Rotation Pattern</h5>
                    <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0 }}>Days worked before switching shift type</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Days On</label>
                        <input
                          type="number"
                          min={1}
                          max={7}
                          value={form.days_on}
                          onChange={(e) => setForm(f => ({ ...f, days_on: parseInt(e.target.value) || 1 }))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Days Off</label>
                        <input
                          type="number"
                          min={1}
                          max={7}
                          value={form.days_off}
                          onChange={(e) => setForm(f => ({ ...f, days_off: parseInt(e.target.value) || 1 }))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Sequence Preview</label>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {(() => {
                          const seq: { label: string; type: string }[] = []
                          for (let i = 0; i < form.days_on; i++) seq.push({ label: 'D', type: 'day' })
                          for (let i = 0; i < form.days_off; i++) seq.push({ label: 'O', type: 'off' })
                          for (let i = 0; i < form.days_on; i++) seq.push({ label: 'N', type: 'night' })
                          for (let i = 0; i < form.days_off; i++) seq.push({ label: 'O', type: 'off' })
                          return seq.map((s, i) => (
                            <span
                              key={i}
                              style={{
                                width: '28px',
                                height: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '6px',
                                fontSize: '10px',
                                fontWeight: 700,
                                border: '1px solid',
                                ...(s.type === 'day' ? { background: 'rgba(245,158,11,0.15)', color: 'var(--pz-warning-500)', borderColor: 'rgba(245,158,11,0.2)' } :
                                  s.type === 'night' ? { background: 'rgba(99,102,241,0.15)', color: 'var(--pz-accent)', borderColor: 'rgba(99,102,241,0.2)' } :
                                  { background: 'rgba(113,113,122,0.15)', color: 'var(--pz-text-secondary)', borderColor: 'rgba(113,113,122,0.2)' })
                              }}
                            >
                              {s.label}
                            </span>
                          ))
                        })()}
                        <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)', alignSelf: 'center', marginLeft: '4px' }}>↻</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Grace & Coverage</h5>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Grace Period</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="number"
                          value={form.grace_period_minutes}
                          onChange={(e) => setForm(f => ({ ...f, grace_period_minutes: parseInt(e.target.value) || 0 }))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                        />
                        <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: 'var(--pz-text-muted)', fontWeight: 500 }}>min</span>
                      </div>
                    </div>
                    <div style={{ paddingTop: '4px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '4px', display: 'block' }}>Working Days</label>
                      <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: '0 0 6px 0' }}>Days per week the rotation covers</p>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {DAYS_SHORT.map((day, idx) => (
                          <button
                            key={day}
                            onClick={() => toggleDay(idx + 1)}
                            style={{
                              flex: 1,
                              padding: '8px 0',
                              borderRadius: '8px',
                              fontSize: '9px',
                              fontWeight: 700,
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              ...(form.working_days.includes(idx + 1)
                                ? { background: 'linear-gradient(135deg, #9333EA, #7E22CE)', color: '#fff', boxShadow: '0 1px 3px rgba(147,51,234,0.3)' }
                                : { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)' }
                              )
                            }}
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
          </div>

          {/* ── Section: Configuration ── */}
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
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width: '40px', height: '40px', borderRadius: '10px', border: '1px solid var(--pz-border)', cursor: 'pointer', padding: '2px', background: 'var(--pz-surface-1)' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--pz-text-muted)', fontFamily: 'monospace' }}>{form.color}</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Cycle Length (days)</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={form.cycle_length}
                  onChange={(e) => setForm(f => ({ ...f, cycle_length: parseInt(e.target.value) || 14 }))}
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Default Shift Supervisor</label>
                <input
                  value={form.default_shift_supervisor}
                  onChange={(e) => setForm(f => ({ ...f, default_shift_supervisor: e.target.value }))}
                  placeholder="Employee name (optional)"
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                />
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
            <button
              onClick={() => setDeleteId(null)}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              Cancel
            </button>
            <button
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
              disabled={deleteMut.isPending}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-danger-500)', color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: deleteMut.isPending ? 0.5 : 1, transition: 'all 0.15s' }}
            >
              {deleteMut.isPending ? 'Removing...' : 'Remove'}
            </button>
          </div>
        }
      >
        <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)' }}>
          This will permanently delete this shift protocol. This action cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
