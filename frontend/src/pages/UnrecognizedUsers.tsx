import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, UserCheck, Trash2, Download, UserPlus, Search } from 'lucide-react'
import { devicesAPI, employeesAPI, departmentsAPI, shiftTemplatesAPI } from '@/api/client'
import { format } from 'date-fns'
import { Modal } from '@/components/ui/Modal'
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
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AlertCircle size={12} style={{ color: 'var(--pz-warning-500)' }} />
        </div>
        <span style={{ color: 'var(--pz-text)', fontFamily: 'monospace', fontWeight: 600 }}>{getValue() as string}</span>
      </div>
    ),
    size: 200,
  },
  {
    accessorKey: 'device_name',
    header: 'Device',
    cell: ({ row }) => (
      <span style={{ color: 'var(--pz-text-secondary)' }}>{row.original.device_name || row.original.device_serial}</span>
    ),
  },
  {
    accessorKey: 'scan_count',
    header: 'Scans',
    cell: ({ getValue }) => (
      <span className="font-mono font-bold tabular-nums" style={{ color: (getValue() as number) > 5 ? 'var(--pz-warning-500)' : 'var(--pz-text-secondary)' }}>
        {getValue() as number}
      </span>
    ),
    size: 80,
  },
  {
    accessorKey: 'first_seen',
    header: 'First Seen',
    cell: ({ getValue }) => (
      <span style={{ color: 'var(--pz-text-muted)', fontSize: '12px', fontFamily: 'monospace' }} className="tabular-nums">
        {format(new Date(getValue() as string), 'MMM d, HH:mm')}
      </span>
    ),
    size: 130,
  },
  {
    accessorKey: 'last_seen',
    header: 'Last Seen',
    cell: ({ getValue }) => (
      <span style={{ color: 'var(--pz-text-secondary)', fontSize: '12px', fontFamily: 'monospace' }} className="tabular-nums">
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

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '28px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  headerBadge: { marginLeft: '12px', padding: '3px 10px', borderRadius: '9999px', background: 'rgba(245,158,11,0.2)', color: 'var(--pz-warning-500)', fontSize: '10px', fontWeight: 700, border: '1px solid rgba(245,158,11,0.2)' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
}

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
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={s.headerTitle}>Unrecognized Users</h1>
            {pendingCount > 0 && (
              <span style={s.headerBadge}>{pendingCount} pending</span>
            )}
          </div>
          <p style={s.headerSubtitle}>Identity resolution center — resolve unknown biometric scans</p>
        </div>
      </div>

      <div style={s.cards}>
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
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-xs font-semibold transition-all" style={{ color: 'var(--pz-text-secondary)' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
              <div style={{ padding: '18px', borderRadius: '10px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', flexShrink: 0 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '10px', background: 'rgba(245,158,11,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertCircle size={14} style={{ color: '#F59E0B' }} />
                </div>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Details</h4>
              </div>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' }}>
                {[
                  ['User ID on Device', selectedUser.user_id_on_device],
                  ['Device', selectedUser.device_name || selectedUser.device_serial],
                  ['Scan Count', String(selectedUser.scan_count)],
                  ['First Seen', format(new Date(selectedUser.first_seen), 'MMM d, yyyy HH:mm')],
                  ['Last Seen', format(new Date(selectedUser.last_seen), 'MMM d, yyyy HH:mm')],
                  ['Status', selectedUser.status],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '52px', paddingInline: '16px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)' }}>
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
      <Modal
        open={showLinkModal && !!selectedUser}
        onClose={() => setShowLinkModal(false)}
        title="Resolve Unknown User"
        description={selectedUser ? `User ID ${selectedUser.user_id_on_device} from ${selectedUser.device_name || selectedUser.device_serial}` : ''}
        size="md"
      >
        {selectedUser && (
          <ResolveForm
            onResolve={(employeeId) => resolveMutation.mutate({ employeeId })}
            onResolveNew={(data) => resolveNewMutation.mutate(data)}
            onCancel={() => setShowLinkModal(false)}
            isPending={resolveMutation.isPending || resolveNewMutation.isPending}
            deviceUserId={selectedUser.user_id_on_device}
          />
        )}
      </Modal>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Mode Tabs ──────────────────────────────────────── */}
      <div style={{ display: 'flex', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', padding: '2px' }}>
        <button
          onClick={() => setMode('search')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
            transition: 'all 0.15s', border: 'none', cursor: 'pointer',
            background: mode === 'search' ? '#2563EB' : 'transparent',
            color: mode === 'search' ? '#fff' : 'var(--pz-text-secondary)',
            boxShadow: mode === 'search' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <Search size={13} />
          Link Existing
        </button>
        <button
          onClick={() => setMode('create')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
            transition: 'all 0.15s', border: 'none', cursor: 'pointer',
            background: mode === 'create' ? '#2563EB' : 'transparent',
            color: mode === 'create' ? '#fff' : 'var(--pz-text-secondary)',
            boxShadow: mode === 'create' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <UserPlus size={13} />
          Create New
        </button>
      </div>

      {/* ── Search Existing Employee ───────────────────────── */}
      {mode === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Search Employee</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or code..."
              className="pz-input"
              style={{ height: '44px', fontSize: '14px', width: '100%' }}
            />
          </div>

          <div style={{ maxHeight: '192px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {employees.map((emp: any) => (
              <button
                key={emp.id}
                onClick={() => setSelectedEmployeeId(emp.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px', borderRadius: '8px', textAlign: 'left', cursor: 'pointer',
                  transition: 'all 0.15s', border: '1px solid',
                  background: selectedEmployeeId === emp.id ? 'rgba(37,99,235,0.2)' : 'transparent',
                  borderColor: selectedEmployeeId === emp.id ? 'rgba(59,130,246,0.3)' : 'transparent',
                }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(37,99,235,0.25), rgba(99,102,241,0.25))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--pz-accent)', border: '1px solid rgba(59,130,246,0.25)', flexShrink: 0 }}>
                  {emp.full_name?.[0] || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.full_name}</p>
                  <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', fontFamily: 'monospace' }}>{emp.employee_code}</p>
                </div>
                {emp.department_name && (
                  <span style={{ fontSize: '9px', color: 'var(--pz-text-muted)', background: 'var(--pz-surface)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--pz-border)', whiteSpace: 'nowrap' }}>
                    {emp.department_name}
                  </span>
                )}
              </button>
            ))}
            {!employees.length && search && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>No employees found</p>
                <button
                  onClick={() => setMode('create')}
                  style={{ fontSize: '10px', color: 'var(--pz-accent)', marginTop: '4px', cursor: 'pointer', background: 'none', border: 'none' }}
                >
                  Create a new employee →
                </button>
              </div>
            )}
            {!employees.length && !search && (
              <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', textAlign: 'center', padding: '16px 0' }}>Type to search employees</p>
            )}
          </div>
        </div>
      )}

      {/* ── Create New Employee ────────────────────────────── */}
      {mode === 'create' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--pz-border)' }}>
            <UserPlus size={14} style={{ color: 'var(--pz-accent)' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Employee Information</span>
          </div>

          <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)' }}>
            <p style={{ fontSize: '10px', color: 'var(--pz-accent)' }}>
              Creating a new employee will automatically link device user <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{deviceUserId}</span>
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
                className="pz-input"
                style={{ height: '44px', fontSize: '14px', width: '100%' }}
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
                className="pz-input"
                style={{ height: '44px', fontSize: '14px', width: '100%' }}
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
              className="pz-input"
              style={{ height: '44px', fontSize: '14px', width: '100%' }}
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
              className="pz-input"
              style={{ height: '44px', fontSize: '14px', width: '100%' }}
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
              className="pz-input"
              style={{ height: '44px', fontSize: '14px', width: '100%' }}
            />
          </div>
        </div>
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
