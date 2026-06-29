import { cn } from '@/lib/utils'

interface SkeletonCardProps {
  className?: string
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-5 shadow-card animate-pulse', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-24 rounded bg-[var(--pz-surface-3)]" />
        <div className="h-9 w-9 rounded-lg bg-[var(--pz-surface-3)]" />
      </div>
      <div className="h-8 w-20 rounded bg-[var(--pz-surface-3)] mb-2" />
      <div className="h-3 w-16 rounded bg-[var(--pz-surface-3)]" />
    </div>
  )
}
