import { useQuery } from '@tanstack/react-query'
import { dashboardAPI } from '@/api/client'
import { useDeptSummaryStore } from '@/stores/deptSummaryStore'
import { Users, Clock, AlertTriangle, Fingerprint, Wifi, WifiOff } from 'lucide-react'

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  loading?: boolean
}

function StatCard({ label, value, icon, color, loading }: StatCardProps) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-[var(--pz-text-muted)] uppercase tracking-wider font-medium truncate">
          {label}
        </p>
        {loading ? (
          <div className="h-5 w-16 skeleton rounded mt-0.5" />
        ) : (
          <p className="text-lg font-bold text-[var(--pz-text)] font-mono tabular-nums leading-tight">
            {value}
          </p>
        )}
      </div>
    </div>
  )
}

export default function OperationalCards() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => (await dashboardAPI.getStats()).data,
    refetchInterval: 15000,
  })

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
      <StatCard
        label="Present Today"
        value={stats?.present_today ?? '--'}
        icon={<Users size={16} className="text-[var(--pz-success-500)]" />}
        color="bg-[var(--pz-success-50)]"
        loading={isLoading}
      />
      <StatCard
        label="Late Today"
        value={stats?.late_today ?? '--'}
        icon={<Clock size={16} className="text-[var(--pz-warning-500)]" />}
        color="bg-[var(--pz-warning-50)]"
        loading={isLoading}
      />
      <StatCard
        label="Absent Today"
        value={stats?.absent_today ?? '--'}
        icon={<AlertTriangle size={16} className="text-[var(--pz-danger-500)]" />}
        color="bg-[var(--pz-danger-50)]"
        loading={isLoading}
      />
      <StatCard
        label="Total Scans"
        value={stats?.total_scans_today ?? '--'}
        icon={<Fingerprint size={16} className="text-[var(--pz-accent)]" />}
        color="bg-[var(--pz-info-50)]"
        loading={isLoading}
      />
      <StatCard
        label="Devices Online"
        value={stats?.online_devices ?? stats?.active_devices ?? '--'}
        icon={<Wifi size={16} className="text-[var(--pz-success-500)]" />}
        color="bg-[var(--pz-success-50)]"
        loading={isLoading}
      />
      <StatCard
        label="Devices Offline"
        value={stats?.offline_devices || ((stats?.active_devices ?? 0) - (stats?.online_devices ?? stats?.active_devices ?? 0)) || '--'}
        icon={<WifiOff size={16} className="text-[var(--pz-danger-500)]" />}
        color="bg-[var(--pz-danger-50)]"
        loading={isLoading}
      />
    </div>
  )
}
