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
import { Search, Plus, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Employee {
  id: string
  employeeId: string
  name: string
  department: string
  position: string
  shift: string
  status: "active" | "inactive" | "on-leave"
}

const mockEmployees: Employee[] = [
  { id: "1", employeeId: "EMP001", name: "Ahmed Hassan", department: "Operations", position: "Senior Operator", shift: "Morning", status: "active" },
  { id: "2", employeeId: "EMP045", name: "Sarah Johnson", department: "Security", position: "Security Officer", shift: "Morning", status: "active" },
  { id: "3", employeeId: "EMP023", name: "Mohammed Ali", department: "ICT", position: "Systems Admin", shift: "Morning", status: "active" },
  { id: "4", employeeId: "EMP067", name: "Emily Chen", department: "HR", position: "HR Specialist", shift: "Morning", status: "active" },
  { id: "5", employeeId: "EMP012", name: "David Miller", department: "Operations", position: "Operator", shift: "Afternoon", status: "active" },
  { id: "6", employeeId: "EMP089", name: "Fatima Al-Rashid", department: "Security", position: "Security Lead", shift: "Night", status: "active" },
  { id: "7", employeeId: "EMP034", name: "James Wilson", department: "Operations", position: "Operator", shift: "Morning", status: "on-leave" },
  { id: "8", employeeId: "EMP056", name: "Lisa Wang", department: "Management", position: "Operations Manager", shift: "Morning", status: "active" },
  { id: "9", employeeId: "EMP078", name: "Omar Khalil", department: "Cargo", position: "Cargo Handler", shift: "Night", status: "inactive" },
  { id: "10", employeeId: "EMP091", name: "Anna Rodriguez", department: "ICT", position: "Network Engineer", shift: "Morning", status: "active" },
]

const statusStyles = {
  active: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  inactive: "bg-muted text-muted-foreground border-muted",
  "on-leave": "bg-amber-500/10 text-amber-600 border-amber-500/20",
}

export default function EmployeesPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Employee Directory</h1>
            <p className="text-sm text-muted-foreground">
              Manage and view all employee records
            </p>
          </div>
          <Button className="w-fit">
            <Plus className="mr-2 h-4 w-4" />
            Add Employee
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, ID, or position..."
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
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="on-leave">On Leave</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold text-muted-foreground">Employee ID</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Name</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Department</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Position</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Shift</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockEmployees.map((employee) => (
                  <TableRow key={employee.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm font-mono text-card-foreground">{employee.employeeId}</TableCell>
                    <TableCell>
                      <Link href={`/employees/${employee.id}`} className="font-medium text-sm text-primary hover:underline">
                        {employee.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-card-foreground">{employee.department}</TableCell>
                    <TableCell className="text-sm text-card-foreground">{employee.position}</TableCell>
                    <TableCell className="text-sm text-card-foreground">{employee.shift}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("capitalize text-xs", statusStyles[employee.status])}>
                        {employee.status.replace("-", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>View Profile</DropdownMenuItem>
                          <DropdownMenuItem>Edit Details</DropdownMenuItem>
                          <DropdownMenuItem>View Attendance</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">Deactivate</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-medium">1-10</span> of <span className="font-medium">350</span> employees
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
