import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle, UserPlus, Link2, X, Loader2,
  Fingerprint, Clock, Monitor, Search,
} from 'lucide-react'
import { devicesAPI, employeesAPI, departmentsAPI } from '@/api/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { Employee, Department } from '@/types'

interface UnrecognizedUser {
  device_user_id: string
  device_id: string
  device_serial: string
  device_name: string | null
  device_ip: string | null
  scan_count: number
  last_seen: string | null
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-800 text-sm bg-slate-950 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all'
const labelCls = 'block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5'

// ── Map Modal ────────────────────────────────────────────
function MapUserModal({
  user,
  onClose,
}: {
  user: UnrecognizedUser
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [empSearch, setEmpSearch] = useState('')
  const [newForm, setNewForm] = useState({
    full_name: '',
    employee_code: `EMP-${user.device_user_id}`,
    department_id: '',
  })

  const { data: employeesData } = useQuery({
    queryKey: ['employees', 1, empSearch, ''],
    queryFn: async () => {
      const params: Record<string, unknown> = { page: 1, per_page: 20 }
      if (empSearch) params.search = empSearch
      return (await employeesAPI.list(params)).data
    },
  })

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })

  const mapExistingMutation = useMutation({
    mutationFn: () => devicesAPI.mapToExisting(user.device_id, user.device_user_id, selectedEmployeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unrecognized-users'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Device user mapped successfully')
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to map user'),
  })

  const mapNewMutation = useMutation({
    mutationFn: () => devicesAPI.mapToNew(
      user.device_id,
      user.device_user_id,
      newForm.full_name,
      newForm.employee_code,
      newForm.department_id || undefined,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unrecognized-users'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Employee created and mapped')
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to create employee'),
  })

