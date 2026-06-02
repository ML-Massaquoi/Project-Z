import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { UserCog, Plus, Edit, Trash2, Loader2, X, Shield, Eye, EyeOff, Key } from 'lucide-react'
import { usersAPI, rolesAPI } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'

interface SystemUser {
  id: string
  username: string
  email: string
  full_name: string | null
  is_active: boolean
  role_id: string | null
  role_name: string | null
  role_type: string | null
  created_at: string
}

interface Role {
  id: string
  name: string
  display_name: string
  description: string | null
  role_type: string
  is_active: boolean
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-800 text-sm bg-slate-950 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
const labelCls = 'block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5'

const roleTypeColors: Record<string, string> = {
  super_admin: 'bg-purple-950/40 text-purple-400 border border-purple-900/50',
  admin: 'bg-blue-950/40 text-blue-400 border border-blue-900/50',
  hr_manager: 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/50',
  hr_officer: 'bg-cyan-950/40 text-cyan-400 border border-cyan-900/50',
  viewer: 'bg-slate-800/40 text-slate-400 border border-slate-700/50',
}

export default function UsersRoles() {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuthStore()
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState<SystemUser | null>(null)
  const [showPwModal, setShowPwModal] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ username: '', email: '', password: '', full_name: '', role_id: '', is_active: true })
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' })

  const { data: users = [], isLoading } = useQuery<SystemUser[]>({
    queryKey: ['users'],
    queryFn: async () => (await usersAPI.list()).data,
  })

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => (await rolesAPI.list()).data,
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => usersAPI.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User created'); closeModal() },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create user'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => usersAPI.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated'); closeModal() },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersAPI.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User deleted') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to delete'),
  })

  const changePwMutation = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) => usersAPI.changePassword(data),
    onSuccess: () => { toast.success('Password changed successfully'); setShowPwModal(false); setPwForm({ current_password: '', new_password: '', confirm: '' }) },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to change password'),
  })

  const openCreate = () => {
    setEditUser(null)
    setForm({ username: '', email: '', password: '', full_name: '', role_id: roles[0]?.id || '', is_active: true })
    setShowModal(true)
  }

  const openEdit = (u: SystemUser) => {
    setEditUser(u)
    setForm({ username: u.username, email: u.email, password: '', full_name: u.full_name || '', role_id: u.role_id || '', is_active: u.is_active })
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditUser(null) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editUser) {
      const payload: Record<string, unknown> = { email: form.email, full_name: form.full_name, is_active: form.is_active }
      if (form.role_id) payload.role_id = form.role_id
      updateMutation.mutate({ id: editUser.id, data: payload })
    } else {
      const payload: Record<string, unknown> = { username: form.username, email: form.email, password: form.password, full_name: form.full_name }
      if (form.role_id) payload.role_id = form.role_id
      createMutation.mutate(payload)
    }
  }

  const handleChangePw = (e: React.FormEvent) => {
    e.preventDefault()
    if (pwForm.new_password !== pwForm.confirm) { toast.error('Passwords do not match'); return }
    if (pwForm.new_password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    changePwMutation.mutate({ current_password: pwForm.current_password, new_password: pwForm.new_password })
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div />
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPwModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white bg-transparent transition-colors"
          >
            <Key size={15} /> Change Password
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] text-white rounded-xl text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors shadow-lg shadow-blue-950/20"
          >
            <Plus size={15} /> Add User
          </button>
        </div>
      </div>

      {/* Roles summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {roles.map((role) => (
          <div key={role.id} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={14} className="text-[var(--color-primary)]" />
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleTypeColors[role.role_type] || 'bg-slate-850 text-slate-400'}`}>
                {role.role_type.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-200">{role.display_name}</p>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{role.description || '—'}</p>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="font-semibold text-slate-100">System Users</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-800">
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Username</th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-right py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-800/40">
                    {Array.from({ length: 5 }).map((_, j) => <td key={j} className="py-4 px-4"><div className="skeleton h-4 w-24 rounded" /></td>)}
                  </tr>
                ))
              ) : users.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors group">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 text-blue-400 border border-blue-800/50 flex items-center justify-center">
                        <span className="text-xs font-bold">{(u.full_name || u.username)[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-200">{u.full_name || u.username}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </div>
                      {u.id === currentUser?.id && (
                        <span className="text-xs bg-blue-950/40 border border-blue-900/50 text-blue-400 px-2 py-0.5 rounded-full font-medium">You</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs text-slate-400">{u.username}</td>
                  <td className="py-3.5 px-4">
                    {u.role_name ? (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${roleTypeColors[u.role_type || ''] || 'bg-slate-800/40 text-slate-400 border border-slate-700/50'}`}>
                        {u.role_name}
                      </span>
                    ) : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${u.is_active ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40' : 'bg-red-950/40 text-red-400 border border-red-900/50'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors">
                        <Edit size={15} />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => { if (confirm(`Delete ${u.username}?`)) deleteMutation.mutate(u.id) }} className="p-1.5 rounded-lg hover:bg-red-950/40 text-slate-400 hover:text-red-400 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeModal} />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} className="relative bg-[#0B0F19] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 z-10 text-slate-200">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-slate-100">{editUser ? 'Edit User' : 'Add System User'}</h2>
                <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                {!editUser && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Username *</label>
                      <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required className={inputCls} placeholder="john.doe" />
                    </div>
                    <div>
                      <label className={labelCls}>Password *</label>
                      <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className={`${inputCls} pr-10`} placeholder="••••••••" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors">
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label className={labelCls}>Full Name</label>
                  <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} placeholder="John Doe" />
                </div>
                <div>
                  <label className={labelCls}>Email *</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className={inputCls} placeholder="john@example.com" />
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} className={inputCls}>
                    <option value="">No Role</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
                  </select>
                </div>
                {editUser && (
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded bg-slate-950 border-slate-800 text-[var(--color-primary)]" />
                    <label htmlFor="is_active" className="text-sm text-slate-300">Account Active</label>
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={closeModal} className="px-4 py-2.5 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white bg-transparent transition-colors">Cancel</button>
                  <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50 flex items-center gap-2">
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
                    {editUser ? 'Save Changes' : 'Create User'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Change Password Modal */}
      <AnimatePresence>
        {showPwModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowPwModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative bg-[#0B0F19] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10 text-slate-200">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-slate-100">Change Password</h2>
                <button onClick={() => setShowPwModal(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
              </div>
              <form onSubmit={handleChangePw} className="space-y-4">
                <div>
                  <label className={labelCls}>Current Password</label>
                  <input type="password" value={pwForm.current_password} onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })} required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>New Password</label>
                  <input type="password" value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Confirm New Password</label>
                  <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} required className={inputCls} />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowPwModal(false)} className="px-4 py-2.5 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white bg-transparent transition-colors">Cancel</button>
                  <button type="submit" disabled={changePwMutation.isPending} className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50 flex items-center gap-2">
                    {changePwMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                    Change Password
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
