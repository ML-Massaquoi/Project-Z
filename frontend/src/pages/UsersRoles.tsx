import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserCog, Shield, Plus, Download } from 'lucide-react'
import { usersAPI, rolesAPI } from '@/api/client'
import { format } from 'date-fns'
import { PageHeader, TabBar } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table/DataTable'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface SystemUser {
  id: string
  username: string
  full_name: string
  email: string
  role: string
  role_type: string
  is_active: boolean
  last_login?: string
  created_at: string
  [key: string]: unknown
}

interface Role {
  id: string
  name: string
  description?: string
  role_type: string
  permissions: string[]
  user_count: number
  created_at: string
  [key: string]: unknown
}

const userColumns: ColumnDef<SystemUser, unknown>[] = [
  {
    accessorKey: 'full_name',
    header: 'User',
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 text-blue-400 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold">{row.original.full_name?.[0] || row.original.username[0]}</span>
        </div>
        <div>
          <p className="font-semibold text-gray-200 text-sm">{row.original.full_name || row.original.username}</p>
          <p className="text-[10px] text-gray-500">@{row.original.username}</p>
        </div>
      </div>
    ),
    size: 220,
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ getValue }) => <span className="text-gray-400 text-xs">{(getValue() as string) || '—'}</span>,
    size: 200,
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => (
      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
        {row.original.role || row.original.role_type}
      </span>
    ),
    size: 140,
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ getValue }) => <StatusBadge status={getValue() ? 'active' : 'inactive'} size="xs" />,
    size: 100,
  },
  {
    accessorKey: 'last_login',
    header: 'Last Login',
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return <span className="text-gray-500 text-xs font-mono">{val ? format(new Date(val), 'MMM d, HH:mm') : 'Never'}</span>
    },
    size: 130,
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ getValue }) => (
      <span className="text-gray-500 text-xs font-mono">{format(new Date(getValue() as string), 'MMM d, yyyy')}</span>
    ),
    size: 110,
  },
]

