import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors border',
  {
    variants: {
      variant: {
        default:  'bg-[var(--pz-surface-3)] text-[var(--pz-text-secondary)] border-[var(--pz-border)]',
        primary:  'bg-[var(--pz-brand-50)] text-[var(--pz-brand)] border-[var(--pz-brand-200)]',
        success:  'bg-[var(--pz-success-50)]  text-[var(--pz-success-500)]  border-[var(--pz-success-border)]',
        warning:  'bg-[var(--pz-warning-50)]  text-[var(--pz-warning-600)]  border-[var(--pz-warning-border)]',
        danger:   'bg-[var(--pz-danger-50)]   text-[var(--pz-danger-500)]  border-[var(--pz-danger-border)]',
        info:     'bg-[var(--pz-info-50)]     text-[var(--pz-info-500)]  border-[var(--pz-info-border)]',
        outline:  'bg-transparent text-[var(--pz-text-secondary)] border-[var(--pz-border-strong)]',
        accent:   'bg-[var(--pz-accent-light)] text-[var(--pz-accent)] border-[var(--pz-accent-border)]',
      },
      size: {
        sm: 'text-[10px] px-1.5 py-px',
        md: 'text-[11px] px-2 py-0.5',
        lg: 'text-xs px-2.5 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size:    'md',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, size, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size, className }))} {...props}>
        {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            variant === 'primary' && 'bg-[var(--pz-brand)]',
            variant === 'success' && 'bg-[var(--pz-success-500)]',
            variant === 'warning' && 'bg-[var(--pz-warning-500)]',
            variant === 'danger'  && 'bg-[var(--pz-danger-500)]',
            variant === 'info'    && 'bg-[var(--pz-info-500)]',
            variant === 'accent'  && 'bg-[var(--pz-accent)]',
            (!variant || variant === 'default' || variant === 'outline') && 'bg-[var(--pz-text-muted)]',
          )}
        />
      )}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
