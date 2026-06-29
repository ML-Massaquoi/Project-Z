import { useQuery } from '@tanstack/react-query'
import { BarChart2 } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { dashboardAPI } from '@/api/client'
import type { DashboardChartData } from '@/types'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'

export function AttendanceOverviewChart() {
  const { data, isLoading, isError, refetch } = useQuery<DashboardChartData>({
    queryKey: ['dashboard-charts'],
    queryFn: async () => (await dashboardAPI.getCharts()).data,
    refetchInterval: 60000,
    staleTime: 0,
    retry: 2,
  })

  if (isLoading) return <SkeletonCard className="h-[320px]" />
  if (isError) return <ErrorState message="Failed to load chart data" onRetry={refetch} />

  const overview = data?.attendance_overview ?? []

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text">Attendance Overview</h3>
        <span className="text-xs text-text-muted bg-surface-2 px-2 py-1 rounded-md border border-border">This Week</span>
      </div>

      {overview.length === 0 ? (
        <EmptyState
          icon={BarChart2}
          message="No attendance data for this week"
          hint="Data appears once devices push records"
          className="h-[220px]"
        />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={overview}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#94A3B8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94A3B8' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#131823',
                borderRadius: '12px',
                border: '1px solid #1E293B',
                color: '#F8FAFC',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
              itemStyle={{ color: '#E2E8F0' }}
              labelStyle={{ color: '#F8FAFC', fontWeight: 'bold' }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ color: '#E2E8F0' }} />
            <Line
              type="monotone"
              dataKey="present"
              stroke="#2563EB"
              strokeWidth={2.5}
              dot={false}
              name="Present"
            />
            <Line
              type="monotone"
              dataKey="absent"
              stroke="#94A3B8"
              strokeWidth={2}
              dot={false}
              name="Absent"
            />
            <Line
              type="monotone"
              dataKey="late"
              stroke="#F59E0B"
              strokeWidth={2}
              dot={false}
              name="Late"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
