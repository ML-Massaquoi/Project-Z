import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Edit, Trash2, Loader2, UserPlus, Cpu, Plus, X,
  Fingerprint, Users, ChevronLeft, ChevronRight, User, Link2,
} from 'lucide-react'
import { employeesAPI, departmentsAPI, devicesAPI, shiftsAPI } from '@/api/client'
import { toast } from 'sonner'
import type { Employee, Department, Device, Shift } from '@/types'

interface DeviceMapping {
  id: string
  employee_id: string
  device_id: string
  device_serial: string
  device_name: string | null
  device_user_id: string
  created_at: string
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-800 text-sm bg-slate-950 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
const labelCls = 'block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5'

// ── Unified Employee Modal ───────────────────────────────
function EmployeeModal({
  employee,
  onClose,
}: {
  employee: Employee | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!employee
  const [tab, setTab] = useState<'info' | 'devices'>('info')
  const [form, setForm] = useState({
    full_name: employee?.full_name || '',
    employee_code: employee?.employee_code || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    position: employee?.position || '',
    department_id: employee?.department_id || '',
    shift_id: employee?.shift_id || '',
    status: employee?.status || 'active',
  })
  const [newDeviceId, setNewDeviceId] = useState('')
  const [newDeviceUserId, setNewDeviceUserId] = useState('')

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })
  const { data: shiftsData = [] } = useQuery<Shift[]>({
    queryKey: ['shifts'],
    queryFn: async () => (await shiftsAPI.list()).data,
  })
  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await devicesAPI.list()).data,
  })
  const devices: Device[] = devicesData?.items ?? []

  const { data: mappings = [], isLoading: mappingsLoading } = useQuery<DeviceMapping[]>({
    queryKey: ['device-mappings', employee?.id],
    queryFn: async () => (await employeesAPI.listMappings(employee!.id)).data,
    enabled: isEdit && tab === 'devices',
  })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      isEdit ? employeesAPI.update(employee!.id, data) : employeesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success(isEdit ? 'Employee updated' : 'Employee created')
      if (!isEdit) onClose()
      else setTab('devices')
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save'),
  })

  const addMappingMutation = useMutation({
    mutationFn: () => employeesAPI.createMapping(employee!.id, newDeviceId, newDeviceUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-mappings', employee?.id] })
      toast.success('Device mapping added')
      setNewDeviceId('')
      setNewDeviceUserId('')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to add mapping'),
  })

  const deleteMappingMutation = useMutation({
    mutationFn: (mappingId: string) => employeesAPI.deleteMapping(employee!.id, mappingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-mappings', employee?.id] })
      toast.success('Mapping removed')
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = { ...form }
    if (!payload.department_id) delete payload.department_id
    if (!payload.shift_id) delete payload.shift_id
    if (!payload.email) delete payload.email
    if (!payload.phone) delete payload.phone
    saveMutation.mutate(payload)
  }

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40',
    inactive: 'bg-slate-800/50 text-slate-400 border border-slate-700/40',
    suspended: 'bg-amber-950/40 text-amber-400 border border-amber-900/40',
    terminated: 'bg-red-950/40 text-red-400 border border-red-900/40',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2 }}
        className="relative bg-[#0B0F19] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl z-10 overflow-hidden text-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                {isEdit ? employee.full_name : 'Add New Employee'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEdit ? employee.employee_code : 'Fill in the details below'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs — only show for edit */}
        {isEdit && (
          <div className="flex border-b border-slate-800 px-6">
            {[
              { id: 'info', label: 'Profile', icon: User },
              { id: 'devices', label: 'Device Mappings', icon: Cpu },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`flex items-center gap-2 px-1 py-3 mr-6 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <t.icon size={14} />
                {t.label}
                {t.id === 'devices' && mappings.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--color-primary)] text-white text-[10px] font-bold">
                    {mappings.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Tab: Profile */}
        {tab === 'info' && (
          <form onSubmit={handleSave} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full Name *</label>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required className={inputCls} placeholder="John Doe" />
              </div>
              <div>
                <label className={labelCls}>Employee Code *</label>
                <input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} required className={inputCls} placeholder="EMP001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} placeholder="john@example.com" />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} placeholder="+232 XX XXX XXXX" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Position</label>
                <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className={inputCls} placeholder="e.g. Security Officer" />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className={inputCls}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Department</label>
                <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className={inputCls}>
                  <option value="">No Department</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Shift</label>
                <select value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })} className={inputCls}>
                  <option value="">No Shift</option>
                  {shiftsData.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white bg-transparent transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saveMutation.isPending} className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50 flex items-center gap-2">
                {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {isEdit ? 'Save Changes' : 'Create & Add Devices →'}
              </button>
            </div>
          </form>
        )}

        {/* Tab: Device Mappings */}
        {tab === 'devices' && isEdit && (
          <div className="p-6 space-y-5">
            {/* Existing mappings */}
            <div>
              <p className={labelCls}>Linked Devices</p>
              {mappingsLoading ? (
                <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 rounded-xl skeleton" />)}</div>
              ) : mappings.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-slate-400 bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
                  <Fingerprint size={28} className="mb-2 opacity-30" />
                  <p className="text-sm font-medium">No device mappings yet</p>
                  <p className="text-xs mt-0.5 text-slate-500">Link this employee to a biometric device below</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mappings.map((m) => (
                    <div key={m.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900/40">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-blue-950/40 border border-blue-900/50"><Cpu size={14} className="text-[var(--color-primary)]" /></div>
                        <div>
                          <p className="text-sm font-medium text-slate-200">{m.device_name || m.device_serial}</p>
                          <p className="text-xs text-slate-400">User ID on device: <span className="font-mono font-semibold text-slate-300">{m.device_user_id}</span></p>
                        </div>
                      </div>
                      <button onClick={() => deleteMappingMutation.mutate(m.id)} disabled={deleteMappingMutation.isPending} className="p-1.5 rounded-lg hover:bg-red-950/40 text-slate-400 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add mapping */}
            <div className="border-t border-slate-800 pt-4">
              <p className={labelCls}>Add Device Mapping</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Select Device</label>
                  <select value={newDeviceId} onChange={(e) => setNewDeviceId(e.target.value)} className={inputCls}>
                    <option value="">Choose a device…</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name || d.serial_number} {d.ip_address ? `· ${d.ip_address}` : ''} {d.is_online ? '🟢' : '⚫'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Device User ID <span className="text-xs text-slate-500">(enrollment number on the device)</span>
                  </label>
                  <input
                    type="text"
                    value={newDeviceUserId}
                    onChange={(e) => setNewDeviceUserId(e.target.value)}
                    placeholder="e.g. 1, 42, 100"
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <button
                  onClick={() => { if (newDeviceId && newDeviceUserId.trim()) addMappingMutation.mutate() }}
                  disabled={addMappingMutation.isPending || !newDeviceId || !newDeviceUserId.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50"
                >
                  {addMappingMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                  Link Device
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────
export default function Employees() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [modalEmployee, setModalEmployee] = useState<Employee | null | 'new'>()

  const { data, isLoading } = useQuery({
    queryKey: ['employees', page, search, deptFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, per_page: 15 }
      if (search) params.search = search
      if (deptFilter) params.department_id = deptFilter
      return (await employeesAPI.list(params)).data
    },
  })

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => employeesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Employee deleted')
    },
    onError: () => toast.error('Failed to delete employee'),
  })

  const handleDelete = (emp: Employee) => {
    if (confirm(`Delete ${emp.full_name}? This cannot be undone.`)) {
      deleteMutation.mutate(emp.id)
    }
  }

  const statusColor: Record<string, string> = {
    active: 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40',
    inactive: 'bg-slate-800/50 text-slate-400 border border-slate-700/40',
    suspended: 'bg-amber-950/40 text-amber-400 border border-amber-900/40',
    terminated: 'bg-red-950/40 text-red-400 border border-red-900/40',
  }

  const totalPages = data?.pages || 1

  return (
    <div className="animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, code, email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          <select
            value={deptFilter}
            onChange={(e) => { setDeptFilter(e.target.value); setPage(1) }}
            className="px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button
          onClick={() => setModalEmployee('new')}
          className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] text-white rounded-xl text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors shadow-lg shadow-blue-950/20 whitespace-nowrap"
        >
          <UserPlus size={15} /> Add Employee
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-800">
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Employee</th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Code</th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Department</th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Position</th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-right py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-800/40">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="py-4 px-4"><div className="skeleton h-4 w-24 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : data?.items?.length ? (
                data.items.map((emp: Employee) => (
                  <tr key={emp.id} className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors group">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 text-blue-400 border border-blue-800/50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold">{emp.full_name[0]?.toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-200">{emp.full_name}</p>
                          <p className="text-xs text-slate-400">{emp.email || emp.phone || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">{emp.employee_code}</td>
                    <td className="py-3.5 px-4 text-slate-300">{emp.department_name || <span className="text-slate-500">—</span>}</td>
                    <td className="py-3.5 px-4 text-slate-300">{emp.position || <span className="text-slate-500">—</span>}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor[emp.status] || statusColor.active}`}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setModalEmployee(emp)}
                          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors"
                          title="Edit employee"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(emp)}
                          className="p-1.5 rounded-lg hover:bg-red-950/40 text-slate-400 hover:text-red-400 transition-colors"
                          title="Delete employee"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <Users size={40} className="mx-auto mb-3 text-[var(--color-slate-300)]" />
                    <p className="font-medium text-[var(--color-slate-500)]">No employees found</p>
                    <p className="text-xs text-[var(--color-slate-400)] mt-1">
                      {search || deptFilter ? 'Try adjusting your filters' : 'Add your first employee to get started'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <p className="text-sm text-slate-400">
              {((page - 1) * 15) + 1}–{Math.min(page * 15, data.total)} of {data.total} employees
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 disabled:opacity-20 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === page ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-slate-800 text-slate-400'}`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 disabled:opacity-20 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modalEmployee !== undefined && (
          <EmployeeModal
            employee={modalEmployee === 'new' ? null : modalEmployee as Employee}
            onClose={() => setModalEmployee(undefined)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
