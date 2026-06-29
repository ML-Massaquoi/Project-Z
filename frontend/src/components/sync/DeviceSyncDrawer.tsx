import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  X, Monitor, RefreshCw, Download, Upload, Loader2,
  CheckCircle2, AlertTriangle, Clock, Database,
} from 'lucide-react'
import { syncAPI, devicesAPI } from '@/api/client'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { DeviceSyncStatus, Device } from '@/types'

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

interface DeviceSyncDrawerProps {
  deviceId: string
  onClose: () => void
}

export function DeviceSyncDrawer({ deviceId, onClose }: DeviceSyncDrawerProps) {
  const queryClient = useQueryClient()

  const { data: device } = useQuery<Device>({
    queryKey: ['device', deviceId],
    queryFn: async () => (await devicesAPI.get(deviceId)).data,
  })

  const { data: syncStatus, isLoading } = useQuery<DeviceSyncStatus>({
    queryKey: ['device-sync', deviceId],
    queryFn: async () => (await syncAPI.deviceSync(deviceId)).data,
    refetchInterval: 10000,
  })

  const fullSyncMutation = useMutation({
    mutationFn: () => syncAPI.fullSync(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-sync', deviceId] })
      queryClient.invalidateQueries({ queryKey: ['sync-overview'] })
    },
  })

  const pullUsersMutation = useMutation({
    mutationFn: () => syncAPI.pullUsers(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-sync', deviceId] })
    },
  })

  const pullTemplatesMutation = useMutation({
    mutationFn: () => syncAPI.pullTemplates(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-sync', deviceId] })
    },
  })

  const pushUsersMutation = useMutation({
    mutationFn: () => syncAPI.pushUsers(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-sync', deviceId] })
      queryClient.invalidateQueries({ queryKey: ['sync-overview'] })
    },
  })

  const pushTemplatesMutation = useMutation({
    mutationFn: () => syncAPI.pushTemplates(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-sync', deviceId] })
      queryClient.invalidateQueries({ queryKey: ['sync-overview'] })
    },
  })

  const initialSyncMutation = useMutation({
    mutationFn: () => syncAPI.initialSync(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-sync', deviceId] })
      queryClient.invalidateQueries({ queryKey: ['sync-overview'] })
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
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Monitor size={18} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--pz-text)]">
                {device?.name || 'Device Sync'}
              </h2>
              <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">
                {device?.serial_number} · {device?.ip_address}
              </p>
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
        ) : syncStatus ? (
          <div className="p-5 space-y-5">
            {/* Sync Summary */}
            <div className="pz-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-[var(--pz-text)]">Sync Summary</h3>
                <StatusBadge status={mapSyncHealth(syncStatus.sync_health)} size="sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-[var(--pz-surface-2)]/30 border border-[var(--pz-border)]/50">
                  <p className="text-[10px] text-[var(--pz-text-muted)]">Users on Device</p>
                  <p className="text-xl font-bold text-[var(--pz-text)]">{syncStatus.total_users_on_device}</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--pz-surface-2)]/30 border border-[var(--pz-border)]/50">
                  <p className="text-[10px] text-[var(--pz-text-muted)]">Templates Stored</p>
                  <p className="text-xl font-bold text-[var(--pz-text)]">{syncStatus.total_templates_stored}</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--pz-surface-2)]/30 border border-[var(--pz-border)]/50">
                  <p className="text-[10px] text-[var(--pz-text-muted)]">Pending Push</p>
                  <p className="text-xl font-bold text-amber-400">{syncStatus.pending_push_users + syncStatus.pending_push_templates}</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--pz-surface-2)]/30 border border-[var(--pz-border)]/50">
                  <p className="text-[10px] text-[var(--pz-text-muted)]">Failed Syncs</p>
                  <p className="text-xl font-bold text-red-400">{syncStatus.failed_syncs}</p>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="pz-card p-4">
              <h3 className="text-xs font-semibold text-[var(--pz-text)] mb-3">Last Operations</h3>
              <div className="space-y-2 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--pz-text-muted)]">Last Full Sync</span>
                  <span className="text-[var(--pz-text-secondary)] font-mono">
                    {syncStatus.last_full_sync_at ? new Date(syncStatus.last_full_sync_at).toLocaleString() : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--pz-text-muted)]">Last Push</span>
                  <span className="text-[var(--pz-text-secondary)] font-mono">
                    {syncStatus.last_push_at ? new Date(syncStatus.last_push_at).toLocaleString() : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--pz-text-muted)]">Last Pull</span>
                  <span className="text-[var(--pz-text-secondary)] font-mono">
                    {syncStatus.last_pull_at ? new Date(syncStatus.last_pull_at).toLocaleString() : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--pz-text-muted)]">Provisioned</span>
                  <span className="text-[var(--pz-text-secondary)] font-mono">
                    {syncStatus.provisioned_at ? new Date(syncStatus.provisioned_at).toLocaleString() : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[var(--pz-text)]">Sync Operations</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => fullSyncMutation.mutate()}
                  disabled={fullSyncMutation.isPending}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                >
                  {fullSyncMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Full Sync
                </button>
                <button
                  onClick={() => initialSyncMutation.mutate()}
                  disabled={initialSyncMutation.isPending}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold hover:bg-violet-500/20 transition-colors disabled:opacity-50"
                >
                  {initialSyncMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                  Initial Sync
                </button>
                <button
                  onClick={() => pullUsersMutation.mutate()}
                  disabled={pullUsersMutation.isPending}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  {pullUsersMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  Pull Users
                </button>
                <button
                  onClick={() => pullTemplatesMutation.mutate()}
                  disabled={pullTemplatesMutation.isPending}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  {pullTemplatesMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  Pull Templates
                </button>
                <button
                  onClick={() => pushUsersMutation.mutate()}
                  disabled={pushUsersMutation.isPending}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                >
                  {pushUsersMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  Push Users
                </button>
                <button
                  onClick={() => pushTemplatesMutation.mutate()}
                  disabled={pushTemplatesMutation.isPending}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                >
                  {pushTemplatesMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  Push Templates
                </button>
              </div>
            </div>

            {/* Last Error */}
            {syncStatus.last_error && (
              <div className="pz-card p-4 border-red-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={14} className="text-red-400" />
                  <h3 className="text-xs font-semibold text-red-400">Last Error</h3>
                </div>
                <p className="text-[10px] text-[var(--pz-text-muted)] font-mono break-all">
                  {syncStatus.last_error}
                </p>
              </div>
            )}
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
