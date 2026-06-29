"use client"

import { cn } from "@/lib/utils"

interface DepartmentReadiness {
  id: string
  name: string
  expected: number
  present: number
  late: number
  absent: number
}

const mockDepartments: DepartmentReadiness[] = [
  { id: "1", name: "Operations", expected: 120, present: 98, late: 12, absent: 10 },
  { id: "2", name: "Security", expected: 85, present: 72, late: 8, absent: 5 },
  { id: "3", name: "ICT", expected: 45, present: 40, late: 3, absent: 2 },
  { id: "4", name: "HR", expected: 25, present: 22, late: 2, absent: 1 },
  { id: "5", name: "Management", expected: 15, present: 14, late: 1, absent: 0 },
  { id: "6", name: "Cargo", expected: 60, present: 48, late: 7, absent: 5 },
]

export function WorkforceReadiness() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="font-semibold text-card-foreground">Workforce Readiness by Department</h3>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {mockDepartments.map((dept) => {
          const readiness = Math.round((dept.present / dept.expected) * 100)
          return (
            <div key={dept.id} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between">
                <h4 className="font-medium text-sm text-card-foreground">{dept.name}</h4>
                <span
                  className={cn(
                    "text-xs font-bold",
                    readiness >= 90 ? "text-teal-600" : readiness >= 75 ? "text-amber-600" : "text-destructive"
                  )}
                >
                  {readiness}%
                </span>
              </div>
              {/* Progress Bar */}
              <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    readiness >= 90 ? "bg-teal-500" : readiness >= 75 ? "bg-amber-500" : "bg-destructive"
                  )}
                  style={{ width: `${readiness}%` }}
                />
              </div>
              {/* Stats */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-teal-600">{dept.present}</p>
                  <p className="text-[10px] text-muted-foreground">Present</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-600">{dept.late}</p>
                  <p className="text-[10px] text-muted-foreground">Late</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-destructive">{dept.absent}</p>
                  <p className="text-[10px] text-muted-foreground">Absent</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground text-center">
                Expected: {dept.expected}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