  const employees: Employee[] = employeesData?.items ?? []

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
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative bg-[#0B0F19] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg z-10 overflow-hidden text-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-950/40 border border-amber-900/50 text-amber-400 animate-pulse">
              <Fingerprint size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 tracking-wide uppercase">
                Reconcile Biometric Telemetry
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Profile ID: <span className="font-mono font-semibold text-amber-400">{user.device_user_id}</span>
                {' · '}{user.device_name || user.device_serial}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/20 px-6 py-3">
          <div className="flex gap-2 p-1 rounded-xl bg-slate-950 border border-slate-900 w-full">
            {[
              { id: 'existing', label: 'Link Existing Employee', icon: Link2 },
              { id: 'new', label: 'Create New Employee', icon: UserPlus },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setMode(t.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  mode === t.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-4">
          {mode === 'existing' ? (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Search Employee Roster</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="Search by employee name or code..."
                    className={`${inputCls} pl-10 bg-slate-950/80 border-slate-800`}
                  />
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 border border-slate-800 rounded-xl p-2 bg-slate-950/70 scrollbar-thin">
                {employees.length === 0 ? (
                  <p className="text-center py-8 text-xs text-slate-500 font-mono">NO COMPATIBLE EMPLOYEES FOUND</p>
                ) : (
                  employees.map((emp) => {
                    const isSelected = selectedEmployeeId === emp.id
                    return (
                      <button
                        key={emp.id}
                        onClick={() => setSelectedEmployeeId(emp.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                          isSelected
                            ? 'bg-blue-950/60 border border-blue-500/40 text-blue-200 shadow-sm'
                            : 'border border-transparent hover:bg-slate-900/40 hover:border-slate-800/50 text-slate-300'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border transition-all ${
                          isSelected
                            ? 'bg-blue-900/40 text-blue-400 border-blue-500/30'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}>
                          <span className="text-xs font-bold font-mono">
                            {emp.full_name[0]?.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold truncate ${isSelected ? 'text-blue-300' : 'text-slate-200'}`}>
                            {emp.full_name}
                          </p>
                          <p className="text-[10px] font-mono truncate text-slate-400 mt-0.5">
                            {emp.employee_code} {emp.department_name ? `· ${emp.department_name}` : ''}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping flex-shrink-0" />
                        )}
                      </button>
                    )
                  })
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-800/60">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 bg-transparent transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => mapExistingMutation.mutate()}
                  disabled={!selectedEmployeeId || mapExistingMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 border border-blue-500/20 text-white text-xs font-semibold disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-blue-950/20"
                >
                  {mapExistingMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  <Link2 size={14} /> Link Employee
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Full Name *</label>
                  <input
                    value={newForm.full_name}
                    onChange={(e) => setNewForm({ ...newForm, full_name: e.target.value })}
                    placeholder="e.g. John Doe"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Employee Code *</label>
                  <input
                    value={newForm.employee_code}
                    onChange={(e) => setNewForm({ ...newForm, employee_code: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Department</label>
                <select
                  value={newForm.department_id}
                  onChange={(e) => setNewForm({ ...newForm, department_id: e.target.value })}
                  className={inputCls}
                >
                  <option value="">No Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-800/60">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 bg-transparent transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => mapNewMutation.mutate()}
                  disabled={!newForm.full_name || !newForm.employee_code || mapNewMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/20 text-white text-xs font-semibold disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/20"
                >
                  {mapNewMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  <UserPlus size={14} /> Create & Map
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────
export default function UnrecognizedUsers() {
  const [selectedUser, setSelectedUser] = useState<UnrecognizedUser | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['unrecognized-users'],
    queryFn: async () => (await devicesAPI.getUnrecognizedUsers()).data,
    refetchInterval: 30000,
  })

  const users: UnrecognizedUser[] = data?.users ?? []

  return (
    <div className="animate-fade-in space-y-6">
      {/* Banner */}
      {users.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-amber-950/40 via-amber-950/20 to-transparent border border-amber-500/20 border-l-4 border-l-amber-500 shadow-lg shadow-amber-950/20"
        >
          <div className="p-2 rounded-lg bg-amber-950/60 border border-amber-500/30 text-amber-400 flex-shrink-0 animate-pulse">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-amber-400 tracking-wide uppercase">
              System Alert: Unresolved Biometric Telemetry
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Detected <span className="font-semibold text-amber-400 font-mono">{users.length}</span> unrecognized biometric profile{users.length !== 1 ? 's' : ''} actively scanning on registered terminals. These records must be mapped to authorized employee profiles to reconcile attendance logs.
            </p>
          </div>
        </motion.div>
      )}

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/20 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Unmapped Device Biometrics</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Profiles captured on terminal devices but missing employee credentials mapping
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-semibold text-blue-400 hover:text-blue-300 hover:bg-slate-900/60 transition-all bg-transparent"
          >
            Refresh Logs
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-900 flex items-center justify-center mx-auto mb-4 text-slate-600">
              <Fingerprint size={32} />
            </div>
            <p className="font-semibold text-slate-300">All Biometric Profiles Synced</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              No unrecognized scans found. Every fingerprint logged by network terminals is correctly matched to a valid worker ID.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-800">
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Device User ID</th>
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Originating Device</th>
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Scans</th>
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Telemetry</th>
                  <th className="text-right py-3.5 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <motion.tr
                    key={`${u.device_id}-${u.device_user_id}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-slate-800/60 hover:bg-slate-800/30 hover:border-slate-700/50 transition-all duration-150"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-950/20 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
                          <Fingerprint size={18} />
                        </div>
                        <div>
                          <p className="font-mono font-bold text-sm text-slate-200">ID: {u.device_user_id}</p>
                          <div className="mt-1">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-950/40 text-amber-400 border border-amber-500/20">
                              Unmapped Profile
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
                          <Monitor size={15} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-200">{u.device_name || 'Terminal (Unknown)'}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-900/60">{u.device_ip || 'No IP'}</span>
                            <span className="text-[10px] font-mono text-slate-500">{u.device_serial}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-900 text-slate-300 border border-slate-800">
                        {u.scan_count} scan{u.scan_count !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Clock size={13} className="text-slate-500" />
                        <span className="text-xs font-medium">
                          {u.last_seen ? format(new Date(u.last_seen), 'MMM dd, hh:mm a') : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900/80 hover:bg-blue-600 border border-blue-700/50 text-blue-100 text-xs font-semibold transition-all hover:scale-[1.02] shadow-sm active:scale-95 ml-auto"
                      >
                        <Link2 size={12} /> Reconcile Profile
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Map Modal */}
      <AnimatePresence>
        {selectedUser && (
          <MapUserModal
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
