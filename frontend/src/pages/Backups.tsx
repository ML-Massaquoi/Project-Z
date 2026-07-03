import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Database,
  Download,
  Trash2,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive,
  Calendar,
  Play,
  Shield,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { backupAPI } from '@/api/client'

interface BackupJob {
  id: string
  status: string
  backup_type: string
  file_name: string | null
  file_size_bytes: number | null
  file_size_display: string | null
  checksum_sha256: string | null
  database_name: string | null
  duration_seconds: number | null
  duration_display: string | null
  error_message: string | null
  init_by: string
  started_at: string | null
  completed_at: string | null
  expires_at: string | null
  created_at: string
}

interface BackupStats {
  total_backups: number
  successful_backups: number
  failed_backups: number
  total_size_bytes: number
  total_size_display: string
  last_backup_at: string | null
  last_backup_status: string | null
  avg_duration_seconds: number | null
  next_scheduled: string | null
  storage_path: string
}

const statusConfig: Record<string, { color: string; icon: React.ElementType; bg: string }> = {
  completed: { color: 'text-green-400', icon: CheckCircle2, bg: 'bg-green-500/10' },
  running: { color: 'text-blue-400', icon: RefreshCcw, bg: 'bg-blue-500/10' },
  failed: { color: 'text-red-400', icon: XCircle, bg: 'bg-red-500/10' },
  pending: { color: 'text-amber-400', icon: Clock, bg: 'bg-amber-500/10' },
  expired: { color: 'text-text-muted', icon: Clock, bg: 'bg-[var(--pz-surface-3)]' },
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return 'N/A'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(1)} ${units[i]}`
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'N/A'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '28px',
    padding: '32px',
    flex: 1,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  headerTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  headerSubtitle: {
    fontSize: '13px',
    color: 'var(--pz-text-muted)',
    margin: 0,
  },
  card: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '12px',
    padding: '24px',
  },
  statCard: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '12px',
    padding: '20px',
  },
}

export default function Backups() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)

  const { data: stats, isLoading: statsLoading } = useQuery<BackupStats>({
    queryKey: ['backup-stats'],
    queryFn: async () => { const r = await backupAPI.stats(); return r.data },
  })

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['backup-list', page],
    queryFn: async () => { const r = await backupAPI.list({ page, page_size: 15 }); return r.data },
  })

  const triggerMutation = useMutation({
    mutationFn: (type: string) => backupAPI.trigger({ backup_type: type }),
    onSuccess: () => {
      toast.success('Backup started')
      queryClient.invalidateQueries({ queryKey: ['backup-list'] })
      queryClient.invalidateQueries({ queryKey: ['backup-stats'] })
    },
    onError: (err: Error) => toast.error(`Backup failed: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => backupAPI.delete(id),
    onSuccess: () => {
      toast.success('Backup deleted')
      queryClient.invalidateQueries({ queryKey: ['backup-list'] })
      queryClient.invalidateQueries({ queryKey: ['backup-stats'] })
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  })

  const items: BackupJob[] = listData?.items || []
  const total = listData?.total || 0
  const totalPages = Math.ceil(total / 15)

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Database Backups</h1>
          <p style={s.headerSubtitle}>Manage automated PostgreSQL backups</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => triggerMutation.mutate('full')}
            disabled={triggerMutation.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
              background: '#6366F1', color: '#fff', borderRadius: '8px',
              fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer',
              opacity: triggerMutation.isPending ? 0.5 : 1,
            }}
          >
            <Play className="w-4 h-4" />
            {triggerMutation.isPending ? 'Running...' : 'Run Full Backup'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Backups', value: String(stats?.total_backups ?? 0), icon: Database, color: '#6366F1' },
          { label: 'Successful', value: String(stats?.successful_backups ?? 0), icon: CheckCircle2, color: '#10B981' },
          { label: 'Failed', value: String(stats?.failed_backups ?? 0), icon: XCircle, color: '#EF4444' },
          { label: 'Total Size', value: stats?.total_size_display ?? '0 B', icon: HardDrive, color: '#F59E0B' },
        ].map((card) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={s.statCard}
            className="flex items-center gap-4"
          >
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${card.color}15` }}>
              <card.icon size={22} style={{ color: card.color }} />
            </div>
            <div>
              <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{card.value}</p>
              <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', margin: 0 }}>{card.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Schedule & Storage Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={s.card}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--pz-text)', margin: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar className="w-5 h-5" style={{ color: '#818CF8' }} />
            Schedule
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span style={{ fontSize: '14px', color: 'var(--pz-text-secondary)' }}>Next Backup</span>
              <span style={{ fontWeight: 500, color: 'var(--pz-text)' }}>
                {stats?.next_scheduled
                  ? new Date(stats.next_scheduled).toLocaleString()
                  : 'Disabled'}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontSize: '14px', color: 'var(--pz-text-secondary)' }}>Last Backup</span>
              <span style={{ fontWeight: 500, color: 'var(--pz-text)' }}>
                {stats?.last_backup_at ? formatRelative(stats.last_backup_at) : 'Never'}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontSize: '14px', color: 'var(--pz-text-secondary)' }}>Avg Duration</span>
              <span style={{ fontWeight: 500, color: 'var(--pz-text)' }}>{formatDuration(stats?.avg_duration_seconds ?? null)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontSize: '14px', color: 'var(--pz-text-secondary)' }}>Retention</span>
              <span style={{ fontWeight: 500, color: 'var(--pz-text)' }}>30 days</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={s.card}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--pz-text)', margin: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardDrive className="w-5 h-5" style={{ color: '#FBBF24' }} />
            Storage
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span style={{ fontSize: '14px', color: 'var(--pz-text-secondary)' }}>Storage Path</span>
              <span className="font-mono text-xs" style={{ color: 'var(--pz-text)', background: 'var(--pz-surface-2)', padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--pz-border)' }}>
                {stats?.storage_path ?? 'backups/'}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontSize: '14px', color: 'var(--pz-text-secondary)' }}>Total Size</span>
              <span style={{ fontWeight: 500, color: 'var(--pz-text)' }}>{stats?.total_size_display ?? '0 B'}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Backup History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={s.card}
      >
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--pz-text)', margin: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield className="w-5 h-5" style={{ color: '#60A5FA' }} />
          Backup History
        </h3>

        {listLoading ? (
          <div className="flex justify-center py-8">
            <RefreshCcw className="w-6 h-6 animate-spin" style={{ color: '#3B82F6' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'var(--pz-text-muted)' }}>No backups found</div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--pz-border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--pz-text-muted)' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--pz-text-muted)' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--pz-text-muted)' }}>File</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500, color: 'var(--pz-text-muted)' }}>Size</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500, color: 'var(--pz-text-muted)' }}>Duration</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--pz-text-muted)' }}>Initiated By</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--pz-text-muted)' }}>Completed</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500, color: 'var(--pz-text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => {
                  const cfg = statusConfig[job.status] || statusConfig.pending
                  const StatusIcon = cfg.icon
                  return (
                    <tr key={job.id} style={{ borderBottom: '1px solid var(--pz-border)' }} className="hover:bg-[var(--pz-surface-3)] transition-colors">
                      <td style={{ padding: '8px 12px' }}>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                          <StatusIcon className={`w-3 h-3 ${job.status === 'running' ? 'animate-spin' : ''}`} />
                          {job.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--pz-text-secondary)', textTransform: 'capitalize' }}>
                        {job.backup_type.replace('_', ' ')}
                      </td>
                      <td className="font-mono text-xs" style={{ color: 'var(--pz-text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '8px 12px' }} title={job.file_name || ''}>
                        {job.file_name || 'N/A'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--pz-text-secondary)', padding: '8px 12px' }}>
                        {formatBytes(job.file_size_bytes)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--pz-text-secondary)', padding: '8px 12px' }}>
                        {formatDuration(job.duration_seconds)}
                      </td>
                      <td style={{ color: 'var(--pz-text-secondary)', padding: '8px 12px' }}>{job.init_by}</td>
                      <td style={{ color: 'var(--pz-text-muted)', fontSize: '12px', padding: '8px 12px' }}>
                        {job.completed_at ? formatRelative(job.completed_at) : 'In progress...'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 12px' }}>
                        {job.status === 'failed' && job.error_message && (
                          <span title={job.error_message} className="inline mr-2 cursor-help">
                            <AlertTriangle className="w-4 h-4" style={{ color: '#F59E0B', display: 'inline' }} />
                          </span>
                        )}
                        <button
                          onClick={() => deleteMutation.mutate(job.id)}
                          className="p-1 rounded hover:bg-red-500/10"
                          style={{ color: 'var(--pz-text-muted)', border: 'none', cursor: 'pointer', background: 'none' }}
                          title="Delete backup"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', color: 'var(--pz-text)' }}>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              style={{
                padding: '4px 12px', borderRadius: '8px', border: '1px solid var(--pz-border)',
                background: 'var(--pz-surface-2)', color: 'var(--pz-text)', cursor: page === 1 ? 'not-allowed' : 'pointer',
                fontSize: '14px', opacity: page === 1 ? 0.4 : 1,
              }}
            >
              Previous
            </button>
            <span style={{ padding: '4px 12px', fontSize: '14px', color: 'var(--pz-text-muted)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              style={{
                padding: '4px 12px', borderRadius: '8px', border: '1px solid var(--pz-border)',
                background: 'var(--pz-surface-2)', color: 'var(--pz-text)', cursor: page === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '14px', opacity: page === totalPages ? 0.4 : 1,
              }}
            >
              Next
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
