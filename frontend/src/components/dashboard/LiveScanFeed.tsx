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
  successful: 'bg-[var(--pz-success-50)] text-[var(--pz-success-600)] border-[var(--pz-success-border)]',
  duplicate: 'bg-[var(--pz-warning-50)] text-[var(--pz-warning-600)] border-[var(--pz-warning-border)]',
  unknown_user: 'bg-[var(--pz-danger-50)] text-[var(--pz-danger-500)] border-[var(--pz-danger-border)]',
  unknown_device: 'bg-[var(--pz-danger-50)] text-[var(--pz-danger-500)] border-[var(--pz-danger-border)]',
  rejected: 'bg-[var(--pz-danger-50)] text-[var(--pz-danger-500)] border-[var(--pz-danger-border)]',
  movement: 'bg-[var(--pz-info-50)] text-[var(--pz-info-500)] border-[var(--pz-info-border)]',
  retry: 'bg-[var(--pz-surface-3)] text-[var(--pz-text-muted)] border-[var(--pz-border)]',
}

function ScanCard({ scan }: { scan: ScanEventPayload }) {
  const initials = scan.employee_name
    ? scan.employee_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const resultColor = RESULT_COLORS[scan.scan_result] || 'bg-[var(--pz-surface-3)] text-[var(--pz-text-muted)] border-[var(--pz-border)]'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--pz-border)] bg-white hover:bg-[var(--pz-surface-2)] transition-colors"
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-[var(--pz-brand-light)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[var(--pz-brand)] border border-[var(--pz-accent-border)]">
        {scan.employee_photo_url ? (
          <img src={scan.employee_photo_url} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          initials
        )}
      </div>

      {/* Employee info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[var(--pz-text)] truncate">
          {scan.employee_name || 'Unknown User'}
        </p>
        <p className="text-[10px] text-[var(--pz-text-muted)] truncate">
          {scan.employee_code} · {scan.department_name}
        </p>
      </div>

      {/* Verify method icon */}
      <div className="text-[var(--pz-text-muted)] flex-shrink-0" title={scan.verification_method}>
        {VERIFY_ICONS[scan.verification_method] || VERIFY_ICONS.other}
      </div>

      {/* Scan result badge */}
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${resultColor}`}>
        {scan.scan_result.replace('_', ' ')}
      </span>

      {/* Timestamp + device */}
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-mono font-semibold text-[var(--pz-text-secondary)]">
          {format(new Date(scan.scan_timestamp), 'HH:mm:ss')}
        </p>
        <p className="text-[9px] text-[var(--pz-text-muted)] truncate max-w-[70px]">
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
  const allScans = useScanFeedStore((s) => s.scans)
  const scans = allScans.slice(0, maxItems)

  return (
    <div className={`space-y-2 overflow-y-auto max-h-[600px] pr-1 ${className}`}>
      <AnimatePresence initial={false}>
        {scans.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-[var(--pz-text-muted)]">
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
