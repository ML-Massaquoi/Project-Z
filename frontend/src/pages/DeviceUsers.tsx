import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Fingerprint, Link2, Unlink2, Download, UserPlus, Search, Users } from 'lucide-react'
import { devicesAPI, employeesAPI, departmentsAPI, shiftTemplatesAPI } from '@/api/client'
import { format } from 'date-fns'
import { Modal } from '@/components/ui/Modal'
import { FilterBar } from '@/components/ui/FilterBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table/DataTable'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface DeviceUser {
  id: string
  user_id_on_device: string
  device_serial: string
  device_name?: string
  employee_id?: string
  employee_name?: string
  employee_code?: string
  is_linked: boolean
  created_at: string
  updated_at: string
  [key: string]: unknown
}

const columns: ColumnDef<DeviceUser, unknown>[] = [
  {
    accessorKey: 'user_id_on_device',
    header: 'Device User ID',
    cell: ({ getValue }) => <span style={{ color: 'var(--pz-text)', fontFamily: 'monospace', fontWeight: 600 }}>{getValue() as string}</span>,
    size: 140,
  },
  {
    accessorKey: 'device_name',
    header: 'Device',
    cell: ({ row }) => (
      <span style={{ color: 'var(--pz-text-muted)' }}>{row.original.device_name || row.original.device_serial || '—'}</span>
    ),
  },
  {
    accessorKey: 'employee_name',
    header: 'Linked Employee',
    cell: ({ row }) => {
      if (!row.original.employee_name) return <span style={{ color: 'var(--pz-text-muted)', fontStyle: 'italic', fontSize: '12px' }}>Not linked</span>
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--pz-accent)' }}>{row.original.employee_name[0]}</span>
          </div>
          <div>
            <p style={{ color: 'var(--pz-text)', fontWeight: 500, fontSize: '12px', margin: 0 }}>{row.original.employee_name}</p>
            <p style={{ fontSize: '9px', color: 'var(--pz-text-muted)', fontFamily: 'monospace', margin: 0 }}>{row.original.employee_code}</p>
          </div>
        </div>
      )
    },
    size: 220,
  },
  {
    accessorKey: 'is_linked',
    header: 'Status',
    cell: ({ getValue }) => (
      <StatusBadge status={getValue() ? 'success' : 'warning'} size="xs" dot={false}>
        {getValue() ? 'Linked' : 'Unlinked'}
      </StatusBadge>
    ),
    size: 110,
  },
  {
    accessorKey: 'created_at',
    header: 'Registered',
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      if (!val) return <span style={{ color: 'var(--pz-text-faint)', fontSize: '12px' }}>--</span>
      return <span style={{ color: 'var(--pz-text-muted)', fontSize: '12px', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{format(new Date(val), 'MMM d, yyyy')}</span>
    },
    size: 120,
  },
]

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '28px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  actions: { display: 'flex', alignItems: 'center', gap: '8px' },
}

