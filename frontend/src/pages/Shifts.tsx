import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Clock, Plus, Edit, Trash2, Loader2, X, Sun, Moon, Sunrise } from 'lucide-react'
import { shiftsAPI } from '@/api/client'
import { toast } from 'sonner'
import type { Shift } from '@/types'

export default function Shifts() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editShift, setEditShift] = useState<Shift | null>(null)
  const [form, setForm] = useState({ name: '', code: '', start_time: '08:00', end_time: '17:00', grace_period_minutes: 15, break_duration_minutes: 60, working_hours: 8, is_overnight: false })

  const { data: shifts, isLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: async () => (await shiftsAPI.list()).data,
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => shiftsAPI.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shifts'] }); toast.success('Shift created'); setShowModal(false) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => shiftsAPI.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shifts'] }); toast.success('Shift updated'); setShowModal(false) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => shiftsAPI.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shifts'] }); toast.success('Shift deleted') },
  })

  const openCreate = () => {
    setEditShift(null)
    setForm({ name: '', code: '', start_time: '08:00', end_time: '17:00', grace_period_minutes: 15, break_duration_minutes: 60, working_hours: 8, is_overnight: false })
    setShowModal(true)
  }

  const openEdit = (s: Shift) => {
    setEditShift(s)
    setForm({
      name: s.name, code: s.code, start_time: s.start_time, end_time: s.end_time,
      grace_period_minutes: s.grace_period_minutes, break_duration_minutes: s.break_duration_minutes,
      working_hours: s.working_hours || 8, is_overnight: s.is_overnight,
    })
    setShowModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editShift) updateMutation.mutate({ id: editShift.id, data: form })
    else createMutation.mutate(form)
  }

  const shiftIcon = (code: string) => {
    if (code.includes('NIGHT')) return <Moon size={20} className="text-indigo-400" />
    if (code.includes('AFTERNOON')) return <Sunrise size={20} className="text-orange-400" />
    return <Sun size={20} className="text-amber-400" />
  }

  const shiftGradient = (code: string) => {
    if (code.includes('NIGHT')) return 'from-indigo-950/30 via-slate-900/20 to-purple-950/30 text-indigo-200 border-indigo-900/40'
    if (code.includes('AFTERNOON')) return 'from-amber-950/20 via-slate-900/20 to-orange-950/20 text-orange-200 border-orange-900/40'
    return 'from-yellow-950/20 via-slate-900/20 to-amber-950/20 text-amber-200 border-amber-900/40'
  }

  return (
    <div className="animate-fade-in">
      <div className="flex justify-end mb-6">
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] text-white rounded-xl text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors shadow-md shadow-blue-200" id="add-shift-btn">
          <Plus size={16} /> Add Shift
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="card p-5"><div className="skeleton h-36 rounded-xl" /></div>)
        ) : (shifts as Shift[])?.length ? (
          (shifts as Shift[]).map((shift, i) => (
            <motion.div key={shift.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`card p-5 bg-gradient-to-br ${shiftGradient(shift.code)}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 shadow-sm">{shiftIcon(shift.code)}</div>
                  <div>
                    <h3 className="font-semibold text-slate-200">{shift.name}</h3>
                    <p className="text-xs text-slate-400 font-mono">{shift.code}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(shift)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400"><Edit size={14} /></button>
                  <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(shift.id) }} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">Start</p>
                  <p className="font-semibold text-slate-200">{shift.start_time}</p>
                </div>
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">End</p>
                  <p className="font-semibold text-slate-200">{shift.end_time}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                <span>Grace: {shift.grace_period_minutes} min</span>
                <span>Break: {shift.break_duration_minutes} min</span>
                {shift.is_overnight && <span className="bg-indigo-950/40 text-indigo-400 border border-indigo-900/50 px-1.5 py-0.5 rounded">Overnight</span>}
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full text-center py-20 text-[var(--color-slate-400)]">
            <Clock size={48} className="mx-auto mb-3 opacity-20" /><p className="font-medium text-lg">No shifts defined</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-[#0B0F19] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 z-10 text-slate-200">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-100">{editShift ? 'Edit Shift' : 'Add Shift'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-400 mb-1">Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-400 mb-1">Code *</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required className="w-full px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-400 mb-1">Start Time</label><input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-400 mb-1">End Time</label><input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-400 mb-1">Grace (min)</label><input type="number" value={form.grace_period_minutes} onChange={(e) => setForm({ ...form, grace_period_minutes: parseInt(e.target.value) })} className="w-full px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-400 mb-1">Break (min)</label><input type="number" value={form.break_duration_minutes} onChange={(e) => setForm({ ...form, break_duration_minutes: parseInt(e.target.value) })} className="w-full px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.is_overnight} onChange={(e) => setForm({ ...form, is_overnight: e.target.checked })} className="rounded bg-slate-950 border-slate-800 text-[var(--color-primary)]" /> Overnight shift
              </label>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white bg-transparent transition-colors">Cancel</button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50 flex items-center gap-2">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
                  {editShift ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}
