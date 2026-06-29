import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      'duration-300',
      className,
    )}
    {...props}
  />
))
SheetOverlay.displayName = 'SheetOverlay'

const sideVariants = {
  right:  'right-0 top-0 h-full border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
  left:   'left-0 top-0 h-full border-r data-[state=open]:slide-in-from-left  data-[state=closed]:slide-out-to-left',
  top:    'top-0 left-0 w-full border-b data-[state=open]:slide-in-from-top    data-[state=closed]:slide-out-to-top',
  bottom: 'bottom-0 left-0 w-full border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
}

const sheetSizes = {
  sm: 'max-w-xs',
  md: 'max-w-md',
  lg: 'max-w-xl',
  xl: 'max-w-2xl',
}

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: keyof typeof sideVariants
  size?: keyof typeof sheetSizes
  showClose?: boolean
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, side = 'right', size = 'md', showClose = true, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-[61] flex flex-col',
        'bg-[var(--pz-surface-0)] border-[var(--pz-border)]',
        'shadow-[0_0_60px_rgba(0,0,0,0.5)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out duration-300',
        sideVariants[side],
        (side === 'right' || side === 'left') && sheetSizes[size],
        (side === 'top'   || side === 'bottom') && 'max-h-[70vh]',
        className,
      )}
      {...props}
    >
      {children}
      {showClose && (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--pz-text-muted)] hover:bg-[var(--pz-surface-2)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--pz-border-focus)]">
          <X size={16} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = 'SheetContent'

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-6 pt-6 pb-4 border-b border-[var(--pz-border)] flex-shrink-0', className)} {...props} />
)

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--pz-border)] flex-shrink-0 mt-auto bg-[var(--pz-surface-0)]/60', className)} {...props} />
)

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-base font-bold text-[var(--pz-text)]', className)} {...props} />
))
SheetTitle.displayName = 'SheetTitle'

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-[var(--pz-text-muted)] mt-1', className)} {...props} />
))
SheetDescription.displayName = 'SheetDescription'

const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 overflow-y-auto px-6 py-5', className)} {...props} />
)

export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, SheetBody }
