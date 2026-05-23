import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search, Edit, Trash2, Loader2, UserPlus, Cpu, Plus, X, Fingerprint } from 'lucide-react'
import { employeesAPI, departmentsAPI, devicesAPI } from '@/api/client'
import { toast } from 'sonner'
import type { Employee, Department, Device } from '@/types'

// ── Device Mapping Types ─────────────────────────────────
interface DeviceMapping {
  id: string
  employee_id: string
  device_id: string
  device_serial: string
  device_name: string | null
  device_user_id: string
  created_at: string
}

// ── Device Mappings Modal ────────────────────────────────
function DeviceMappingsModal({
  employee,
  onClose,
}: {
  employee: Employee
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [newDeviceId, setNewDeviceId] = useState('')
  const [newDeviceUserId, setNewDeviceUserId] = useState('')

  const { data: mappings = [], isLoading: mappingsLoading } = useQuery<DeviceMapping[]>({
    queryKey: ['device-mappings', employee.id],
    queryFn: async () => (await employeesAPI.listMappings(employee.id)).data,
  })

  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await devicesAPI.list()).data,
  })
  const devices: Device[] = devicesData?.items ?? []

  const createMutation = useMutation({
    mutationFn: () => employeesAPI.createMapping(employee.id, newDeviceId, newDeviceUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-mappings', employee.id] })
      toast.success('Device mapping added')
      setNewDeviceId('')
      setNewDeviceUserId('')
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.detail || 'Failed to add mapping'),
  })

  const deleteMutation = useMutation({
    mutationFn: (mappingId: string) => employeesAPI.deleteMapping(employee.id, mappingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-mappings', employee.id] })
      toast.success('Mapping removed')
    },
    onError: () => toast.error('Failed to remove mapping'),
  })

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDeviceId || !newDeviceUserId.trim()) return
    createMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-slate-800)]">
              Device Mappings
            </h2>
            <p className="text-xs text-[var(--color-slate-400)] mt-0.5">
              {employee.full_name} · {employee.employee_code}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-slate-100)] text-[var(--color-slate-400)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Existing mappings */}
          <div>
            <p className="text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider mb-2">
              Current Mappings
            </p>
            {mappingsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-12 rounded-xl bg-[var(--color-slate-100)] animate-pulse" />
                ))}
              </div>
            ) : mappings.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-[var(--color-slate-400)]">
                <Fingerprint size={28} className="mb-2 opacity-30" />
                <p className="text-sm">No device mappings yet</p>
                <p className="text-xs mt-0.5">Add one below to link this employee to a device</p>
              </div>
            ) : (
              <div className="space-y-2">
                {mappings.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-slate-50)]"
                  >
                    <div className="flex items-center gap-2.5">
                      <Cpu size={15} className="text-[var(--color-primary)] flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-[var(--color-slate-700)]">
                          {m.device_name || m.device_serial}
                        </p>
                        <p className="text-xs text-[var(--color-slate-400)]">
                          Device User ID: <span className="font-mono font-semibold">{m.device_user_id}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteMutation.mutate(m.id)}
                      disabled={deleteMutation.isPending}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--color-slate-400)] hover:text-red-500 transition-colors"
                      title="Remove mapping"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add new mapping */}
          <div>
            <p className="text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider mb-2">
              Add New Mapping
            </p>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">
                  Device
                </label>
                <select
                  value={newDeviceId}
                  onChange={(e) => setNewDeviceId(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
                >
                  <option value="">Select a device…</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name || d.serial_number}
                      {d.ip_address ? ` (${d.ip_address})` : ''}
                      {d.is_online ? ' 🟢' : ' ⚫'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">
                  Device User ID
                  <span className="ml-1 text-xs font-normal text-[var(--color-slate-400)]">
                    (the enrollment number on the device)
                  </span>
                </label>
                <input
                  type="text"
                  value={newDeviceUserId}
                  onChange={(e) => setNewDeviceUserId(e.target.value)}
                  placeholder="e.g. 1, 42, 100"
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
                />
              </div>
              <button
                type="submit"
                disabled={createMutation.isPending || !newDeviceId || !newDeviceUserId.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Add Mapping
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default function Employees() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [mappingEmployee, setMappingEmployee] = useState<Employee | null>(null)
  const [form, setForm] = useState({ employee_code: '', full_name: '', email: '', phone: '', position: '', department_id: '', shift_id: '', status: 'active' })

  const { data, isLoading } = useQuery({
    queryKey: ['employees', page, search, deptFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, per_page: 15 }
      if (search) params.search = search
      if (deptFilter) params.department_id = deptFilter
      return (await employeesAPI.list(params)).data
    },
  })

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => employeesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Employee created successfully')
      closeModal()
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create employee'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => employeesAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Employee updated successfully')
      closeModal()
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => employeesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Employee deleted')
    },
    onError: () => toast.error('Failed to delete employee'),
  })

  const openCreate = () => {
    setEditingEmployee(null)
    setForm({ employee_code: '', full_name: '', email: '', phone: '', position: '', department_id: '', shift_id: '', status: 'active' })
    setShowModal(true)
  }

  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp)
    setForm({
      employee_code: emp.employee_code, full_name: emp.full_name,
      email: emp.email || '', phone: emp.phone || '', position: emp.position || '',
      department_id: emp.department_id || '', shift_id: emp.shift_id || '', status: emp.status,
    })
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditingEmployee(null) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = { ...form }
    if (!payload.department_id) delete payload.department_id
    if (!payload.shift_id) delete payload.shift_id
    if (!payload.email) delete payload.email
    if (editingEmployee) {
      updateMutation.mutate({ id: editingEmployee.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const handleDelete = (emp: Employee) => {
    if (confirm(`Delete ${emp.full_name}? This action cannot be undone.`)) {
      deleteMutation.mutate(emp.id)
    }
  }

  const statusColor: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700',
    inactive: 'bg-slate-100 text-slate-500',
    suspended: 'bg-amber-50 text-amber-700',
    terminated: 'bg-red-50 text-red-600',
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-slate-400)]" />
            <input
              id="employee-search"
              type="text"
              placeholder="Search employees..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all"
            />
          </div>
          <select
            id="employee-dept-filter"
            value={deptFilter}
            onChange={(e) => { setDeptFilter(e.target.value); setPage(1) }}
            className="px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-white text-sm text-[var(--color-slate-600)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          >
            <option value="">All Departments</option>
            {(departments as Department[] || []).map((d: Department) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <button
          id="add-employee-btn"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] text-white rounded-xl text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors shadow-md shadow-blue-200"
        >
          <UserPlus size={16} /> Add Employee
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-slate-50)] border-b border-[var(--color-border)]">
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider">Employee</th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider">Code</th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider">Department</th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider">Position</th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider">Status</th>
                <th className="text-right py-3.5 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-[var(--color-slate-50)]">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="py-4 px-4"><div className="skeleton h-4 w-24 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : data?.items?.length ? (
                data.items.map((emp: Employee) => (
                  <tr key={emp.id} className="border-b border-[var(--color-slate-50)] hover:bg-[var(--color-slate-50)] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                          <span className="text-xs font-semibold text-[var(--color-primary)]">{emp.full_name[0]}</span>
                        </div>
                        <div>
                          <p className="font-medium text-[var(--color-slate-700)]">{emp.full_name}</p>
                          <p className="text-xs text-[var(--color-slate-400)]">{emp.email || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-[var(--color-slate-500)] font-mono text-xs">{emp.employee_code}</td>
                    <td className="py-3.5 px-4 text-[var(--color-slate-500)]">{emp.department_name || '—'}</td>
                    <td className="py-3.5 px-4 text-[var(--color-slate-500)]">{emp.position || '—'}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor[emp.status] || statusColor.active}`}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button onClick={() => setMappingEmployee(emp)} className="p-1.5 rounded-lg hover:bg-purple-50 text-[var(--color-slate-400)] hover:text-purple-600 transition-colors" title="Device mappings" id={`map-emp-${emp.id}`}>
                        <Cpu size={15} />
                      </button>
                      <button onClick={() => openEdit(emp)} className="p-1.5 rounded-lg hover:bg-blue-50 text-[var(--color-slate-400)] hover:text-[var(--color-primary)] transition-colors" id={`edit-emp-${emp.id}`}>
                        <Edit size={15} />
                      </button>
                      <button onClick={() => handleDelete(emp)} className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--color-slate-400)] hover:text-red-500 transition-colors ml-1" id={`del-emp-${emp.id}`}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="py-16 text-center text-[var(--color-slate-400)]">
                  <Users size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No employees found</p>
                  <p className="text-xs mt-1">Add employees to get started</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
            <p className="text-sm text-[var(--color-slate-400)]">
              Showing {((page - 1) * 15) + 1} to {Math.min(page * 15, data.total)} of {data.total}
            </p>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(data.pages, 5) }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === page ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-[var(--color-slate-50)] text-[var(--color-slate-500)]'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10"
          >
            <h2 className="text-lg font-semibold text-[var(--color-slate-800)] mb-5">
              {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Full Name *</label>
                  <input id="emp-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Employee Code *</label>
                  <input id="emp-code" value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} required className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Email</label>
                  <input id="emp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Phone</label>
                  <input id="emp-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Department</label>
                  <select id="emp-dept" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 bg-white">
                    <option value="">Select Department</option>
                    {(departments as Department[] || []).map((d: Department) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Position</label>
                  <input id="emp-position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={closeModal} className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-slate-600)] hover:bg-[var(--color-slate-50)] transition-colors">Cancel</button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50 flex items-center gap-2">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
                  {editingEmployee ? 'Save Changes' : 'Create Employee'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {/* Device Mappings Modal */}
      {mappingEmployee && (
        <DeviceMappingsModal
          employee={mappingEmployee}
          onClose={() => setMappingEmployee(null)}
        />
      )}
    </div>
  )
}

// Need the Users icon for the empty state
import { Users } from 'lucide-react'
