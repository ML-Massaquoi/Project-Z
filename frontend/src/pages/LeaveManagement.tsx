import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Modal } from '@/components/ui/Modal'
import {
  Calendar, Plus, CheckCircle2, XCircle, Clock, Filter,
  Search, Plane, Stethoscope, Baby, UserX, AlertCircle,
  FileText, Info,
} from 'lucide-react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { leaveAPI, employeesAPI } from '@/api/client'
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
  annual: { icon: <Plane size={14} />, color: '#60A5FA', label: 'Annual' },
  sick: { icon: <Stethoscope size={14} />, color: '#FBBF24', label: 'Sick' },
  maternity: { icon: <Baby size={14} />, color: '#F472B6', label: 'Maternity' },
  paternity: { icon: <Baby size={14} />, color: '#818CF8', label: 'Paternity' },
  unpaid: { icon: <UserX size={14} />, color: '#9CA3AF', label: 'Unpaid' },
  emergency: { icon: <AlertCircle size={14} />, color: '#F87171', label: 'Emergency' },
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  pending: { color: '#FBBF24', icon: <Clock size={14} /> },
  approved: { color: '#34D399', icon: <CheckCircle2 size={14} /> },
  rejected: { color: '#F87171', icon: <XCircle size={14} /> },
}

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '28px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' },
  filters: { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: '12px' },
  searchWrap: { position: 'relative' as const, flex: 1, maxWidth: '320px' },
  searchInput: { width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text-secondary)', outline: 'none', boxSizing: 'border-box' as const },
  selectInput: { padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '12px', color: 'var(--pz-text-secondary)', outline: 'none' },
  card: { background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' },
  tableWrap: { overflowX: 'auto' as const },
  table: { width: '100%', fontSize: '12px', borderCollapse: 'collapse' as const },
  th: { textAlign: 'left' as const, padding: '12px 16px', color: 'var(--pz-text-muted)', fontWeight: 600 },
  empCell: { display: 'flex', alignItems: 'center', gap: '10px' },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(59,130,246,0.4), rgba(99,102,241,0.4))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--pz-accent)', border: '1px solid rgba(59,130,246,0.2)' },
  empName: { fontWeight: 600, color: 'var(--pz-text-secondary)' },
  empCode: { fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0 },
  leaveTypeCell: { display: 'flex', alignItems: 'center', gap: '6px' },
  duration: { color: 'var(--pz-text-secondary)', fontWeight: 600 },
  dates: { color: 'var(--pz-text-muted)', fontFamily: 'monospace', fontSize: '10px' },
  emptyState: { padding: '64px 0', textAlign: 'center' as const, color: 'var(--pz-text-muted)' },
  emptyTitle: { fontSize: '14px', fontWeight: 500, margin: 0 },
  emptySub: { fontSize: '12px', marginTop: '4px' },
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
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Leave Management</h1>
          <p style={s.headerSubtitle}>
            Employee leave requests · {stats.pending} pending approval
          </p>
        </div>
        <Button variant="default" size="md" onClick={() => setShowCreateModal(true)}>
          <Plus size={15} />
          New Request
        </Button>
      </div>

      {/* KPI Cards */}
      <div style={s.kpiGrid}>
        <KPICard icon={Calendar} label="Total" value={stats.total} color="#3B82F6" />
        <KPICard icon={Clock} label="Pending" value={stats.pending} color="#F59E0B" />
        <KPICard icon={CheckCircle2} label="Approved" value={stats.approved} color="#10B981" />
        <KPICard icon={XCircle} label="Rejected" value={stats.rejected} color="#EF4444" />
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <div style={s.searchWrap}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--pz-text-muted)' }} />
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={s.searchInput}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={s.selectInput}
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={s.selectInput}
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
        style={s.card}
      >
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--pz-border)', background: 'rgba(255,255,255,0.025)' }}>
                <th style={s.th}>Employee</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Duration</th>
                <th style={s.th}>Dates</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Actions</th>
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
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={s.empCell}>
                        <div style={s.avatar}>
                          {req.employee_name?.[0] || '?'}
                        </div>
                        <div>
                          <span style={s.empName}>{req.employee_name || 'Unknown'}</span>
                          <p style={s.empCode}>{req.employee_code}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={s.leaveTypeCell}>
                        <span style={{ color: typeConfig.color, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {typeConfig.icon}
                          <span style={{ textTransform: 'capitalize' }}>{typeConfig.label}</span>
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={s.duration}>{days} day{days !== 1 ? 's' : ''}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={s.dates}>
                        {format(parseISO(req.start_date), 'MMM d')} - {format(parseISO(req.end_date), 'MMM d')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={req.status as any} size="xs" dot={false}>
                        <span style={{ color: STATUS_CONFIG[req.status]?.color || 'var(--pz-text-muted)' }}>
                          {req.status}
                        </span>
                      </StatusBadge>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {req.status === 'pending' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            onClick={() => approveMutation.mutate(req.id)}
                            style={{ padding: '6px', borderRadius: '6px', border: 'none', cursor: 'pointer', color: 'var(--pz-success)', background: 'transparent' }}
                            title="Approve"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate(req.id)}
                            style={{ padding: '6px', borderRadius: '6px', border: 'none', cursor: 'pointer', color: 'var(--pz-danger)', background: 'transparent' }}
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
                  <td colSpan={6} style={s.emptyState}>
                    <Calendar size={32} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                    <p style={s.emptyTitle}>No leave requests found</p>
                    <p style={s.emptySub}>Create a new request or adjust filters</p>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
              <div style={{ padding: '20px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '10px', minHeight: '88px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <p style={{ fontSize: '12px', fontWeight: 400, color: 'var(--pz-text-muted)', margin: 0 }}>Type</p>
                <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--pz-text)', textTransform: 'capitalize', margin: 0 }}>{selectedRequest.leave_type}</p>
              </div>
              <div style={{ padding: '20px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '10px', minHeight: '88px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <p style={{ fontSize: '12px', fontWeight: 400, color: 'var(--pz-text-muted)', margin: 0 }}>Status</p>
                <div><StatusBadge status={selectedRequest.status as any} size="md">{selectedRequest.status}</StatusBadge></div>
              </div>
            </div>

            {/* Details table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={14} style={{ color: 'var(--pz-accent)' }} />
                </div>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Details</h4>
              </div>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' }}>
                {[
                  ['Employee', selectedRequest.employee_name || 'Unknown'],
                  ['Start Date', format(parseISO(selectedRequest.start_date), 'MMMM d, yyyy')],
                  ['End Date', format(parseISO(selectedRequest.end_date), 'MMMM d, yyyy')],
                  ['Duration', `${differenceInDays(parseISO(selectedRequest.end_date), parseISO(selectedRequest.start_date)) + 1} days`],
                  ['Reason', selectedRequest.reason || '---'],
                  ['Submitted', format(parseISO(selectedRequest.created_at), 'MMM d, yyyy HH:mm')],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '52px', paddingInline: '16px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--pz-text-secondary)', textAlign: 'right', maxWidth: '240px' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Approve / Reject actions */}
            {selectedRequest.status === 'pending' && (
              <div style={{ display: 'flex', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)' }}>
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
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="New Leave Request"
        description="Submit a leave request on behalf of an employee."
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Button variant="outline" size="md" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button variant="default" size="md" loading={createMutation.isPending} disabled={!createForm.employee_id || !createForm.start_date || !createForm.end_date || createMutation.isPending} onClick={() => createMutation.mutate(createForm)}>
              {createMutation.isPending ? 'Creating...' : 'Create Request'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px' }}>

          {/* ── Leave Details ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Info size={14} style={{ color: 'var(--pz-accent)' }} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>Leave Details</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
            </div>
          </div>

          {/* ── Dates ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calendar size={14} style={{ color: 'var(--pz-accent)' }} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>Dates</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
          </div>

          {/* ── Reason ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={14} style={{ color: 'var(--pz-accent)' }} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>Reason</span>
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
        </div>

      </Modal>
    </div>
  )
}
