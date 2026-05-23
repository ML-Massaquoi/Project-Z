import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Building2, Plus, Edit, Trash2, Users, Loader2, X } from 'lucide-react'
import { departmentsAPI, officesAPI } from '@/api/client'
import { toast } from 'sonner'
import type { Department, Office } from '@/types'

export default function Departments() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editDept, setEditDept] = useState<Department | null>(null)
  const [form, setForm] = useState({ name: '', code: '', description: '', head_name: '', office_id: '' })

  const { data: departments, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })

  const { data: offices } = useQuery({
    queryKey: ['offices'],
    queryFn: async () => (await officesAPI.list()).data,
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => departmentsAPI.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['departments'] }); toast.success('Department created'); setShowModal(false) },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => departmentsAPI.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['departments'] }); toast.success('Department updated'); setShowModal(false) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => departmentsAPI.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['departments'] }); toast.success('Department deleted') },
  })

  const openCreate = () => {
    setEditDept(null)
    setForm({ name: '', code: '', description: '', head_name: '', office_id: (offices as Office[])?.[0]?.id || '' })
    setShowModal(true)
  }

  const openEdit = (d: Department) => {
    setEditDept(d)
    setForm({ name: d.name, code: d.code, description: d.description || '', head_name: d.head_name || '', office_id: d.office_id })
    setShowModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = { ...form }
    if (!payload.description) delete payload.description
    if (!payload.head_name) delete payload.head_name
    if (editDept) updateMutation.mutate({ id: editDept.id, data: payload })
    else createMutation.mutate(payload)
  }

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div />
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] text-white rounded-xl text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors shadow-md shadow-blue-200" id="add-dept-btn">
          <Plus size={16} /> Add Department
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="card p-5"><div className="skeleton h-28 rounded-xl" /></div>)
        ) : (departments as Department[])?.length ? (
          (departments as Department[]).map((dept, i) => (
            <motion.div key={dept.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card p-5 hover:shadow-lg transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-50"><Building2 size={20} className="text-indigo-500" /></div>
                  <div>
                    <h3 className="font-semibold text-[var(--color-slate-700)]">{dept.name}</h3>
                    <p className="text-xs text-[var(--color-slate-400)] font-mono">{dept.code}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(dept)} className="p-1.5 rounded-lg hover:bg-blue-50 text-[var(--color-slate-400)] hover:text-[var(--color-primary)]"><Edit size={14} /></button>
                  <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(dept.id) }} className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--color-slate-400)] hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
              {dept.description && <p className="text-sm text-[var(--color-slate-500)] mb-3 line-clamp-2">{dept.description}</p>}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
                <div className="flex items-center gap-1.5 text-sm text-[var(--color-slate-500)]"><Users size={14} />{dept.employee_count} employees</div>
                {dept.office_name && <span className="text-xs text-[var(--color-primary)] bg-blue-50 px-2 py-0.5 rounded-full">{dept.office_name}</span>}
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full text-center py-20 text-[var(--color-slate-400)]">
            <Building2 size={48} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium text-lg">No departments yet</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">{editDept ? 'Edit Department' : 'Add Department'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-[var(--color-slate-50)] rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" /></div>
                <div><label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Code *</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" /></div>
              </div>
              <div><label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Office *</label>
                <select value={form.office_id} onChange={(e) => setForm({ ...form, office_id: e.target.value })} required className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm bg-white">
                  <option value="">Select Office</option>
                  {(offices as Office[] || []).map((o: Office) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Head Name</label><input value={form.head_name} onChange={(e) => setForm({ ...form, head_name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm" /></div>
              <div><label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm resize-none" /></div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-medium">Cancel</button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50 flex items-center gap-2">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
                  {editDept ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}
