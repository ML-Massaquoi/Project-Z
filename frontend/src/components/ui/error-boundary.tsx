import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw, Home, Wifi, WifiOff, ShieldOff, SearchX } from 'lucide-react'
import { Button } from './button'

// ── Base ErrorBoundary ────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-lg font-semibold text-[var(--pz-text)]">Something went wrong</h2>
          <p className="mt-1 text-sm text-[var(--pz-text-muted)] max-w-md">
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => (window.location.href = '/')}>
              <Home size={14} />
              Go to Dashboard
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw size={14} />
              Refresh Page
            </Button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-6 max-w-2xl overflow-auto rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] p-4 text-xs text-[var(--pz-text-muted)] text-left">
              {this.state.error.stack}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

// ── NetworkErrorScreen ────────────────────────────────────────

interface NetworkErrorScreenProps {
  onRetry?: () => void
  message?: string
}

export function NetworkErrorScreen({
  onRetry,
  message = 'Unable to connect to the server. Check your internet connection and try again.',
}: NetworkErrorScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] px-4 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
        <WifiOff size={32} />
      </div>
      <h2 className="text-xl font-bold text-[var(--pz-text)] tracking-tight">Connection Error</h2>
      <p className="mt-2 text-sm text-[var(--pz-text-muted)] max-w-sm">{message}</p>
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" onClick={() => (window.location.href = '/')}>
          <Home size={14} />
          Dashboard
        </Button>
        {onRetry && (
          <Button onClick={onRetry}>
            <Wifi size={14} />
            Try Again
          </Button>
        )}
      </div>
    </div>
  )
}

// ── PermissionErrorScreen ─────────────────────────────────────

interface PermissionErrorScreenProps {
  onGoBack?: () => void
  onGoHome?: () => void
  message?: string
}

export function PermissionErrorScreen({
  onGoBack,
  onGoHome,
  message = "You don't have permission to access this page. Contact your administrator if you think this is a mistake.",
}: PermissionErrorScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] px-4 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
        <ShieldOff size={32} />
      </div>
      <h2 className="text-xl font-bold text-[var(--pz-text)] tracking-tight">Access Denied</h2>
      <p className="mt-2 text-sm text-[var(--pz-text-muted)] max-w-sm">{message}</p>
      <div className="mt-6 flex gap-3">
        {onGoBack && (
          <Button variant="secondary" onClick={onGoBack}>
            Go Back
          </Button>
        )}
        <Button onClick={onGoHome ?? (() => (window.location.href = '/'))}>
          <Home size={14} />
          Dashboard
        </Button>
      </div>
    </div>
  )
}

// ── NotFoundScreen ────────────────────────────────────────────

interface NotFoundScreenProps {
  onGoHome?: () => void
  onGoBack?: () => void
  message?: string
  title?: string
}

export function NotFoundScreen({
  onGoHome,
  onGoBack,
  title = 'Page Not Found',
  message = "The page you're looking for doesn't exist or has been moved.",
}: NotFoundScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] px-4 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-[var(--pz-text-muted)]">
        <SearchX size={32} />
      </div>
      <p className="text-4xl font-black text-[var(--pz-surface-4)] mb-2 tabular-nums">404</p>
      <h2 className="text-xl font-bold text-[var(--pz-text)] tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-[var(--pz-text-muted)] max-w-sm">{message}</p>
      <div className="mt-6 flex gap-3">
        {onGoBack && (
          <Button variant="secondary" onClick={onGoBack}>
            Go Back
          </Button>
        )}
        <Button onClick={onGoHome ?? (() => (window.location.href = '/'))}>
          <Home size={14} />
          Dashboard
        </Button>
      </div>
    </div>
  )
}
