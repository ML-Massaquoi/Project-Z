import { Copy } from 'lucide-react'
import { format } from 'date-fns'
import { useScanFeedStore } from '@/stores/scanFeedStore'
import type { ScanEventPayload } from '@/types'

function DuplicateRow({ scan }: { scan: ScanEventPayload }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg border border-[var(--color-border)] bg-[#111827]/40">
      <div className="w-7 h-7 rounded-full bg-amber-950/20 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] font-bold text-amber-400">
          {scan.employee_name?.[0] || '?'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-200 truncate">
          {scan.employee_name || 'Unknown'}
        </p>
        <p className="text-[10px] text-gray-400 truncate">
          {scan.device_name}
        </p>
      </div>
      <p className="text-[10px] font-mono text-gray-400 flex-shrink-0">
        {format(new Date(scan.scan_timestamp), 'HH:mm:ss')}
      </p>
    </div>
  )
}

interface DuplicateScanPanelProps {
  maxItems?: number
  className?: string
}

export function DuplicateScanPanel({ maxItems = 20, className = '' }: DuplicateScanPanelProps) {
  const allDuplicates = useScanFeedStore((s) => s.duplicates)
  const duplicates = allDuplicates.slice(0, maxItems)

  if (duplicates.length === 0) {
    return (
      <div className={`flex flex-col items-center py-8 text-[var(--color-slate-400)] ${className}`}>
        <Copy size={28} className="mb-2 opacity-20" />
        <p className="text-sm">No duplicate scans today</p>
      </div>
    )
  }

  return (
    <div className={`space-y-1.5 overflow-y-auto max-h-[300px] pr-1 ${className}`}>
      <p className="text-xs text-[var(--color-slate-400)] mb-2">
        {duplicates.length} duplicate scan{duplicates.length !== 1 ? 's' : ''} today
      </p>
      {duplicates.map((scan, i) => (
        <DuplicateRow key={`${scan.scan_event_id}-${i}`} scan={scan} />
      ))}
    </div>
  )
}
