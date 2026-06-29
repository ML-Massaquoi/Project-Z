import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Calendar, Plus, CheckCircle2, XCircle, Clock, Filter,
  Search, Plane, Stethoscope, Baby, UserX, AlertCircle,
} from 'lucide-react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { leaveAPI, employeesAPI } from '@/api/client'
import { PageHeader } from '@/components/ui/PageHeader'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface LeaveRequest {
  id: string
  employee_id: string
  employee_name?: string
  employee_code?: string
  department_name?: string
  leave_type: string
  start_date: string
  end_date: string
  status: string
  reason: string | null
  created_at: string
}

const LEAVE_TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  annual: { icon: <Plane size={14} />, color: 'text-blue-400', label: 'Annual' },
  sick: { icon: <Stethoscope size={14} />, color: 'text-amber-400', label: 'Sick' },
  maternity: { icon: <Baby size={14} />, color: 'text-pink-400', label: 'Maternity' },
  paternity: { icon: <Baby size={14} />, color: 'text-indigo-400', label: 'Paternity' },
  unpaid: { icon: <UserX size={14} />, color: 'text-gray-400', label: 'Unpaid' },
  emergency: { icon: <AlertCircle size={14} />, color: 'text-red-400', label: 'Emergency' },
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  pending: { color: 'text-amber-400', icon: <Clock size={14} /> },
  approved: { color: 'text-emerald-400', icon: <CheckCircle2 size={14} /> },
  rejected: { color: 'text-red-400', icon: <XCircle size={14} /> },
}