export default function DeviceUsers() {
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [selectedUser, setSelectedUser] = useState<DeviceUser | null>(null)
  const [showLinkModal, setShowLinkModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['device-users'],
    queryFn: async () => (await devicesAPI.getDeviceUsers()).data,
  })

  const users: DeviceUser[] = data?.items ?? []

  const unlinkMutation = useMutation({
    mutationFn: (mappingId: string) => employeesAPI.deleteMapping(selectedUser?.employee_id || '', mappingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-users'] })
      toast.success('Employee unlinked from device')
      setSelectedUser(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to unlink'),
  })

  const linkMutation = useMutation({
    mutationFn: ({ employeeId, deviceUserId }: { employeeId: string; deviceUserId: string }) =>
      employeesAPI.createMapping(employeeId, selectedUser?.device_serial || '', deviceUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-users'] })
      toast.success('Employee linked to device')
      setShowLinkModal(false)
      setSelectedUser(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to link'),
  })

  const linkNewMutation = useMutation({
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
      await employeesAPI.createMapping(
        newEmployeeId,
        selectedUser?.device_serial || '',
        selectedUser?.user_id_on_device || ''
      )

      return newEmployeeId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-users'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Employee created and linked to device')
      setShowLinkModal(false)
      setSelectedUser(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create employee'),
  })

  const bulkCreateMutation = useMutation({
    mutationFn: () => devicesAPI.bulkCreateEmployees(),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['device-users'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      const d = res.data
      toast.success(`Sync complete: ${d.created} created, ${d.mapped} mapped, ${d.skipped} skipped`)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Bulk create failed'),
  })

  const filtered = useMemo(() => {
    return users.filter(u => {
      if (searchValue.trim()) {
        const q = searchValue.toLowerCase()
        const match = u.user_id_on_device.toLowerCase().includes(q) ||
          (u.employee_name?.toLowerCase().includes(q)) ||
          (u.device_name?.toLowerCase().includes(q))
        if (!match) return false
      }
      if (filterValues.status === 'linked' && !u.is_linked) return false
      if (filterValues.status === 'unlinked' && u.is_linked) return false
      return true
    })
  }, [users, searchValue, filterValues])

  const linkedCount = users.filter(u => u.is_linked).length
  const unmappedCount = users.length - linkedCount

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Device Users</h1>
          <p style={s.headerSubtitle}>
            Biometric identity management · {users.length} enrolled, {linkedCount} linked, {unmappedCount} unmapped
          </p>
        </div>
        <div style={s.actions}>
          <Button
            variant="default"
            size="md"
            onClick={() => {
              if (window.confirm('Create employee records for all unmapped device users?')) {
                bulkCreateMutation.mutate()
              }
            }}
            disabled={bulkCreateMutation.isPending}
          >
            <Users size={14} />
            {bulkCreateMutation.isPending ? 'Syncing...' : 'Auto-Create Employees'}
          </Button>
          <Button variant="outline" size="md">
            <Download size={14} />
            Export
          </Button>
        </div>
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
            searchPlaceholder="Search by user ID, name, device..."
            filters={[
              {
                id: 'status',
                label: 'Link Status',
                type: 'select',
                options: [
                  { value: 'linked', label: 'Linked' },
                  { value: 'unlinked', label: 'Unlinked' },
                ],
              },
            ]}
            filterValues={filterValues}
            onFilterChange={(id, value) => setFilterValues(prev => ({ ...prev, [id]: value }))}
            onClearAll={() => setFilterValues({})}
          />
        }
      />

      <DetailDrawer
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title={`Device User: ${selectedUser?.user_id_on_device || ''}`}
        subtitle={selectedUser?.device_name || selectedUser?.device_serial}
        width={680}
      >
        {selectedUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Status header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
              <div style={{ padding: '18px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', flexShrink: 0 }}>
                <Fingerprint size={24} style={{ color: 'var(--pz-accent)' }} />
              </div>
              <StatusBadge status={selectedUser.is_linked ? 'success' : 'warning'} size="md" dot={false}>
                {selectedUser.is_linked ? 'Linked' : 'Unlinked'}
              </StatusBadge>
            </div>

            {/* Details table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Fingerprint size={14} style={{ color: 'var(--pz-accent)' }} />
                </div>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Details</h4>
              </div>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' }}>
                {[
                  ['Device User ID', selectedUser.user_id_on_device],
                  ['Device', selectedUser.device_name || selectedUser.device_serial || '—'],
                  ['Linked Employee', selectedUser.employee_name || 'None'],
                  ['Employee Code', selectedUser.employee_code || '—'],
                  ['Registered', selectedUser.created_at ? format(new Date(selectedUser.created_at), 'MMM d, yyyy') : '--'],
                  ['Updated', selectedUser.updated_at ? format(new Date(selectedUser.updated_at), 'MMM d, yyyy HH:mm') : '--'],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '52px', paddingInline: '16px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)' }}>
              {selectedUser.is_linked ? (
                <Button variant="destructive" size="md" style={{ flex: 1 }}
                  disabled={unlinkMutation.isPending} loading={unlinkMutation.isPending}
                  onClick={() => unlinkMutation.mutate(selectedUser.employee_id || '')}>
                  <Unlink2 size={15} /> {unlinkMutation.isPending ? 'Unlinking...' : 'Unlink Employee'}
                </Button>
              ) : (
                <Button variant="default" size="md" style={{ flex: 1 }} onClick={() => setShowLinkModal(true)}>
                  <Link2 size={15} /> Link to Employee
                </Button>
              )}
            </div>

          </div>
        )}
      </DetailDrawer>

      {/* ── Link Employee Modal ────────────────────────────── */}
      <Modal
        open={showLinkModal && !!selectedUser}
        onClose={() => setShowLinkModal(false)}
        title="Link Device User"
        description={selectedUser ? `Device user ${selectedUser.user_id_on_device}${selectedUser.device_name ? ` on ${selectedUser.device_name}` : ''}` : ''}
        size="md"
      >
        {selectedUser && (
          <LinkEmployeeForm
            deviceUserId={selectedUser.user_id_on_device}
            onLink={(employeeId) => linkMutation.mutate({ employeeId, deviceUserId: selectedUser.user_id_on_device })}
            onLinkNew={(data) => linkNewMutation.mutate(data)}
            onCancel={() => setShowLinkModal(false)}
            isPending={linkMutation.isPending || linkNewMutation.isPending}
          />
        )}
      </Modal>
    </div>
  )
}

function LinkEmployeeForm({
  deviceUserId,
  onLink,
  onLinkNew,
  onCancel,
  isPending,
}: {
  deviceUserId: string
  onLink: (employeeId: string) => void
  onLinkNew: (data: { full_name: string; employee_code: string; department_id: string; shift_template_id?: string; position?: string }) => void
  onCancel: () => void
  isPending: boolean
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
    queryKey: ['employees-link-search', search],
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px' }}>
      {/* ── Mode Tabs ──────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Link2 size={14} style={{ color: 'var(--pz-accent)' }} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>Link Mode</span>
        </div>
        <div style={{ display: 'flex', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', padding: '2px' }}>
        <button
          onClick={() => setMode('search')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
            transition: 'all 0.15s', border: 'none', cursor: 'pointer',
            background: mode === 'search' ? 'var(--pz-accent)' : 'transparent',
            color: mode === 'search' ? '#fff' : 'var(--pz-text-muted)',
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
            background: mode === 'create' ? 'var(--pz-accent)' : 'transparent',
            color: mode === 'create' ? '#fff' : 'var(--pz-text-muted)',
          }}
        >
          <UserPlus size={13} />
          Create New
        </button>
      </div>
      </div>

      {/* ── Search Existing Employee ───────────────────────── */}
      {mode === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Search size={14} style={{ color: 'var(--pz-accent)' }} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>Search Existing</span>
            </div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Search Employee</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or code..."
              className="pz-input w-full"
              style={{ height: '44px', fontSize: '14px' }}
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
                  transition: 'background 0.12s', border: '1px solid',
                  background: selectedEmployeeId === emp.id ? 'rgba(59,130,246,0.2)' : 'transparent',
                  borderColor: selectedEmployeeId === emp.id ? 'rgba(59,130,246,0.3)' : 'transparent',
                }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(99,102,241,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--pz-accent)', border: '1px solid rgba(59,130,246,0.2)', flexShrink: 0 }}>
                  {emp.full_name?.[0] || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.full_name}</p>
                  <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', fontFamily: 'monospace', margin: 0 }}>{emp.employee_code}</p>
                </div>
                {emp.department_name && (
                  <span style={{ fontSize: '9px', color: 'var(--pz-text-muted)', background: 'var(--pz-surface)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--pz-border)' }}>
                    {emp.department_name}
                  </span>
                )}
              </button>
            ))}
            {!employees.length && search && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0 }}>No employees found</p>
                <button
                  onClick={() => setMode('create')}
                  style={{ fontSize: '10px', color: 'var(--pz-accent)', border: 'none', background: 'none', cursor: 'pointer', marginTop: '4px' }}
                >
                  Create a new employee →
                </button>
              </div>
            )}
            {!employees.length && !search && (
              <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', textAlign: 'center', padding: '16px 0', margin: 0 }}>Type to search employees</p>
            )}
          </div>
        </div>
      )}

      {/* ── Create New Employee ────────────────────────────── */}
      {mode === 'create' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserPlus size={14} style={{ color: 'var(--pz-accent)' }} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>Employee Information</span>
            </div>
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)' }}>
              <p style={{ fontSize: '10px', color: 'var(--pz-accent)', margin: 0 }}>
                Creating a new employee will automatically link device user <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{deviceUserId}</span>
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
        </div>
      )}

      {/* ── Actions ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        {mode === 'search' ? (
          <Button variant="default" size="md" loading={isPending} disabled={!selectedEmployeeId || isPending} onClick={() => onLink(selectedEmployeeId)}>
            {isPending ? 'Linking...' : 'Link Employee'}
          </Button>
        ) : (
          <Button variant="success" size="md" loading={isPending} disabled={!form.full_name || !form.employee_code || !form.department_id || isPending} onClick={() => onLinkNew(form)}>
            <UserPlus size={14} />
            {isPending ? 'Creating...' : 'Create & Link'}
          </Button>
        )}
      </div>
    </div>
  )
}
