import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[100] max-w-[280px] rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-1)]',
        'px-3 py-1.5 text-xs text-[var(--pz-text-secondary)] shadow-[var(--pz-shadow-lg)]',
        'data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade',
        'data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade',
        'data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade',
        'data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade',
        'animate-in fade-in-0 zoom-in-95 duration-150',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
