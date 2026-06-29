import * as React from 'react'
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  iconColor?: string
  trend?: { value: number; label?: string; positive?: boolean }
  loading?: boolean
  onClick?: () => void
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const variantConfig = {
  default: { iconBg: 'bg-[var(--pz-surface-2)] border-[var(--pz-border)]',  iconColor: 'text-[var(--pz-text-muted)]' },
  success: { iconBg: 'bg-emerald-500/10 border-emerald-500/20',              iconColor: 'text-emerald-500'            },
  warning: { iconBg: 'bg-amber-500/10 border-amber-500/20',                  iconColor: 'text-amber-500'              },
  danger:  { iconBg: 'bg-red-500/10 border-red-500/20',                      iconColor: 'text-red-500'                },
  info:    { iconBg: 'bg-[var(--pz-brand-50)] border-[var(--pz-brand-200)]', iconColor: 'text-[var(--pz-brand)]'      },
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  trend,
  loading,
  onClick,
  variant = 'default',
  size = 'md',
  className,
}: MetricCardProps) {
  const vc = variantConfig[variant]

  const sizeConfig = {
    sm: { padding: 'p-4', valueClass: 'text-2xl', titleClass: 'text-xs', iconSize: 16, iconBox: 'p-2 rounded-lg' },
    md: { padding: 'p-5', valueClass: 'text-3xl', titleClass: 'text-xs', iconSize: 18, iconBox: 'p-2.5 rounded-xl' },
    lg: { padding: 'p-6', valueClass: 'text-4xl', titleClass: 'text-sm', iconSize: 22, iconBox: 'p-3 rounded-xl' },
  }[size]

  if (loading) {
    return (
      <div className={cn('pz-card', sizeConfig.padding, className)}>
        <div className="flex items-start justify-between mb-3">
          <Skeleton variant="circle" width={40} height={40} />
        </div>
        <Skeleton variant="text" className="w-1/2 h-8 mb-2" />
        <Skeleton variant="text" className="w-2/3 h-4" />
      </div>
    )
  }

  const TrendIcon = !trend ? null
    : trend.value > 0 ? TrendingUp
    : trend.value < 0 ? TrendingDown
    : Minus

  const trendPositive = trend ? (trend.positive !== undefined ? trend.positive : trend.value > 0) : null

  return (
    <motion.div
      whileHover={onClick ? { y: -2 } : undefined}
      transition={{ duration: 0.15 }}
      className={cn(
        'pz-card',
        sizeConfig.padding,
        onClick && 'cursor-pointer pz-card--interactive',
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        {Icon && (
          <div className={cn('border flex-shrink-0', vc.iconBg, sizeConfig.iconBox)}>
            <Icon size={sizeConfig.iconSize} className={iconColor || vc.iconColor} />
          </div>
        )}
        {trend && TrendIcon && (
          <div className={cn(
            'flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg',
            trendPositive ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10',
          )}>
            <TrendIcon size={12} />
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>

      <div className={cn('font-bold text-[var(--pz-text)] tabular-nums tracking-tight mb-1', sizeConfig.valueClass)}>
        {value}
      </div>

      <div className={cn('font-semibold text-[var(--pz-text-muted)] uppercase tracking-[0.06em]', sizeConfig.titleClass)}>
        {title}
      </div>

      {subtitle && (
        <p className="text-xs text-[var(--pz-text-faint)] mt-1">{subtitle}</p>
      )}
      {trend?.label && (
        <p className="text-[11px] text-[var(--pz-text-muted)] mt-1">{trend.label}</p>
      )}
    </motion.div>
  )
}
