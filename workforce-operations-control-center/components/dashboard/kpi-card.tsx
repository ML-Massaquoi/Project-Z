import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  variant?: "default" | "success" | "warning" | "danger"
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
}: KpiCardProps) {
  const variantStyles = {
    default: "bg-primary/10 text-primary",
    success: "bg-teal-500/10 text-teal-600",
    warning: "bg-amber-500/10 text-amber-600",
    danger: "bg-destructive/10 text-destructive",
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-card-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <div
              className={cn(
                "inline-flex items-center text-xs font-medium",
                trend.isPositive ? "text-teal-600" : "text-destructive"
              )}
            >
              <span>{trend.isPositive ? "↑" : "↓"}</span>
              <span className="ml-1">{Math.abs(trend.value)}% from yesterday</span>
            </div>
          )}
        </div>
        <div className={cn("rounded-lg p-2.5", variantStyles[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}
