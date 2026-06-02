import { motion, AnimatePresence } from 'framer-motion'
import { Fingerprint, CreditCard, Eye, KeyRound, Scan } from 'lucide-react'
import { format } from 'date-fns'
import { useScanFeedStore } from '@/stores/scanFeedStore'
import type { ScanEventPayload } from '@/types'

const VERIFY_ICONS: Record<string, React.ReactNode> = {
  fingerprint: <Fingerprint size={12} />,
  face: <Eye size={12} />,
  card: <CreditCard size={12} />,
  password: <KeyRound size={12} />,
  other: <Scan size={12} />,
}

const RESULT_COLORS: Record<string, string> = {
  successful: 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20',
  duplicate: 'bg-amber-950/20 text-amber-400 border-amber-500/20',
  unknown_user: 'bg-red-950/20 text-red-400 border-red-500/20',
  unknown_device: 'bg-red-950/20 text-red-400 border-red-500/20',
  rejected: 'bg-red-950/20 text-red-400 border-red-500/20',
  movement: 'bg-blue-950/20 text-blue-400 border-blue-500/20',
  retry: 'bg-slate-800 text-gray-400 border-slate-700',
}

function ScanCard({ scan }: { scan: ScanEventPayload }) {
  const initials = scan.employee_name
    ? scan.employee_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const resultColor = RESULT_COLORS[scan.scan_result] || 'bg-slate-800 text-gray-400 border-slate-700'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--color-border)] bg-[#111827]/40 hover:bg-[#1F2937]/30 hover:border-gray-700 transition-colors"
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[var(--color-primary)] border border-blue-500/20">
        {scan.employee_photo_url ? (
          <img src={scan.employee_photo_url} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          initials
        )}
      </div>

      {/* Employee info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-200 truncate">
          {scan.employee_name || 'Unknown User'}
        </p>
        <p className="text-[10px] text-gray-400 truncate">
          {scan.employee_code} · {scan.department_name}
        </p>
      </div>

      {/* Verify method icon */}
      <div className="text-gray-400 flex-shrink-0" title={scan.verification_method}>
        {VERIFY_ICONS[scan.verification_method] || VERIFY_ICONS.other}
      </div>

      {/* Scan result badge */}
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${resultColor}`}>
        {scan.scan_result.replace('_', ' ')}
      </span>

      {/* Timestamp + device */}
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-mono font-semibold text-gray-300">
          {format(new Date(scan.scan_timestamp), 'HH:mm:ss')}
        </p>
        <p className="text-[9px] text-gray-500 truncate max-w-[70px]">
          {scan.device_name}
        </p>
      </div>
    </motion.div>
  )
}

interface LiveScanFeedProps {
  maxItems?: number
  className?: string
}

export function LiveScanFeed({ maxItems = 50, className = '' }: LiveScanFeedProps) {
  // Select only the count to avoid new-array-reference on every render.
  // The actual slice happens inside the render, not in the selector.
  const allScans = useScanFeedStore((s) => s.scans)
  const scans = allScans.slice(0, maxItems)

  return (
    <div className={`space-y-2 overflow-y-auto max-h-[600px] pr-1 ${className}`}>
      <AnimatePresence initial={false}>
        {scans.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-[var(--color-slate-400)]">
            <Fingerprint size={40} className="mb-3 opacity-20" />
            <p className="text-sm font-medium">Waiting for scans...</p>
            <p className="text-xs mt-1">Scans appear instantly as employees scan</p>
          </div>
        ) : (
          scans.map((scan) => (
            <ScanCard key={`${scan.scan_event_id}-${scan.scan_timestamp}`} scan={scan} />
          ))
        )}
      </AnimatePresence>
    </div>
  )
}
