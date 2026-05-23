import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  message: string
  hint?: string
  className?: string
}

export function EmptyState({ icon: Icon, message, hint, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}>
      <Icon className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
      <p className="text-sm text-slate-600">{message}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
