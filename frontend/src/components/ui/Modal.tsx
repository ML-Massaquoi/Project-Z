/**
 * Modal.tsx — Enterprise modal wrapper
 * This is the canonical modal used across pages (capital M, for backward compat).
 * Re-exports from the Dialog primitives with sensible defaults.
 */
import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from './dialog'
import { Button } from './button'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  size?: ModalSize
  children: React.ReactNode
  footer?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  confirmLoading?: boolean
  confirmDestructive?: boolean
  showClose?: boolean
  className?: string
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  confirmLoading,
  confirmDestructive,
  showClose = true,
  className,
}: ModalProps) {
  const hasStandardFooter = !footer && (confirmLabel || onConfirm)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size={size} showClose={showClose} className={className}>
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription className="mt-1">{description}</DialogDescription>}
          </DialogHeader>
        )}

        <DialogBody>{children}</DialogBody>

        {footer && <DialogFooter>{footer}</DialogFooter>}

        {hasStandardFooter && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={confirmLoading}>
              {cancelLabel}
            </Button>
            {onConfirm && confirmLabel && (
              <Button
                variant={confirmDestructive ? 'destructive' : 'default'}
                onClick={onConfirm}
                loading={confirmLoading}
              >
                {confirmLabel}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
