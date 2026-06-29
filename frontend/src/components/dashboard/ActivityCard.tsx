import * as React from 'react'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { format, isToday, isYesterday } from 'date-fns'

export interface ActivityItem {
  id: string
  title: string
  subtitle?: string
  timestamp: string
  icon?: LucideIcon
  iconColor?: string
  iconBg?: string
  status?: string
  statusColor?: string
}

export interface ActivityCardProps {
  title: string
  icon?: LucideIcon
  iconColor?: string
  iconBg?: string
  items: ActivityItem[]
  loading?: boolean
  maxItems?: number
  onViewAll?: () => void
  className?: string
}

function formatTs(ts: string) {
  const d = new Date(ts)
  if (isToday(d))     return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

export function ActivityCard({
  title,
  icon: TitleIcon,
  iconColor = 'text-blue-400',
  iconBg = 'bg-blue-500/10 border-blue-500/20',
  items,
  loading,
  maxItems = 8,
  onViewAll,
  className,
}: ActivityCardProps) {
  const displayed = items.slice(0, maxItems)

  return (
    <div className={cn('pz-card p-5', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {TitleIcon && (
            <div className={cn('p-2 rounded-xl border', iconBg)}>
              <TitleIcon size={16} className={iconColor} />
            </div>
          )}
          <h3 className="text-sm font-bold text-[var(--pz-text)]">{title}</h3>
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors group"
          >
            View All <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton variant="circle" width={32} height={32} />
              <div className="flex-1 space-y-1.5">
                <Skeleton variant="text" className="w-2/3 h-3" />
                <Skeleton variant="text" className="w-1/3 h-3" />
              </div>
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <p className="text-center text-sm text-[var(--pz-text-muted)] py-6">No activity yet</p>
      ) : (
        <div className="space-y-1">
          {displayed.map((item, i) => {
            const ItemIcon = item.icon
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-[var(--pz-surface-2)]/40 transition-colors"
              >
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border',
                  item.iconBg || 'bg-[var(--pz-surface-2)] border-[var(--pz-border)]',
                )}>
                  {ItemIcon
                    ? <ItemIcon size={14} className={item.iconColor || 'text-[var(--pz-text-muted)]'} />
                    : <span className="text-xs font-bold text-[var(--pz-text-muted)]">{item.title[0]}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--pz-text-secondary)] truncate">{item.title}</p>
                  {item.subtitle && <p className="text-xs text-[var(--pz-text-muted)] truncate">{item.subtitle}</p>}
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                  <span className="text-[11px] text-[var(--pz-text-faint)] tabular-nums font-mono">{formatTs(item.timestamp)}</span>
                  {item.status && (
                    <span className={cn('text-[10px] font-semibold', item.statusColor || 'text-[var(--pz-text-muted)]')}>{item.status}</span>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
