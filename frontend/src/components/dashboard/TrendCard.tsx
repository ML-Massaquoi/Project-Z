import * as React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export interface TrendCardProps {
  title: string
  value: string | number
  unit?: string
  data?: number[]
  color?: string
  loading?: boolean
  trend?: { direction: 'up' | 'down' | 'flat'; percentage: number }
  subtitle?: string
  className?: string
}

function Sparkline({ data, color = '#3B82F6', height = 48 }: { data: number[]; color?: string; height?: number }) {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 100
  const h = height

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x},${y}`
  })

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
        opacity={0.9}
      />
      <polyline
        fill={`${color}18`}
        stroke="none"
        points={`0,${h} ${points.join(' ')} ${w},${h}`}
      />
    </svg>
  )
}

export function TrendCard({ title, value, unit, data, color = '#3B82F6', loading, trend, subtitle, className }: TrendCardProps) {
  if (loading) {
    return (
      <div className={cn('pz-card p-5', className)}>
        <Skeleton variant="text" className="w-1/2 h-3 mb-4" />
        <Skeleton variant="text" className="w-1/3 h-8 mb-2" />
        <Skeleton className="w-full h-12 rounded" />
      </div>
    )
  }

  const TrendIcon = !trend ? null
    : trend.direction === 'up'   ? TrendingUp
    : trend.direction === 'down' ? TrendingDown
    : Minus

  return (
    <div className={cn('pz-card p-5 overflow-hidden', className)}>
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs font-semibold text-[var(--pz-text-muted)] uppercase tracking-wide">{title}</span>
        {trend && TrendIcon && (
          <div className={cn(
            'flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md',
            trend.direction === 'up'   ? 'text-emerald-400 bg-emerald-500/10'
            : trend.direction === 'down' ? 'text-red-400 bg-red-500/10'
            : 'text-[var(--pz-text-muted)]',
          )}>
            <TrendIcon size={11} />
            {trend.percentage}%
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-3xl font-bold text-[var(--pz-text)] tabular-nums tracking-tight">{value}</span>
        {unit && <span className="text-sm text-[var(--pz-text-muted)] font-medium">{unit}</span>}
      </div>

      {subtitle && <p className="text-xs text-[var(--pz-text-muted)] mb-2">{subtitle}</p>}

      {data && data.length >= 2 && (
        <div className="mt-1 -mx-1">
          <Sparkline data={data} color={color} />
        </div>
      )}
    </div>
  )
}
