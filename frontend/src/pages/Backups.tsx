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
import { PageHeader } from '@/components/ui/PageHeader'

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
    <div className="space-y-6">
      <PageHeader
        title="Database Backups"
        description="Manage automated PostgreSQL backups"
        icon={Database}
        iconColor="#6366F1"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => triggerMutation.mutate('full')}
              disabled={triggerMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Play className="w-4 h-4" />
              {triggerMutation.isPending ? 'Running...' : 'Run Full Backup'}
            </button>
          </div>
        }
      />

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
            className="bg-surface rounded-xl border border-border p-5 flex items-center gap-4"
          >
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${card.color}15` }}>
              <card.icon size={22} style={{ color: card.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-text">{card.value}</p>
              <p className="text-sm text-text-muted">{card.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Schedule & Storage Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface rounded-xl border border-border p-6"
        >
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            Schedule
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Next Backup</span>
              <span className="font-medium text-text">
                {stats?.next_scheduled
                  ? new Date(stats.next_scheduled).toLocaleString()
                  : 'Disabled'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Last Backup</span>
              <span className="font-medium text-text">
                {stats?.last_backup_at ? formatRelative(stats.last_backup_at) : 'Never'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Avg Duration</span>
              <span className="font-medium text-text">{formatDuration(stats?.avg_duration_seconds ?? null)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Retention</span>
              <span className="font-medium text-text">30 days</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface rounded-xl border border-border p-6"
        >
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-amber-400" />
            Storage
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Storage Path</span>
              <span className="font-mono text-xs text-text bg-surface-2 px-2 py-1 rounded border border-border">
                {stats?.storage_path ?? 'backups/'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">Total Size</span>
              <span className="font-medium text-text">{stats?.total_size_display ?? '0 B'}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Backup History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-surface rounded-xl border border-border p-6"
      >
        <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Backup History
        </h3>

        {listLoading ? (
          <div className="flex justify-center py-8">
            <RefreshCcw className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No backups found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-text-muted">Status</th>
                  <th className="text-left py-2 px-3 font-medium text-text-muted">Type</th>
                  <th className="text-left py-2 px-3 font-medium text-text-muted">File</th>
                  <th className="text-right py-2 px-3 font-medium text-text-muted">Size</th>
                  <th className="text-right py-2 px-3 font-medium text-text-muted">Duration</th>
                  <th className="text-left py-2 px-3 font-medium text-text-muted">Initiated By</th>
                  <th className="text-left py-2 px-3 font-medium text-text-muted">Completed</th>
                  <th className="text-right py-2 px-3 font-medium text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => {
                  const cfg = statusConfig[job.status] || statusConfig.pending
                  const StatusIcon = cfg.icon
                  return (
                    <tr key={job.id} className="border-b border-border hover:bg-[var(--pz-surface-3)] transition-colors">
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                          <StatusIcon className={`w-3 h-3 ${job.status === 'running' ? 'animate-spin' : ''}`} />
                          {job.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-text-secondary capitalize">
                        {job.backup_type.replace('_', ' ')}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-text-muted max-w-[200px] truncate" title={job.file_name || ''}>
                        {job.file_name || 'N/A'}
                      </td>
                      <td className="py-2 px-3 text-right text-text-secondary">
                        {formatBytes(job.file_size_bytes)}
                      </td>
                      <td className="py-2 px-3 text-right text-text-secondary">
                        {formatDuration(job.duration_seconds)}
                      </td>
                      <td className="py-2 px-3 text-text-secondary">{job.init_by}</td>
                      <td className="py-2 px-3 text-text-muted text-xs">
                        {job.completed_at ? formatRelative(job.completed_at) : 'In progress...'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {job.status === 'failed' && job.error_message && (
                          <span title={job.error_message} className="inline mr-2 cursor-help">
                            <AlertTriangle className="w-4 h-4 text-amber-500 inline" />
                          </span>
                        )}
                        <button
                          onClick={() => deleteMutation.mutate(job.id)}
                          className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
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
          <div className="flex justify-center gap-2 mt-4 text-text">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-border bg-surface-2 text-text hover:bg-[var(--pz-surface-3)] text-sm disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-text-muted">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded border border-border bg-surface-2 text-text hover:bg-[var(--pz-surface-3)] text-sm disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
