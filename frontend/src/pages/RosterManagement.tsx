/**
 * RosterManagement.tsx
 * FIA 2-On/2-Off Shift Roster Management
 * Tabs: Shift Pairs | Monthly Calendar | Generate
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Calendar, RefreshCw, Plus, Trash2, Edit3,
  ChevronLeft, ChevronRight, Sun, Moon, Coffee, AlertCircle,
  Download, Check, X, Settings,
} from 'lucide-react'
import { format, addMonths, subMonths } from 'date-fns'
import { toast } from 'sonner'
import { rosterAPI, type ShiftPair, type CalendarEmployee } from '@/api/roster'
import { departmentsAPI, shiftProtocolsAPI, employeesAPI } from '@/api/client'
import { PageHeader, TabBar } from '@/components/ui/PageHeader'
import type { Department, ShiftProtocol, Employee } from '@/types'
import { Button } from '@/components/ui/button'

// ── Assignment colour/label config ──────────────────────────

const ASSIGN_CONFIG: Record<string, { bg: string; text: string; border: string; label: string; short: string }> = {
  DAY:     { bg: '#FEF9C3', text: '#854D0E', border: '#FDE047', label: 'Day Shift',  short: 'D' },
  NIGHT:   { bg: '#EDE9FE', text: '#4C1D95', border: '#A78BFA', label: 'Night Shift', short: 'N' },
  OFF:     { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB', label: 'Rest Day',   short: '—' },
  ADMIN:   { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD', label: 'Office Day', short: 'A' },
  LEAVE:   { bg: '#DCFCE7', text: '#166534', border: '#86EFAC', label: 'Leave',      short: 'L' },
  ABSENT:  { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', label: 'Absent',     short: '!' },
  HOLIDAY: { bg: '#FCE7F3', text: '#831843', border: '#F9A8D4', label: 'Holiday',    short: 'H' },
}

// ── Main Page ────────────────────────────────────────────────

export default function RosterManagement() {
  const [tab, setTab] = useState<'pairs' | 'calendar' | 'generate'>('pairs')
  const [selectedDeptId, setSelectedDeptId] = useState<string>('')
  const [calendarMonth, setCalendarMonth] = useState(new Date())

  const { data: deptsData } = useQuery({
    queryKey: ['roster-departments'],
    queryFn: () => departmentsAPI.list(),
    select: d => (Array.isArray(d.data) ? d.data : d.data?.items ?? []) as Department[],
  })
  const departments = deptsData ?? []

  const activeDept = departments.find(d => d.id === selectedDeptId) ?? departments[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roster Management"
        subtitle="FIA 2-On/2-Off Shift Pairing System"
        breadcrumbs={[{ label: 'Workforce' }, { label: 'Roster Management' }]}
        tabs={
          <TabBar
            tabs={[
              { id: 'pairs',    label: 'Shift Pairs',     icon: <Users size={14} /> },
              { id: 'calendar', label: 'Monthly Calendar', icon: <Calendar size={14} /> },
              { id: 'generate', label: 'Generate Roster',  icon: <RefreshCw size={14} /> },
            ]}
            activeTab={tab}
            onChange={t => setTab(t as typeof tab)}
          />
        }
      />

      {/* Department selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-semibold flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--pz-text-muted)' }}>Department:</label>
        <select
          value={selectedDeptId || activeDept?.id || ''}
          onChange={e => setSelectedDeptId(e.target.value)}
          className="pz-input h-10 text-sm flex-1"
        >
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {tab === 'pairs' && (
        <PairsTab departmentId={selectedDeptId || activeDept?.id || ''} />
      )}
      {tab === 'calendar' && (
        <CalendarTab
          departmentId={selectedDeptId || activeDept?.id || ''}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
        />
      )}
      {tab === 'generate' && (
        <GenerateTab departmentId={selectedDeptId || activeDept?.id || ''} />
      )}
    </div>
  )
}

// ── PairsTab ─────────────────────────────────────────────────

function PairsTab({ departmentId }: { departmentId: string }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editPair, setEditPair] = useState<ShiftPair | null>(null)
  const [addMemberPair, setAddMemberPair] = useState<ShiftPair | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['roster-pairs', departmentId],
    queryFn: () => rosterAPI.listPairs(departmentId),
    enabled: !!departmentId,
    select: d => d.data.items,
  })
  const pairs = data ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rosterAPI.deletePair(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roster-pairs', departmentId] }); toast.success('Pair deleted') },
    onError: () => toast.error('Failed to delete pair'),
  })

  if (!departmentId) return <p className="text-sm" style={{ color: 'var(--pz-text-muted)' }}>Select a department above.</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--pz-text-muted)' }}>
          Manage paired employees for the 2-On/2-Off rotational system.
          Unpaired staff (managers, admins) follow their individual protocol.
        </p>
        <Button variant="default" size="md" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> New Pair
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2].map(i => <div key={i} className="rounded-xl border p-5 h-40 skeleton" style={{ borderColor: 'var(--pz-border)' }} />)}
        </div>
      ) : pairs.length === 0 ? (
        <div className="rounded-xl border p-12 text-center" style={{ background: 'var(--pz-surface-1)', borderColor: 'var(--pz-border)' }}>
          <Users size={36} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--pz-text-muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--pz-text-secondary)' }}>No shift pairs yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--pz-text-muted)' }}>Create pairs to define the rotation schedule</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {pairs.map((pair, i) => (
            <motion.div key={pair.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <PairCard
                pair={pair}
                onEdit={() => setEditPair(pair)}
                onDelete={() => deleteMutation.mutate(pair.id)}
                onAddMember={() => setAddMemberPair(pair)}
                onRemoveMember={(empId) => {
                  rosterAPI.removeMember(pair.id, empId)
                    .then(() => { qc.invalidateQueries({ queryKey: ['roster-pairs', departmentId] }); toast.success('Member removed') })
                    .catch(() => toast.error('Failed to remove member'))
                }}
              />
            </motion.div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreatePairModal
          departmentId={departmentId}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['roster-pairs', departmentId] }) }}
        />
      )}
      {addMemberPair && (
        <AddMemberModal
          pair={addMemberPair}
          departmentId={departmentId}
          onClose={() => setAddMemberPair(null)}
          onSuccess={() => { setAddMemberPair(null); qc.invalidateQueries({ queryKey: ['roster-pairs', departmentId] }) }}
        />
      )}
    </div>
  )
}

// ── PairCard ──────────────────────────────────────────────────

function PairCard({ pair, onEdit, onDelete, onAddMember, onRemoveMember }: {
  pair: ShiftPair
  onEdit: () => void
  onDelete: () => void
  onAddMember: () => void
  onRemoveMember: (empId: string) => void
}) {
  const SLOTS = ['Slot 0 — Day Start', 'Slot 1 — Night Start']
  const slotColors = ['#FEF9C3', '#EDE9FE']
  const slotTextColors = ['#854D0E', '#4C1D95']

  return (
    <div className="rounded-xl border p-5 transition-all hover:shadow-md"
      style={{ background: 'var(--pz-surface-1)', borderColor: pair.color || 'var(--pz-border)', borderLeftWidth: 3 }}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full" style={{ background: pair.color || '#2563EB' }} />
          <h3 className="font-bold text-base" style={{ color: 'var(--pz-text)' }}>{pair.name}</h3>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--pz-text-muted)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--pz-surface-3)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <Edit3 size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--pz-text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--pz-danger-50)'; (e.currentTarget as HTMLElement).style.color = 'var(--pz-danger-500)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--pz-text-muted)' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <p className="text-xs mb-3" style={{ color: 'var(--pz-text-muted)' }}>
        Rotation start: <span className="font-mono font-semibold" style={{ color: 'var(--pz-text-secondary)' }}>{pair.rotation_start_date}</span>
      </p>

      <div className="space-y-2">
        {[0, 1].map(slot => {
          const member = pair.members.find(m => m.slot_index === slot)
          return (
            <div key={slot} className="flex items-center justify-between px-3 py-2.5 rounded-lg"
              style={{ background: slotColors[slot], border: `1px solid ${slot === 0 ? '#FDE047' : '#A78BFA'}` }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: slotTextColors[slot] }}>{SLOTS[slot]}</p>
                {member ? (
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--pz-text)' }}>{member.employee_name}</p>
                ) : (
                  <p className="text-sm italic" style={{ color: 'var(--pz-text-muted)' }}>Empty slot</p>
                )}
              </div>
              {member ? (
                <button onClick={() => onRemoveMember(member.employee_id)}
                  className="p-1 rounded transition-colors"
                  style={{ color: 'var(--pz-text-muted)' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--pz-danger-500)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--pz-text-muted)')}>
                  <X size={13} />
                </button>
              ) : (
                <button onClick={onAddMember}
                  className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
                  style={{ background: 'var(--pz-surface-1)', color: 'var(--pz-accent)', border: '1px solid var(--pz-accent)' }}>
                  + Add
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── CalendarTab ───────────────────────────────────────────────

function CalendarTab({ departmentId, month, onMonthChange }: {
  departmentId: string
  month: Date
  onMonthChange: (d: Date) => void
}) {
  const year = month.getFullYear()
  const monthNum = month.getMonth() + 1

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['roster-calendar', departmentId, year, monthNum],
    queryFn: () => rosterAPI.getCalendar(departmentId, year, monthNum),
    enabled: !!departmentId,
    select: d => d.data,
  })

  const cal = data
  const days = cal?.days ?? []
  const employees = cal?.employees ?? []

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => onMonthChange(subMonths(month, 1))}
            className="p-2 rounded-lg transition-colors" style={{ color: 'var(--pz-text-muted)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--pz-surface-3)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <ChevronLeft size={16} />
          </button>
          <h3 className="text-lg font-bold w-44 text-center" style={{ color: 'var(--pz-text)' }}>
            {format(month, 'MMMM yyyy')}
          </h3>
          <button onClick={() => onMonthChange(addMonths(month, 1))}
            className="p-2 rounded-lg transition-colors" style={{ color: 'var(--pz-text-muted)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--pz-surface-3)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Legend */}
        <div className="hidden lg:flex items-center gap-3 flex-wrap">
          {Object.entries(ASSIGN_CONFIG).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
              {cfg.short} {cfg.label}
            </span>
          ))}
        </div>
      </div>

      {/* No snapshot message */}
      {!isLoading && !cal?.snapshot_id && (
        <div className="rounded-xl border p-8 text-center" style={{ background: 'var(--pz-surface-1)', borderColor: 'var(--pz-border)' }}>
          <Calendar size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--pz-text-muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--pz-text-secondary)' }}>No roster generated for {format(month, 'MMMM yyyy')}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--pz-text-muted)' }}>Go to the "Generate Roster" tab to create one.</p>
        </div>
      )}

      {/* Calendar grid */}
      {(cal?.snapshot_id && !isLoading) && (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--pz-surface-1)', borderColor: 'var(--pz-border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: 'var(--pz-surface-2)', borderBottom: '1.5px solid var(--pz-border)' }}>
                  <th className="sticky left-0 z-10 text-left px-4 py-3 font-semibold min-w-[160px]"
                    style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-text-muted)', borderRight: '1px solid var(--pz-border)' }}>
                    Employee
                  </th>
                  {days.map(day => {
                    const d = new Date(day)
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6
                    return (
                      <th key={day} className="px-1 py-2 text-center font-semibold min-w-[36px]"
                        style={{ color: isWeekend ? 'var(--pz-text-muted)' : 'var(--pz-text-secondary)' }}>
                        <div>{format(d, 'd')}</div>
                        <div className="text-[9px] opacity-60">{format(d, 'EEE')}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, i) => (
                  <tr key={emp.id} style={{ borderBottom: '1px solid var(--pz-border)', background: i % 2 === 0 ? 'transparent' : 'var(--pz-surface-2)' }}>
                    <td className="sticky left-0 z-10 px-4 py-2.5"
                      style={{ background: i % 2 === 0 ? 'var(--pz-surface-1)' : 'var(--pz-surface-2)', borderRight: '1px solid var(--pz-border)' }}>
                      <p className="font-semibold" style={{ color: 'var(--pz-text)' }}>{emp.name}</p>
                      {emp.pair_name && <p className="text-[10px]" style={{ color: 'var(--pz-text-muted)' }}>{emp.pair_name}</p>}
                    </td>
                    {days.map(day => {
                      const cell = emp.schedule[day]
                      const cfg = cell ? ASSIGN_CONFIG[cell.assignment] : null
                      return (
                        <td key={day} className="px-0.5 py-1 text-center">
                          {cfg ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold"
                              title={`${emp.name} — ${cfg.label}\n${cell?.shift_start || ''} – ${cell?.shift_end || ''}`}
                              style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                              {cfg.short}
                            </span>
                          ) : <span className="text-gray-300">·</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="rounded-xl border p-8 text-center skeleton h-48"
          style={{ borderColor: 'var(--pz-border)' }} />
      )}
    </div>
  )
}

// ── GenerateTab ───────────────────────────────────────────────

function GenerateTab({ departmentId }: { departmentId: string }) {
  const qc = useQueryClient()
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const generateMut = useMutation({
    mutationFn: () => rosterAPI.generateRoster(departmentId, year, month),
    onSuccess: (res) => {
      toast.success(`Roster generated for ${format(new Date(year, month - 1), 'MMMM yyyy')}`)
      qc.invalidateQueries({ queryKey: ['roster-calendar', departmentId, year, month] })
      qc.invalidateQueries({ queryKey: ['roster-snapshots', departmentId] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Generation failed'),
  })

  const { data: snapsData } = useQuery({
    queryKey: ['roster-snapshots', departmentId],
    queryFn: () => rosterAPI.listSnapshots(departmentId),
    enabled: !!departmentId,
    select: d => d.data.items,
  })
  const snapshots = snapsData ?? []

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Generator */}
      <div className="rounded-xl border p-6 space-y-5"
        style={{ background: 'var(--pz-surface-1)', borderColor: 'var(--pz-border)' }}>
        <h3 className="text-base font-bold" style={{ color: 'var(--pz-text)' }}>Generate Monthly Roster</h3>
        <p className="text-sm" style={{ color: 'var(--pz-text-muted)' }}>
          The system will automatically compute every employee's Day/Night/OFF schedule
          for the selected month based on their pair assignment and protocol.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--pz-text-muted)' }}>Year</label>
            <select value={year} onChange={e => setYear(+e.target.value)} className="pz-input h-9 text-sm w-full">
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--pz-text-muted)' }}>Month</label>
            <select value={month} onChange={e => setMonth(+e.target.value)} className="pz-input h-9 text-sm w-full">
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={() => generateMut.mutate()}
          disabled={!departmentId || generateMut.isPending}
          className="w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          style={{ background: 'var(--pz-brand)' }}
          onMouseEnter={e => !generateMut.isPending && ((e.currentTarget as HTMLElement).style.background = 'var(--pz-accent)')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--pz-brand)')}>
          {generateMut.isPending
            ? <><RefreshCw size={16} className="animate-spin" /> Generating…</>
            : <><Calendar size={16} /> Generate {MONTHS[month-1]} {year} Roster</>}
        </button>

        {generateMut.isSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
            style={{ background: 'var(--pz-success-50)', color: 'var(--pz-success-500)', border: '1px solid var(--pz-success-border)' }}>
            <Check size={15} /> Roster generated successfully
          </div>
        )}
      </div>

      {/* Snapshot history */}
      <div className="rounded-xl border p-6 space-y-4"
        style={{ background: 'var(--pz-surface-1)', borderColor: 'var(--pz-border)' }}>
        <h3 className="text-base font-bold" style={{ color: 'var(--pz-text)' }}>Generated Rosters</h3>
        {snapshots.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--pz-text-muted)' }}>No rosters generated yet.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {snapshots.map(snap => (
              <div key={snap.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                style={{ border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)' }}>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--pz-text)' }}>
                    {MONTHS[snap.month - 1]} {snap.year}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--pz-text-muted)' }}>
                    Generated {format(new Date(snap.generated_at), 'MMM d, HH:mm')}
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-1 rounded-full"
                  style={{ background: 'var(--pz-success-50)', color: 'var(--pz-success-500)', border: '1px solid var(--pz-success-border)' }}>
                  Ready
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── CreatePairModal ───────────────────────────────────────────

function CreatePairModal({ departmentId, onClose, onSuccess }: {
  departmentId: string; onClose: () => void; onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [protocolId, setProtocolId] = useState('')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [color, setColor] = useState('#2563EB')

  const { data: protosData } = useQuery({
    queryKey: ['shift-protocols-list'],
    queryFn: () => shiftProtocolsAPI.list(),
    select: d => (Array.isArray(d.data) ? d.data : d.data ?? []) as ShiftProtocol[],
  })
  const protocols = (protosData ?? []).filter((p: ShiftProtocol) => p.protocol_type === 'rotating')

  const createMut = useMutation({
    mutationFn: () => rosterAPI.createPair({ department_id: departmentId, protocol_id: protocolId, name, rotation_start_date: startDate, color }),
    onSuccess: () => { toast.success('Pair created'); onSuccess() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to create pair'),
  })

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
      style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        style={{
          width: '100%',
          maxWidth: '680px',
          background: 'var(--pz-surface-1)',
          borderColor: 'var(--pz-border)',
          boxShadow: 'var(--pz-shadow-modal)',
          borderRadius: '6px',
          border: '1px solid var(--pz-border)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div style={{ padding: '28px 32px 20px 32px', borderBottom: '1px solid var(--pz-border)' }}>
          <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Create Shift Pair</h3>
          <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>
            Define a new 2-on/2-off rotation pair for this department.
          </p>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Pair Name */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Pair Name <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Pair A"
              className="pz-input w-full"
              style={{ height: '44px', fontSize: '14px' }}
            />
          </div>

          {/* Rotation Protocol */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Rotation Protocol <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <select
              value={protocolId}
              onChange={e => setProtocolId(e.target.value)}
              className="pz-input w-full"
              style={{ height: '44px', fontSize: '14px' }}
            >
              <option value="">Select rotating protocol…</option>
              {protocols.map((p: ShiftProtocol) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {protocols.length === 0 && (
              <p style={{ fontSize: '12px', marginTop: '6px', color: 'var(--pz-warning-600)' }}>
                No rotating protocols found. Create one in Shift Protocols first.
              </p>
            )}
          </div>

          {/* Two-column row: Start Date + Colour */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
                Rotation Start Date <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="pz-input w-full"
                style={{ height: '44px', fontSize: '14px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
                Pair Colour
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '44px' }}>
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  style={{ width: '44px', height: '44px', borderRadius: '4px', border: '1px solid var(--pz-border)', cursor: 'pointer', padding: '2px' }}
                />
                <span style={{ fontSize: '14px', fontFamily: 'monospace', color: 'var(--pz-text-secondary)' }}>{color}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '20px 32px 28px 32px', borderTop: '1px solid var(--pz-border)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="default" size="md" loading={createMut.isPending} disabled={!name || !protocolId || !startDate || createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending ? 'Creating…' : 'Create Pair'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// ── AddMemberModal ────────────────────────────────────────────

function AddMemberModal({ pair, departmentId, onClose, onSuccess }: {
  pair: ShiftPair; departmentId: string; onClose: () => void; onSuccess: () => void
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [slotIndex, setSlotIndex] = useState<0 | 1>(0)

  // Find the first empty slot automatically
  const emptySlots = [0, 1].filter(s => !pair.members.find(m => m.slot_index === s))

  const { data: empsData } = useQuery({
    queryKey: ['employees-dept', departmentId],
    queryFn: () => employeesAPI.list({ department_id: departmentId, limit: 200 }),
    enabled: !!departmentId,
    select: d => (d.data?.items ?? []) as Employee[],
  })
  const employees = (empsData ?? []).filter((e: Employee) =>
    !pair.members.find(m => m.employee_id === e.id)
  )

  const addMut = useMutation({
    mutationFn: () => rosterAPI.addMember(pair.id, employeeId, (emptySlots[0] ?? slotIndex) as 0 | 1),
    onSuccess: () => { toast.success('Member added'); onSuccess() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to add member'),
  })

  const occupiedSlots = pair.members.map(m => m.slot_index)
  const availableSlots = [0, 1].filter(s => !occupiedSlots.includes(s))

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
      style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--pz-surface-1)',
          border: '1px solid var(--pz-border)',
          boxShadow: 'var(--pz-shadow-modal)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div style={{ padding: '28px 32px 20px 32px', borderBottom: '1px solid var(--pz-border)' }}>
          <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>
            Add Member to {pair.name}
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>
            Available slots:{' '}
            <strong style={{ color: 'var(--pz-text-secondary)' }}>
              {availableSlots.map(s => s === 0 ? 'Slot 0 (Day Start)' : 'Slot 1 (Night Start)').join(', ') || 'None — pair is full'}
            </strong>
          </p>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Employee select */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Employee <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <select
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              className="pz-input w-full"
              style={{ height: '44px', fontSize: '14px' }}
            >
              <option value="">Select employee…</option>
              {employees.map((e: Employee) => (
                <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
              ))}
            </select>
            {employees.length === 0 && (
              <p style={{ fontSize: '12px', marginTop: '6px', color: 'var(--pz-text-muted)' }}>
                All eligible employees are already assigned to this pair.
              </p>
            )}
          </div>

          {/* Slot select — only shown when both slots are open */}
          {availableSlots.length > 1 && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
                Assign to Slot
              </label>
              <select
                value={slotIndex}
                onChange={e => setSlotIndex(+e.target.value as 0 | 1)}
                className="pz-input w-full"
                style={{ height: '44px', fontSize: '14px' }}
              >
                {availableSlots.map(s => (
                  <option key={s} value={s}>
                    {s === 0 ? 'Slot 0 — Starts as Day Shift' : 'Slot 1 — Starts as Night Shift'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '20px 32px 28px 32px', borderTop: '1px solid var(--pz-border)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="default" size="md" loading={addMut.isPending} disabled={!employeeId || addMut.isPending || availableSlots.length === 0} onClick={() => addMut.mutate()}>
            {addMut.isPending ? 'Adding…' : 'Add Member'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
