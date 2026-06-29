"use client"

import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Clock, MoreHorizontal, Building2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Shift {
  id: string
  name: string
  startTime: string
  endTime: string
  gracePeriod: string
  departments: string[]
  employeeCount: number
  status: "active" | "inactive"
}

const mockShifts: Shift[] = [
  { id: "1", name: "Morning Shift", startTime: "06:00", endTime: "14:00", gracePeriod: "15 min", departments: ["Operations", "Security", "ICT"], employeeCount: 145, status: "active" },
  { id: "2", name: "Afternoon Shift", startTime: "14:00", endTime: "22:00", gracePeriod: "15 min", departments: ["Operations", "Security", "Cargo"], employeeCount: 98, status: "active" },
  { id: "3", name: "Night Shift", startTime: "22:00", endTime: "06:00", gracePeriod: "15 min", departments: ["Security", "Cargo"], employeeCount: 67, status: "active" },
  { id: "4", name: "Office Hours", startTime: "08:00", endTime: "17:00", gracePeriod: "10 min", departments: ["HR", "Management", "ICT"], employeeCount: 40, status: "active" },
  { id: "5", name: "Weekend Shift", startTime: "07:00", endTime: "15:00", gracePeriod: "15 min", departments: ["Operations", "Security"], employeeCount: 55, status: "inactive" },
]

export default function ShiftsPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Shift Management</h1>
            <p className="text-sm text-muted-foreground">
              Configure and manage work shifts and schedules
            </p>
          </div>
          <Button className="w-fit">
            <Plus className="mr-2 h-4 w-4" />
            Add Shift
          </Button>
        </div>

        {/* Shift Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockShifts.map((shift) => (
            <div key={shift.id} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-card-foreground">{shift.name}</h3>
                      <Badge
                        variant="outline"
                        className={
                          shift.status === "active"
                            ? "bg-teal-500/10 text-teal-600 border-teal-500/20"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {shift.status}
                      </Badge>
                    </div>
                    <p className="text-sm font-mono text-muted-foreground">
                      {shift.startTime} — {shift.endTime}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Edit Shift</DropdownMenuItem>
                    <DropdownMenuItem>View Employees</DropdownMenuItem>
                    <DropdownMenuItem>Duplicate</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Details */}
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Grace Period</span>
                  <span className="font-medium text-card-foreground">{shift.gracePeriod}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Employees</span>
                  <span className="font-medium text-card-foreground">{shift.employeeCount}</span>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground mb-2">Departments</p>
                  <div className="flex flex-wrap gap-1">
                    {shift.departments.map((dept) => (
                      <Badge key={dept} variant="secondary" className="text-xs gap-1">
                        <Building2 className="h-3 w-3" />
                        {dept}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
