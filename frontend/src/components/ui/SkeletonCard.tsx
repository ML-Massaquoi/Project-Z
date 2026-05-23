import { cn } from '@/lib/utils'

interface SkeletonCardProps {
  className?: string
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-5 shadow-card animate-pulse', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-24 rounded bg-slate-200" />
        <div className="h-9 w-9 rounded-lg bg-slate-200" />
      </div>
      <div className="h-8 w-20 rounded bg-slate-200 mb-2" />
      <div className="h-3 w-16 rounded bg-slate-200" />
    </div>
  )
}
