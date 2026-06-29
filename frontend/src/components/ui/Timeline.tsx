import { type ReactNode } from 'react'
import { motion } from 'framer-motion'

interface TimelineItem {
  id: string
  timestamp: string
  title: string
  description?: string
  status?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  icon?: ReactNode
}

interface TimelineProps {
  items: TimelineItem[]
  maxItems?: number
}

const dotColors: Record<string, string> = {
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  neutral: '#6B7280',
}

const dotGlows: Record<string, string> = {
  success: '0 0 8px rgba(16,185,129,0.5)',
  warning: '0 0 8px rgba(245,158,11,0.5)',
  danger:  '0 0 8px rgba(239,68,68,0.5)',
  info:    '0 0 8px rgba(59,130,246,0.5)',
  neutral: 'none',
}

export function Timeline({ items, maxItems }: TimelineProps) {
  const displayItems = maxItems ? items.slice(0, maxItems) : items

  if (displayItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-[var(--pz-text-muted)]">
        <p className="text-xs">No activity to display</p>
      </div>
    )
  }

  return (
    <div className="relative pl-6">
      {/* Timeline line */}
      <div
        className="absolute left-[9px] top-2 bottom-2 w-px"
        style={{ background: 'var(--pz-border)' }}
      />

      <div className="space-y-3">
        {displayItems.map((item, index) => {
          const color = dotColors[item.status || 'neutral']
          const glow = dotGlows[item.status || 'neutral']

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex gap-3 group"
            >
              {/* Dot */}
              <div
                className="absolute -left-6 top-1.5 w-[10px] h-[10px] rounded-full border-2 flex-shrink-0"
                style={{
                  backgroundColor: color,
                  borderColor: 'var(--pz-surface-1)',
                  boxShadow: glow,
                }}
              />

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--pz-text)] truncate">
                    {item.title}
                  </span>
                  <span className="text-[10px] text-[var(--pz-text-muted)] font-mono tabular-nums flex-shrink-0">
                    {item.timestamp}
                  </span>
                </div>
                {item.description && (
                  <p className="text-[11px] text-[var(--pz-text-muted)] mt-0.5 truncate">
                    {item.description}
                  </p>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
