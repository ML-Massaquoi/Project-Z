import * as React from 'react'
import {
  Users, Building2, Fingerprint, Monitor,
  FileBarChart, ScrollText, AlertCircle,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from './button'

// ── Types ──────────────────────────────────────────────────

type ActionObj = {
  label: string
  onClick: () => void
  variant?: 'default' | 'outline' | 'ghost'
}

export interface EmptyStateProps {
  /**
   * Pass a Lucide icon component (e.g. icon={Users})
   * OR a pre-rendered ReactNode (e.g. icon={<Layers size={28}/>})
   */
  icon?: LucideIcon | React.ReactNode
  title: string
  description?: string
  /**
   * Pass an ActionObj for a standard button,
   * OR a pre-rendered ReactNode for custom actions.
   */
  action?: ActionObj | React.ReactNode
  secondaryAction?: ActionObj
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// ── Helpers ────────────────────────────────────────────────

function isActionObj(x: unknown): x is ActionObj {
  return (
    typeof x === 'object' &&
    x !== null &&
    'label' in x &&
    'onClick' in x &&
    typeof (x as ActionObj).label === 'string'
  )
}

// ── Component ──────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  className,
}: EmptyStateProps) {
  const sizeConfig = {
    sm: { iconSize: 28, padding: 'py-8',  titleClass: 'text-sm font-semibold',  descClass: 'text-xs mt-1',   iconBox: 'w-12 h-12' },
    md: { iconSize: 36, padding: 'py-14', titleClass: 'text-base font-semibold', descClass: 'text-sm mt-1.5', iconBox: 'w-16 h-16' },
    lg: { iconSize: 44, padding: 'py-20', titleClass: 'text-lg font-bold',       descClass: 'text-sm mt-2',   iconBox: 'w-20 h-20' },
  }[size]

  // Render icon — either a component or a ReactNode
  const renderIcon = () => {
    if (!icon) return null
    const iconNode =
      typeof icon === 'function'
        ? React.createElement(icon as LucideIcon, {
            size: sizeConfig.iconSize,
            className: 'text-[var(--pz-text-faint)]',
            strokeWidth: 1.5,
          })
        : (icon as React.ReactNode)

    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-2xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] mb-4',
          sizeConfig.iconBox,
        )}
      >
        {iconNode}
      </div>
    )
  }

  // Render action — either an ActionObj button or a raw ReactNode
  const renderAction = () => {
    if (!action) return null
    if (isActionObj(action)) {
      return (
        <Button
          variant={action.variant ?? 'default'}
          size="sm"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )
    }
    // Custom ReactNode
    return <>{action}</>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        sizeConfig.padding,
        className,
      )}
    >
      {renderIcon()}

      <h3 className={cn(sizeConfig.titleClass, 'text-[var(--pz-text-secondary)]')}>
        {title}
      </h3>

      {description && (
        <p className={cn(sizeConfig.descClass, 'text-[var(--pz-text-muted)] max-w-sm')}>
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-5">
          {secondaryAction && (
            <Button variant="ghost" size="sm" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
          {renderAction()}
        </div>
      )}
    </motion.div>
  )
}

// ── Pre-built domain-specific variants ─────────────────────

export const EmptyEmployees = ({ onAdd }: { onAdd?: () => void }) => (
  <EmptyState
    icon={Users}
    title="No employees found"
    description="Your workforce list is empty. Add employees to start tracking attendance."
    action={onAdd ? { label: 'Add Employee', onClick: onAdd } : undefined}
  />
)

export const EmptyDepartments = ({ onAdd }: { onAdd?: () => void }) => (
  <EmptyState
    icon={Building2}
    title="No departments found"
    description="Create departments to organize your workforce by teams or divisions."
    action={onAdd ? { label: 'Add Department', onClick: onAdd } : undefined}
  />
)

export const EmptyAttendance = () => (
  <EmptyState
    icon={Fingerprint}
    title="No attendance records"
    description="No scans have been recorded yet. Ensure your devices are connected and online."
  />
)

export const EmptyDevices = ({ onAdd }: { onAdd?: () => void }) => (
  <EmptyState
    icon={Monitor}
    title="No devices registered"
    description="Biometric terminals will appear here automatically when they connect to the system."
    action={onAdd ? { label: 'Add Device', onClick: onAdd } : undefined}
  />
)

export const EmptyReports = ({ onGenerate }: { onGenerate?: () => void }) => (
  <EmptyState
    icon={FileBarChart}
    title="No reports generated"
    description="Generate attendance reports for your workforce to gain operational insights."
    action={onGenerate ? { label: 'Generate Report', onClick: onGenerate } : undefined}
  />
)

export const EmptyAuditLogs = () => (
  <EmptyState
    icon={ScrollText}
    title="No audit logs"
    description="System actions will be logged here for compliance and security review."
  />
)

export const EmptySearch = ({ query }: { query?: string }) => (
  <EmptyState
    icon={AlertCircle}
    title={query ? `No results for "${query}"` : 'No results found'}
    description="Try adjusting your search terms or filters."
    size="sm"
  />
)
