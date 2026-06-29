import { cn } from '@/lib/utils'
import { AlertTriangle, WifiOff } from 'lucide-react'
import { Button } from './button'

interface ErrorStateProps {
  variant?: 'error' | 'network'
  message?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  variant = 'error',
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  const Icon = variant === 'network' ? WifiOff : AlertTriangle
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-status-offline-bg text-status-offline">
        <Icon size={28} />
      </div>
      <h4 className="text-sm font-semibold text-fg-primary">
        {variant === 'network' ? 'Connection Error' : 'Something went wrong'}
      </h4>
      <p className="mt-1 text-xs text-fg-muted max-w-xs">
        {message || (variant === 'network'
          ? 'Unable to reach the server. Please check your connection.'
          : 'An unexpected error occurred. Please try again.')}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  )
}
