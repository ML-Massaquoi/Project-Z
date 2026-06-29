import * as React from 'react'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export interface ChartCardProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  iconColor?: string
  iconBg?: string
  children: React.ReactNode
  loading?: boolean
  actions?: React.ReactNode
  badge?: React.ReactNode
  className?: string
  contentClassName?: string
  padding?: boolean
}

export function ChartCard({
  title,
  subtitle,
  icon: Icon,
  iconColor = 'text-blue-400',
  iconBg = 'bg-blue-500/10 border-blue-500/20',
  children,
  loading,
  actions,
  badge,
  className,
  contentClassName,
  padding = true,
}: ChartCardProps) {
  return (
    <div className={cn('pz-card', padding ? 'p-6' : 'overflow-hidden', className)}>
      <div className={cn('flex items-center justify-between mb-5', !padding && 'px-6 pt-6')}>
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={cn('p-2.5 rounded-xl border', iconBg)}>
              <Icon size={18} className={iconColor} />
            </div>
          )}
          <div>
            <h3 className="text-base font-bold text-[var(--pz-text)]">{title}</h3>
            {subtitle && <p className="text-xs text-[var(--pz-text-muted)] mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {badge}
          {actions}
        </div>
      </div>

      {loading ? (
        <Skeleton className={cn('w-full rounded-xl', padding ? 'h-[280px]' : 'h-[280px] mx-6 mb-6')} />
      ) : (
        <div className={contentClassName}>{children}</div>
      )}
    </div>
  )
}
