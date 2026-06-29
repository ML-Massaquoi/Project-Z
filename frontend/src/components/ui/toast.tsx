import { toast as sonnerToast } from 'sonner'
import type { ExternalToast } from 'sonner'

type ToastOptions = ExternalToast

/**
 * Project Z standardized toast notifications.
 * Wrapper around sonner with consistent styling and types.
 */
export const toast = {
  success: (title: string, description?: string, opts?: ToastOptions) =>
    sonnerToast.success(title, {
      description,
      duration: 4000,
      ...opts,
    }),

  error: (title: string, description?: string, opts?: ToastOptions) =>
    sonnerToast.error(title, {
      description,
      duration: 6000,
      ...opts,
    }),

  warning: (title: string, description?: string, opts?: ToastOptions) =>
    sonnerToast.warning(title, {
      description,
      duration: 5000,
      ...opts,
    }),

  info: (title: string, description?: string, opts?: ToastOptions) =>
    sonnerToast.info(title, {
      description,
      duration: 4000,
      ...opts,
    }),

  loading: (title: string, opts?: ToastOptions) =>
    sonnerToast.loading(title, {
      duration: Infinity,
      ...opts,
    }),

  dismiss: (id?: string | number) => sonnerToast.dismiss(id),

  promise: function<T>(
    promise: Promise<T>,
    msgs: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((err: unknown) => string)
    },
    opts?: ToastOptions
  ) {
    return sonnerToast.promise(promise, {
      loading: msgs.loading,
      success: msgs.success,
      error:   msgs.error,
      ...opts,
    })
  },

  custom: sonnerToast,
}

// Re-export Toaster for convenience
export { Toaster } from 'sonner'
