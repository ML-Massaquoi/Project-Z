import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import {
  Calendar, RefreshCw, Plus, Trash2, Check, X,
  ChevronLeft, ChevronRight, Users,
  Lock, ArrowLeftRight, Clock, Sun, Moon, AlertCircle, Download, Building2,
} from 'lucide-react'
import { format, addMonths, subMonths } from 'date-fns'
import { toast } from 'sonner'
import { schedulingAPI, departmentsAPI, employeesAPI, workforceAPI, rosterExportsAPI } from '@/api/client'
import { rosterAPI, type ShiftPair, type ShiftPairMember } from '@/api/roster'
import { TabBar } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/badge'
import type { Department, Employee, DepartmentDetail } from '@/types'
import { EnterpriseRosterGrid } from '@/components/shifts/EnterpriseRosterGrid'
import type { RosterGridData } from '@/components/shifts/EnterpriseRosterGrid'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const ASSIGN_CONFIG: Record<string, { bg: string; text: string; border: string; label: string; short: string }> = {
  DAY:     { bg: 'rgba(250,204,21,0.2)', text: 'var(--pz-warning-500)', border: 'rgba(250,204,21,0.3)', label: 'Day Shift',  short: 'D' },
  NIGHT:   { bg: 'rgba(99,102,241,0.2)', text: 'var(--pz-accent)', border: 'rgba(99,102,241,0.3)', label: 'Night Shift', short: 'N' },
  OFF:     { bg: 'rgba(113,113,122,0.15)', text: 'var(--pz-text-secondary)', border: 'rgba(113,113,122,0.2)', label: 'Rest Day',   short: '\u2014' },
  LEAVE:   { bg: 'rgba(34,197,94,0.15)', text: 'var(--pz-success-500)', border: 'rgba(34,197,94,0.25)', label: 'Leave',      short: 'L' },
  HOLIDAY: { bg: 'rgba(236,72,153,0.15)', text: 'var(--pz-danger-500)', border: 'rgba(236,72,153,0.25)', label: 'Holiday',    short: 'H' },
  ABSENT:  { bg: 'rgba(239,68,68,0.15)', text: 'var(--pz-danger-500)', border: 'rgba(239,68,68,0.2)', label: 'Absent',     short: '!' },
}

type EmpSchedule = {
  employee_id: string; employee_name: string; employee_code: string;
  schedule: Record<string, { assignment: string; shift_start?: string; shift_end?: string; shift_type?: string; color?: string }>;
}

type CalendarData = {
  year: number; month: number; days: string[];
  employees: EmpSchedule[]; snapshot_id?: string; status?: string;
}

type PubRecord = {
  id: string; department_id: string; year: number; month: number;
  status: 'draft' | 'published' | 'locked';
  published_by?: string; published_at?: string; created_at: string;
  version?: number;
}

type SwapRequest = {
  id: string; requester_employee_id: string; requester_name?: string;
  target_employee_id?: string; target_name?: string;
  swap_date: string; shift_type_from?: string; shift_type_to?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  notes?: string; created_at: string;
}

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '24px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  card: { background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '12px', boxShadow: 'var(--pz-shadow-sm)' },
  sectionCard: (noPadding?: boolean) => ({
    background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)',
    borderRadius: '12px', padding: noPadding ? '0' : '24px',
  }),
}

export default function RosterManagement() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'calendar' | 'generate' | 'swaps' | 'employees' | 'pairs' | 'groups'>('calendar')
  const [selectedDeptId, setSelectedDeptId] = useState<string>('')
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [showCreatePair, setShowCreatePair] = useState<'calendar' | 'generate' | false>(false)

  const { data: deptsData } = useQuery({
    queryKey: ['roster-departments'],
    queryFn: () => departmentsAPI.list(),
    select: d => (Array.isArray(d.data) ? d.data : d.data?.items ?? []) as Department[],
  })
  const departments = deptsData ?? []
  const activeDept = departments.find(d => d.id === selectedDeptId) ?? departments[0]

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Roster Management</h1>
          <p style={s.headerSubtitle}>Auto-generated shift rosters with protocol-based scheduling engine</p>
        </div>
        <TabBar
          tabs={[
            { id: 'calendar',  label: 'Calendar',       icon: <Calendar size={14} /> },
            { id: 'generate',  label: 'Generate',        icon: <RefreshCw size={14} /> },
            { id: 'groups',    label: 'Rotation Groups', icon: <Users size={14} /> },
            { id: 'pairs',     label: 'Shift Pairs',     icon: <ArrowLeftRight size={14} /> },
            { id: 'swaps',     label: 'Shift Swaps',     icon: <Clock size={14} /> },
            { id: 'employees', label: 'Employees',       icon: <Clock size={14} /> },
          ]}
          activeTab={tab}
          onChange={t => setTab(t as typeof tab)}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '400px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-muted)', flexShrink: 0 }}>Department:</label>
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

      {tab === 'calendar' && <CalendarTab deptId={selectedDeptId || activeDept?.id || ''} month={calendarMonth} onMonthChange={setCalendarMonth} onShowCreatePair={() => setShowCreatePair('calendar')} />}
      {tab === 'generate' && <GenerateTab deptId={selectedDeptId || activeDept?.id || ''} departments={departments} onShowCreatePair={() => setShowCreatePair('generate')} />}
      {tab === 'groups' && <GroupsTab deptId={selectedDeptId || activeDept?.id || ''} />}
      {tab === 'pairs' && <PairsTab deptId={selectedDeptId || activeDept?.id || ''} />}
      {tab === 'swaps' && <SwapsTab deptId={selectedDeptId || activeDept?.id || ''} />}
      {tab === 'employees' && <EmployeeTab deptId={selectedDeptId || activeDept?.id || ''} />}

      <CreatePairModal
        open={!!showCreatePair}
        onClose={() => setShowCreatePair(false)}
        deptId={selectedDeptId || activeDept?.id || ''}
        deptName={activeDept?.name || ''}
        protocolId={activeDept?.shift_protocol_id || ''}
        onCreated={() => {
          setShowCreatePair(false)
          qc.invalidateQueries({ queryKey: ['roster-pairs', selectedDeptId || activeDept?.id || ''] })
          toast.success('Shift pair created! You can now generate the roster.')
        }}
      />
    </div>
  )
}