export default function UsersRoles() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('users')
  const [searchValue, setSearchValue] = useState('')
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false)

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['system-users'],
    queryFn: async () => (await usersAPI.list()).data,
    enabled: tab === 'users',
  })

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await rolesAPI.list()).data,
    enabled: tab === 'roles',
  })

  const users: SystemUser[] = Array.isArray(usersData) ? usersData : usersData?.items ?? []
  const roles: Role[] = Array.isArray(rolesData) ? rolesData : rolesData?.items ?? []

  const filteredUsers = useMemo(() => {
    if (!searchValue.trim()) return users
    const q = searchValue.toLowerCase()
    return users.filter(u =>
      u.full_name?.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    )
  }, [users, searchValue])

  const filteredRoles = useMemo(() => {
    if (!searchValue.trim()) return roles
    const q = searchValue.toLowerCase()
    return roles.filter(r => r.name.toLowerCase().includes(q))
  }, [roles, searchValue])

  return (
    <div className="space-y-5 pz-slide-up">
      <PageHeader
        title="Users & Roles"
        subtitle="Access management and role-based permissions"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Users & Roles' }]}
        tabs={
          <TabBar
            tabs={[
              { id: 'users', label: 'Users', icon: <UserCog size={14} />, badge: users.length },
              { id: 'roles', label: 'Roles', icon: <Shield size={14} />, badge: roles.length },
            ]}
            activeTab={tab}
            onChange={(t) => { setTab(t); setSearchValue('') }}
          />
        }
        actions={
          <Button variant="default" size="md"
            onClick={() => {
              setSelectedUser(null)
              if (tab === 'users') setShowAddUserModal(true)
              else setShowCreateRoleModal(true)
            }}>
            <Plus size={15} />
            {tab === 'users' ? 'Add User' : 'Create Role'}
          </Button>
        }
      />

      {tab === 'users' ? (
        <DataTable
          data={filteredUsers}
          columns={userColumns}
          loading={usersLoading}
          onRowClick={(u) => setSelectedUser(u)}
          toolbar={
            <FilterBar
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              searchPlaceholder="Search users..."
            />
          }
        />
      ) : (
        <>
          <FilterBar
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="Search roles..."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rolesLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="pz-card p-5 space-y-3">
                  <div className="pz-skeleton h-5 w-24 rounded" />
                  <div className="pz-skeleton h-4 w-40 rounded" />
                </div>
              ))
            ) : (
              filteredRoles.map((role, i) => (
                <motion.div
                  key={role.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="pz-card pz-card--interactive p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                        <Shield size={16} className="text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">{role.name}</h3>
                        <p className="text-[10px] text-gray-500 capitalize">{role.role_type.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 bg-[var(--pz-surface-2)] px-2 py-0.5 rounded border border-[var(--pz-border)]">
                      {role.user_count} user{role.user_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {role.description && (
                    <p className="text-xs text-gray-500 mb-3">{role.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.slice(0, 4).map(perm => (
                      <span key={perm} className="text-[9px] text-gray-500 bg-[var(--pz-surface-2)] px-1.5 py-0.5 rounded border border-[var(--pz-border)]">
                        {perm}
                      </span>
                    ))}
                    {role.permissions.length > 4 && (
                      <span className="text-[9px] text-gray-600 px-1.5 py-0.5">
                        +{role.permissions.length - 4} more
                      </span>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </>
      )}

      <DetailDrawer
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title={selectedUser?.full_name || selectedUser?.username || ''}
        subtitle={selectedUser ? `@${selectedUser.username}` : ''}
        width={680}
      >
        {selectedUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* User avatar + role header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '6px', background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(99,102,241,0.2))', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '22px', fontWeight: 700, color: '#818CF8' }}>{selectedUser.full_name?.[0] || selectedUser.username[0]}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{selectedUser.full_name || selectedUser.username}</p>
                <span style={{ display: 'inline-flex', fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '4px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818CF8' }}>
                  {selectedUser.role || selectedUser.role_type}
                </span>
              </div>
            </div>

            {/* Account details table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Account Details</h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  ['Username', selectedUser.username],
                  ['Email', selectedUser.email || '—'],
                  ['Role', selectedUser.role || selectedUser.role_type],
                  ['Status', selectedUser.is_active ? 'Active' : 'Inactive'],
                  ['Last Login', selectedUser.last_login ? format(new Date(selectedUser.last_login), 'MMM d, yyyy HH:mm') : 'Never'],
                  ['Created', format(new Date(selectedUser.created_at), 'MMM d, yyyy')],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '44px', paddingInline: '14px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </DetailDrawer>

      {/* ── Add User Modal ────────────────────────────── */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setShowAddUserModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              width: '100%', maxWidth: '680px',
              background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)',
              boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden',
            }}
          >
            <div style={{ padding: '28px 32px 20px 32px', borderBottom: '1px solid var(--pz-border)' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Add New User</h3>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>Create a system access account with role-based permissions.</p>
            </div>
            <div style={{ padding: '28px 32px 32px 32px' }}>
              <AddUserForm
                roles={roles}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['system-users'] })
                  setShowAddUserModal(false)
                }}
                onCancel={() => setShowAddUserModal(false)}
              />
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Create Role Modal ────────────────────────────── */}
      {showCreateRoleModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setShowCreateRoleModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              width: '100%', maxWidth: '680px',
              background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)',
              boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden',
            }}
          >
            <div style={{ padding: '28px 32px 20px 32px', borderBottom: '1px solid var(--pz-border)' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Create New Role</h3>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>Define permissions for a new access role.</p>
            </div>
            <div style={{ padding: '28px 32px 32px 32px' }}>
              <CreateRoleForm
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['roles'] })
                  setShowCreateRoleModal(false)
                }}
                onCancel={() => setShowCreateRoleModal(false)}
              />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function AddUserForm({
  roles,
  onSuccess,
  onCancel,
}: {
  roles: Role[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    username: '',
    full_name: '',
    email: '',
    password: '',
    role_id: '',
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => usersAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-users'] })
      toast.success('User created')
      onSuccess()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Username <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <input
          value={form.username}
          onChange={(e) => setForm(p => ({ ...p, username: e.target.value }))}
          placeholder="jdoe"
          className="pz-input w-full"
          style={{ height: '44px', fontSize: '14px' }}
        />
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
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
            placeholder="john@airport.sl"
            className="pz-input w-full"
            style={{ height: '44px', fontSize: '14px' }}
          />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Password <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
          placeholder="Min 8 characters"
          className="pz-input w-full"
          style={{ height: '44px', fontSize: '14px' }}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Role
        </label>
        <select
          value={form.role_id}
          onChange={(e) => setForm(p => ({ ...p, role_id: e.target.value }))}
          className="pz-input w-full"
          style={{ height: '44px', fontSize: '14px' }}
        >
          <option value="">Select role</option>
          {roles.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '20px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md" loading={createMutation.isPending} disabled={!form.username || !form.full_name || !form.password || createMutation.isPending} onClick={() => createMutation.mutate(form)}>
          {createMutation.isPending ? 'Creating...' : 'Create User'}
        </Button>
      </div>
    </div>
  )
}

function CreateRoleForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    description: '',
    role_type: 'custom',
    permissions: [] as string[],
  })

  const allPermissions = [
    'attendance.view', 'attendance.manage', 'employees.view', 'employees.manage',
    'devices.view', 'devices.manage', 'reports.view', 'reports.export',
    'shifts.view', 'shifts.manage', 'users.view', 'users.manage',
    'settings.view', 'settings.manage', 'audit.view',
  ]

  const togglePermission = (perm: string) => {
    setForm(p => ({
      ...p,
      permissions: p.permissions.includes(perm)
        ? p.permissions.filter(x => x !== perm)
        : [...p.permissions, perm],
    }))
  }

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => rolesAPI.createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      toast.success('Role created')
      onSuccess()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Role Name <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
          </label>
          <input
            value={form.name}
            onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. HR Manager"
            className="pz-input w-full"
            style={{ height: '44px', fontSize: '14px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Role Type
          </label>
          <select
            value={form.role_type}
            onChange={(e) => setForm(p => ({ ...p, role_type: e.target.value }))}
            className="pz-input w-full"
            style={{ height: '44px', fontSize: '14px' }}
          >
            <option value="custom">Custom</option>
            <option value="admin">Admin</option>
            <option value="hr_manager">HR Manager</option>
            <option value="supervisor">Supervisor</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Description
        </label>
        <input
          value={form.description}
          onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="What this role can do..."
          className="pz-input w-full"
          style={{ height: '44px', fontSize: '14px' }}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Permissions
        </label>
        <div className="flex flex-wrap gap-1.5">
          {allPermissions.map(perm => (
            <button
              key={perm}
              onClick={() => togglePermission(perm)}
              style={{
                fontSize: '11px', padding: '5px 10px', borderRadius: '6px', fontWeight: 500,
                border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
                background: form.permissions.includes(perm) ? 'rgba(37,99,235,0.12)' : 'var(--pz-surface-2)',
                borderColor: form.permissions.includes(perm) ? 'rgba(59,130,246,0.4)' : 'var(--pz-border)',
                color: form.permissions.includes(perm) ? 'var(--pz-accent)' : 'var(--pz-text-muted)',
              }}
            >
              {perm}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '20px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md" loading={createMutation.isPending} disabled={!form.name || createMutation.isPending} onClick={() => createMutation.mutate(form)}>
          {createMutation.isPending ? 'Creating...' : 'Create Role'}
        </Button>
      </div>
    </div>
  )
}
