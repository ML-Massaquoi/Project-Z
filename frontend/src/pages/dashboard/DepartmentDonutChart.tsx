import { useQuery } from '@tanstack/react-query'
import { PieChart as PieChartIcon } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { dashboardAPI } from '@/api/client'
import type { DashboardChartData } from '@/types'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'

const CHART_COLORS = ['#2563EB', '#6366F1', '#06B6D4', '#10B981', '#F59E0B', '#EF4444']

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ payload: { department_name: string; count: number; percentage: number } }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg text-xs text-text">
      <p className="font-medium text-text">{d.department_name}</p>
      <p className="text-text-muted">Count: {d.count}</p>
      <p className="text-text-muted">{d.percentage.toFixed(1)}%</p>
    </div>
  )
}

export function DepartmentDonutChart() {
  const { data, isLoading, isError, refetch } = useQuery<DashboardChartData>({
    queryKey: ['dashboard-charts'],
    queryFn: async () => (await dashboardAPI.getCharts()).data,
    refetchInterval: 60000,
    staleTime: 0,
    retry: 2,
  })

  if (isLoading) return <SkeletonCard className="h-[320px]" />
  if (isError) return <ErrorState message="Failed to load chart data" onRetry={refetch} />

  const breakdown = data?.department_breakdown ?? []

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <h3 className="font-semibold text-text mb-4">Attendance by Department</h3>

      {breakdown.length === 0 ? (
        <EmptyState
          icon={PieChartIcon}
          message="No department attendance data for today"
          hint="Assign employees to departments to see breakdown"
          className="h-[220px]"
        />
      ) : (
        <div className="flex flex-col items-center">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={breakdown}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="count"
                nameKey="department_name"
                paddingAngle={3}
              >
                {breakdown.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {breakdown.slice(0, 6).map((dept, i) => (
              <div
                key={dept.department_id}
                className="flex items-center gap-1.5 text-xs text-text-muted"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                {dept.department_name} — {dept.count} ({dept.percentage.toFixed(1)}%)
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
