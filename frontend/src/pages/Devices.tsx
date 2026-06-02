import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Monitor, Wifi, WifiOff, MapPin, Clock, Edit, X, Loader2, Building2, Download, Users, CheckCircle, AlertCircle } from 'lucide-react'
import { devicesAPI, officesAPI, departmentsAPI } from '@/api/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useState } from 'react'
import type { Device, Office, Department } from '@/types'

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-800 text-sm bg-slate-950 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
const labelCls = 'block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5'

interface SDKUser {
  user_id: string
  name: string
  privilege: number
  uid: number
}

interface ImportResult {
  user_id: string
  name: string
  status: 'imported' | 'already_mapped'
  employee_id: string
  employee_code?: string
}

export default function Devices() {
  const queryClient = useQueryClient()
  const [editDevice, setEditDevice] = useState<Device | null>(null)
  const [editForm, setEditForm] = useState({ name: '', location_description: '', office_id: '', department_id: '' })
  const [importDevice, setImportDevice] = useState<Device | null>(null)
  const [importPreview, setImportPreview] = useState<SDKUser[] | null>(null)
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await devicesAPI.list()).data,
    refetchInterval: 15000,
  })

  const { data: offices = [] } = useQuery<Office[]>({
    queryKey: ['offices'],
    queryFn: async () => (await officesAPI.list()).data,
  })

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => devicesAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      toast.success('Device updated')
      setEditDevice(null)
    },
    onError: () => toast.error('Failed to update device'),
  })

  const previewMutation = useMutation({
    mutationFn: (deviceId: string) => devicesAPI.getSDKUsers(deviceId),
    onSuccess: (res) => setImportPreview(res.data.users),
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not connect to device. Check IP and port 4370.'),
  })

  const importMutation = useMutation({
    mutationFn: (deviceId: string) => devicesAPI.importSDKUsers(deviceId),
    onSuccess: (res) => {
      setImportResults(res.data.results)
      setImportPreview(null)
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success(`Imported ${res.data.imported} users, ${res.data.skipped} already mapped`)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Import failed'),
  })

  const openEdit = (device: Device) => {
    setEditDevice(device)
    setEditForm({
      name: device.name || '',
      location_description: '',
      office_id: device.office_id || '',
      department_id: device.department_id || '',
    })
  }

  const onlineCount = data?.items?.filter((d: Device) => d.is_online).length || 0
  const totalCount = data?.items?.length || 0

  return (
    <div className="animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-900/50"><Monitor size={20} className="text-blue-400" /></div>
          <div><p className="text-2xl font-bold text-slate-100">{totalCount}</p><p className="text-sm text-slate-400">Total Devices</p></div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/50"><Wifi size={20} className="text-emerald-400" /></div>
          <div><p className="text-2xl font-bold text-emerald-400">{onlineCount}</p><p className="text-sm text-slate-400">Online</p></div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-900/50"><WifiOff size={20} className="text-red-400" /></div>
          <div><p className="text-2xl font-bold text-red-400">{totalCount - onlineCount}</p><p className="text-sm text-slate-400">Offline</p></div>
        </div>
      </div>

      {/* Device Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-5"><div className="skeleton h-36 rounded-xl" /></div>
          ))
        ) : data?.items?.length ? (
          data.items.map((device: Device, i: number) => (
            <motion.div
              key={device.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-5 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${device.is_online ? 'bg-emerald-950/40 border border-emerald-900/50' : 'bg-slate-800/40 border border-slate-700/50'}`}>
                    <Monitor size={18} className={device.is_online ? 'text-emerald-400' : 'text-slate-500'} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-200 text-sm">
                      {device.name || `Device ${device.serial_number.slice(-6)}`}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">{device.serial_number}</p>
                  </div>
                </div>
                <span className={device.is_online ? 'badge-online' : 'badge-offline'}>
                  {device.is_online ? 'Online' : 'Offline'}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-300">
                  <MapPin size={13} className="text-slate-500 flex-shrink-0" />
                  <span className="text-xs">{device.ip_address || 'No IP assigned'}</span>
                </div>
                {device.office_name && (
                  <div className="flex items-center gap-2">
                    <Building2 size={13} className="text-slate-500 flex-shrink-0" />
                    <span className="text-xs text-slate-300">{device.office_name}</span>
                  </div>
                )}
                {device.department_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-blue-950/40 border border-blue-900/50 text-blue-400 px-2 py-0.5 rounded-full font-medium">
                      {device.department_name}
                    </span>
                  </div>
                )}
                {device.last_seen && (
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    <Clock size={12} />
                    {format(new Date(device.last_seen), 'MMM dd, hh:mm a')}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-3">
                <button
                  onClick={() => openEdit(device)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium hover:underline flex items-center gap-1"
                >
                  <Edit size={12} /> Configure
                </button>
                {device.ip_address && (
                  <button
                    onClick={() => { setImportDevice(device); setImportPreview(null); setImportResults(null) }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium hover:underline flex items-center gap-1"
                  >
                    <Download size={12} /> Import Users
                  </button>
                )}
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
      <AnimatePresence>
        {editDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditDevice(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative bg-[#0B0F19] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 z-10 text-slate-200">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">Configure Device</h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">{editDevice.serial_number}</p>
                </div>
                <button onClick={() => setEditDevice(null)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); const payload: Record<string, unknown> = { name: editForm.name }; if (editForm.office_id) payload.office_id = editForm.office_id; if (editForm.department_id) payload.department_id = editForm.department_id; updateMutation.mutate({ id: editDevice.id, data: payload }) }} className="space-y-4">
                <div>
                  <label className={labelCls}>Device Name</label>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputCls} placeholder="e.g. Main Entrance Terminal" />
                </div>
                <div>
                  <label className={labelCls}>Office</label>
                  <select value={editForm.office_id} onChange={(e) => setEditForm({ ...editForm, office_id: e.target.value })} className={inputCls}>
                    <option value="">No Office</option>
                    {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Department</label>
                  <select value={editForm.department_id} onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })} className={inputCls}>
                    <option value="">No Department</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setEditDevice(null)} className="px-4 py-2.5 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white bg-transparent transition-colors">Cancel</button>
                  <button type="submit" disabled={updateMutation.isPending} className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50 flex items-center gap-2">
                    {updateMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                    Save
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Import Users Modal */}
      <AnimatePresence>
        {importDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setImportDevice(null); setImportPreview(null); setImportResults(null) }} />
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative bg-[#0B0F19] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg z-10 overflow-hidden text-slate-200">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-900/50 text-emerald-400"><Download size={16} /></div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">Import Users from Device</h2>
                    <p className="text-xs text-slate-400">{importDevice.name || importDevice.serial_number} · {importDevice.ip_address}</p>
                  </div>
                </div>
                <button onClick={() => { setImportDevice(null); setImportPreview(null); setImportResults(null) }} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
              </div>

              <div className="p-6">
                {/* Results view */}
                {importResults ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/50 text-emerald-400">
                      <CheckCircle size={18} className="text-emerald-400" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-400">Import Complete</p>
                        <p className="text-xs text-emerald-500">
                          {importResults.filter(r => r.status === 'imported').length} imported · {importResults.filter(r => r.status === 'already_mapped').length} already existed
                        </p>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1.5">
                      {importResults.map((r) => (
                        <div key={r.user_id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 text-blue-400 border border-blue-800/50 flex items-center justify-center">
                              <span className="text-[10px] font-bold">{r.name[0]?.toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-200">{r.name}</p>
                              <p className="text-xs text-slate-400">ID: {r.user_id}{r.employee_code ? ` · ${r.employee_code}` : ''}</p>
                            </div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.status === 'imported' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40' : 'bg-slate-800/40 text-slate-400 border border-slate-700/40'}`}>
                            {r.status === 'imported' ? 'Imported' : 'Existed'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => { setImportDevice(null); setImportResults(null) }} className="w-full py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors">
                      Done — View Employees
                    </button>
                  </div>
                ) : importPreview ? (
                  /* Preview view */
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-950/30 border border-blue-900/50 text-blue-400">
                      <Users size={16} />
                      <p className="text-sm font-medium">{importPreview.length} users found on device</p>
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-1.5">
                      {importPreview.map((u) => (
                        <div key={u.user_id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 text-blue-400 border border-blue-800/50 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold">{u.name[0]?.toUpperCase() || '?'}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-200">{u.name}</p>
                            <p className="text-xs text-slate-400">Device User ID: <span className="font-mono font-semibold text-slate-300">{u.user_id}</span></p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 pt-1">
                      <button onClick={() => setImportPreview(null)} className="flex-1 py-2.5 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white bg-transparent transition-colors">Cancel</button>
                      <button
                        onClick={() => importMutation.mutate(importDevice.id)}
                        disabled={importMutation.isPending}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {importMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        Import All Users
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Initial state */
                  <div className="text-center py-6 space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-950/40 border border-emerald-900/50 flex items-center justify-center mx-auto text-emerald-400">
                      <Users size={28} />
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">Connect via TCP SDK</p>
                      <p className="text-sm text-slate-400 mt-1">
                        This will connect to <span className="font-mono font-semibold text-slate-300">{importDevice.ip_address}:4370</span> and retrieve all enrolled users
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-900/50 text-left">
                      <p className="text-xs text-amber-400 font-medium">Requirements:</p>
                      <ul className="text-xs text-amber-500 mt-1 space-y-0.5 list-disc list-inside">
                        <li>Device must be on the same network</li>
                        <li>TCP port 4370 must be accessible</li>
                        <li>Device must not be in admin menu</li>
                      </ul>
                    </div>
                    <button
                      onClick={() => previewMutation.mutate(importDevice.id)}
                      disabled={previewMutation.isPending}
                      className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {previewMutation.isPending ? (
                        <><Loader2 size={16} className="animate-spin" /> Connecting to device...</>
                      ) : (
                        <><Download size={16} /> Fetch Users from Device</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