/* ── Pairs Tab ─────────────────────────────────────────── */
function PairsTab({ deptId }: { deptId: string }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: pairsData, isLoading } = useQuery({
    queryKey: ['roster-pairs', deptId],
    queryFn: () => rosterAPI.listPairs(deptId),
    enabled: !!deptId,
    select: (d) => (Array.isArray(d.data) ? d.data : d.data?.items ?? []) as ShiftPair[],
  })
  const pairs = pairsData ?? []

  const deleteMut = useMutation({
    mutationFn: (pairId: string) => rosterAPI.deletePair(pairId),
    onSuccess: () => {
      toast.success('Shift pair deleted')
      qc.invalidateQueries({ queryKey: ['roster-pairs', deptId] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to delete pair'),
  })

  const { data: employees } = useQuery({
    queryKey: ['roster-dept-employees', deptId],
    queryFn: () => employeesAPI.list({ department_id: deptId, status: 'active', limit: 50 }),
    enabled: !!deptId,
    select: (d) => (Array.isArray(d.data) ? d.data : d.data?.items ?? d.data ?? []) as Employee[],
  })

  if (!deptId) return <p style={{ color: 'var(--pz-text-muted)', fontSize: '13px' }}>Select a department above.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>
          Shift Pairs <span style={{ fontWeight: 400, color: 'var(--pz-text-muted)', fontSize: '13px' }}>({pairs.length})</span>
        </h3>
        <button onClick={() => setShowCreate(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-brand)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={13} /> Create Pair
        </button>
      </div>

      {isLoading ? (
        <div className="skeleton" style={{ height: '120px', borderRadius: '10px' }} />
      ) : pairs.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', borderRadius: '10px', border: '1px dashed var(--pz-border)', background: 'var(--pz-surface-2)' }}>
          <Users size={32} style={{ margin: '0 auto 8px', opacity: 0.3, color: 'var(--pz-text-muted)' }} />
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>No shift pairs yet</p>
          <p style={{ fontSize: '11px', color: 'var(--pz-text-muted)', marginTop: '2px' }}>Create a pair to enable rotating roster generation.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pairs.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color || 'var(--pz-accent)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text)' }}>{p.name}</span>
                  {!p.is_active && <Badge size="sm" className="bg-red-500/15 text-red-400">Inactive</Badge>}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--pz-text-muted)', marginTop: '4px' }}>
                  {p.members?.map(m => m.employee_name).join(', ') || 'No members'}
                  <span style={{ marginLeft: '8px', opacity: 0.5 }}>Started {p.rotation_start_date}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {p.members?.length < 2 && (
                  <button onClick={() => {
                    const unpaired = (employees ?? []).filter(e => !p.members?.some(m => m.employee_id === e.id))
                    if (unpaired.length === 0) {
                      toast.error('No additional employees available in this department')
                      return
                    }
                    const nextSlot = p.members?.length ?? 0
                    rosterAPI.addMember(p.id, unpaired[0].id, nextSlot as 0 | 1).then(() => {
                      qc.invalidateQueries({ queryKey: ['roster-pairs', deptId] })
                      toast.success('Member added')
                    }).catch((e: any) => toast.error(e.response?.data?.detail || 'Failed to add member'))
                  }} style={{ padding: '6px 10px', borderRadius: '6px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', cursor: 'pointer' }}>
                    <Plus size={11} /> Add Member
                  </button>
                )}
                <button onClick={() => { if (confirm('Delete this pair?')) deleteMut.mutate(p.id) }}
                  style={{ padding: '6px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--pz-border)', fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', cursor: 'pointer' }}>
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreatePairModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        deptId={deptId}
        onCreated={() => {
          setShowCreate(false)
          qc.invalidateQueries({ queryKey: ['roster-pairs', deptId] })
          toast.success('Shift pair created')
        }}
      />
    </div>
  )
}

/* ── Create Pair Modal ───────────────────────────────── */
function CreatePairModal({ open, onClose, deptId, deptName: _deptName, protocolId: _protocolId, onCreated }: { open: boolean; onClose: () => void; deptId: string; deptName?: string; protocolId?: string; onCreated?: () => void }) {
  const [name, setName] = useState('')
  const [rotationStart, setRotationStart] = useState(new Date().toISOString().slice(0, 10))
  const [slot0Emp, setSlot0Emp] = useState('')
  const [slot1Emp, setSlot1Emp] = useState('')
  const [creating, setCreating] = useState(false)

  const { data: deptsList } = useQuery({
    queryKey: ['create-pair-depts'],
    queryFn: () => departmentsAPI.list(),
    enabled: open && (!_deptName || !_protocolId),
    select: (d) => (Array.isArray(d.data) ? d.data : d.data?.items ?? []) as Department[],
  })
  const matchedDept = (deptsList ?? []).find(d => d.id === deptId)
  const deptName = _deptName || matchedDept?.name || ''
  const protocolId = _protocolId || matchedDept?.shift_protocol_id || ''

  const { data: employees } = useQuery({
    queryKey: ['create-pair-employees', deptId],
    queryFn: () => employeesAPI.list({ department_id: deptId, status: 'active', limit: 50 }),
    enabled: !!deptId && open,
    select: (d) => (Array.isArray(d.data) ? d.data : d.data?.items ?? d.data ?? []) as Employee[],
  })

  const handleCreate = async () => {
    if (!name || !protocolId || !slot0Emp) {
      toast.error('Pair name, Slot 0 employee, and a protocol are required')
      return
    }
    setCreating(true)
    try {
      const pair = await rosterAPI.createPair({
        department_id: deptId,
        protocol_id: protocolId,
        name,
        rotation_start_date: rotationStart,
      })
      const pairData = pair.data as ShiftPair
      await rosterAPI.addMember(pairData.id, slot0Emp, 0)
      if (slot1Emp) {
        await rosterAPI.addMember(pairData.id, slot1Emp, 1)
      }
      onCreated?.()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to create pair')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Shift Pair"
      description={deptName ? `Department: ${deptName}` : undefined}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={creating || !name || !slot0Emp}
            style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--pz-brand)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: creating ? 0.5 : 1 }}>
            {creating ? 'Creating...' : 'Create Pair'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', display: 'block', marginBottom: '4px' }}>Pair Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Terminal Pair 1"
            className="pz-input h-9 text-sm w-full" />
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', display: 'block', marginBottom: '4px' }}>Rotation Start Date</label>
          <input type="date" value={rotationStart} onChange={e => setRotationStart(e.target.value)}
            className="pz-input h-9 text-sm w-full" />
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', display: 'block', marginBottom: '4px' }}>Slot 0 Employee <span style={{ color: 'var(--pz-danger-500)' }}>*</span></label>
          <select value={slot0Emp} onChange={e => setSlot0Emp(e.target.value)}
            className="pz-input h-9 text-sm w-full">
            <option value="">Select employee</option>
            {(employees ?? []).map(e => (
              <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
            ))}
          </select>
          <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', marginTop: '2px' }}>Slot 0 starts as DAY on first rotation cycle</p>
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', display: 'block', marginBottom: '4px' }}>Slot 1 Employee</label>
          <select value={slot1Emp} onChange={e => setSlot1Emp(e.target.value)}
            className="pz-input h-9 text-sm w-full">
            <option value="">Select employee (optional — unpaired staff get admin schedule)</option>
            {(employees ?? []).filter(e => e.id !== slot0Emp).map(e => (
              <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
            ))}
          </select>
          <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', marginTop: '2px' }}>Slot 1 starts as NIGHT — swaps DAY/NIGHT opposite to Slot 0</p>
        </div>
      </div>
    </Modal>
  )
}

function CalendarTab({ deptId, month, onMonthChange, onShowCreatePair }: { deptId: string; month: Date; onMonthChange: (d: Date) => void; onShowCreatePair?: () => void }) {
  const qc = useQueryClient()
  const year = month.getFullYear()
  const monthNum = month.getMonth() + 1
  const [exporting, setExporting] = useState<'csv' | 'excel' | 'pdf' | null>(null)
  const [confirmRegen, setConfirmRegen] = useState(false)

  // ── Determine if department is rotating or fixed ──────────
  const { data: deptDetail } = useQuery({
    queryKey: ['dept-detail-type', deptId],
    queryFn: async () => (await workforceAPI.departmentDetail(deptId)).data as DepartmentDetail,
    enabled: !!deptId,
  })
  const isRotating = deptDetail?.department?.protocol_type === 'rotating'

  // ── Calendar data (per-employee, used for fixed depts) ────
  const { data, isLoading: calLoading } = useQuery({
    queryKey: ['sched-calendar', deptId, year, monthNum],
    queryFn: () => schedulingAPI.departmentCalendar(deptId, { year, month: monthNum }),
    enabled: !!deptId,
    select: (d) => d.data as CalendarData,
  })

  // ── Grid data (group-based, used for rotating depts) ──────
  const { data: gridData, isLoading: gridLoading } = useQuery({
    queryKey: ['dept-grid', deptId, year, monthNum],
    queryFn: async () => (await schedulingAPI.departmentGrid(deptId, { year, month: monthNum })).data as RosterGridData,
    enabled: !!deptId && isRotating,
  })

  const isLoading = isRotating ? gridLoading : calLoading

  const invalidateRoster = () => {
    qc.invalidateQueries({ queryKey: ['sched-calendar', deptId, year, monthNum] })
    qc.invalidateQueries({ queryKey: ['sched-publications', deptId] })
    qc.invalidateQueries({ queryKey: ['dept-grid'] })
  }

  const generateMut = useMutation({
    mutationFn: () => schedulingAPI.generateDepartment(deptId, { year, month: monthNum }),
    onSuccess: () => {
      toast.success('Roster regenerated')
      invalidateRoster()
      setConfirmRegen(false)
    },
    onError: (e: any) => {
      const msg = e.response?.data?.detail || ''
      if (msg.toLowerCase().includes('no active shift pair')) {
        onShowCreatePair?.()
      } else {
        toast.error(msg || 'Regeneration failed')
      }
    },
  })

  const deletePubMut = useMutation({
    mutationFn: (pubId: string) => schedulingAPI.deletePublication(deptId, pubId),
    onSuccess: () => {
      toast.success('Roster deleted')
      invalidateRoster()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to delete'),
  })

  const deleteSnapshotMut = useMutation({
    mutationFn: () => schedulingAPI.deleteSnapshot(deptId, year, monthNum),
    onSuccess: () => {
      toast.success('Roster snapshot deleted')
      invalidateRoster()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to delete snapshot'),
  })

  const [confirmClear, setConfirmClear] = useState(false)
  const clearCalendarMut = useMutation({
    mutationFn: () => schedulingAPI.clearCalendar(deptId, { year, month: monthNum }),
    onSuccess: () => {
      toast.success('Calendar cleared')
      invalidateRoster()
      setConfirmClear(false)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to clear calendar'),
  })

  const { data: pubsData } = useQuery({
    queryKey: ['sched-publications', deptId],
    queryFn: () => schedulingAPI.publications(deptId),
    enabled: !!deptId,
    select: (d) => (Array.isArray(d.data) ? d.data : d.data?.items ?? []) as PubRecord[],
  })
  const publications = pubsData ?? []
  const currentPub = publications.find(p => p.year === year && p.month === monthNum)

  const hasSnapshot = isRotating ? !!gridData?.weeks?.length : !!data?.snapshot_id

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    if (!deptId) { toast.error('No roster to export'); return }
    setExporting(format)
    try {
      const fn = rosterExportsAPI[format]
      const res = await fn(deptId, year, monthNum)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `roster_${deptId}_${year}_${monthNum}.${format === 'excel' ? 'xlsx' : format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.success(`Exported as ${format.toUpperCase()}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  if (!deptId) return <p style={{ color: 'var(--pz-text-muted)', fontSize: '13px' }}>Select a department above.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── Legend & Status Bar ───────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {Object.entries(ASSIGN_CONFIG).map(([key, cfg]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
              {cfg.short} {cfg.label}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isRotating && gridData?.weeks?.length ? (
            <span style={{ fontSize: '11px', color: 'var(--pz-text-muted)' }}>
              Rotating schedule &middot; {gridData.department.name}
            </span>
          ) : data?.status && (
            <Badge size="sm" className={data.status === 'locked' ? 'bg-red-500/15 text-red-400' : data.status === 'published' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'}>
              {data.status}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Calendar Actions Bar (shared) ────────────────── */}
      {hasSnapshot && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>
              Roster for {format(month, 'MMMM yyyy')}
              {currentPub && <span style={{ marginLeft: '6px', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, textTransform: 'capitalize', background: currentPub.status === 'locked' ? 'rgba(239,68,68,0.15)' : currentPub.status === 'published' ? 'rgba(34,197,94,0.15)' : 'rgba(250,204,21,0.15)', color: currentPub.status === 'locked' ? '#EF4444' : currentPub.status === 'published' ? '#10B981' : '#F59E0B' }}>{currentPub.status}</span>}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {confirmRegen ? (
              <>
                <button onClick={() => { setConfirmRegen(false); generateMut.mutate() }} disabled={generateMut.isPending || currentPub?.status === 'locked'}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-danger-500)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: generateMut.isPending ? 0.5 : 1 }}>
                  {generateMut.isPending ? 'Regenerating...' : 'Confirm Regenerate'}
                </button>
                <button onClick={() => setConfirmRegen(false)}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmRegen(true)} disabled={currentPub?.status === 'locked'}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-warning-500)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: currentPub?.status === 'locked' ? 0.5 : 1 }}>
                <RefreshCw size={13} /> Regenerate
              </button>
            )}
            {currentPub && currentPub.status !== 'locked' && (
              <button onClick={() => deletePubMut.mutate(currentPub.id)} disabled={deletePubMut.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: deletePubMut.isPending ? 0.5 : 1 }}>
                <Trash2 size={13} /> Delete
              </button>
            )}
            {confirmClear ? (
              <>
                <button onClick={() => { setConfirmClear(false); clearCalendarMut.mutate() }} disabled={clearCalendarMut.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-danger-500)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: clearCalendarMut.isPending ? 0.5 : 1 }}>
                  {clearCalendarMut.isPending ? 'Clearing...' : 'Confirm Clear'}
                </button>
                <button onClick={() => setConfirmClear(false)}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmClear(true)} disabled={!hasSnapshot || currentPub?.status === 'locked'}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: !hasSnapshot || currentPub?.status === 'locked' ? 0.4 : 1 }}
                title="Remove all roster entries for this month">
                <Trash2 size={13} /> Clear Calendar
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Rotating dept → Enterprise Roster Grid ──────── */}
      {isRotating ? (
        <EnterpriseRosterGrid
          data={gridData}
          loading={isLoading}
          month={month}
          onMonthChange={onMonthChange}
          onExport={handleExport}
        />
      ) : isLoading ? (
        /* ── Loading skeleton (fixed dept) ─────────────── */
        <div style={{ ...s.sectionCard(), padding: '48px', textAlign: 'center' }}>
          <div className="skeleton" style={{ height: '256px', borderRadius: '12px' }} />
        </div>
      ) : !data?.snapshot_id ? (
        /* ── No roster (fixed dept) ────────────────────── */
        <div style={{ ...s.sectionCard(), padding: '48px', textAlign: 'center' }}>
          <Calendar size={36} style={{ margin: '0 auto 12px', opacity: 0.3, color: 'var(--pz-text-muted)' }} />
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>No roster for {format(month, 'MMMM yyyy')}</p>
          <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', marginTop: '4px' }}>Use the Generate tab to create one.</p>
        </div>
      ) : (
        /* ── Fixed department → Employee per-row table ─── */
        <div style={{ ...s.sectionCard(true), overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--pz-surface-2)', borderBottom: '1.5px solid var(--pz-border)' }}>
                  <th style={{ position: 'sticky', left: 0, zIndex: 10, textAlign: 'left', padding: '12px 16px', fontWeight: 600, minWidth: '160px', color: 'var(--pz-text-muted)', borderRight: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)' }}>
                    Employee
                  </th>
                  {data.days.map(day => {
                    const d = new Date(day)
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6
                    return (
                      <th key={day} style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600, minWidth: '32px', color: isWeekend ? 'var(--pz-text-muted)' : 'var(--pz-text-secondary)' }}>
                        <div>{format(d, 'd')}</div>
                        <div style={{ fontSize: '9px', opacity: 0.5 }}>{format(d, 'EEE')}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {data.employees.map((emp, i) => (
                  <tr key={emp.employee_id} style={{ borderBottom: '1px solid var(--pz-border)', background: i % 2 === 0 ? 'transparent' : 'var(--pz-surface-2)' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 10, padding: '10px 16px', color: 'var(--pz-text)', fontWeight: 600, borderRight: '1px solid var(--pz-border)', background: i % 2 === 0 ? 'var(--pz-surface-1)' : 'var(--pz-surface-2)' }}>
                      {emp.employee_name}
                      <span style={{ color: 'var(--pz-text-muted)', fontWeight: 400, fontSize: '10px', marginLeft: '6px' }}>{emp.employee_code}</span>
                    </td>
                    {data.days.map(day => {
                      const cell = emp.schedule[day]
                      const cfg = cell ? ASSIGN_CONFIG[cell.assignment] : null
                      const customColor = cell?.color
                      return (
                        <td key={day} style={{ padding: '2px', textAlign: 'center' }}>
                          {cell ? (
                            <span
                              title={[emp.employee_name, cfg?.label || cell.assignment, cell.shift_start ? cell.shift_start + '\u2013' + cell.shift_end : ''].filter(Boolean).join('\n')}
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: '28px', height: '28px', borderRadius: '6px',
                                fontSize: '10px', fontWeight: 700,
                                background: customColor ? customColor + '20' : (cfg?.bg || 'var(--pz-surface-2)'),
                                color: customColor || (cfg?.text || 'var(--pz-text-muted)'),
                                border: '1px solid ' + (customColor ? customColor + '30' : (cfg?.border || 'var(--pz-border)')),
                              }}>
                              {cfg?.short || cell.assignment.slice(0, 2)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--pz-text-faint)' }}>·</span>
                          )}
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
    </div>
  )
}

/* ── Rotation Groups Tab ───────────────────────────────── */

type RotationGroup = {
  id: string
  department_id: string
  name: string
  protocol_offset: number
  color: string | null
  is_active: boolean
  employee_count: number
  employees: { id: string; code: string; name: string }[]
}

function GroupsTab({ deptId }: { deptId: string }) {
  const qc = useQueryClient()
  const [showAutoDistribute, setShowAutoDistribute] = useState(false)
  const [numGroups, setNumGroups] = useState(4)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [editOffset, setEditOffset] = useState(0)

  const { data: groups, isLoading } = useQuery({
    queryKey: ['rotation-groups', deptId],
    queryFn: async () => (await schedulingAPI.rotationGroups(deptId)).data as RotationGroup[],
    enabled: !!deptId,
  })

  const autoDistributeMut = useMutation({
    mutationFn: () => schedulingAPI.autoDistribute(deptId, { num_groups: numGroups }),
    onSuccess: () => {
      toast.success(`Auto-distributed employees into ${numGroups} groups`)
      qc.invalidateQueries({ queryKey: ['rotation-groups', deptId] })
      setShowAutoDistribute(false)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Auto-distribute failed'),
  })

  const deleteGroupMut = useMutation({
    mutationFn: (id: string) => schedulingAPI.deleteRotationGroup(id),
    onSuccess: () => {
      toast.success('Group deleted')
      qc.invalidateQueries({ queryKey: ['rotation-groups', deptId] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to delete group'),
  })

  const updateOffsetMut = useMutation({
    mutationFn: ({ id, offset }: { id: string; offset: number }) =>
      schedulingAPI.updateRotationGroup(id, { protocol_offset: offset }),
    onSuccess: () => {
      toast.success('Protocol offset updated')
      qc.invalidateQueries({ queryKey: ['rotation-groups', deptId] })
      setEditingGroup(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update offset'),
  })

  if (!deptId) return <p style={{ color: 'var(--pz-text-muted)', fontSize: '13px' }}>Select a department above.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── Actions ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 }}>
          Rotation groups determine how employees cover day/night/off shifts.
          Each group starts at a different position in the protocol sequence.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          {showAutoDistribute ? (
            <>
              <select value={numGroups} onChange={e => setNumGroups(+e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', color: 'var(--pz-text)', fontSize: '12px' }}>
                {[2, 3, 4, 5, 6, 8].map(n => <option key={n} value={n}>{n} Groups</option>)}
              </select>
              <button onClick={() => autoDistributeMut.mutate()} disabled={autoDistributeMut.isPending}
                style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-accent)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                {autoDistributeMut.isPending ? 'Distributing...' : 'Confirm'}
              </button>
              <button onClick={() => setShowAutoDistribute(false)}
                style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setShowAutoDistribute(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              Auto-Distribute Employees
            </button>
          )}
        </div>
      </div>

      {/* ── Groups list ─────────────────────── */}
      {isLoading ? (
        <div style={{ ...s.sectionCard(), padding: '48px', textAlign: 'center' }}>
          <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
        </div>
      ) : !groups?.length ? (
        <div style={{ ...s.sectionCard(), padding: '48px', textAlign: 'center' }}>
          <Users size={36} style={{ margin: '0 auto 12px', opacity: 0.3, color: 'var(--pz-text-muted)' }} />
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>No rotation groups</p>
          <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', marginTop: '4px' }}>Use Auto-Distribute to create groups from active employees.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {groups.map((g, i) => (
            <div key={g.id} style={{
              ...s.sectionCard(), padding: '16px 20px',
              borderLeft: g.color ? `4px solid ${g.color}` : '4px solid var(--pz-accent)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{g.name}</h3>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: 'var(--pz-surface-2)', color: 'var(--pz-text-muted)' }}>
                      {g.employee_count} {g.employee_count === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--pz-text-muted)' }}>Protocol offset:</span>
                    {editingGroup === g.id ? (
                      <>
                        <input type="number" min={0} max={31} value={editOffset} onChange={e => setEditOffset(+e.target.value)}
                          style={{ width: '50px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', color: 'var(--pz-text)', fontSize: '12px' }} />
                        <button onClick={() => updateOffsetMut.mutate({ id: g.id, offset: editOffset })} disabled={updateOffsetMut.isPending}
                          style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--pz-accent)', color: '#fff', border: 'none', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>
                          Save
                        </button>
                        <button onClick={() => setEditingGroup(null)}
                          style={{ padding: '4px 8px', borderRadius: '6px', background: 'transparent', border: 'none', color: 'var(--pz-text-muted)', fontSize: '10px', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text)', fontFamily: 'monospace' }}>{g.protocol_offset}</span>
                        <button onClick={() => { setEditingGroup(g.id); setEditOffset(g.protocol_offset) }}
                          style={{ padding: '2px 6px', borderRadius: '4px', background: 'transparent', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)', fontSize: '9px', cursor: 'pointer' }}>
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => deleteGroupMut.mutate(g.id)} disabled={deleteGroupMut.isPending}
                  style={{ padding: '6px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--pz-danger-500)'; (e.currentTarget as HTMLElement).style.color = 'var(--pz-danger-500)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--pz-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--pz-text-muted)' }}>
                  <Trash2 size={13} /> Delete
                </button>
              </div>

              {/* Group members */}
              {g.employees.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--pz-border)' }}>
                  {g.employees.map(emp => (
                    <span key={emp.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', borderRadius: '999px',
                      background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)',
                      fontSize: '11px', fontWeight: 500, color: 'var(--pz-text)',
                    }}>
                      {emp.name}
                      <span style={{ fontSize: '9px', color: 'var(--pz-text-muted)' }}>{emp.code}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GenerateTab({ deptId, onShowCreatePair, departments }: { deptId: string; onShowCreatePair?: () => void; departments: Department[] }) {
  const qc = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [multiMonthRange, setMultiMonthRange] = useState<1 | 3 | 6 | 12>(3)
  const [showMultiMonth, setShowMultiMonth] = useState(false)
  const [orgWideLoading, setOrgWideLoading] = useState(false)
  const [clearTargetDept, setClearTargetDept] = useState(deptId || '')
  const [confirmClearGen, setConfirmClearGen] = useState(false)

  const clearDeptCalendarMut = useMutation({
    mutationFn: () => schedulingAPI.clearCalendar(clearTargetDept, { year, month }),
    onSuccess: () => {
      toast.success('Calendar cleared for ' + MONTH_NAMES[month - 1] + ' ' + year)
      qc.invalidateQueries({ queryKey: ['sched-calendar', clearTargetDept, year, month] })
      qc.invalidateQueries({ queryKey: ['sched-publications', clearTargetDept] })
      qc.invalidateQueries({ queryKey: ['dept-grid'] })
      setConfirmClearGen(false)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to clear calendar'),
  })

  const invalidateRoster = () => {
    qc.invalidateQueries({ queryKey: ['sched-calendar', deptId, year, month] })
    qc.invalidateQueries({ queryKey: ['sched-publications', deptId] })
    qc.invalidateQueries({ queryKey: ['dept-grid'] })
  }

  const generateMut = useMutation({
    mutationFn: () => schedulingAPI.generateDepartment(deptId, { year, month }),
    onSuccess: () => {
      toast.success('Roster generated for ' + MONTH_NAMES[month - 1] + ' ' + year)
      invalidateRoster()
    },
    onError: (e: any) => {
      const msg = e.response?.data?.detail || ''
      if (msg.toLowerCase().includes('no active shift pair')) {
        onShowCreatePair?.()
      } else {
        toast.error(msg || 'Generation failed')
      }
    },
  })

  const generateOrgMut = useMutation({
    mutationFn: () => schedulingAPI.generateOrganization({ year, month }),
    onSuccess: (res: any) => {
      const count = res.data?.total_generated ?? 0
      toast.success(`Rosters generated for ${count} department(s)`)
      qc.invalidateQueries({ queryKey: ['sched-publications'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Organization generation failed'),
  })

  const generateMultiMut = useMutation({
    mutationFn: () => schedulingAPI.generateMultiMonth(deptId, { year, start_month: month, num_months: multiMonthRange }),
    onSuccess: (res: any) => {
      const count = res.data?.total_generated ?? 0
      toast.success(`Generated ${count} month(s) of rosters`)
      qc.invalidateQueries({ queryKey: ['sched-calendar'] })
      qc.invalidateQueries({ queryKey: ['sched-publications'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Multi-month generation failed'),
  })

  const generateOrgMultiMut = useMutation({
    mutationFn: () => schedulingAPI.generateOrgMultiMonth({ year, start_month: month, num_months: multiMonthRange }),
    onSuccess: (res: any) => {
      const count = res.data?.total_generated ?? 0
      toast.success(`Generated ${count} roster(s) organization-wide`)
      qc.invalidateQueries({ queryKey: ['sched-calendar'] })
      qc.invalidateQueries({ queryKey: ['sched-publications'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Organization multi-month generation failed'),
  })

  const publishMut = useMutation({
    mutationFn: () => schedulingAPI.publish(deptId, { year, month }),
    onSuccess: () => {
      toast.success('Roster published')
      qc.invalidateQueries({ queryKey: ['sched-publications', deptId] })
      qc.invalidateQueries({ queryKey: ['sched-calendar', deptId, year, month] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to publish'),
  })

  const lockMut = useMutation({
    mutationFn: () => schedulingAPI.lock(deptId, { year, month }),
    onSuccess: () => {
      toast.success('Roster locked')
      qc.invalidateQueries({ queryKey: ['sched-publications', deptId] })
      qc.invalidateQueries({ queryKey: ['sched-calendar', deptId, year, month] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to lock'),
  })

  const deletePubMut = useMutation({
    mutationFn: (pubId: string) => schedulingAPI.deletePublication(deptId, pubId),
    onSuccess: () => {
      toast.success('Roster deleted')
      qc.invalidateQueries({ queryKey: ['sched-publications', deptId] })
      qc.invalidateQueries({ queryKey: ['sched-calendar', deptId, year, month] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to delete'),
  })

  const [confirmRegen, setConfirmRegen] = useState(false)
  const [exportFmt, setExportFmt] = useState<'csv' | 'excel' | 'pdf' | null>(null)

  const { data: pubsData } = useQuery({
    queryKey: ['sched-publications', deptId],
    queryFn: () => schedulingAPI.publications(deptId),
    enabled: !!deptId,
    select: (d) => (Array.isArray(d.data) ? d.data : d.data?.items ?? []) as PubRecord[],
  })
  const publications = pubsData ?? []
  const currentPub = publications.find(p => p.year === year && p.month === month)

  const handleExport = async (fmt: 'csv' | 'excel' | 'pdf') => {
    if (!deptId) return
    setExportFmt(fmt)
    try {
      const fn = rosterExportsAPI[fmt]
      const res = await fn(deptId, year, month)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `roster_${deptId}_${year}_${month}.${fmt === 'excel' ? 'xlsx' : fmt}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.success(`Exported as ${fmt.toUpperCase()}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Export failed')
    } finally {
      setExportFmt(null)
    }
  }

  if (!deptId) return <p style={{ color: 'var(--pz-text-muted)', fontSize: '13px' }}>Select a department above.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div style={s.sectionCard()}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 16px' }}>{currentPub ? 'Regenerate Roster' : 'Generate Roster'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 }}>
              Scheduling engine resolution chain:<br/>
              <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>Holiday → Leave → Override → Swap → Protocol+Offset → OFF</span>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', display: 'block', marginBottom: '4px' }}>Year</label>
                <select value={year} onChange={e => setYear(+e.target.value)} className="pz-input h-9 text-sm w-full">
                  {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', display: 'block', marginBottom: '4px' }}>Month</label>
                <select value={month} onChange={e => setMonth(+e.target.value)} className="pz-input h-9 text-sm w-full">
                  {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
            </div>

            {currentPub ? (
              <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.25)', fontSize: '12px', color: 'var(--pz-text-secondary)' }}>
                A {currentPub.status} roster already exists for {MONTH_NAMES[month - 1]} {year}. Regenerating will overwrite it.
              </div>
            ) : null}

            {confirmRegen && currentPub ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setConfirmRegen(false); generateMut.mutate() }} disabled={generateMut.isPending}
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'var(--pz-danger-500)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: generateMut.isPending ? 0.5 : 1 }}>
                  {generateMut.isPending ? 'Regenerating...' : 'Yes, Regenerate'}
                </button>
                <button onClick={() => setConfirmRegen(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'var(--pz-surface-2)', color: 'var(--pz-text-secondary)', border: '1px solid var(--pz-border)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => { if (currentPub && currentPub.status !== 'locked') setConfirmRegen(true); else generateMut.mutate() }}
                disabled={generateMut.isPending || currentPub?.status === 'locked'}
                style={{ width: '100%', padding: '12px', borderRadius: '12px', background: currentPub ? 'linear-gradient(135deg, var(--pz-warning-500), #EA580C)' : 'linear-gradient(135deg, var(--pz-brand), var(--pz-accent))', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: generateMut.isPending || currentPub?.status === 'locked' ? 0.5 : 1 }}>
                {generateMut.isPending ? <><RefreshCw size={16} className="animate-spin" /> Generating...</> : <><Calendar size={16} /> {currentPub ? 'Regenerate ' : 'Generate '}{MONTH_NAMES[month - 1]} {year}</>}
              </button>
            )}

            {currentPub && (
              <div style={{ display: 'flex', gap: '8px' }}>
                {(currentPub.status === 'draft') && (<>
                  <button onClick={() => publishMut.mutate()} disabled={publishMut.isPending}
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'var(--pz-success-500)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: publishMut.isPending ? 0.5 : 1 }}>
                    <Check size={14} /> Publish
                  </button>
                  <button onClick={() => lockMut.mutate()} disabled={lockMut.isPending}
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'var(--pz-danger-500)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: lockMut.isPending ? 0.5 : 1 }}>
                    <Lock size={14} /> Lock
                  </button>
                </>)}
                {currentPub.status === 'published' && (
                  <button onClick={() => lockMut.mutate()} disabled={lockMut.isPending}
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'var(--pz-accent)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: lockMut.isPending ? 0.5 : 1 }}>
                    <Lock size={14} /> Lock (Finalize)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Bulk Generation Card */}
          <div style={s.sectionCard()}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 16px' }}>Bulk Generation</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', display: 'block', marginBottom: '4px' }}>Generate Range</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {([1, 3, 6, 12] as const).map(r => (
                    <button key={r} onClick={() => setMultiMonthRange(r)}
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s', ...(multiMonthRange === r ? { background: 'linear-gradient(135deg, var(--pz-accent), #4F46E5)', color: '#fff' } : { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)' }) }}>
                      {r} {r === 1 ? 'Month' : 'Months'}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => generateMultiMut.mutate()} disabled={generateMultiMut.isPending || !deptId}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'var(--pz-accent)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: generateMultiMut.isPending || !deptId ? 0.5 : 1 }}>
                <RefreshCw size={14} className={generateMultiMut.isPending ? 'animate-spin' : ''} />
                {generateMultiMut.isPending ? `Generating ${multiMonthRange} months...` : `Generate ${multiMonthRange} Months for Selected Dept`}
              </button>
            </div>
          </div>

          {/* Organization Generation Card */}
          <div style={s.sectionCard()}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 16px' }}>Organization-Wide</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button onClick={() => generateOrgMut.mutate()} disabled={generateOrgMut.isPending}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'linear-gradient(135deg, #10B981, #059669)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: generateOrgMut.isPending ? 0.5 : 1 }}>
                <Building2 size={14} className={generateOrgMut.isPending ? 'animate-spin' : ''} />
                {generateOrgMut.isPending ? 'Generating...' : `Generate All Depts — ${MONTH_NAMES[month - 1]} ${year}`}
              </button>
              <button onClick={() => generateOrgMultiMut.mutate()} disabled={generateOrgMultiMut.isPending}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: generateOrgMultiMut.isPending ? 0.5 : 1 }}>
                <RefreshCw size={14} className={generateOrgMultiMut.isPending ? 'animate-spin' : ''} />
                {generateOrgMultiMut.isPending ? 'Generating...' : `All Depts — ${multiMonthRange} Months from ${MONTH_NAMES[month - 1]}`}
              </button>
            </div>
          </div>

          {/* Clear Calendar Card */}
          <div style={s.sectionCard()}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 8px' }}>Clear Calendar</h3>
            <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: '0 0 12px' }}>
              Remove all roster entries for a department's month. This is destructive — regenerating will restore them.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={clearTargetDept} onChange={e => setClearTargetDept(e.target.value)}
                style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', color: 'var(--pz-text)', fontSize: '12px' }}>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {confirmClearGen ? (
                <>
                  <button onClick={() => { setConfirmClearGen(false); clearDeptCalendarMut.mutate() }} disabled={clearDeptCalendarMut.isPending}
                    style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-danger-500)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: clearDeptCalendarMut.isPending ? 0.5 : 1 }}>
                    {clearDeptCalendarMut.isPending ? 'Clearing...' : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirmClearGen(false)}
                    style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmClearGen(true)}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  title="Remove all roster entries for this department/month">
                  <Trash2 size={13} style={{ marginRight: '4px' }} /> Clear Month
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Rosters History */}
      <div style={s.sectionCard()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Rosters History</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {publications.length > 0 && (
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['csv', 'excel', 'pdf'] as const).map(fmt => (
                  <button key={fmt} onClick={() => handleExport(fmt)} disabled={exportFmt === fmt}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', cursor: 'pointer', opacity: exportFmt === fmt ? 0.5 : 1 }}>
                    <Download size={11} /> {fmt === 'excel' ? 'xlsx' : fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            <span style={{ fontSize: '11px', color: 'var(--pz-text-muted)' }}>{publications.length} total</span>
          </div>
        </div>
        {publications.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)' }}>No rosters generated yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
            {publications.map(pub => {
              const statusColors: Record<string, { bg: string; text: string; border: string }> = {
                draft: { bg: 'rgba(250,204,21,0.15)', text: 'var(--pz-warning-500)', border: 'rgba(250,204,21,0.25)' },
                published: { bg: 'rgba(34,197,94,0.15)', text: 'var(--pz-success-500)', border: 'rgba(34,197,94,0.25)' },
                locked: { bg: 'rgba(239,68,68,0.15)', text: 'var(--pz-danger-500)', border: 'rgba(239,68,68,0.25)' },
              }
              const sc = statusColors[pub.status] || statusColors.draft
              const isCurrent = pub.year === year && pub.month === month
              return (
                <div key={pub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '10px', border: '1px solid ' + (isCurrent ? 'var(--pz-accent)' : 'var(--pz-border)'), background: 'var(--pz-surface-2)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>{MONTH_NAMES[pub.month - 1]} {pub.year}</p>
                      {isCurrent && <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--pz-accent)', padding: '1px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)' }}>CURRENT</span>}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--pz-text-muted)', margin: '2px 0 0' }}>{format(new Date(pub.created_at), 'MMM d, HH:mm')} {pub.version && pub.version > 1 ? '(v' + pub.version + ')' : ''}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px', background: sc.bg, color: sc.text, border: '1px solid ' + sc.border, textTransform: 'capitalize' }}>{pub.status}</span>
                    {pub.status !== 'locked' && (
                      <button onClick={() => deletePubMut.mutate(pub.id)} disabled={deletePubMut.isPending} title="Delete roster"
                        style={{ padding: '4px', borderRadius: '6px', background: 'transparent', border: 'none', color: 'var(--pz-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--pz-danger-500)'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--pz-text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SwapsTab({ deptId }: { deptId: string }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: swapsData, isLoading } = useQuery({
    queryKey: ['sched-swaps', deptId],
    queryFn: () => schedulingAPI.listSwaps({ department_id: deptId }),
    enabled: !!deptId,
    select: (d) => (Array.isArray(d.data) ? d.data : d.data?.items ?? []) as SwapRequest[],
  })
  const swaps = swapsData ?? []

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      schedulingAPI.updateSwap(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sched-swaps', deptId] }); toast.success('Swap updated') },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => schedulingAPI.deleteSwap(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sched-swaps', deptId] }); toast.success('Swap removed') },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const statusStyles: Record<string, { bg: string; text: string; border: string }> = {
    pending: { bg: 'rgba(250,204,21,0.15)', text: 'var(--pz-warning-500)', border: 'rgba(250,204,21,0.25)' },
    approved: { bg: 'rgba(34,197,94,0.15)', text: 'var(--pz-success-500)', border: 'rgba(34,197,94,0.25)' },
    rejected: { bg: 'rgba(239,68,68,0.15)', text: 'var(--pz-danger-500)', border: 'rgba(239,68,68,0.25)' },
    cancelled: { bg: 'rgba(113,113,122,0.15)', text: 'var(--pz-text-secondary)', border: 'rgba(113,113,122,0.2)' },
  }

  if (!deptId) return <p style={{ color: 'var(--pz-text-muted)', fontSize: '13px' }}>Select a department above.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 }}>Manage shift swap requests between employees</p>
        <button onClick={() => setShowCreate(true)}
          style={{ padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-accent)', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={15} /> New Swap Request
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '100px', borderRadius: '12px' }} />)}
        </div>
      ) : swaps.length === 0 ? (
        <div style={{ ...s.sectionCard(), padding: '48px', textAlign: 'center' }}>
          <ArrowLeftRight size={32} style={{ margin: '0 auto 12px', opacity: 0.3, color: 'var(--pz-text-muted)' }} />
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>No swap requests</p>
          <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', marginTop: '4px' }}>Create a new swap request for employees to exchange shifts.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {swaps.map(swap => {
            const sc = statusStyles[swap.status] || statusStyles.pending
            return (
              <div key={swap.id} style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>
                      {swap.requester_name || swap.requester_employee_id}
                    </p>
                    {swap.target_name && (
                      <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: '2px 0 0' }}>
                        with <strong>{swap.target_name}</strong>
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px', background: sc.bg, color: sc.text, border: '1px solid ' + sc.border, textTransform: 'capitalize' }}>
                    {swap.status}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--pz-text-secondary)' }}>
                  <Calendar size={13} />
                  <span>{format(new Date(swap.swap_date), 'MMM d, yyyy')}</span>
                  <span style={{ color: 'var(--pz-text-faint)' }}>|</span>
                  <ArrowLeftRight size={13} />
                  <span>{swap.shift_type_from || '?'} \u2192 {swap.shift_type_to || '?'}</span>
                </div>
                {swap.notes && (
                  <p style={{ fontSize: '11px', color: 'var(--pz-text-muted)', margin: '8px 0 0', padding: '8px', borderRadius: '6px', background: 'var(--pz-surface-2)' }}>
                    {swap.notes}
                  </p>
                )}
                {swap.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--pz-border)' }}>
                    <button onClick={() => updateMut.mutate({ id: swap.id, data: { status: 'approved' } })}
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', background: 'var(--pz-success-500)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                      Approve
                    </button>
                    <button onClick={() => updateMut.mutate({ id: swap.id, data: { status: 'rejected' } })}
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', background: 'var(--pz-danger-500)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                      Reject
                    </button>
                    <button onClick={() => deleteMut.mutate(swap.id)}
                      style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', color: 'var(--pz-text-muted)', border: '1px solid var(--pz-border)', fontSize: '11px', cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showCreate && <CreateSwapModal deptId={deptId} onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['sched-swaps', deptId] }) }} />}
    </div>
  )
}

function CreateSwapModal({ deptId, onClose, onSuccess }: { deptId: string; onClose: () => void; onSuccess: () => void }) {
  const [requesterId, setRequesterId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [swapDate, setSwapDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [shiftFrom, setShiftFrom] = useState('')
  const [shiftTo, setShiftTo] = useState('')
  const [notes, setNotes] = useState('')

  const { data: empsData } = useQuery({
    queryKey: ['employees-dept', deptId],
    queryFn: () => employeesAPI.list({ department_id: deptId, limit: 200 }),
    enabled: !!deptId,
    select: d => (d.data?.items ?? []) as Employee[],
  })
  const employees = empsData ?? []

  const createMut = useMutation({
    mutationFn: () => schedulingAPI.createSwap({
      requester_employee_id: requesterId,
      target_employee_id: targetId || undefined,
      swap_date: swapDate,
      shift_type_from: shiftFrom || undefined,
      shift_type_to: shiftTo || undefined,
      notes: notes || undefined,
    }),
    onSuccess: () => { toast.success('Swap request created'); onSuccess() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  return (
    <Modal open onClose={onClose} title="New Shift Swap Request" size="md"
      footer={
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => createMut.mutate()} disabled={!requesterId || createMut.isPending}
            style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-accent)', color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: !requesterId || createMut.isPending ? 0.5 : 1 }}>
            {createMut.isPending ? 'Creating...' : 'Create Request'}
          </button>
        </div>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={15} color="#3B82F6" />
            </div>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Swap Details</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Requester *</label>
              <select value={requesterId} onChange={e => setRequesterId(e.target.value)}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none' }}>
                <option value="">Select employee...</option>
                {employees.map((e: Employee) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Target Employee</label>
              <select value={targetId} onChange={e => setTargetId(e.target.value)}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none' }}>
                <option value="">Open swap (any volunteer)</option>
                {employees.filter((e: Employee) => e.id !== requesterId).map((e: Employee) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Swap Date *</label>
              <input type="date" value={swapDate} onChange={e => setSwapDate(e.target.value)}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Shift From</label>
              <select value={shiftFrom} onChange={e => setShiftFrom(e.target.value)}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none' }}>
                <option value="">Any</option>
                <option value="DAY">Day</option>
                <option value="NIGHT">Night</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Shift To</label>
              <select value={shiftTo} onChange={e => setShiftTo(e.target.value)}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none' }}>
                <option value="">Any</option>
                <option value="DAY">Day</option>
                <option value="NIGHT">Night</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Reason for swap..."
              style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>
    </Modal>
  )
}

function EmployeeTab({ deptId }: { deptId: string }) {
  const [selectedEmpId, setSelectedEmpId] = useState<string>('')
  const [empMonth, setEmpMonth] = useState(new Date())

  const { data: empsData } = useQuery({
    queryKey: ['employees-dept', deptId],
    queryFn: () => employeesAPI.list({ department_id: deptId, limit: 200 }),
    enabled: !!deptId,
    select: d => (d.data?.items ?? []) as Employee[],
  })
  const employees = empsData ?? []

  const { data: empCal, isLoading } = useQuery({
    queryKey: ['sched-emp-cal', selectedEmpId, empMonth.getFullYear(), empMonth.getMonth() + 1],
    queryFn: () => schedulingAPI.employeeCalendar(selectedEmpId, { year: empMonth.getFullYear(), month: empMonth.getMonth() + 1 }),
    enabled: !!selectedEmpId,
    select: (d) => d.data as { days: string[]; schedule: Record<string, { assignment: string; shift_start?: string; shift_end?: string; color?: string }>; status?: string },
  })

  if (!deptId) return <p style={{ color: 'var(--pz-text-muted)', fontSize: '13px' }}>Select a department above.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-muted)', flexShrink: 0 }}>Employee:</label>
        <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)}
          style={{ width: '320px', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none' }}>
          <option value="">Select employee...</option>
          {employees.map((e: Employee) => (
            <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
          ))}
        </select>
      </div>

      {!selectedEmpId ? (
        <div style={{ ...s.sectionCard(), padding: '48px', textAlign: 'center' }}>
          <Users size={36} style={{ margin: '0 auto 12px', opacity: 0.3, color: 'var(--pz-text-muted)' }} />
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>Select an employee</p>
          <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', marginTop: '4px' }}>Choose an employee above to view their schedule.</p>
        </div>
      ) : isLoading ? (
        <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
      ) : empCal ? (
        <div style={s.sectionCard()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>
              {format(empMonth, 'MMMM yyyy')} Schedule
            </h3>
            {empCal.status && <Badge size="sm">{empCal.status}</Badge>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setEmpMonth(subMonths(empMonth, 1))} style={{ padding: '6px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', color: 'var(--pz-text-muted)', cursor: 'pointer' }}><ChevronLeft size={14} /></button>
              <button onClick={() => setEmpMonth(addMonths(empMonth, 1))} style={{ padding: '6px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', color: 'var(--pz-text-muted)', cursor: 'pointer' }}><ChevronRight size={14} /></button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {empCal.days.map(day => {
              const cell = empCal.schedule[day]
              const d = new Date(day)
              const cfg = cell ? ASSIGN_CONFIG[cell.assignment] : null
              return (
                <div key={day} style={{
                  width: '56px', padding: '8px 4px', borderRadius: '8px', textAlign: 'center',
                  border: '1px solid ' + (cell ? (cfg?.border || 'var(--pz-border)') : 'var(--pz-border)'),
                  background: cell ? (cell.color ? cell.color + '20' : (cfg?.bg || 'var(--pz-surface-2)')) : 'var(--pz-surface-2)',
                }}>
                  <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0 }}>{format(d, 'EEE')}</p>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{format(d, 'd')}</p>
                  {cell ? (
                    <span style={{
                      fontSize: '9px', fontWeight: 700, display: 'block', marginTop: '2px',
                      color: cell.color || (cfg?.text || 'var(--pz-text-secondary)'),
                    }}>
                      {cfg?.short || cell.assignment.slice(0, 2)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--pz-text-faint)', fontSize: '9px' }}>-</span>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--pz-border)', flexWrap: 'wrap', justifyContent: 'center' }}>
            {Object.entries(ASSIGN_CONFIG).map(([key, cfg]) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: cfg.bg, color: cfg.text, border: '1px solid ' + cfg.border }}>
                {cfg.short} {cfg.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
