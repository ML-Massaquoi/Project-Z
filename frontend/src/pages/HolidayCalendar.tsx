import { useMemo, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { holidaysAPI, departmentsAPI } from '@/api/client'
import { extractErrorMessage } from '@/lib/utils'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Calendar,
  CalendarDays,
  List,
  Plus,
  Edit3,
  Trash2,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Globe,
  Building2,
  Users,
  Download,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

type HolidayType = 'public' | 'organizational' | 'departmental'
type HolidayScope = 'all' | 'office' | 'department'

interface Holiday {
  id: string
  name: string
  date: string
  type: HolidayType
  scope: HolidayScope
  office_id: string | null
  office_name: string | null
  department_id: string | null
  department_name: string | null
  is_recurring: boolean
  description: string | null
  created_at: string
}

type ViewMode = 'table' | 'calendar' | 'year'

type FormData = {
  name: string
  date: string
  type: HolidayType
  scope: HolidayScope
  office_id: string
  department_id: string
  is_recurring: boolean
  description: string
}

function defaultForm(): FormData {
  return {
    name: '',
    date: '',
    type: 'public',
    scope: 'all',
    office_id: '',
    department_id: '',
    is_recurring: false,
    description: '',
  }
}

const TYPE_STYLES: Record<HolidayType, string> = {
  public: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  organizational: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  departmental: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

const TYPE_LABELS: Record<HolidayType, string> = {
  public: 'Public',
  organizational: 'Organizational',
  departmental: 'Departmental',
}

const SCOPE_LABELS: Record<HolidayScope, string> = {
  all: 'All',
  office: 'Office',
  department: 'Department',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PUBLIC_HOLIDAY_COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'KE', name: 'Kenya' },
  { code: 'IN', name: 'India' },
]

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '24px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  headerActions: { display: 'flex', alignItems: 'center', gap: '12px' },
  card: { background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', boxShadow: 'var(--pz-shadow-sm)' },
  skeletonGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' },
}

export default function HolidayCalendar() {
  const queryClient = useQueryClient()
  const today = useMemo(() => new Date(), [])
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [modalOpen, setModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(() => defaultForm())
  const [searchTerm, setSearchTerm] = useState('')

  const [filterYear, setFilterYear] = useState(today.getFullYear())
  const [filterMonth, setFilterMonth] = useState<number | null>(null)
  const [filterType, setFilterType] = useState<HolidayType | ''>('')
  const [filterScope, setFilterScope] = useState<HolidayScope | ''>('')

  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [calYear, setCalYear] = useState(today.getFullYear())

  const { data: holidaysData, isLoading } = useQuery({
    queryKey: ['holidays', { year: filterYear, month: filterMonth, type: filterType, scope: filterScope }],
    queryFn: () => holidaysAPI.list({ year: filterYear, month: filterMonth || undefined, type: filterType || undefined, scope: filterScope || undefined }),
    select: (d) => d.data?.items || d.data || [],
  })

  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsAPI.list(),
    select: (d) => d.data || [],
  })

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => holidaysAPI.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['holidays'] }); setModalOpen(false); toast.success('Holiday created') },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => holidaysAPI.update(id as string, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['holidays'] }); setModalOpen(false); toast.success('Holiday updated') },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => holidaysAPI.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['holidays'] }); setDeleteId(null); toast.success('Holiday removed') },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const importMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => holidaysAPI.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['holidays'] }); toast.success('Holidays imported') },
    onError: (err) => toast.error(extractErrorMessage(err)),
  })

  const holidays: Holiday[] = holidaysData || []
  const departments: { id: string; name: string }[] = deptsData || []

  const filteredHolidays = useMemo(() => {
    if (!searchTerm.trim()) return holidays
    const q = searchTerm.toLowerCase()
    return holidays.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.date.includes(q) ||
        h.type.toLowerCase().includes(q)
    )
  }, [holidays, searchTerm])

  const openCreate = useCallback(() => {
    setForm(defaultForm())
    setEditId(null)
    setModalOpen(true)
  }, [])

  const openEdit = useCallback((holiday: Holiday) => {
    setEditId(holiday.id)
    setForm({
      name: holiday.name,
      date: holiday.date.slice(0, 10),
      type: holiday.type,
      scope: holiday.scope,
      office_id: holiday.office_id || '',
      department_id: holiday.department_id || '',
      is_recurring: holiday.is_recurring,
      description: holiday.description || '',
    })
    setModalOpen(true)
  }, [])

  const handleSubmit = useCallback(() => {
    if (!form.name.trim() || !form.date) {
      toast.error('Name and date are required')
      return
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      date: form.date,
      type: form.type,
      scope: form.scope,
      is_recurring: form.is_recurring,
      description: form.description.trim() || null,
    }
    if (form.scope === 'office') {
      payload.office_id = form.office_id || null
    } else if (form.scope === 'department') {
      payload.department_id = form.department_id || null
    }
    if (editId) updateMut.mutate({ id: editId, ...payload })
    else createMut.mutate(payload)
  }, [form, editId, createMut, updateMut])

  const handleImportCountry = useCallback((countryCode: string) => {
    importMut.mutate({ action: 'import_public', country: countryCode, year: filterYear })
    setImportOpen(false)
  }, [filterYear, importMut])

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Holiday Calendar</h1>
          <p style={s.headerSubtitle}>Manage public, organizational, and departmental holidays</p>
        </div>
        <div style={s.headerActions}>
          <button
            onClick={() => setImportOpen(true)}
            style={{ padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Download size={15} />
            Import Public
          </button>
          <button
            onClick={openCreate}
            style={{ padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-accent)', border: 'none', fontSize: '14px', fontWeight: 600, color: '#fff', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={15} />
            Add Holiday
          </button>
        </div>
      </div>

      {/* View Toggle & Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '4px', padding: '3px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
          {([
            { mode: 'table' as ViewMode, icon: List, label: 'Table' },
            { mode: 'calendar' as ViewMode, icon: CalendarDays, label: 'Calendar' },
            { mode: 'year' as ViewMode, icon: Calendar, label: 'Year' },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                ...(viewMode === mode
                  ? { background: 'var(--pz-surface-1)', color: 'var(--pz-text)', boxShadow: 'var(--pz-shadow-sm)' }
                  : { background: 'transparent', color: 'var(--pz-text-muted)' }),
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--pz-text-muted)', pointerEvents: 'none' }} />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search holidays..."
              style={{ width: '200px', padding: '8px 12px 8px 32px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '13px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <select
            value={filterYear}
            onChange={(e) => setFilterYear(parseInt(e.target.value))}
            style={{ padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '13px', color: 'var(--pz-text)', outline: 'none' }}
          >
            {Array.from({ length: 10 }, (_, i) => today.getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select
            value={filterMonth ?? ''}
            onChange={(e) => setFilterMonth(e.target.value ? parseInt(e.target.value) : null)}
            style={{ padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '13px', color: 'var(--pz-text)', outline: 'none' }}
          >
            <option value="">All Months</option>
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as HolidayType | '')}
            style={{ padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '13px', color: 'var(--pz-text)', outline: 'none' }}
          >
            <option value="">All Types</option>
            <option value="public">Public</option>
            <option value="organizational">Organizational</option>
            <option value="departmental">Departmental</option>
          </select>

          <select
            value={filterScope}
            onChange={(e) => setFilterScope(e.target.value as HolidayScope | '')}
            style={{ padding: '8px 12px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '13px', color: 'var(--pz-text)', outline: 'none' }}
          >
            <option value="">All Scopes</option>
            <option value="all">All</option>
            <option value="office">Office</option>
            <option value="department">Department</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div style={s.skeletonGrid}>
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filteredHolidays.length === 0 && viewMode === 'table' ? (
        <div style={{ ...s.card, padding: '48px' }}>
          <EmptyState
            icon={<CalendarDays size={28} />}
            title="No holidays found"
            description={searchTerm ? 'Try a different search term' : 'Add your first holiday or import from a public list'}
            action={
              <div className="flex gap-3">
                <button
                  onClick={() => setImportOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-sm font-semibold text-[var(--pz-text-secondary)] transition-colors flex items-center gap-2"
                >
                  <Download size={15} />
                  Import Public
                </button>
                <button
                  onClick={openCreate}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  <Plus size={15} />
                  Add Holiday
                </button>
              </div>
            }
          />
        </div>
      ) : viewMode === 'table' ? (
        <TableView holidays={filteredHolidays} onEdit={openEdit} onDelete={setDeleteId} />
      ) : viewMode === 'calendar' ? (
        <CalendarView
          holidays={holidays}
          calMonth={calMonth}
          calYear={calYear}
          onPrevMonth={() => { setCalMonth((m) => { if (m === 0) { setCalYear((y) => y - 1); return 11 }; return m - 1 }) }}
          onNextMonth={() => { setCalMonth((m) => { if (m === 11) { setCalYear((y) => y + 1); return 0 }; return m + 1 }) }}
        />
      ) : (
        <YearView holidays={holidays} year={filterYear} />
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Edit Holiday' : 'Create Holiday'}
        description="Define a holiday for attendance and scheduling"
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
              onClick={handleSubmit}
              disabled={createMut.isPending || updateMut.isPending}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--pz-accent), rgba(37,99,235,0.8))', color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: createMut.isPending || updateMut.isPending ? 0.5 : 1, transition: 'all 0.15s' }}
            >
              {createMut.isPending || updateMut.isPending ? 'Saving...' : editId ? 'Update Holiday' : 'Create Holiday'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CalendarDays size={15} color="#3B82F6" />
              </div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Holiday Details</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Holiday Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. New Year's Day"
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Type</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(['public', 'organizational', 'departmental'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setForm((f) => ({ ...f, type: t }))}
                        style={{
                          flex: 1,
                          padding: '8px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          ...(form.type === t
                            ? t === 'public' ? { background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff', boxShadow: '0 1px 3px rgba(37,99,235,0.3)' }
                              : t === 'organizational' ? { background: 'linear-gradient(135deg, #9333EA, #7E22CE)', color: '#fff', boxShadow: '0 1px 3px rgba(147,51,234,0.3)' }
                                : { background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#fff', boxShadow: '0 1px 3px rgba(245,158,11,0.3)' }
                            : { background: 'var(--pz-surface-1)', color: 'var(--pz-text-muted)', border: '1px solid var(--pz-border)' }),
                        }}
                      >
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Scope</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(['all', 'office', 'department'] as const).map((sc) => (
                      <button
                        key={sc}
                        onClick={() => setForm((f) => ({ ...f, scope: sc, office_id: '', department_id: '' }))}
                        style={{
                          flex: 1,
                          padding: '8px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          ...(form.scope === sc
                            ? { background: 'linear-gradient(135deg, #6366F1, #4F46E5)', color: '#fff', boxShadow: '0 1px 3px rgba(99,102,241,0.3)' }
                            : { background: 'var(--pz-surface-1)', color: 'var(--pz-text-muted)', border: '1px solid var(--pz-border)' }),
                        }}
                      >
                        {SCOPE_LABELS[sc]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {form.scope === 'department' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Department</label>
                  <select
                    value={form.department_id}
                    onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                    style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="">Select department...</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.scope === 'office' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Office</label>
                  <select
                    value={form.office_id}
                    onChange={(e) => setForm((f) => ({ ...f, office_id: e.target.value }))}
                    style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="">Select office...</option>
                    <option value="office_1">Main Office</option>
                    <option value="office_2">Branch Office</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="is_recurring"
                  checked={form.is_recurring}
                  onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--pz-accent)' }}
                />
                <label htmlFor="is_recurring" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', cursor: 'pointer' }}>
                  Recurring annually
                </label>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '6px', display: 'block' }}>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Optional description..."
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
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
        title="Remove Holiday"
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
          This will permanently delete this holiday. This action cannot be undone.
        </p>
      </Modal>

      {/* Import Public Holidays Modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Public Holidays"
        description="Select a country to import known public holidays"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button
              onClick={() => setImportOpen(false)}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              Cancel
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
          {PUBLIC_HOLIDAY_COUNTRIES.map((country) => (
            <button
              key={country.code}
              onClick={() => handleImportCountry(country.code)}
              disabled={importMut.isPending}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'var(--pz-surface-2)',
                border: '1px solid var(--pz-border)',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--pz-text)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                opacity: importMut.isPending ? 0.5 : 1,
              }}
              className="hover:bg-[var(--pz-surface-3)]"
            >
              <Globe size={16} style={{ color: 'var(--pz-accent)', flexShrink: 0 }} />
              <span>{country.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--pz-text-muted)' }}>{country.code}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}

/* ── Table View ────────────────────────────────────────── */

function TableView({
  holidays,
  onEdit,
  onDelete,
}: {
  holidays: Holiday[]
  onEdit: (h: Holiday) => void
  onDelete: (id: string) => void
}) {
  return (
    <div style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', boxShadow: 'var(--pz-shadow-sm)', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--pz-surface-2)' }}>
              {['Date', 'Name', 'Type', 'Scope', 'Department', 'Recurring', 'Actions'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--pz-text-muted)',
                    borderBottom: '1px solid var(--pz-border)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holidays.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--pz-text-muted)', fontSize: '13px' }}>
                  No holidays match your filters
                </td>
              </tr>
            ) : (
              holidays.map((holiday, i) => (
                <motion.tr
                  key={holiday.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  style={{
                    borderBottom: '1px solid var(--pz-border)',
                    transition: 'background 0.1s',
                  }}
                  className="hover:bg-[var(--pz-surface-2)]"
                >
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--pz-text)', whiteSpace: 'nowrap' }}>
                    {new Date(holiday.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text)' }}>
                    {holiday.name}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge className={cn(TYPE_STYLES[holiday.type])} size="sm">
                      {TYPE_LABELS[holiday.type]}
                    </Badge>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge
                      status={holiday.scope === 'all' ? 'success' : holiday.scope === 'office' ? 'info' : 'warning'}
                      size="xs"
                    >
                      {SCOPE_LABELS[holiday.scope]}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--pz-text-secondary)' }}>
                    {holiday.scope === 'department' ? (holiday.department_name || '—') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {holiday.is_recurring ? (
                      <Badge variant="info" size="sm">Recurring</Badge>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => onEdit(holiday)}
                        className="p-1.5 rounded-lg hover:bg-[var(--pz-surface-2)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] transition-colors"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(holiday.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--pz-text-muted)] hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--pz-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>
          {holidays.length} holiday{holidays.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

/* ── Calendar View ─────────────────────────────────────── */

function CalendarView({
  holidays,
  calMonth,
  calYear,
  onPrevMonth,
  onNextMonth,
}: {
  holidays: Holiday[]
  calMonth: number
  calYear: number
  onPrevMonth: () => void
  onNextMonth: () => void
}) {
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1)
    const lastDay = new Date(calYear, calMonth + 1, 0)
    const startOffset = firstDay.getDay()
    const daysInMonth = lastDay.getDate()
    const days: (number | null)[] = []
    for (let i = 0; i < startOffset; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    return days
  }, [calMonth, calYear])

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>()
    holidays.forEach((h) => {
      const dateObj = new Date(h.date + 'T00:00:00')
      if (dateObj.getMonth() === calMonth && dateObj.getFullYear() === calYear) {
        const key = String(dateObj.getDate())
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(h)
      }
    })
    return map
  }, [holidays, calMonth, calYear])

  const monthHolidays = useMemo(() => {
    return holidays.filter((h) => {
      const d = new Date(h.date + 'T00:00:00')
      return d.getMonth() === calMonth && d.getFullYear() === calYear
    })
  }, [holidays, calMonth, calYear])

  return (
    <div style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', boxShadow: 'var(--pz-shadow-sm)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--pz-border)' }}>
        <button
          onClick={onPrevMonth}
          style={{ padding: '8px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--pz-text-secondary)' }}
        >
          <ChevronLeft size={16} />
        </button>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>
          {MONTH_NAMES[calMonth]} {calYear}
        </h2>
        <button
          onClick={onNextMonth}
          style={{ padding: '8px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--pz-text-secondary)' }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {WEEKDAY_NAMES.map((day) => (
            <div
              key={day}
              style={{
                padding: '10px 8px',
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--pz-text-muted)',
                borderBottom: '1px solid var(--pz-border)',
                background: 'var(--pz-surface-2)',
              }}
            >
              {day}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {calendarDays.map((day, idx) => {
            const dayHolidays = day ? holidaysByDate.get(String(day)) : undefined
            return (
              <div
                key={idx}
                style={{
                  minHeight: '90px',
                  padding: '6px',
                  borderRight: (idx + 1) % 7 === 0 ? 'none' : '1px solid var(--pz-border)',
                  borderBottom: '1px solid var(--pz-border)',
                  background: day ? 'var(--pz-surface-1)' : 'var(--pz-surface-2)',
                }}
              >
                {day && (
                  <>
                    <span
                      style={{
                        display: 'inline-flex',
                        width: '24px',
                        height: '24px',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        fontSize: '12px',
                        fontWeight: dayHolidays ? 700 : 500,
                        color: dayHolidays ? 'var(--pz-accent)' : 'var(--pz-text)',
                        marginBottom: '4px',
                        ...(dayHolidays ? { background: 'rgba(37,99,235,0.12)' } : {}),
                      }}
                    >
                      {day}
                    </span>
                    {dayHolidays && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {dayHolidays.slice(0, 3).map((h) => (
                          <span
                            key={h.id}
                            style={{
                              padding: '1px 4px',
                              borderRadius: '4px',
                              fontSize: '9px',
                              fontWeight: 600,
                              lineHeight: '1.4',
                              ...(h.type === 'public'
                                ? { background: 'rgba(37,99,235,0.12)', color: '#60A5FA' }
                                : h.type === 'organizational'
                                ? { background: 'rgba(147,51,234,0.12)', color: '#A78BFA' }
                                : { background: 'rgba(245,158,11,0.12)', color: '#FBBF24' }),
                            }}
                          >
                            {h.name}
                          </span>
                        ))}
                        {dayHolidays.length > 3 && (
                          <span style={{ fontSize: '9px', color: 'var(--pz-text-muted)', paddingLeft: '4px' }}>
                            +{dayHolidays.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {monthHolidays.length > 0 && (
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--pz-border)', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginRight: '8px', alignSelf: 'center' }}>Holidays:</span>
          {monthHolidays.map((h) => (
            <Badge key={h.id} className={cn(TYPE_STYLES[h.type])} size="sm">
              {new Date(h.date + 'T00:00:00').getDate()} {MONTH_NAMES[calMonth].slice(0, 3)} — {h.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Year View ─────────────────────────────────────────── */

function YearView({ holidays, year }: { holidays: Holiday[]; year: number }) {
  const holidaysByMonth = useMemo(() => {
    const map: { month: number; holidays: Holiday[] }[] = []
    for (let m = 0; m < 12; m++) {
      map.push({
        month: m,
        holidays: holidays.filter((h) => {
          const d = new Date(h.date + 'T00:00:00')
          return d.getMonth() === m && d.getFullYear() === year
        }),
      })
    }
    return map
  }, [holidays, year])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
      {holidaysByMonth.map(({ month, holidays: monthHolidays }) => (
        <motion.div
          key={month}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: month * 0.02 }}
          style={{
            background: 'var(--pz-surface-1)',
            border: '1px solid var(--pz-border)',
            borderRadius: '10px',
            boxShadow: 'var(--pz-shadow-sm)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--pz-border)',
              background: 'var(--pz-surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)' }}>
              {MONTH_NAMES[month]}
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--pz-text-muted)', fontWeight: 600 }}>
              {monthHolidays.length} holiday{monthHolidays.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ padding: '12px 16px', minHeight: '60px' }}>
            {monthHolidays.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0 }}>No holidays</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {monthHolidays.map((h) => {
                  const day = new Date(h.date + 'T00:00:00').getDate()
                  return (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          flexShrink: 0,
                          background: 'var(--pz-surface-2)',
                          color: 'var(--pz-text)',
                          border: '1px solid var(--pz-border)',
                        }}
                      >
                        {day}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--pz-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {h.name}
                        </p>
                      </div>
                      <Badge className={cn(TYPE_STYLES[h.type])} size="sm">
                        {TYPE_LABELS[h.type]}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
