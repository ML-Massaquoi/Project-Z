import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, Plus, Edit, X, Loader2, Shield, Clock, MapPin, Info } from 'lucide-react'
import { officesAPI } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'
import type { Office } from '@/types'

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-800 text-sm bg-slate-950 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
const labelCls = 'block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5'

export default function Settings() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showOfficeModal, setShowOfficeModal] = useState(false)
  const [editOffice, setEditOffice] = useState<Office | null>(null)
  const [officeForm, setOfficeForm] = useState({ name: '', code: '', address: '', city: '', phone: '' })

  const { data: offices = [], isLoading: officesLoading } = useQuery<Office[]>({
    queryKey: ['offices'],
    queryFn: async () => (await officesAPI.list()).data,
  })

  const createOfficeMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => officesAPI.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['offices'] }); toast.success('Office created'); setShowOfficeModal(false) },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create office'),
  })

  const updateOfficeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => officesAPI.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['offices'] }); toast.success('Office updated'); setShowOfficeModal(false) },
  })

  const openCreateOffice = () => {
    setEditOffice(null)
    setOfficeForm({ name: '', code: '', address: '', city: '', phone: '' })
    setShowOfficeModal(true)
  }

  const openEditOffice = (o: Office) => {
    setEditOffice(o)
    setOfficeForm({ name: o.name, code: o.code, address: o.address || '', city: o.city || '', phone: o.phone || '' })
    setShowOfficeModal(true)
  }

  const handleOfficeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = { ...officeForm }
    if (!payload.address) delete payload.address
    if (!payload.city) delete payload.city
    if (!payload.phone) delete payload.phone
    if (editOffice) updateOfficeMutation.mutate({ id: editOffice.id, data: payload })
    else createOfficeMutation.mutate(payload)
  }

  return (
    <div className="animate-fade-in max-w-4xl mx-auto space-y-6">

      {/* Account Profile */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-blue-950/40 border border-blue-900/50 text-blue-400"><Shield size={18} /></div>
          <h2 className="font-semibold text-slate-100">Account Profile</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Username', value: user?.username },
            { label: 'Email', value: user?.email },
            { label: 'Full Name', value: user?.full_name || '—' },
            { label: 'Role', value: user?.role_type === 'super_admin' ? 'Super Administrator' : user?.role || '—' },
          ].map((item) => (
            <div key={item.label} className="p-4 rounded-xl bg-slate-900/30 border border-slate-800">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{item.label}</p>
              <p className="text-sm font-medium text-slate-200 truncate">{item.value}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Offices */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-900/50 text-indigo-400"><Building2 size={18} /></div>
            <h2 className="font-semibold text-slate-100">Offices</h2>
          </div>
          <button onClick={openCreateOffice} className="flex items-center gap-2 px-3 py-2 bg-[var(--color-primary)] text-white rounded-xl text-xs font-medium hover:bg-[var(--color-primary-hover)] transition-colors">
            <Plus size={13} /> Add Office
          </button>
        </div>
        <div className="p-4">
          {officesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1, 2].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
            </div>
          ) : offices.length === 0 ? (
            <div className="text-center py-10 text-slate-5500">
              <Building2 size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">No offices yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {offices.map((office) => (
                <div key={office.id} className="flex items-start justify-between p-4 rounded-xl border border-slate-800 bg-slate-900/30 hover:bg-slate-900/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-indigo-950/40 border border-indigo-900/50 text-indigo-400 mt-0.5"><MapPin size={14} /></div>
                    <div>
                      <p className="font-medium text-slate-200 text-sm">{office.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{office.code}</p>
                      {office.city && <p className="text-xs text-slate-400 mt-0.5">{office.city}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span>{office.department_count} dept{office.department_count !== 1 ? 's' : ''}</span>
                        <span>{office.device_count} device{office.device_count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => openEditOffice(office)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors">
                    <Edit size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* System Info */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/50 text-slate-300"><Info size={18} /></div>
          <h2 className="font-semibold text-slate-100">System Information</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Organization', value: 'Freetown International Airport' },
            { label: 'Country', value: 'Sierra Leone' },
            { label: 'Timezone', value: 'Africa/Freetown (UTC)' },
            { label: 'Version', value: 'Project Z v1.0.0' },
          ].map((item) => (
            <div key={item.label} className="p-4 rounded-xl bg-slate-900/30 border border-slate-800">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{item.label}</p>
              <p className="text-sm font-medium text-slate-200">{item.value}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ADMS Config */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-900/50 text-cyan-400"><Clock size={18} /></div>
          <h2 className="font-semibold text-slate-100">ADMS Configuration</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'ADMS Endpoint', value: '/iclock/cdata' },
            { label: 'ADMS Port', value: '8081' },
            { label: 'Duplicate Window', value: '60 seconds' },
            { label: 'Grace Period', value: '15 minutes' },
          ].map((item) => (
            <div key={item.label} className="p-4 rounded-xl bg-slate-900/30 border border-slate-800">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{item.label}</p>
              <p className="text-sm font-mono font-medium text-slate-200">{item.value}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Office Modal */}
      <AnimatePresence>
        {showOfficeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowOfficeModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative bg-[#0B0F19] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 z-10 text-slate-200">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-slate-100">{editOffice ? 'Edit Office' : 'Add Office'}</h2>
                <button onClick={() => setShowOfficeModal(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
              </div>
              <form onSubmit={handleOfficeSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Office Name *</label>
                    <input value={officeForm.name} onChange={(e) => setOfficeForm({ ...officeForm, name: e.target.value })} required className={inputCls} placeholder="Main Terminal" />
                  </div>
                  <div>
                    <label className={labelCls}>Code *</label>
                    <input value={officeForm.code} onChange={(e) => setOfficeForm({ ...officeForm, code: e.target.value })} required className={inputCls} placeholder="MT01" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>City</label>
                    <input value={officeForm.city} onChange={(e) => setOfficeForm({ ...officeForm, city: e.target.value })} className={inputCls} placeholder="Freetown" />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input value={officeForm.phone} onChange={(e) => setOfficeForm({ ...officeForm, phone: e.target.value })} className={inputCls} placeholder="+232 XX XXX XXXX" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input value={officeForm.address} onChange={(e) => setOfficeForm({ ...officeForm, address: e.target.value })} className={inputCls} placeholder="Lungi, Sierra Leone" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowOfficeModal(false)} className="px-4 py-2.5 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white bg-transparent transition-colors">Cancel</button>
                  <button type="submit" disabled={createOfficeMutation.isPending || updateOfficeMutation.isPending} className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50 flex items-center gap-2">
                    {(createOfficeMutation.isPending || updateOfficeMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
                    {editOffice ? 'Save Changes' : 'Create Office'}
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
