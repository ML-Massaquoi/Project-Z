import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  X, User, Fingerprint, Monitor, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, Loader2,
} from 'lucide-react'
import { syncAPI } from '@/api/client'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { EmployeeSyncStatus } from '@/types'

type BadgeStatus = 'online' | 'offline' | 'active' | 'inactive' | 'present' | 'late' | 'absent' |
  'on_time' | 'early_departure' | 'overtime' | 'in' | 'out' | 'unknown' |
  'warning' | 'danger' | 'info' | 'success' | 'pending' | 'processing' | 'failed' |
  'synced' | 'degraded' | 'critical'

function mapSyncHealth(health: string): BadgeStatus {
  if (health === 'healthy') return 'synced'
  if (health === 'degraded') return 'degraded'
  if (health === 'critical') return 'critical'
  return 'unknown'
}

interface EmployeeSyncDrawerProps {
  employeeId: string
  onClose: () => void
}

export function EmployeeSyncDrawer({ employeeId, onClose }: EmployeeSyncDrawerProps) {
  const queryClient = useQueryClient()

  const { data: status, isLoading } = useQuery<EmployeeSyncStatus>({
    queryKey: ['employee-sync', employeeId],
    queryFn: async () => (await syncAPI.employeeStatus(employeeId)).data,
  })

  const pushAllMutation = useMutation({
    mutationFn: () => syncAPI.pushEmployeeAll(employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-sync', employeeId] })
      queryClient.invalidateQueries({ queryKey: ['sync-matrix'] })
    },
  })

  const retryMutation = useMutation({
    mutationFn: () => syncAPI.employeeRetry(employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-sync', employeeId] })
      queryClient.invalidateQueries({ queryKey: ['sync-matrix'] })
    },
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-lg bg-[var(--pz-surface-1)] border-l border-[var(--pz-border)] shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-[var(--pz-border)] bg-[var(--pz-surface-1)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <User size={18} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--pz-text)]">Employee Sync Details</h2>
              <p className="text-[10px] text-[var(--pz-text-muted)]">Biometric synchronization status</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--pz-surface-2)] transition-colors">
            <X size={16} className="text-[var(--pz-text-muted)]" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : status ? (
          <div className="p-5 space-y-5">
            {/* Biometric Summary */}
            <div className="pz-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Fingerprint size={14} className="text-blue-400" />
                <h3 className="text-xs font-semibold text-[var(--pz-text)]">Biometric Summary</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-[var(--pz-surface-2)]/30 border border-[var(--pz-border)]/50 text-center">
                  <p className="text-2xl font-bold text-[var(--pz-text)]">{status.total_fingerprints}</p>
                  <p className="text-[10px] text-[var(--pz-text-muted)] mt-1">Fingerprints</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--pz-surface-2)]/30 border border-[var(--pz-border)]/50 text-center">
                  <p className="text-2xl font-bold text-[var(--pz-text)]">{status.total_templates}</p>
                  <p className="text-[10px] text-[var(--pz-text-muted)] mt-1">Templates</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--pz-surface-2)]/30 border border-[var(--pz-border)]/50 text-center">
                  <p className="text-2xl font-bold text-[var(--pz-text)]">{status.synced_device_count}/{status.total_devices}</p>
                  <p className="text-[10px] text-[var(--pz-text-muted)] mt-1">Devices Synced</p>
                </div>
              </div>
            </div>

            {/* Sync Health */}
            <div className="pz-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-[var(--pz-text)]">Sync Health</h3>
                <StatusBadge status={mapSyncHealth(status.sync_health)} size="sm" />
              </div>
              {status.last_sync_at && (
                <p className="text-[10px] text-[var(--pz-text-muted)]">
                  Last sync: {new Date(status.last_sync_at).toLocaleString()}
                </p>
              )}
            </div>

            {/* Device Status */}
            <div className="pz-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Monitor size={14} className="text-blue-400" />
                <h3 className="text-xs font-semibold text-[var(--pz-text)]">Device Status</h3>
              </div>
              <div className="space-y-2">
                {status.devices_available_on.map((dev) => (
                  <div key={dev.device_id} className="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-2)]/20">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--pz-text-secondary)]">{dev.name}</p>
                      <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">{dev.serial_number}</p>
                    </div>
                    <StatusBadge status="synced" size="xs" />
                  </div>
                ))}
                {status.devices_not_synced_to.map((dev) => (
                  <div key={dev.device_id} className="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-2)]/20">
                    <XCircle size={14} className="text-red-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--pz-text-secondary)]">{dev.name}</p>
                      <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">{dev.serial_number}</p>
                    </div>
                    <StatusBadge status="failed" size="xs" />
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => pushAllMutation.mutate()}
                disabled={pushAllMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-semibold hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                {pushAllMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Force Sync to All
              </button>
              <button
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                {retryMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                Retry Failed
              </button>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-[var(--pz-text-muted)]">
            <p className="text-sm">No sync data available</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
