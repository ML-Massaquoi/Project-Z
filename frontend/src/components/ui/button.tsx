import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base: sharp enterprise feel — spacious, clean, breathable
  'inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-md text-sm font-semibold tracking-[0.01em] ring-offset-transparent transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--pz-border-focus] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 select-none cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--pz-brand)] text-white hover:bg-[var(--pz-brand-hover)] active:brightness-90 shadow-sm',
        destructive:
          'bg-[var(--pz-danger-500)] text-white hover:bg-[var(--pz-danger-600)] active:opacity-90 shadow-sm',
        outline:
          'border-[1.5px] border-[var(--pz-border)] bg-[var(--pz-surface-1)] text-[var(--pz-text-secondary)] hover:bg-[var(--pz-surface-3)] hover:border-[var(--pz-border-strong)] hover:text-[var(--pz-text)]',
        ghost:
          'bg-transparent text-[var(--pz-text-tertiary)] hover:bg-[var(--pz-surface-3)] hover:text-[var(--pz-text-secondary)]',
        link:
          'bg-transparent text-[var(--pz-brand)] underline-offset-4 hover:underline hover:text-[var(--pz-brand-hover)] p-0 h-auto',
        success:
          'bg-[var(--pz-success-500)] text-white hover:bg-[var(--pz-success-600)] active:opacity-90 shadow-sm',
        warning:
          'bg-[var(--pz-warning-500)] text-white hover:bg-[var(--pz-warning-600)] active:opacity-90 shadow-sm',
        secondary:
          'bg-[var(--pz-surface-2)] text-[var(--pz-text-secondary)] border-[1.5px] border-[var(--pz-border)] hover:bg-[var(--pz-surface-3)] hover:text-[var(--pz-text)]',
      },
      size: {
        sm:        'h-9 px-5 text-xs rounded-md gap-2',
        md:        'h-[42px] px-6 text-sm rounded-md',
        lg:        'h-[46px] px-8 text-sm rounded-md',
        xl:        'h-[50px] px-10 text-base rounded-md',
        icon:      'h-[42px] w-[42px] p-0 rounded-md',
        'icon-sm': 'h-9 w-9 p-0 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size:    'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            {children}
          </>
        ) : children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
