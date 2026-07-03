import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserCog, Shield, Plus, Download } from 'lucide-react'
import { usersAPI, rolesAPI } from '@/api/client'
import { format } from 'date-fns'
import { FilterBar } from '@/components/ui/FilterBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table/DataTable'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { motion } from 'framer-motion'
import { Modal } from '@/components/ui/Modal'
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
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(37,99,235,0.25), rgba(99,102,241,0.25))', color: 'var(--pz-accent)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', fontWeight: 700 }}>{row.original.full_name?.[0] || row.original.username[0]}</span>
        </div>
        <div>
          <p style={{ fontWeight: 600, color: 'var(--pz-text)', fontSize: '14px' }}>{row.original.full_name || row.original.username}</p>
          <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)' }}>@{row.original.username}</p>
        </div>
      </div>
    ),
    size: 220,
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ getValue }) => <span style={{ color: 'var(--pz-text-secondary)', fontSize: '12px' }}>{(getValue() as string) || '—'}</span>,
    size: 200,
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => (
      <span style={{ fontSize: '12px', fontWeight: 500, padding: '2px 8px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: 'var(--pz-accent)' }}>
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
      return <span style={{ color: 'var(--pz-text-muted)', fontSize: '12px', fontFamily: 'monospace' }}>{val ? format(new Date(val), 'MMM d, HH:mm') : 'Never'}</span>
    },
    size: 130,
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ getValue }) => (
      <span style={{ color: 'var(--pz-text-muted)', fontSize: '12px', fontFamily: 'monospace' }}>{format(new Date(getValue() as string), 'MMM d, yyyy')}</span>
    ),
    size: 110,
  },
]

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '28px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  headerActions: { display: 'flex', alignItems: 'center', gap: '8px' },
  tabsRow: { display: 'flex', gap: '4px', padding: '4px', background: 'var(--pz-surface-2)', borderRadius: '10px', border: '1px solid var(--pz-border)', width: 'fit-content', marginTop: '16px' },
  tab: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s' },
  tabActive: { background: 'var(--pz-accent)', color: '#fff' as const },
  tabInactive: { background: 'transparent', color: 'var(--pz-text-muted)' },
  rolesGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
  roleCard: { background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', boxShadow: 'var(--pz-shadow-sm)', padding: '20px', cursor: 'pointer', transition: 'all 0.15s' },
}

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
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Users & Roles</h1>
          <p style={s.headerSubtitle}>Access management and role-based permissions</p>
        </div>
        <div>
          <Button variant="default" size="md"
            onClick={() => {
              setSelectedUser(null)
              if (tab === 'users') setShowAddUserModal(true)
              else setShowCreateRoleModal(true)
            }}>
            <Plus size={15} />
            {tab === 'users' ? 'Add User' : 'Create Role'}
          </Button>
        </div>
      </div>

      <div style={s.tabsRow}>
        <button
          style={{ ...s.tab, ...(tab === 'users' ? s.tabActive : s.tabInactive) }}
          onClick={() => { setTab('users'); setSearchValue('') }}
        >
          <UserCog size={14} />
          Users
          {users.length > 0 && <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.7 }}>({users.length})</span>}
        </button>
        <button
          style={{ ...s.tab, ...(tab === 'roles' ? s.tabActive : s.tabInactive) }}
          onClick={() => { setTab('roles'); setSearchValue('') }}
        >
          <Shield size={14} />
          Roles
          {roles.length > 0 && <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.7 }}>({roles.length})</span>}
        </button>
      </div>

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
          <div style={s.rolesGrid}>
            {rolesLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={s.roleCard}>
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
                  style={s.roleCard}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                        <Shield size={16} style={{ color: 'var(--pz-accent)' }} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)' }}>{role.name}</h3>
                        <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', textTransform: 'capitalize' }}>{role.role_type.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)', background: 'var(--pz-surface-2)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--pz-border)' }}>
                      {role.user_count} user{role.user_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {role.description && (
                    <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', marginBottom: '12px' }}>{role.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.slice(0, 4).map(perm => (
                      <span key={perm} style={{ fontSize: '9px', color: 'var(--pz-text-muted)', background: 'var(--pz-surface-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--pz-border)' }}>
                        {perm}
                      </span>
                    ))}
                    {role.permissions.length > 4 && (
                      <span style={{ fontSize: '9px', color: 'var(--pz-text-faint)', padding: '2px 6px' }}>
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
              <div style={{ width: '56px', height: '56px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(99,102,241,0.2))', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Account Details</h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' }}>
                {[
                  ['Username', selectedUser.username],
                  ['Email', selectedUser.email || '—'],
                  ['Role', selectedUser.role || selectedUser.role_type],
                  ['Status', selectedUser.is_active ? 'Active' : 'Inactive'],
                  ['Last Login', selectedUser.last_login ? format(new Date(selectedUser.last_login), 'MMM d, yyyy HH:mm') : 'Never'],
                  ['Created', format(new Date(selectedUser.created_at), 'MMM d, yyyy')],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '52px', paddingInline: '16px', paddingBlock: '12px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
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
      <Modal
        open={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        title="Add New User"
        description="Create a system access account with role-based permissions."
        size="md"
      >
        <AddUserForm
          roles={roles}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['system-users'] })
            setShowAddUserModal(false)
          }}
          onCancel={() => setShowAddUserModal(false)}
        />
      </Modal>

      {/* ── Create Role Modal ────────────────────────────── */}
      <Modal
        open={showCreateRoleModal}
        onClose={() => setShowCreateRoleModal(false)}
        title="Create New Role"
        description="Define permissions for a new access role."
        size="md"
      >
        <CreateRoleForm
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['roles'] })
            setShowCreateRoleModal(false)
          }}
          onCancel={() => setShowCreateRoleModal(false)}
        />
      </Modal>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--pz-border)' }}>
        <UserCog size={14} style={{ color: 'var(--pz-accent)' }} />
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account Details</span>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Username <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
        </label>
        <input
          value={form.username}
          onChange={(e) => setForm(p => ({ ...p, username: e.target.value }))}
          placeholder="jdoe"
          className="pz-input"
          style={{ height: '44px', fontSize: '14px', width: '100%' }}
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
            className="pz-input"
            style={{ height: '44px', fontSize: '14px', width: '100%' }}
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
            className="pz-input"
            style={{ height: '44px', fontSize: '14px', width: '100%' }}
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
          className="pz-input"
          style={{ height: '44px', fontSize: '14px', width: '100%' }}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
          Role
        </label>
        <select
          value={form.role_id}
          onChange={(e) => setForm(p => ({ ...p, role_id: e.target.value }))}
          className="pz-input"
          style={{ height: '44px', fontSize: '14px', width: '100%' }}
        >
          <option value="">Select role</option>
          {roles.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--pz-border)' }}>
        <Shield size={14} style={{ color: 'var(--pz-accent)' }} />
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Role Details</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Role Name <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
          </label>
          <input
            value={form.name}
            onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. HR Manager"
            className="pz-input"
            style={{ height: '44px', fontSize: '14px', width: '100%' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Role Type
          </label>
          <select
            value={form.role_type}
            onChange={(e) => setForm(p => ({ ...p, role_type: e.target.value }))}
            className="pz-input"
            style={{ height: '44px', fontSize: '14px', width: '100%' }}
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
          className="pz-input"
          style={{ height: '44px', fontSize: '14px', width: '100%' }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--pz-border)' }}>
        <Shield size={14} style={{ color: 'var(--pz-accent)' }} />
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Permissions</span>
      </div>
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md" loading={createMutation.isPending} disabled={!form.name || createMutation.isPending} onClick={() => createMutation.mutate(form)}>
          {createMutation.isPending ? 'Creating...' : 'Create Role'}
        </Button>
      </div>
    </div>
  )
}
