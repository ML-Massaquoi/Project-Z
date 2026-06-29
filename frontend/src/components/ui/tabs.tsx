import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

const tabsListVariants = cva('inline-flex items-center', {
  variants: {
    variant: {
      default: 'border-b border-[var(--pz-border)] w-full gap-0',
      pills:   'gap-1 p-1 bg-[var(--pz-surface-2)] rounded-xl border border-[var(--pz-border)]',
      boxed:   'gap-0 bg-[var(--pz-surface-2)] rounded-xl border border-[var(--pz-border)] p-0.5',
    },
  },
  defaultVariants: { variant: 'default' },
})

interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <TabsPrimitive.List ref={ref} className={cn(tabsListVariants({ variant }), className)} {...props} />
  )
)
TabsList.displayName = TabsPrimitive.List.displayName

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center gap-2 text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--pz-border-focus)] disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: [
          'px-4 py-2.5 -mb-px border-b-2 border-transparent',
          'text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)]',
          'data-[state=active]:border-blue-500 data-[state=active]:text-blue-400',
        ],
        pills: [
          'px-3.5 py-2 rounded-lg',
          'text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] hover:bg-[var(--pz-surface-3)]',
          'data-[state=active]:bg-[var(--pz-surface-1)] data-[state=active]:text-[var(--pz-text)] data-[state=active]:shadow-sm',
        ],
        boxed: [
          'px-3.5 py-1.5 rounded-lg flex-1',
          'text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)]',
          'data-[state=active]:bg-[var(--pz-surface-1)] data-[state=active]:text-[var(--pz-text)] data-[state=active]:shadow-sm',
        ],
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabsTriggerVariants> {}

const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, TabsTriggerProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <TabsPrimitive.Trigger ref={ref} className={cn(tabsTriggerVariants({ variant }), className)} {...props} />
  )
)
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 outline-none',
      'data-[state=inactive]:hidden',
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