export default function LeaveManagement() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    employee_id: '',
    leave_type: 'annual',
    start_date: '',
    end_date: '',
    reason: '',
  })

  const { data: requests, isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ['leave-requests', statusFilter, typeFilter],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (statusFilter) params.status = statusFilter
      const res = await leaveAPI.list(params)
      return res.data
    },
    refetchInterval: 30000,
  })

  const { data: employees } = useQuery({
    queryKey: ['employees-list'],
    queryFn: async () => (await employeesAPI.list({ per_page: 200 })).data,
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => leaveAPI.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
      toast.success('Leave request approved')
      setSelectedRequest(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to approve'),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => leaveAPI.reject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
      toast.success('Leave request rejected')
      setSelectedRequest(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to reject'),
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof createForm) => leaveAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
      toast.success('Leave request created')
      setShowCreateModal(false)
      setCreateForm({ employee_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create'),
  })

  const filtered = (requests ?? []).filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (r.employee_name || '').toLowerCase().includes(q) ||
      (r.employee_code || '').toLowerCase().includes(q) ||
      r.leave_type.toLowerCase().includes(q)
    )
  }).filter(r => {
    if (!typeFilter) return true
    return r.leave_type === typeFilter
  })

  const stats = {
    pending: (requests ?? []).filter(r => r.status === 'pending').length,
    approved: (requests ?? []).filter(r => r.status === 'approved').length,
    rejected: (requests ?? []).filter(r => r.status === 'rejected').length,
    total: (requests ?? []).length,
  }

  return (
    <div className="space-y-5 pz-slide-up">
      <PageHeader
        title="Leave Management"
        subtitle={`Employee leave requests · ${stats.pending} pending approval`}
        breadcrumbs={[{ label: 'Workforce' }, { label: 'Leave' }]}
        actions={
          <Button variant="default" size="md" onClick={() => setShowCreateModal(true)}>
            <Plus size={15} />
            New Request
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={Calendar} label="Total" value={stats.total} color="#3B82F6" />
        <KPICard icon={Clock} label="Pending" value={stats.pending} color="#F59E0B" />
        <KPICard icon={CheckCircle2} label="Approved" value={stats.approved} color="#10B981" />
        <KPICard icon={XCircle} label="Rejected" value={stats.rejected} color="#EF4444" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-gray-300 focus:outline-none"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-gray-300 focus:outline-none"
        >
          <option value="">All Types</option>
          <option value="annual">Annual</option>
          <option value="sick">Sick</option>
          <option value="maternity">Maternity</option>
          <option value="paternity">Paternity</option>
          <option value="unpaid">Unpaid</option>
          <option value="emergency">Emergency</option>
        </select>
      </div>

      {/* Leave Requests Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="pz-card overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--pz-border)] bg-[var(--pz-surface-2)]/50">
                <th className="text-left py-3 px-4 text-gray-400 font-semibold">Employee</th>
                <th className="text-left py-3 px-4 text-gray-400 font-semibold">Type</th>
                <th className="text-left py-3 px-4 text-gray-400 font-semibold">Duration</th>
                <th className="text-left py-3 px-4 text-gray-400 font-semibold">Dates</th>
                <th className="text-left py-3 px-4 text-gray-400 font-semibold">Status</th>
                <th className="text-left py-3 px-4 text-gray-400 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req, i) => {
                const typeConfig = LEAVE_TYPE_CONFIG[req.leave_type] || LEAVE_TYPE_CONFIG.annual
                const days = differenceInDays(parseISO(req.end_date), parseISO(req.start_date)) + 1
                return (
                  <motion.tr
                    key={req.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-[var(--pz-border)]/30 hover:bg-[var(--pz-surface-2)]/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 flex items-center justify-center text-[10px] font-bold text-blue-400 border border-blue-500/20">
                          {req.employee_name?.[0] || '?'}
                        </div>
                        <div>
                          <span className="font-semibold text-gray-200">{req.employee_name || 'Unknown'}</span>
                          <p className="text-[10px] text-gray-500">{req.employee_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className={`flex items-center gap-1.5 ${typeConfig.color}`}>
                        {typeConfig.icon}
                        <span className="capitalize">{typeConfig.label}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-300 font-semibold">
                      {days} day{days !== 1 ? 's' : ''}
                    </td>
                    <td className="py-3 px-4 text-gray-400 font-mono text-[10px]">
                      {format(parseISO(req.start_date), 'MMM d')} – {format(parseISO(req.end_date), 'MMM d')}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={req.status as any} size="xs" dot={false}>
                        <span className={STATUS_CONFIG[req.status]?.color || 'text-gray-400'}>
                          {req.status}
                        </span>
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4">
                      {req.status === 'pending' && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => approveMutation.mutate(req.id)}
                            className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            title="Approve"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate(req.id)}
                            className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Reject"
                          >
                            <XCircle size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                )
              })}
              {!filtered.length && !isLoading && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-gray-500">
                    <Calendar size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">No leave requests found</p>
                    <p className="text-xs mt-1">Create a new request or adjust filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Detail Drawer */}
      <DetailDrawer
        open={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title="Leave Request Details"
        subtitle={selectedRequest ? `${selectedRequest.leave_type} leave` : ''}
        width={680}
      >
        {selectedRequest && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Type + Status cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
              <div style={{ padding: '16px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '6px', minHeight: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <p style={{ fontSize: '12px', fontWeight: 400, color: 'var(--pz-text-muted)', margin: 0 }}>Type</p>
                <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--pz-text)', textTransform: 'capitalize', margin: 0 }}>{selectedRequest.leave_type}</p>
              </div>
              <div style={{ padding: '16px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '6px', minHeight: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <p style={{ fontSize: '12px', fontWeight: 400, color: 'var(--pz-text-muted)', margin: 0 }}>Status</p>
                <div><StatusBadge status={selectedRequest.status as any} size="md">{selectedRequest.status}</StatusBadge></div>
              </div>
            </div>

            {/* Details table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Details</h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  ['Employee', selectedRequest.employee_name || 'Unknown'],
                  ['Start Date', format(parseISO(selectedRequest.start_date), 'MMMM d, yyyy')],
                  ['End Date', format(parseISO(selectedRequest.end_date), 'MMMM d, yyyy')],
                  ['Duration', `${differenceInDays(parseISO(selectedRequest.end_date), parseISO(selectedRequest.start_date)) + 1} days`],
                  ['Reason', selectedRequest.reason || '—'],
                  ['Submitted', format(parseISO(selectedRequest.created_at), 'MMM d, yyyy HH:mm')],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '44px', paddingInline: '14px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', textAlign: 'right', maxWidth: '240px' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Approve / Reject actions */}
            {selectedRequest.status === 'pending' && (
              <div style={{ display: 'flex', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--pz-border)' }}>
                <Button variant="success" size="md" style={{ flex: 1 }}
                  disabled={approveMutation.isPending} loading={approveMutation.isPending}
                  onClick={() => approveMutation.mutate(selectedRequest.id)}>
                  <CheckCircle2 size={15} /> Approve
                </Button>
                <Button variant="destructive" size="md" style={{ flex: 1 }}
                  disabled={rejectMutation.isPending} loading={rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate(selectedRequest.id)}>
                  <XCircle size={15} /> Reject
                </Button>
              </div>
            )}

          </div>
        )}
      </DetailDrawer>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && setShowCreateModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              width: '100%', maxWidth: '680px',
              background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)',
              boxShadow: 'var(--pz-shadow-modal)', borderRadius: '10px', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '28px 32px 20px 32px', borderBottom: '1px solid var(--pz-border)' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>New Leave Request</h3>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>Submit a leave request on behalf of an employee.</p>
            </div>

            {/* Body */}
            <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
                  Employee <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
                </label>
                <select
                  value={createForm.employee_id}
                  onChange={(e) => setCreateForm(p => ({ ...p, employee_id: e.target.value }))}
                  className="pz-input w-full"
                  style={{ height: '44px', fontSize: '14px' }}
                >
                  <option value="">Select employee</option>
                  {(employees?.items ?? []).map((emp: any) => (
                    <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
                  Leave Type <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
                </label>
                <select
                  value={createForm.leave_type}
                  onChange={(e) => setCreateForm(p => ({ ...p, leave_type: e.target.value }))}
                  className="pz-input w-full"
                  style={{ height: '44px', fontSize: '14px' }}
                >
                  <option value="annual">Annual Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="maternity">Maternity Leave</option>
                  <option value="paternity">Paternity Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                  <option value="emergency">Emergency Leave</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
                    Start Date <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={createForm.start_date}
                    onChange={(e) => setCreateForm(p => ({ ...p, start_date: e.target.value }))}
                    className="pz-input w-full"
                    style={{ height: '44px', fontSize: '14px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
                    End Date <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={createForm.end_date}
                    onChange={(e) => setCreateForm(p => ({ ...p, end_date: e.target.value }))}
                    className="pz-input w-full"
                    style={{ height: '44px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
                  Reason (optional)
                </label>
                <textarea
                  value={createForm.reason}
                  onChange={(e) => setCreateForm(p => ({ ...p, reason: e.target.value }))}
                  rows={3}
                  className="pz-input w-full"
                  placeholder="Reason for leave..."
                  style={{ height: 'auto', minHeight: '88px', fontSize: '14px', resize: 'none' }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '20px 32px 28px 32px', borderTop: '1px solid var(--pz-border)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <Button variant="outline" size="md" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button variant="default" size="md" loading={createMutation.isPending} disabled={!createForm.employee_id || !createForm.start_date || !createForm.end_date || createMutation.isPending} onClick={() => createMutation.mutate(createForm)}>
                {createMutation.isPending ? 'Creating...' : 'Create Request'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
