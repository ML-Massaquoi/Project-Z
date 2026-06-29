import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

// ── Enterprise-grade modal widths ──────────────────────────
const sizeClasses = {
  sm:         'max-w-[480px]',
  md:         'max-w-[680px]',   // was 560 — bumped for breathing room
  lg:         'max-w-[800px]',   // was 720
  xl:         'max-w-[960px]',
  fullscreen: 'max-w-none w-screen h-screen rounded-none',
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[80] bg-black/55 backdrop-blur-[6px]',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: keyof typeof sizeClasses
  showClose?: boolean
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, size = 'md', showClose = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-[81] -translate-x-1/2 -translate-y-1/2 w-full mx-4',
        'bg-[var(--pz-surface-1)] border border-[var(--pz-border)]',
        'rounded-[10px]',        // 10px — modern enterprise corners
        'shadow-[0_24px_64px_rgba(0,0,0,0.22),0_4px_16px_rgba(0,0,0,0.12)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]',
        'duration-200',
        sizeClasses[size],
        size === 'fullscreen' ? 'overflow-y-auto' : 'max-h-[92vh] overflow-y-auto',
        className,
      )}
      {...props}
    >
      {children}
      {showClose && (
        <DialogPrimitive.Close
          className="absolute right-6 top-6 rounded-lg p-2.5 text-[var(--pz-text-muted)] hover:bg-[var(--pz-surface-2)] hover:text-[var(--pz-text-secondary)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--pz-border-focus)]"
        >
          <X size={18} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

// ── Header: generous padding for breathing room ──────────────────────────
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col gap-2.5 px-10 pt-8 pb-6 border-b border-[var(--pz-border)]',
      className,
    )}
    {...props}
  />
)
DialogHeader.displayName = 'DialogHeader'

// ── Footer: spacious with clear button separation ───
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex items-center justify-end gap-4 px-10 pt-6 pb-7',
      'border-t border-[var(--pz-border)] bg-[var(--pz-surface-2)]/50',
      'rounded-b-[10px]',
      className,
    )}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

// ── Title: 22px / 700 ─────────────────────────────────────
const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-[22px] font-bold text-[var(--pz-text)] tracking-tight leading-tight',
      className,
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

// ── Description: 14px muted ───────────────────────────────
const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-[var(--pz-text-muted)] leading-relaxed', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

// ── Body: generous spacing for form content ─────────────────
const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-10 py-8 flex-1 flex flex-col min-h-0', className)} {...props} />
)

export {
  Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogBody,
}
