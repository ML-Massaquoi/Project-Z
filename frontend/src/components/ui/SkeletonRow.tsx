import { cn } from '@/lib/utils'

interface SkeletonRowProps {
  columns?: number
  className?: string
}

export function SkeletonRow({ columns = 5, className }: SkeletonRowProps) {
  return (
    <tr className={cn('animate-pulse', className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-slate-200" style={{ width: i === 0 ? '60%' : '80%' }} />
        </td>
      ))}
    </tr>
  )
}
