import { type ReactNode } from 'react'
import { type LucideIcon, Inbox, Search, AlertTriangle, WifiOff, FileX2 } from 'lucide-react'

interface EnhancedEmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  secondaryAction?: ReactNode
  variant?: 'default' | 'search' | 'error' | 'offline' | 'no-data'
  compact?: boolean
}

const variantIcons: Record<string, LucideIcon> = {
  default: Inbox,
  search: Search,
  error: AlertTriangle,
  offline: WifiOff,
  'no-data': FileX2,
}

export function EnhancedEmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = 'default',
  compact = false,
}: EnhancedEmptyStateProps) {
  const Icon = icon || variantIcons[variant]

  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8 px-4' : 'py-16 px-6'}`}>
      <div
        className={`flex items-center justify-center rounded-2xl mb-4 ${compact ? 'w-12 h-12' : 'w-16 h-16'}`}
        style={{
          background: 'var(--pz-surface-2)',
          border: '1px solid var(--pz-border)',
        }}
      >
        <Icon size={compact ? 20 : 28} className="text-[var(--pz-text-muted)] opacity-60" />
      </div>
      <h3 className={`font-semibold text-[var(--pz-text-secondary)] ${compact ? 'text-sm' : 'text-base'}`}>
        {title}
      </h3>
      {description && (
        <p className={`text-[var(--pz-text-muted)] mt-1 max-w-sm ${compact ? 'text-xs' : 'text-sm'}`}>
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-4">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
