"use client"

import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Plus, Users, MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Department {
  id: string
  name: string
  head: string
  staffCount: number
  present: number
  late: number
  absent: number
}

const mockDepartments: Department[] = [
  { id: "1", name: "Operations", head: "Lisa Wang", staffCount: 120, present: 98, late: 12, absent: 10 },
  { id: "2", name: "Security", head: "Fatima Al-Rashid", staffCount: 85, present: 72, late: 8, absent: 5 },
  { id: "3", name: "ICT", head: "Mohammed Ali", staffCount: 45, present: 40, late: 3, absent: 2 },
  { id: "4", name: "Human Resources", head: "Emily Chen", staffCount: 25, present: 22, late: 2, absent: 1 },
  { id: "5", name: "Management", head: "Ahmed Hassan", staffCount: 15, present: 14, late: 1, absent: 0 },
  { id: "6", name: "Cargo", head: "David Miller", staffCount: 60, present: 48, late: 7, absent: 5 },
]

export default function DepartmentsPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Departments</h1>
            <p className="text-sm text-muted-foreground">
              Manage organizational departments and staff allocation
            </p>
          </div>
          <Button className="w-fit">
            <Plus className="mr-2 h-4 w-4" />
            Add Department
          </Button>
        </div>

        {/* Department Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockDepartments.map((dept) => {
            const readiness = Math.round((dept.present / dept.staffCount) * 100)
            return (
              <div key={dept.id} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-card-foreground">{dept.name}</h3>
                      <p className="text-xs text-muted-foreground">Head: {dept.head}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>View Details</DropdownMenuItem>
                      <DropdownMenuItem>Edit Department</DropdownMenuItem>
                      <DropdownMenuItem>View Staff</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Stats */}
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-lg font-bold text-card-foreground">{dept.staffCount}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div className="rounded-lg bg-teal-500/10 p-2">
                    <p className="text-lg font-bold text-teal-600">{dept.present}</p>
                    <p className="text-[10px] text-muted-foreground">Present</p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 p-2">
                    <p className="text-lg font-bold text-amber-600">{dept.late}</p>
                    <p className="text-[10px] text-muted-foreground">Late</p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 p-2">
                    <p className="text-lg font-bold text-destructive">{dept.absent}</p>
                    <p className="text-[10px] text-muted-foreground">Absent</p>
                  </div>
                </div>

                {/* Readiness Bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Readiness</span>
                    <span
                      className={cn(
                        "font-semibold",
                        readiness >= 90 ? "text-teal-600" : readiness >= 75 ? "text-amber-600" : "text-destructive"
                      )}
                    >
                      {readiness}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        readiness >= 90 ? "bg-teal-500" : readiness >= 75 ? "bg-amber-500" : "bg-destructive"
                      )}
                      style={{ width: `${readiness}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AppLayout>
  )
}
