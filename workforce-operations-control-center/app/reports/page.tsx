"use client"

import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileText, Users, Clock, Building2, Cpu, CalendarClock, Download, FileSpreadsheet, File } from "lucide-react"
import { useState } from "react"

interface ReportCard {
  id: string
  title: string
  description: string
  icon: React.ElementType
  category: "attendance" | "employee" | "device"
}

const reportCards: ReportCard[] = [
  { id: "attendance", title: "Attendance Report", description: "Daily, weekly, and monthly attendance summary", icon: CalendarClock, category: "attendance" },
  { id: "absence", title: "Absence Report", description: "Track employee absences and patterns", icon: Users, category: "attendance" },
  { id: "late", title: "Late Arrivals Report", description: "Monitor late arrivals and violations", icon: Clock, category: "attendance" },
  { id: "department", title: "Department Report", description: "Department-wise workforce analytics", icon: Building2, category: "employee" },
  { id: "device", title: "Device Report", description: "Device usage and scan statistics", icon: Cpu, category: "device" },
  { id: "shift", title: "Shift Report", description: "Shift-wise attendance breakdown", icon: Clock, category: "attendance" },
]

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null)

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Reporting Center</h1>
            <p className="text-sm text-muted-foreground">
              Generate and export comprehensive workforce reports
            </p>
          </div>
        </div>

        {/* Report Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reportCards.map((report) => {
            const Icon = report.icon
            return (
              <button
                key={report.id}
                onClick={() => setSelectedReport(report.id)}
                className={`rounded-xl border p-5 text-left shadow-sm transition-all hover:shadow-md ${
                  selectedReport === report.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    selectedReport === report.id ? "bg-primary/20" : "bg-primary/10"
                  }`}>
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-card-foreground">{report.title}</h3>
                    <p className="text-xs text-muted-foreground">{report.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Report Configuration */}
        {selectedReport && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-semibold text-card-foreground mb-4">Report Configuration</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Date Range</label>
                <Select defaultValue="today">
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Department</label>
                <Select defaultValue="all">
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    <SelectItem value="operations">Operations</SelectItem>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="ict">ICT</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Shift</label>
                <Select defaultValue="all">
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Shifts</SelectItem>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="afternoon">Afternoon</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Status</label>
                <Select defaultValue="all">
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Button>
                <FileText className="mr-2 h-4 w-4" />
                Generate Report
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <File className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button variant="outline" size="sm">
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Excel
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  CSV
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Report Results Placeholder */}
        {selectedReport && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-semibold text-card-foreground">Report Preview</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure the report parameters above and click &quot;Generate Report&quot; to view results
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
