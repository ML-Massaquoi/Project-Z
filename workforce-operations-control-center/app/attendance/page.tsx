"use client"

import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Download, Filter, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface AttendanceRecord {
  id: string
  employeeId: string
  employeeName: string
  department: string
  date: string
  firstScan: string
  lastScan: string
  hoursWorked: string
  status: "present" | "late" | "absent" | "leave"
}

const mockAttendance: AttendanceRecord[] = [
  { id: "1", employeeId: "EMP001", employeeName: "Ahmed Hassan", department: "Operations", date: "2024-01-15", firstScan: "07:58:22", lastScan: "17:02:45", hoursWorked: "9h 04m", status: "present" },
  { id: "2", employeeId: "EMP045", employeeName: "Sarah Johnson", department: "Security", date: "2024-01-15", firstScan: "08:12:45", lastScan: "16:45:30", hoursWorked: "8h 33m", status: "late" },
  { id: "3", employeeId: "EMP023", employeeName: "Mohammed Ali", department: "ICT", date: "2024-01-15", firstScan: "07:55:31", lastScan: "17:30:15", hoursWorked: "9h 35m", status: "present" },
  { id: "4", employeeId: "EMP067", employeeName: "Emily Chen", department: "HR", date: "2024-01-15", firstScan: "07:52:15", lastScan: "16:50:22", hoursWorked: "8h 58m", status: "present" },
  { id: "5", employeeId: "EMP012", employeeName: "David Miller", department: "Operations", date: "2024-01-15", firstScan: "08:22:47", lastScan: "17:15:33", hoursWorked: "8h 53m", status: "late" },
  { id: "6", employeeId: "EMP089", employeeName: "Fatima Al-Rashid", department: "Security", date: "2024-01-15", firstScan: "07:49:33", lastScan: "16:55:18", hoursWorked: "9h 06m", status: "present" },
  { id: "7", employeeId: "EMP034", employeeName: "James Wilson", department: "Operations", date: "2024-01-15", firstScan: "—", lastScan: "—", hoursWorked: "—", status: "absent" },
  { id: "8", employeeId: "EMP056", employeeName: "Lisa Wang", department: "Management", date: "2024-01-15", firstScan: "07:59:55", lastScan: "18:02:11", hoursWorked: "10h 02m", status: "present" },
  { id: "9", employeeId: "EMP078", employeeName: "Omar Khalil", department: "Cargo", date: "2024-01-15", firstScan: "—", lastScan: "—", hoursWorked: "—", status: "leave" },
  { id: "10", employeeId: "EMP091", employeeName: "Anna Rodriguez", department: "ICT", date: "2024-01-15", firstScan: "08:05:12", lastScan: "17:10:45", hoursWorked: "9h 05m", status: "present" },
]

const statusStyles = {
  present: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  late: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  absent: "bg-destructive/10 text-destructive border-destructive/20",
  leave: "bg-primary/10 text-primary border-primary/20",
}

export default function AttendancePage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Attendance Center</h1>
            <p className="text-sm text-muted-foreground">
              Track and manage workforce attendance records
            </p>
          </div>
          <Button className="w-fit">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="today" className="w-full">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or ID..."
              className="pl-10 bg-background"
            />
          </div>
          <Select defaultValue="all">
            <SelectTrigger className="w-full sm:w-[180px] bg-background">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="operations">Operations</SelectItem>
              <SelectItem value="security">Security</SelectItem>
              <SelectItem value="ict">ICT</SelectItem>
              <SelectItem value="hr">HR</SelectItem>
              <SelectItem value="management">Management</SelectItem>
              <SelectItem value="cargo">Cargo</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all">
            <SelectTrigger className="w-full sm:w-[150px] bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="late">Late</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="leave">Leave</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold text-muted-foreground">Employee</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Department</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Date</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">First Scan</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Last Scan</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Hours Worked</TableHead>
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
                    <TableCell className="text-sm text-card-foreground">{record.date}</TableCell>
                    <TableCell className="text-sm font-mono text-card-foreground">{record.firstScan}</TableCell>
                    <TableCell className="text-sm font-mono text-card-foreground">{record.lastScan}</TableCell>
                    <TableCell className="text-sm font-mono text-card-foreground">{record.hoursWorked}</TableCell>
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

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-medium">1-10</span> of <span className="font-medium">350</span> records
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button variant="outline" size="sm">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
