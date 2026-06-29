import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, UserCheck, Trash2, Download, UserPlus, Search } from 'lucide-react'
import { devicesAPI, employeesAPI, departmentsAPI, shiftTemplatesAPI } from '@/api/client'
import { format } from 'date-fns'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table/DataTable'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { KPICard } from '@/components/ui/KPICard'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface UnrecognizedUser {
  id: string
  user_id_on_device: string
  device_serial: string
  device_name?: string
  scan_count: number
  last_seen: string
  first_seen: string
  status: string
  [key: string]: unknown
}

const columns: ColumnDef<UnrecognizedUser, unknown>[] = [
  {
    accessorKey: 'user_id_on_device',
    header: 'Unknown User ID',
    cell: ({ getValue }) => (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <AlertCircle size={12} className="text-amber-400" />
        </div>
        <span className="text-gray-200 font-mono font-semibold">{getValue() as string}</span>
      </div>
    ),
    size: 200,
  },
  {
    accessorKey: 'device_name',
    header: 'Device',
    cell: ({ row }) => (
      <span className="text-gray-400">{row.original.device_name || row.original.device_serial}</span>
    ),
  },
  {
    accessorKey: 'scan_count',
    header: 'Scans',
    cell: ({ getValue }) => (
      <span className={`font-mono font-bold tabular-nums ${(getValue() as number) > 5 ? 'text-amber-400' : 'text-gray-400'}`}>
        {getValue() as number}
      </span>
    ),
    size: 80,
  },
  {
    accessorKey: 'first_seen',
    header: 'First Seen',
    cell: ({ getValue }) => (
      <span className="text-gray-500 text-xs font-mono tabular-nums">
        {format(new Date(getValue() as string), 'MMM d, HH:mm')}
      </span>
    ),
    size: 130,
  },
  {
    accessorKey: 'last_seen',
    header: 'Last Seen',
    cell: ({ getValue }) => (
      <span className="text-gray-400 text-xs font-mono tabular-nums">
        {format(new Date(getValue() as string), 'MMM d, HH:mm')}
      </span>
    ),
    size: 130,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as string
      return <StatusBadge status={s === 'resolved' ? 'success' : 'warning'} size="xs" dot={false}>{s}</StatusBadge>
    },
    size: 110,
  },
]

