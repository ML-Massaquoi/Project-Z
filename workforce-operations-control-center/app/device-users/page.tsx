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
import { Search, Download, ChevronLeft, ChevronRight, Fingerprint, ScanFace, CreditCard, RefreshCw } from "lucide-react"

interface DeviceUser {
  id: string
  employeeId: string
  name: string
  fingerprintCount: number
  faceTemplates: number
  cardNumber: string | null
  sourceDevice: string
  lastSync: string
  status: "synced" | "pending" | "error"
}

const mockDeviceUsers: DeviceUser[] = [
  { id: "1", employeeId: "EMP001", name: "Ahmed Hassan", fingerprintCount: 2, faceTemplates: 1, cardNumber: "CARD001", sourceDevice: "ZK-BIO-001", lastSync: "2024-01-15 08:45", status: "synced" },
  { id: "2", employeeId: "EMP045", name: "Sarah Johnson", fingerprintCount: 2, faceTemplates: 1, cardNumber: null, sourceDevice: "ZK-BIO-003", lastSync: "2024-01-15 08:30", status: "synced" },
  { id: "3", employeeId: "EMP023", name: "Mohammed Ali", fingerprintCount: 1, faceTemplates: 1, cardNumber: "CARD023", sourceDevice: "ZK-BIO-002", lastSync: "2024-01-15 07:15", status: "synced" },
  { id: "4", employeeId: "EMP067", name: "Emily Chen", fingerprintCount: 2, faceTemplates: 0, cardNumber: "CARD067", sourceDevice: "ZK-BIO-005", lastSync: "2024-01-14 16:20", status: "pending" },
  { id: "5", employeeId: "EMP012", name: "David Miller", fingerprintCount: 0, faceTemplates: 1, cardNumber: null, sourceDevice: "ZK-BIO-001", lastSync: "2024-01-14 15:45", status: "synced" },
  { id: "6", employeeId: "EMP089", name: "Fatima Al-Rashid", fingerprintCount: 2, faceTemplates: 1, cardNumber: "CARD089", sourceDevice: "ZK-BIO-004", lastSync: "2024-01-13 09:30", status: "error" },
  { id: "7", employeeId: "EMP034", name: "James Wilson", fingerprintCount: 2, faceTemplates: 1, cardNumber: null, sourceDevice: "ZK-BIO-006", lastSync: "2024-01-15 06:50", status: "synced" },
  { id: "8", employeeId: "EMP056", name: "Lisa Wang", fingerprintCount: 1, faceTemplates: 1, cardNumber: "CARD056", sourceDevice: "ZK-BIO-007", lastSync: "2024-01-15 07:45", status: "synced" },
]

const statusStyles = {
  synced: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  error: "bg-destructive/10 text-destructive border-destructive/20",
}

export default function DeviceUsersPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Device User Center</h1>
            <p className="text-sm text-muted-foreground">
              Manage biometric data and device user synchronization
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync All
            </Button>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or employee ID..."
              className="pl-10 bg-background"
            />
          </div>
          <Select defaultValue="all">
            <SelectTrigger className="w-full sm:w-[180px] bg-background">
              <SelectValue placeholder="Source Device" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Devices</SelectItem>
              <SelectItem value="ZK-BIO-001">ZK-BIO-001</SelectItem>
              <SelectItem value="ZK-BIO-002">ZK-BIO-002</SelectItem>
              <SelectItem value="ZK-BIO-003">ZK-BIO-003</SelectItem>
              <SelectItem value="ZK-BIO-004">ZK-BIO-004</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all">
            <SelectTrigger className="w-full sm:w-[150px] bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="synced">Synced</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="error">Error</SelectItem>
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
                  <TableHead className="text-xs font-semibold text-muted-foreground">Fingerprints</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Face Templates</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Card Number</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Source Device</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Last Sync</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockDeviceUsers.map((user) => (
                  <TableRow key={user.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm font-mono text-card-foreground">{user.employeeId}</TableCell>
                    <TableCell className="text-sm font-medium text-card-foreground">{user.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Fingerprint className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-card-foreground">{user.fingerprintCount}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <ScanFace className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-card-foreground">{user.faceTemplates}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {user.cardNumber ? (
                          <>
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-mono text-card-foreground">{user.cardNumber}</span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-card-foreground">{user.sourceDevice}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.lastSync}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyles[user.status]}>
                        {user.status}
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
              Showing <span className="font-medium">1-8</span> of <span className="font-medium">350</span> users
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
