"use client"

import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { Bell, WifiOff, UserX, RefreshCw, AlertTriangle, CheckCircle, Clock, X } from "lucide-react"

interface Notification {
  id: string
  type: "device_offline" | "unknown_scan" | "sync_completed" | "attendance_exception" | "shift_violation"
  title: string
  message: string
  timestamp: string
  read: boolean
}

const mockNotifications: Notification[] = [
  { id: "1", type: "device_offline", title: "Device Offline", message: "ZK-BIO-004 at Terminal B Gate 3 is offline", timestamp: "5 min ago", read: false },
  { id: "2", type: "unknown_scan", title: "Unknown Scan Detected", message: "Unregistered fingerprint scanned at Security Office", timestamp: "12 min ago", read: false },
  { id: "3", type: "sync_completed", title: "Sync Completed", message: "ZK-BIO-001 synchronized 245 records successfully", timestamp: "25 min ago", read: false },
  { id: "4", type: "attendance_exception", title: "Attendance Exception", message: "EMP034 James Wilson marked absent for 3 consecutive days", timestamp: "1 hour ago", read: true },
  { id: "5", type: "shift_violation", title: "Shift Violation", message: "5 employees exceeded grace period in Morning Shift", timestamp: "2 hours ago", read: true },
  { id: "6", type: "device_offline", title: "Device Offline", message: "ZK-BIO-008 at Terminal C Main went offline", timestamp: "3 hours ago", read: true },
  { id: "7", type: "sync_completed", title: "Sync Completed", message: "Bulk sync completed for all Terminal A devices", timestamp: "4 hours ago", read: true },
  { id: "8", type: "attendance_exception", title: "Attendance Exception", message: "EMP089 Fatima Al-Rashid scan data mismatch detected", timestamp: "5 hours ago", read: true },
]

const typeConfig = {
  device_offline: {
    icon: WifiOff,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  unknown_scan: {
    icon: UserX,
    color: "text-amber-600",
    bgColor: "bg-amber-500/10",
  },
  sync_completed: {
    icon: RefreshCw,
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10",
  },
  attendance_exception: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bgColor: "bg-amber-500/10",
  },
  shift_violation: {
    icon: Clock,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
}

export default function NotificationsPage() {
  const unreadCount = mockNotifications.filter((n) => !n.read).length

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Notification Center</h1>
            <p className="text-sm text-muted-foreground">
              System alerts and important notifications
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <CheckCircle className="mr-2 h-4 w-4" />
              Mark All Read
            </Button>
          </div>
        </div>

        {/* Notification Stats */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Unread Notifications</p>
            <p className="text-2xl font-bold text-card-foreground">{unreadCount}</p>
          </div>
        </div>

        {/* Notifications List */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold text-card-foreground">All Notifications</h2>
          </div>
          <ScrollArea className="h-[600px]">
            <div className="divide-y divide-border">
              {mockNotifications.map((notification) => {
                const config = typeConfig[notification.type]
                const Icon = config.icon
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      "flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/50",
                      !notification.read && "bg-primary/5"
                    )}
                  >
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", config.bgColor)}>
                      <Icon className={cn("h-5 w-5", config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm text-card-foreground">{notification.title}</h3>
                        {!notification.read && (
                          <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">New</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{notification.message}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{notification.timestamp}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </div>
    </AppLayout>
  )
}
