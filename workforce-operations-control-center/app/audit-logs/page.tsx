"use client"

import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import { Search, Download, ChevronLeft, ChevronRight, Filter } from "lucide-react"
import { cn } from "@/lib/utils"

interface AuditLog {
  id: string
  timestamp: string
  user: string
  action: string
  entity: string
  entityId: string
  ipAddress: string
  result: "success" | "failure" | "warning"
  details: string
}

const mockAuditLogs: AuditLog[] = [
  { id: "1", timestamp: "2024-01-15 08:45:22", user: "admin@airport.com", action: "LOGIN", entity: "User", entityId: "USR001", ipAddress: "192.168.1.50", result: "success", details: "Successful login" },
  { id: "2", timestamp: "2024-01-15 08:42:15", user: "hr.manager@airport.com", action: "CREATE", entity: "Employee", entityId: "EMP099", ipAddress: "192.168.1.45", result: "success", details: "Created new employee record" },
  { id: "3", timestamp: "2024-01-15 08:38:33", user: "admin@airport.com", action: "UPDATE", entity: "Device", entityId: "DEV004", ipAddress: "192.168.1.50", result: "success", details: "Updated device configuration" },
  { id: "4", timestamp: "2024-01-15 08:35:10", user: "ict.admin@airport.com", action: "SYNC", entity: "Device", entityId: "DEV001", ipAddress: "192.168.1.60", result: "success", details: "Device sync completed" },
  { id: "5", timestamp: "2024-01-15 08:30:45", user: "unknown", action: "LOGIN", entity: "User", entityId: "—", ipAddress: "192.168.1.99", result: "failure", details: "Invalid credentials" },
  { id: "6", timestamp: "2024-01-15 08:25:18", user: "security.lead@airport.com", action: "EXPORT", entity: "Report", entityId: "RPT045", ipAddress: "192.168.1.55", result: "success", details: "Exported attendance report" },
  { id: "7", timestamp: "2024-01-15 08:20:55", user: "admin@airport.com", action: "DELETE", entity: "Shift", entityId: "SHF005", ipAddress: "192.168.1.50", result: "warning", details: "Deleted inactive shift" },
  { id: "8", timestamp: "2024-01-15 08:15:30", user: "ops.manager@airport.com", action: "UPDATE", entity: "Department", entityId: "DEP003", ipAddress: "192.168.1.48", result: "success", details: "Updated department head" },
]

const resultStyles = {
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  failure: "bg-destructive/10 text-destructive border-destructive/20",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
}

const actionColors: Record<string, string> = {
  LOGIN: "text-primary",
  CREATE: "text-emerald-600",
  UPDATE: "text-amber-600",
  DELETE: "text-destructive",
  SYNC: "text-primary",
  EXPORT: "text-muted-foreground",
}

export default function AuditLogsPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Audit Logs</h1>
            <p className="text-sm text-muted-foreground">
              Track all system activities and user actions
            </p>
          </div>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Logs
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by user, action, or entity..."
              className="pl-10 bg-background"
            />
          </div>
          <Select defaultValue="all">
            <SelectTrigger className="w-full sm:w-[150px] bg-background">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="login">Login</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="sync">Sync</SelectItem>
              <SelectItem value="export">Export</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all">
            <SelectTrigger className="w-full sm:w-[150px] bg-background">
              <SelectValue placeholder="Result" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Results</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failure">Failure</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
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
                  <TableHead className="text-xs font-semibold text-muted-foreground">Timestamp</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">User</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Action</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Entity</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">IP Address</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockAuditLogs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm font-mono text-muted-foreground">{log.timestamp}</TableCell>
                    <TableCell className="text-sm text-card-foreground">{log.user}</TableCell>
                    <TableCell>
                      <span className={cn("text-sm font-medium", actionColors[log.action] || "text-card-foreground")}>
                        {log.action}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="text-sm text-card-foreground">{log.entity}</span>
                        <span className="text-xs text-muted-foreground ml-1">({log.entityId})</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">{log.ipAddress}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("capitalize text-xs", resultStyles[log.result])}>
                        {log.result}
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
              Showing <span className="font-medium">1-8</span> of <span className="font-medium">1,245</span> logs
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
