import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-[var(--pz-text)] mb-2">Something went wrong</h2>
            <p className="text-sm text-[var(--pz-text-muted)] mb-6">
              An unexpected error occurred. Please try refreshing the page or contact your system administrator if the problem persists.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.href = '/'}
                className="px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm font-semibold text-[var(--pz-text-secondary)] hover:bg-[var(--pz-surface-3)] transition-all flex items-center gap-2"
              >
                <Home size={14} />
                Go to Dashboard
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-[var(--pz-text)] mb-2">Page Error</h2>
            <p className="text-sm text-[var(--pz-text-muted)] mb-6">
              This page encountered an error. Please try again or return to the dashboard.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.href = '/'}
                className="px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm font-semibold text-[var(--pz-text-secondary)] hover:bg-[var(--pz-surface-3)] transition-all flex items-center gap-2"
              >
                <Home size={14} />
                Go to Dashboard
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
