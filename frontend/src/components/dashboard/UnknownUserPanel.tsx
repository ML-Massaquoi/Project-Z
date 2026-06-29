import { AlertTriangle, Link2 } from 'lucide-react'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useDeptSummaryStore } from '@/stores/deptSummaryStore'
import type { UnknownUserPayload } from '@/types'

function UnknownUserRow({ user }: { user: UnknownUserPayload }) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-amber-200 bg-[var(--pz-warning-50)]">
      <div className="w-7 h-7 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] font-bold text-[var(--pz-warning-500)] font-mono">{user.raw_device_user_id}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[var(--pz-text)] truncate">
          Biometric ID: {user.raw_device_user_id}
        </p>
        <p className="text-[10px] text-[var(--pz-text-muted)] truncate">
          {user.device_name || user.device_serial_number} · {user.office_name || 'Terminal'}
        </p>
        <p className="text-[9px] text-[var(--pz-warning-500)] font-mono">
          {format(new Date(user.scan_timestamp), 'HH:mm:ss')}
        </p>
      </div>
      <button
        onClick={() => navigate('/unrecognized')}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-white text-[10px] font-bold transition-colors flex-shrink-0 cursor-pointer"
        title="Map this employee"
      >
        <Link2 size={10} /> Map
      </button>
    </div>
  )
}

interface UnknownUserPanelProps {
  maxItems?: number
  className?: string
}

export function UnknownUserPanel({ maxItems = 20, className = '' }: UnknownUserPanelProps) {
  const allUnknown = useDeptSummaryStore((s) => s.unknownUsers)
  const unknownUsers = allUnknown.slice(0, maxItems)

  if (unknownUsers.length === 0) {
    return (
      <div className={`flex flex-col items-center py-8 text-[var(--pz-text-muted)] ${className}`}>
        <AlertTriangle size={28} className="mb-2 opacity-20" />
        <p className="text-sm">No unknown users</p>
        <p className="text-xs mt-1">All fingerprints are mapped to employees</p>
      </div>
    )
  }

  return (
    <div className={`space-y-2 overflow-y-auto max-h-[300px] pr-1 ${className}`}>
      {unknownUsers.map((u, i) => (
        <UnknownUserRow key={`${u.device_serial_number}-${u.raw_device_user_id}-${i}`} user={u} />
      ))}
    </div>
  )
}
