import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size'> {
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  error?: string
  label?: string
  hint?: string
  inputSize?: 'sm' | 'md' | 'lg'
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, prefix, suffix, error, label, hint, inputSize = 'md', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    const sizeClasses = {
      sm: 'h-9 text-xs px-3',
      md: 'h-11 text-sm px-3.5',    // 44px — matches button height
      lg: 'h-12 text-base px-4',
    }

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-[var(--pz-text-secondary)] uppercase tracking-wide"
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border bg-[var(--pz-surface-1)] transition-all duration-150',
            'focus-within:border-[var(--pz-border-focus)] focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]',
            error
              ? 'border-[#DC2626] focus-within:border-[#DC2626] focus-within:shadow-[0_0_0_3px_rgba(220,38,38,0.10)]'
              : 'border-[var(--pz-border)] hover:border-[var(--pz-border-strong)]',
            sizeClasses[inputSize],
          )}
        >
          {prefix && (
            <span className="flex-shrink-0 text-[var(--pz-text-muted)]">{prefix}</span>
          )}
          <input
            id={inputId}
            type={type}
            ref={ref}
            className={cn(
              'flex-1 bg-transparent text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)]',
              'outline-none min-w-0 h-full',
              className,
            )}
            {...props}
          />
          {suffix && (
            <span className="flex-shrink-0 text-[var(--pz-text-muted)]">{suffix}</span>
          )}
        </div>
        {error && (
          <p className="text-xs font-medium" style={{ color: 'var(--pz-danger-500)' }}>{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-[var(--pz-text-muted)]">{hint}</p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
