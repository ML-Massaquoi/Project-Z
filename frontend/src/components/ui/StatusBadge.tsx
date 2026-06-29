import { type ReactNode } from 'react'

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'active' | 'inactive' | 'present' | 'late' | 'absent' |
          'on_time' | 'early_departure' | 'overtime' | 'in' | 'out' | 'unknown' |
          'warning' | 'danger' | 'info' | 'success' | 'pending' | 'processing' | 'failed' |
          'synced' | 'degraded' | 'critical' |
          'pending_enrollment' | 'enrolled' | 'suspended' | 'transferred' | 'terminated' | 'retired'
  size?: 'xs' | 'sm' | 'md'
  pulse?: boolean
  dot?: boolean
  children?: ReactNode
  label?: string
}

const statusConfig: Record<string, { bg: string; text: string; border: string; dotColor: string }> = {
  online:   { bg: 'var(--pz-success-50)', text: 'var(--pz-success-500)', border: 'var(--pz-success-border)', dotColor: 'var(--pz-success-500)' },
  active:   { bg: 'var(--pz-success-50)', text: 'var(--pz-success-500)', border: 'var(--pz-success-border)', dotColor: 'var(--pz-success-500)' },
  present:  { bg: 'var(--pz-success-50)', text: 'var(--pz-success-500)', border: 'var(--pz-success-border)', dotColor: 'var(--pz-success-500)' },
  on_time:  { bg: 'var(--pz-success-50)', text: 'var(--pz-success-500)', border: 'var(--pz-success-border)', dotColor: 'var(--pz-success-500)' },
  success:  { bg: 'var(--pz-success-50)', text: 'var(--pz-success-500)', border: 'var(--pz-success-border)', dotColor: 'var(--pz-success-500)' },
  in:       { bg: 'var(--pz-success-50)', text: 'var(--pz-success-500)', border: 'var(--pz-success-border)', dotColor: 'var(--pz-success-500)' },
  late:     { bg: 'var(--pz-warning-50)', text: 'var(--pz-warning-600)', border: 'var(--pz-warning-border)', dotColor: 'var(--pz-warning-500)' },
  warning:  { bg: 'var(--pz-warning-50)', text: 'var(--pz-warning-600)', border: 'var(--pz-warning-border)', dotColor: 'var(--pz-warning-500)' },
  early_departure: { bg: 'var(--pz-warning-50)', text: 'var(--pz-warning-600)', border: 'var(--pz-warning-border)', dotColor: 'var(--pz-warning-500)' },
  overtime: { bg: 'var(--pz-info-50)', text: 'var(--pz-info-500)', border: 'var(--pz-info-border)', dotColor: 'var(--pz-info-500)' },
  out:      { bg: 'var(--pz-warning-50)', text: 'var(--pz-warning-600)', border: 'var(--pz-warning-border)', dotColor: 'var(--pz-warning-500)' },
  offline:  { bg: 'var(--pz-surface-3)', text: 'var(--pz-text-secondary)', border: 'var(--pz-border)', dotColor: 'var(--pz-text-muted)' },
  inactive: { bg: 'var(--pz-surface-3)', text: 'var(--pz-text-secondary)', border: 'var(--pz-border)', dotColor: 'var(--pz-text-muted)' },
  unknown:  { bg: 'var(--pz-surface-3)', text: 'var(--pz-text-secondary)', border: 'var(--pz-border)', dotColor: 'var(--pz-text-muted)' },
  absent:   { bg: 'var(--pz-danger-50)',  text: 'var(--pz-danger-500)', border: 'var(--pz-danger-border)',  dotColor: 'var(--pz-danger-500)' },
  danger:   { bg: 'var(--pz-danger-50)',  text: 'var(--pz-danger-500)', border: 'var(--pz-danger-border)',  dotColor: 'var(--pz-danger-500)' },
  failed:   { bg: 'var(--pz-danger-50)',  text: 'var(--pz-danger-500)', border: 'var(--pz-danger-border)',  dotColor: 'var(--pz-danger-500)' },
  info:     { bg: 'var(--pz-info-50)', text: 'var(--pz-info-500)', border: 'var(--pz-info-border)', dotColor: 'var(--pz-info-500)' },
  pending:  { bg: 'var(--pz-info-50)', text: 'var(--pz-info-500)', border: 'var(--pz-info-border)', dotColor: 'var(--pz-info-500)' },
  processing: { bg: 'var(--pz-info-50)', text: 'var(--pz-info-500)', border: 'var(--pz-info-border)', dotColor: 'var(--pz-info-500)' },
  synced:   { bg: 'var(--pz-success-50)', text: 'var(--pz-success-500)', border: 'var(--pz-success-border)', dotColor: 'var(--pz-success-500)' },
  degraded: { bg: 'var(--pz-warning-50)', text: 'var(--pz-warning-600)', border: 'var(--pz-warning-border)', dotColor: 'var(--pz-warning-500)' },
  critical: { bg: 'var(--pz-danger-50)',  text: 'var(--pz-danger-500)', border: 'var(--pz-danger-border)',  dotColor: 'var(--pz-danger-500)' },
  pending_enrollment: { bg: 'var(--pz-info-50)', text: 'var(--pz-info-500)', border: 'var(--pz-info-border)', dotColor: 'var(--pz-info-500)' },
  enrolled:   { bg: 'var(--pz-success-50)', text: 'var(--pz-success-500)', border: 'var(--pz-success-border)', dotColor: 'var(--pz-success-500)' },
  suspended:  { bg: 'var(--pz-warning-50)', text: 'var(--pz-warning-600)', border: 'var(--pz-warning-border)', dotColor: 'var(--pz-warning-500)' },
  transferred:{ bg: 'var(--pz-info-50)', text: 'var(--pz-info-500)', border: 'var(--pz-info-border)', dotColor: 'var(--pz-info-500)' },
  terminated: { bg: 'var(--pz-danger-50)', text: 'var(--pz-danger-500)', border: 'var(--pz-danger-border)', dotColor: 'var(--pz-danger-500)' },
  retired:    { bg: 'var(--pz-surface-3)', text: 'var(--pz-text-secondary)', border: 'var(--pz-border)', dotColor: 'var(--pz-text-muted)' },
}

const sizeClasses = {
  xs: 'text-[10px] px-1.5 py-[1px] gap-1',
  sm: 'text-[11px] px-2 py-[2px] gap-1.5',
  md: 'text-xs px-2.5 py-1 gap-1.5',
}

const dotSizes = { xs: 5, sm: 6, md: 7 }

export function StatusBadge({ status, size = 'sm', pulse = false, dot = true, children, label }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.unknown
  const displayLabel = children || label || status.replace(/_/g, ' ')

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full whitespace-nowrap ${sizeClasses[size]}`}
      style={{
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
      }}
    >
      {dot && (
        <span
          className={pulse ? 'pz-pulse-dot' : ''}
          style={{
            width: dotSizes[size],
            height: dotSizes[size],
            borderRadius: '50%',
            backgroundColor: config.dotColor,
            flexShrink: 0,
            boxShadow: pulse ? `0 0 8px ${config.dotColor}` : undefined,
          }}
        />
      )}
      <span className="capitalize">{displayLabel}</span>
    </span>
  )
}