export default function UnrecognizedUsers() {
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [selectedUser, setSelectedUser] = useState<UnrecognizedUser | null>(null)
  const [showLinkModal, setShowLinkModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['unrecognized-users'],
    queryFn: async () => (await devicesAPI.getUnrecognizedUsers()).data,
    refetchInterval: 60000,
  })

  const users: UnrecognizedUser[] = data?.items ?? []
  const pendingCount = users.filter(u => u.status !== 'resolved').length
  const totalScans = users.reduce((acc, u) => acc + (u.scan_count || 0), 0)

  const resolveMutation = useMutation({
    mutationFn: ({ employeeId }: { employeeId: string }) =>
      devicesAPI.mapToExisting(selectedUser?.device_serial || '', selectedUser?.user_id_on_device || '', employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unrecognized-users'] })
      queryClient.invalidateQueries({ queryKey: ['device-users'] })
      toast.success('User resolved and linked to employee')
      setShowLinkModal(false)
      setSelectedUser(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to resolve'),
  })

  const resolveNewMutation = useMutation({
    mutationFn: async ({ full_name, employee_code, department_id, shift_template_id, position }: {
      full_name: string
      employee_code: string
      department_id: string
      shift_template_id?: string
      position?: string
    }) => {
      // Step 1: Create the employee
      const empRes = await employeesAPI.create({
        full_name,
        employee_code,
        department_id,
        shift_template_id: shift_template_id || undefined,
        position: position || undefined,
        status: 'active',
      })
      const newEmployeeId = empRes.data.id

      // Step 2: Link device user to new employee
      await devicesAPI.mapToExisting(
        selectedUser?.device_serial || '',
        selectedUser?.user_id_on_device || '',
        newEmployeeId
      )

      return newEmployeeId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unrecognized-users'] })
      queryClient.invalidateQueries({ queryKey: ['device-users'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Employee created and linked to device')
      setShowLinkModal(false)
      setSelectedUser(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create employee'),
  })

  const dismissMutation = useMutation({
    mutationFn: (userId: string) => devicesAPI.dismissUnrecognized(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unrecognized-users'] })
      toast.success('Unrecognized user dismissed')
      setSelectedUser(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to dismiss'),
  })

  const filtered = useMemo(() => {
    if (!searchValue.trim()) return users
    const q = searchValue.toLowerCase()
    return users.filter(u =>
      u.user_id_on_device.toLowerCase().includes(q) ||
      (u.device_name?.toLowerCase().includes(q)) ||
      u.device_serial.toLowerCase().includes(q)
    )
  }, [users, searchValue])

  return (
    <div className="space-y-5 pz-slide-up">
      <PageHeader
        title="Unrecognized Users"
        subtitle="Identity resolution center — resolve unknown biometric scans"
        breadcrumbs={[{ label: 'Infrastructure' }, { label: 'Unrecognized Users' }]}
        badge={
          pendingCount > 0 ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/20">
              {pendingCount} pending
            </span>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KPICard icon={AlertCircle} label="Total Unrecognized" value={users.length} color="#F59E0B" loading={isLoading} />
        <KPICard icon={AlertCircle} label="Pending Resolution" value={pendingCount} color="#EF4444" loading={isLoading} />
        <KPICard icon={AlertCircle} label="Total Scans" value={totalScans} color="#6366F1" loading={isLoading} />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        loading={isLoading}
        onRowClick={(u) => setSelectedUser(u)}
        toolbar={
          <FilterBar
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="Search by user ID, device..."
            actions={
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-xs font-semibold text-gray-300 transition-all">
                <Download size={14} />
                Export
              </button>
            }
          />
        }
      />

      <DetailDrawer
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title={`Unknown: ${selectedUser?.user_id_on_device || ''}`}
        subtitle={selectedUser?.device_name || selectedUser?.device_serial}
        width={680}
      >
        {selectedUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Status header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
              <div style={{ padding: '14px', borderRadius: '6px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', flexShrink: 0 }}>
                <AlertCircle size={24} style={{ color: '#F59E0B' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <StatusBadge status={selectedUser.status === 'resolved' ? 'success' : 'warning'} size="md">
                  {selectedUser.status}
                </StatusBadge>
                <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{selectedUser.scan_count} scan(s) recorded</span>
              </div>
            </div>

            {/* Details table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Details</h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  ['User ID on Device', selectedUser.user_id_on_device],
                  ['Device', selectedUser.device_name || selectedUser.device_serial],
                  ['Scan Count', String(selectedUser.scan_count)],
                  ['First Seen', format(new Date(selectedUser.first_seen), 'MMM d, yyyy HH:mm')],
                  ['Last Seen', format(new Date(selectedUser.last_seen), 'MMM d, yyyy HH:mm')],
                  ['Status', selectedUser.status],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '44px', paddingInline: '14px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--pz-border)' }}>
              <Button variant="default" size="md" style={{ flex: 1 }} onClick={() => setShowLinkModal(true)}>
                <UserCheck size={15} /> Link to Employee
              </Button>
              <Button variant="destructive" size="md"
                disabled={dismissMutation.isPending}
                loading={dismissMutation.isPending}
                onClick={() => dismissMutation.mutate(selectedUser.id)}>
                <Trash2 size={15} />
              </Button>
            </div>

          </div>
        )}
      </DetailDrawer>

      {/* ── Link Employee Modal ────────────────────────────── */}
      {showLinkModal && selectedUser && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setShowLinkModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              width: '100%', maxWidth: '640px',
              background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)',
              boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden',
              maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '28px 32px 20px 32px', borderBottom: '1px solid var(--pz-border)', flexShrink: 0 }}>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Resolve Unknown User</h3>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>
                User ID <strong style={{ color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{selectedUser.user_id_on_device}</strong> from{' '}
                <strong style={{ color: 'var(--pz-text-secondary)' }}>{selectedUser.device_name || selectedUser.device_serial}</strong>
              </p>
            </div>
            <div style={{ padding: '28px 32px 32px 32px', overflowY: 'auto', flex: 1 }}>
              <ResolveForm
                onResolve={(employeeId) => resolveMutation.mutate({ employeeId })}
                onResolveNew={(data) => resolveNewMutation.mutate(data)}
                onCancel={() => setShowLinkModal(false)}
                isPending={resolveMutation.isPending || resolveNewMutation.isPending}
                deviceUserId={selectedUser.user_id_on_device}
              />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function ResolveForm({
  onResolve,
  onResolveNew,
  onCancel,
  isPending,
  deviceUserId,
}: {
  onResolve: (employeeId: string) => void
  onResolveNew: (data: { full_name: string; employee_code: string; department_id: string; shift_template_id?: string; position?: string }) => void
  onCancel: () => void
  isPending: boolean
  deviceUserId: string
}) {
  const [mode, setMode] = useState<'search' | 'create'>('search')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [search, setSearch] = useState('')

  // ── Create mode state ─────────────────────────────────────
  const [form, setForm] = useState({
    full_name: '',
    employee_code: '',
    department_id: '',
    shift_template_id: '',
    position: '',
  })

  const { data: empData } = useQuery({
    queryKey: ['employees-resolve-search', search],
    queryFn: async () => (await employeesAPI.list({ search, per_page: 50 })).data,
    enabled: mode === 'search',
  })

  const { data: deptData } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => (await departmentsAPI.list()).data,
    enabled: mode === 'create',
  })

  const { data: templateData } = useQuery({
    queryKey: ['shift-templates-list'],
    queryFn: async () => (await shiftTemplatesAPI.list()).data,
    enabled: mode === 'create',
  })

  const employees = empData?.items ?? []
  const departments = Array.isArray(deptData) ? deptData : deptData?.items ?? []
  const templates = Array.isArray(templateData) ? templateData : templateData?.items ?? []

  return (
    <div className="space-y-4">
      {/* ── Mode Tabs ──────────────────────────────────────── */}
      <div className="flex rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] p-0.5">
        <button
          onClick={() => setMode('search')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold transition-all ${
            mode === 'search'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Search size={13} />
          Link Existing
        </button>
        <button
          onClick={() => setMode('create')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold transition-all ${
            mode === 'create'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <UserPlus size={13} />
          Create New
        </button>
      </div>

      {/* ── Search Existing Employee ───────────────────────── */}
      {mode === 'search' && (
        <>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Search Employee</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or code..."
              className="pz-input w-full"
              style={{ height: '44px', fontSize: '14px' }}
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {employees.map((emp: any) => (
              <button
                key={emp.id}
                onClick={() => setSelectedEmployeeId(emp.id)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${
                  selectedEmployeeId === emp.id
                    ? 'bg-blue-600/20 border border-blue-500/30'
                    : 'hover:bg-[var(--pz-surface-2)] border border-transparent'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 flex items-center justify-center text-[10px] font-bold text-blue-400 border border-blue-500/20 flex-shrink-0">
                  {emp.full_name?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-200 truncate">{emp.full_name}</p>
                  <p className="text-[10px] text-gray-500 font-mono">{emp.employee_code}</p>
                </div>
                {emp.department_name && (
                  <span className="text-[9px] text-gray-500 bg-[var(--pz-surface)] px-1.5 py-0.5 rounded border border-[var(--pz-border)]">
                    {emp.department_name}
                  </span>
                )}
              </button>
            ))}
            {!employees.length && search && (
              <div className="text-center py-4">
                <p className="text-xs text-gray-500">No employees found</p>
                <button
                  onClick={() => setMode('create')}
                  className="text-[10px] text-blue-400 hover:text-blue-300 mt-1"
                >
                  Create a new employee →
                </button>
              </div>
            )}
            {!employees.length && !search && (
              <p className="text-xs text-gray-500 text-center py-4">Type to search employees</p>
            )}
          </div>
        </>
      )}

      {/* ── Create New Employee ────────────────────────────── */}
      {mode === 'create' && (
        <>
          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-[10px] text-blue-300">
              Creating a new employee will automatically link device user <span className="font-mono font-bold">{deviceUserId}</span>
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
                Full Name <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
              </label>
              <input
                value={form.full_name}
                onChange={(e) => setForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="John Doe"
                className="pz-input w-full"
                style={{ height: '44px', fontSize: '14px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
                Employee Code <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
              </label>
              <input
                value={form.employee_code}
                onChange={(e) => setForm(p => ({ ...p, employee_code: e.target.value }))}
                placeholder="EMP001"
                className="pz-input w-full"
                style={{ height: '44px', fontSize: '14px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Department <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <select
              value={form.department_id}
              onChange={(e) => setForm(p => ({ ...p, department_id: e.target.value }))}
              className="pz-input w-full"
              style={{ height: '44px', fontSize: '14px' }}
            >
              <option value="">Select department</option>
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Shift Template
            </label>
            <select
              value={form.shift_template_id}
              onChange={(e) => setForm(p => ({ ...p, shift_template_id: e.target.value }))}
              className="pz-input w-full"
              style={{ height: '44px', fontSize: '14px' }}
            >
              <option value="">No shift assigned</option>
              {templates.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name} ({t.start_time} - {t.end_time})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Position
            </label>
            <input
              value={form.position}
              onChange={(e) => setForm(p => ({ ...p, position: e.target.value }))}
              placeholder="e.g. Security Officer"
              className="pz-input w-full"
              style={{ height: '44px', fontSize: '14px' }}
            />
          </div>
        </>
      )}

      {/* ── Actions ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        {mode === 'search' ? (
          <Button variant="default" size="md" loading={isPending} disabled={!selectedEmployeeId || isPending} onClick={() => onResolve(selectedEmployeeId)}>
            {isPending ? 'Linking...' : 'Link & Resolve'}
          </Button>
        ) : (
          <Button variant="success" size="md" loading={isPending} disabled={!form.full_name || !form.employee_code || !form.department_id || isPending} onClick={() => onResolveNew(form)}>
            <UserPlus size={14} />
            {isPending ? 'Creating...' : 'Create & Link'}
          </Button>
        )}
      </div>
    </div>
  )
}
