import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Monitor, Wifi, WifiOff, MapPin, Clock, Edit, X } from 'lucide-react'
import { devicesAPI } from '@/api/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useState } from 'react'
import type { Device } from '@/types'

export default function Devices() {
  const queryClient = useQueryClient()
  const [editDevice, setEditDevice] = useState<Device | null>(null)
  const [editForm, setEditForm] = useState({ name: '', location_description: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await devicesAPI.list()).data,
    refetchInterval: 15000,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => devicesAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      toast.success('Device updated')
      setEditDevice(null)
    },
  })

  const onlineCount = data?.items?.filter((d: Device) => d.is_online).length || 0
  const totalCount = data?.items?.length || 0

  return (
    <div className="animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-50"><Monitor size={22} className="text-[var(--color-primary)]" /></div>
          <div><p className="text-2xl font-bold text-[var(--color-slate-800)]">{totalCount}</p><p className="text-sm text-[var(--color-slate-400)]">Total Devices</p></div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50"><Wifi size={22} className="text-emerald-500" /></div>
          <div><p className="text-2xl font-bold text-emerald-600">{onlineCount}</p><p className="text-sm text-[var(--color-slate-400)]">Online</p></div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-red-50"><WifiOff size={22} className="text-red-400" /></div>
          <div><p className="text-2xl font-bold text-red-500">{totalCount - onlineCount}</p><p className="text-sm text-[var(--color-slate-400)]">Offline</p></div>
        </div>
      </div>

      {/* Device Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5"><div className="skeleton h-32 rounded-xl" /></div>
          ))
        ) : data?.items?.length ? (
          data.items.map((device: Device, i: number) => (
            <motion.div
              key={device.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-5 hover:shadow-lg transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${device.is_online ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <Monitor size={20} className={device.is_online ? 'text-emerald-500' : 'text-red-400'} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--color-slate-700)] text-sm">
                      {device.name || `Device ${device.serial_number.slice(-6)}`}
                    </h3>
                    <p className="text-xs text-[var(--color-slate-400)] font-mono">{device.serial_number}</p>
                  </div>
                </div>
                <span className={device.is_online ? 'badge-online' : 'badge-offline'}>
                  {device.is_online ? 'Online' : 'Offline'}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-[var(--color-slate-500)]">
                  <MapPin size={14} className="text-[var(--color-slate-400)]" />
                  <span>{device.ip_address || 'No IP assigned'}</span>
                </div>
                {device.office_name && (
                  <div className="flex items-center gap-2 text-[var(--color-slate-500)]">
                    <span className="text-xs bg-blue-50 text-[var(--color-primary)] px-2 py-0.5 rounded-full font-medium">
                      {device.office_name}
                    </span>
                  </div>
                )}
                {device.last_seen && (
                  <div className="flex items-center gap-2 text-[var(--color-slate-400)] text-xs">
                    <Clock size={12} />
                    Last seen: {format(new Date(device.last_seen), 'MMM dd, hh:mm a')}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
                <button
                  onClick={() => { setEditDevice(device); setEditForm({ name: device.name || '', location_description: '' }) }}
                  className="text-xs text-[var(--color-primary)] font-medium hover:underline flex items-center gap-1"
                >
                  <Edit size={12} /> Edit Device
                </button>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full text-center py-20 text-[var(--color-slate-400)]">
            <Monitor size={48} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium text-lg">No devices registered</p>
            <p className="text-sm mt-1">Devices auto-register when they connect via ADMS</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditDevice(null)} />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">Edit Device</h2>
              <button onClick={() => setEditDevice(null)} className="p-1 hover:bg-[var(--color-slate-50)] rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate({ id: editDevice.id, data: editForm }) }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-slate-600)] mb-1">Device Name</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" placeholder="e.g. Main Office Door" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setEditDevice(null)} className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-medium">Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors">Save</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}
