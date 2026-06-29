import { AppLayout } from "@/components/layout/app-layout"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { TodayAttendanceBoard } from "@/components/dashboard/today-attendance-board"
import { LiveScanFeed } from "@/components/dashboard/live-scan-feed"
import { DeviceStatusCenter } from "@/components/dashboard/device-status-center"
import { WorkforceReadiness } from "@/components/dashboard/workforce-readiness"
import { Users, Clock, UserX, Cpu } from "lucide-react"

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Command Center</h1>
          <p className="text-sm text-muted-foreground">
            Real-time airport workforce operations overview
          </p>
        </div>

        {/* KPI Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Present Today"
            value="294"
            subtitle="Out of 350 expected"
            icon={Users}
            variant="success"
            trend={{ value: 2.5, isPositive: true }}
          />
          <KpiCard
            title="Late Arrivals"
            value="33"
            subtitle="After grace period"
            icon={Clock}
            variant="warning"
            trend={{ value: 1.2, isPositive: false }}
          />
          <KpiCard
            title="Absent"
            value="23"
            subtitle="No scan recorded"
            icon={UserX}
            variant="danger"
            trend={{ value: 0.8, isPositive: true }}
          />
          <KpiCard
            title="Online Devices"
            value="18/20"
            subtitle="2 devices offline"
            icon={Cpu}
            variant="default"
          />
        </div>

        {/* Today's Attendance Board */}
        <TodayAttendanceBoard />

        {/* Live Scan Feed + Device Status */}
        <div className="grid gap-6 lg:grid-cols-2">
          <LiveScanFeed />
          <DeviceStatusCenter />
        </div>

        {/* Workforce Readiness */}
        <WorkforceReadiness />
      </div>
    </AppLayout>
  )
}
