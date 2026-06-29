"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface AttendanceRecord {
  id: string
  employeeId: string
  employeeName: string
  department: string
  firstScan: string
  lastScan: string
  status: "present" | "late" | "absent"
}

const mockAttendance: AttendanceRecord[] = [
  { id: "1", employeeId: "EMP001", employeeName: "Ahmed Hassan", department: "Operations", firstScan: "07:58:22", lastScan: "08:45:22", status: "present" },
  { id: "2", employeeId: "EMP045", employeeName: "Sarah Johnson", department: "Security", firstScan: "08:12:45", lastScan: "08:44:58", status: "late" },
  { id: "3", employeeId: "EMP023", employeeName: "Mohammed Ali", department: "ICT", firstScan: "07:55:31", lastScan: "08:44:31", status: "present" },
  { id: "4", employeeId: "EMP067", employeeName: "Emily Chen", department: "HR", firstScan: "07:52:15", lastScan: "08:43:15", status: "present" },
  { id: "5", employeeId: "EMP012", employeeName: "David Miller", department: "Operations", firstScan: "08:22:47", lastScan: "08:42:47", status: "late" },
  { id: "6", employeeId: "EMP089", employeeName: "Fatima Al-Rashid", department: "Security", firstScan: "07:49:33", lastScan: "08:41:33", status: "present" },
  { id: "7", employeeId: "EMP034", employeeName: "James Wilson", department: "Operations", firstScan: "07:56:19", lastScan: "08:40:19", status: "present" },
  { id: "8", employeeId: "EMP056", employeeName: "Lisa Wang", department: "Management", firstScan: "07:59:55", lastScan: "08:39:55", status: "present" },
]

const statusStyles = {
  present: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  late: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  absent: "bg-destructive/10 text-destructive border-destructive/20",
}

export function TodayAttendanceBoard() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="font-semibold text-card-foreground">Today&apos;s Attendance Board</h3>
        <span className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-semibold text-muted-foreground">Employee</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Department</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">First Scan</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Last Scan</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockAttendance.map((record) => (
              <TableRow key={record.id} className="hover:bg-muted/50">
                <TableCell>
                  <div>
                    <p className="font-medium text-sm text-card-foreground">{record.employeeName}</p>
                    <p className="text-xs text-muted-foreground">{record.employeeId}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-card-foreground">{record.department}</TableCell>
                <TableCell className="text-sm font-mono text-card-foreground">{record.firstScan}</TableCell>
                <TableCell className="text-sm font-mono text-card-foreground">{record.lastScan}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("capitalize text-xs", statusStyles[record.status])}>
                    {record.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
