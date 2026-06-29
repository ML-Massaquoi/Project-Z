/**
 * Project Z – Standardized Toast Utilities
 * Wrapper around Sonner with consistent styling and patterns.
 */
import { toast as sonner } from 'sonner'

export const toast = {
  success: (title: string, description?: string) =>
    sonner.success(title, { description }),

  error: (title: string, description?: string) =>
    sonner.error(title, { description }),

  warning: (title: string, description?: string) =>
    sonner.warning(title, { description }),

  info: (title: string, description?: string) =>
    sonner.info(title, { description }),

  loading: (title: string) =>
    sonner.loading(title),

  dismiss: (id?: string | number) =>
    sonner.dismiss(id),

  promise: <T>(
    promise: Promise<T>,
    msgs: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((err: unknown) => string)
    }
  ) => sonner.promise(promise, msgs),

  /** Convenience: action with undo */
  action: (title: string, actionLabel: string, onAction: () => void) =>
    sonner(title, {
      action: { label: actionLabel, onClick: onAction },
    }),
}

export { sonner as rawToast }
