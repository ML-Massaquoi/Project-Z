import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Fingerprint, Link2, Unlink2, Download, UserPlus, Search, Users } from 'lucide-react'
import { devicesAPI, employeesAPI, departmentsAPI, shiftTemplatesAPI } from '@/api/client'
import { format } from 'date-fns'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/ui/PageHeader'
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
    cell: ({ getValue }) => <span className="text-[var(--pz-text)] font-mono font-semibold">{getValue() as string}</span>,
    size: 140,
  },
  {
    accessorKey: 'device_name',
    header: 'Device',
    cell: ({ row }) => (
      <span className="text-[var(--pz-text-muted)]">{row.original.device_name || row.original.device_serial || '—'}</span>
    ),
  },
  {
    accessorKey: 'employee_name',
    header: 'Linked Employee',
    cell: ({ row }) => {
      if (!row.original.employee_name) return <span className="text-[var(--pz-text-muted)] italic text-xs">Not linked</span>
      return (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center">
            <span className="text-[9px] font-bold text-[var(--pz-accent)]">{row.original.employee_name[0]}</span>
          </div>
          <div>
            <p className="text-[var(--pz-text)] font-medium text-xs">{row.original.employee_name}</p>
            <p className="text-[9px] text-[var(--pz-text-muted)] font-mono">{row.original.employee_code}</p>
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
      if (!val) return <span className="text-[var(--pz-text-faint)] text-xs">--</span>
      return <span className="text-[var(--pz-text-muted)] text-xs font-mono tabular-nums">{format(new Date(val), 'MMM d, yyyy')}</span>
    },
    size: 120,
  },
]

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
    <div className="space-y-5 pz-slide-up">
      <PageHeader
        title="Device Users"
        subtitle={`Biometric identity management · ${users.length} enrolled, ${linkedCount} linked, ${unmappedCount} unmapped`}
        breadcrumbs={[{ label: 'Infrastructure' }, { label: 'Device Users' }]}
        actions={
          <div className="flex items-center gap-2">
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
        }
      />

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
              <div style={{ padding: '14px', borderRadius: '6px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', flexShrink: 0 }}>
                <Fingerprint size={24} style={{ color: 'var(--pz-accent)' }} />
              </div>
              <StatusBadge status={selectedUser.is_linked ? 'success' : 'warning'} size="md" dot={false}>
                {selectedUser.is_linked ? 'Linked' : 'Unlinked'}
              </StatusBadge>
            </div>

            {/* Details table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Details</h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  ['Device User ID', selectedUser.user_id_on_device],
                  ['Device', selectedUser.device_name || selectedUser.device_serial || '—'],
                  ['Linked Employee', selectedUser.employee_name || 'None'],
                  ['Employee Code', selectedUser.employee_code || '—'],
                  ['Registered', selectedUser.created_at ? format(new Date(selectedUser.created_at), 'MMM d, yyyy') : '--'],
                  ['Updated', selectedUser.updated_at ? format(new Date(selectedUser.updated_at), 'MMM d, yyyy HH:mm') : '--'],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '44px', paddingInline: '14px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ paddingTop: '8px', borderTop: '1px solid var(--pz-border)' }}>
              {selectedUser.is_linked ? (
                <Button variant="destructive" size="md"
                  disabled={unlinkMutation.isPending} loading={unlinkMutation.isPending}
                  onClick={() => unlinkMutation.mutate(selectedUser.employee_id || '')}>
                  <Unlink2 size={15} /> {unlinkMutation.isPending ? 'Unlinking...' : 'Unlink Employee'}
                </Button>
              ) : (
                <Button variant="default" size="md" onClick={() => setShowLinkModal(true)}>
                  <Link2 size={15} /> Link to Employee
                </Button>
              )}
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
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Link Device User</h3>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>
                Device user <strong style={{ color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{selectedUser.user_id_on_device}</strong>
                {selectedUser.device_name && <span> on <strong style={{ color: 'var(--pz-text-secondary)' }}>{selectedUser.device_name}</strong></span>}
              </p>
            </div>
            <div style={{ padding: '28px 32px 32px 32px', overflowY: 'auto', flex: 1 }}>
              <LinkEmployeeForm
                deviceUserId={selectedUser.user_id_on_device}
                onLink={(employeeId) => linkMutation.mutate({ employeeId, deviceUserId: selectedUser.user_id_on_device })}
                onLinkNew={(data) => linkNewMutation.mutate(data)}
                onCancel={() => setShowLinkModal(false)}
                isPending={linkMutation.isPending || linkNewMutation.isPending}
              />
            </div>
          </motion.div>
        </div>
      )}
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
    <div className="space-y-4">
      {/* ── Mode Tabs ──────────────────────────────────────── */}
      <div className="flex rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] p-0.5">
        <button
          onClick={() => setMode('search')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold transition-all ${
            mode === 'search'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-[var(--pz-text-muted)] hover:text-[var(--pz-text)]'
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
              : 'text-[var(--pz-text-muted)] hover:text-[var(--pz-text)]'
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
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-[10px] font-bold text-[var(--pz-accent)] border border-blue-200 flex-shrink-0">
                  {emp.full_name?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--pz-text)] truncate">{emp.full_name}</p>
                  <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">{emp.employee_code}</p>
                </div>
                {emp.department_name && (
                  <span className="text-[9px] text-[var(--pz-text-muted)] bg-[var(--pz-surface)] px-1.5 py-0.5 rounded border border-[var(--pz-border)]">
                    {emp.department_name}
                  </span>
                )}
              </button>
            ))}
            {!employees.length && search && (
              <div className="text-center py-4">
                <p className="text-xs text-[var(--pz-text-muted)]">No employees found</p>
                <button
                  onClick={() => setMode('create')}
                  className="text-[10px] text-[var(--pz-accent)] hover:text-blue-300 mt-1"
                >
                  Create a new employee →
                </button>
              </div>
            )}
            {!employees.length && !search && (
              <p className="text-xs text-[var(--pz-text-muted)] text-center py-4">Type to search employees</p>
            )}
          </div>
        </>
      )}

      {/* ── Create New Employee ────────────────────────────── */}
      {mode === 'create' && (
        <>
          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-200">
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
