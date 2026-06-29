"use client"

import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Building2, Clock, User, Fingerprint } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { use } from "react"

const mockEmployee = {
  id: "1",
  employeeId: "EMP001",
  name: "Ahmed Hassan",
  email: "ahmed.hassan@airport.com",
  phone: "+971 50 123 4567",
  department: "Operations",
  position: "Senior Operator",
  shift: "Morning (06:00 - 14:00)",
  status: "active",
  joinDate: "2021-03-15",
  address: "Dubai, UAE",
  emergencyContact: "+971 50 987 6543",
  biometricStatus: "Enrolled",
  fingerprintCount: 2,
  faceTemplates: 1,
}

const mockAttendanceHistory = [
  { date: "2024-01-15", firstScan: "07:58:22", lastScan: "17:02:45", hours: "9h 04m", status: "present" },
  { date: "2024-01-14", firstScan: "07:55:31", lastScan: "16:45:30", hours: "8h 50m", status: "present" },
  { date: "2024-01-13", firstScan: "08:12:45", lastScan: "17:30:15", hours: "9h 18m", status: "late" },
  { date: "2024-01-12", firstScan: "07:52:15", lastScan: "16:50:22", hours: "8h 58m", status: "present" },
  { date: "2024-01-11", firstScan: "—", lastScan: "—", hours: "—", status: "absent" },
]

const mockDeviceActivity = [
  { device: "Terminal A Gate 1", action: "Check In", time: "07:58:22", date: "2024-01-15" },
  { device: "Terminal A Gate 1", action: "Check Out", time: "17:02:45", date: "2024-01-15" },
  { device: "Terminal A Gate 2", action: "Check In", time: "07:55:31", date: "2024-01-14" },
  { device: "Admin Building", action: "Check Out", time: "16:45:30", date: "2024-01-14" },
]

const statusStyles = {
  present: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  late: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  absent: "bg-destructive/10 text-destructive border-destructive/20",
}

export default function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  console.log("[v0] Employee ID:", id)
  
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Back Button */}
        <Link href="/employees">
          <Button variant="ghost" className="gap-2 px-0 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Employees
          </Button>
        </Link>

        {/* Employee Header */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-card-foreground">{mockEmployee.name}</h1>
                <p className="text-sm text-muted-foreground">{mockEmployee.employeeId} • {mockEmployee.position}</p>
                <Badge variant="outline" className="mt-2 capitalize bg-teal-500/10 text-teal-600 border-teal-500/20">
                  {mockEmployee.status}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">Edit Profile</Button>
              <Button>View Attendance</Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Personal Information */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-semibold text-card-foreground mb-4">Personal Information</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm text-card-foreground">{mockEmployee.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm text-card-foreground">{mockEmployee.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="text-sm text-card-foreground">{mockEmployee.address}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Emergency Contact</p>
                  <p className="text-sm text-card-foreground">{mockEmployee.emergencyContact}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Employment Information */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-semibold text-card-foreground mb-4">Employment Information</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Department</p>
                  <p className="text-sm text-card-foreground">{mockEmployee.department}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Shift</p>
                  <p className="text-sm text-card-foreground">{mockEmployee.shift}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Join Date</p>
                  <p className="text-sm text-card-foreground">{mockEmployee.joinDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Fingerprint className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Biometric Status</p>
                  <p className="text-sm text-card-foreground">{mockEmployee.biometricStatus} ({mockEmployee.fingerprintCount} fingerprints, {mockEmployee.faceTemplates} face)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Attendance History */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold text-card-foreground">Attendance History</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-muted-foreground">Date</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">First Scan</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Last Scan</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Hours</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockAttendanceHistory.map((record, i) => (
                <TableRow key={i} className="hover:bg-muted/50">
                  <TableCell className="text-sm text-card-foreground">{record.date}</TableCell>
                  <TableCell className="text-sm font-mono text-card-foreground">{record.firstScan}</TableCell>
                  <TableCell className="text-sm font-mono text-card-foreground">{record.lastScan}</TableCell>
                  <TableCell className="text-sm font-mono text-card-foreground">{record.hours}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("capitalize text-xs", statusStyles[record.status as keyof typeof statusStyles])}>
                      {record.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Device Activity */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold text-card-foreground">Device Activity</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-muted-foreground">Device</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Action</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Time</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDeviceActivity.map((activity, i) => (
                <TableRow key={i} className="hover:bg-muted/50">
                  <TableCell className="text-sm text-card-foreground">{activity.device}</TableCell>
                  <TableCell className="text-sm text-card-foreground">{activity.action}</TableCell>
                  <TableCell className="text-sm font-mono text-card-foreground">{activity.time}</TableCell>
                  <TableCell className="text-sm text-card-foreground">{activity.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  )
}
