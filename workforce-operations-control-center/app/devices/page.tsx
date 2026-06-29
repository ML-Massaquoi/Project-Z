"use client"

import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Plus, Wifi, WifiOff, MoreHorizontal, RefreshCw, Search, MapPin, Activity } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Device {
  id: string
  name: string
  serialNumber: string
  ipAddress: string
  location: string
  status: "online" | "offline"
  lastHeartbeat: string
  totalScans: number
  model: string
}

const mockDevices: Device[] = [
  { id: "1", name: "ZK-BIO-001", serialNumber: "ZKBIO2024001", ipAddress: "192.168.1.101", location: "Terminal A Gate 1", status: "online", lastHeartbeat: "2 min ago", totalScans: 15420, model: "ZKTeco ProFace X" },
  { id: "2", name: "ZK-BIO-002", serialNumber: "ZKBIO2024002", ipAddress: "192.168.1.102", location: "Terminal A Gate 2", status: "online", lastHeartbeat: "1 min ago", totalScans: 12890, model: "ZKTeco ProFace X" },
  { id: "3", name: "ZK-BIO-003", serialNumber: "ZKBIO2024003", ipAddress: "192.168.1.103", location: "Terminal B Gate 1", status: "online", lastHeartbeat: "30 sec ago", totalScans: 18750, model: "ZKTeco SpeedFace" },
  { id: "4", name: "ZK-BIO-004", serialNumber: "ZKBIO2024004", ipAddress: "192.168.1.104", location: "Terminal B Gate 3", status: "offline", lastHeartbeat: "15 min ago", totalScans: 9650, model: "ZKTeco ProFace X" },
  { id: "5", name: "ZK-BIO-005", serialNumber: "ZKBIO2024005", ipAddress: "192.168.1.105", location: "Security Office", status: "online", lastHeartbeat: "45 sec ago", totalScans: 22340, model: "ZKTeco SpeedFace" },
  { id: "6", name: "ZK-BIO-006", serialNumber: "ZKBIO2024006", ipAddress: "192.168.1.106", location: "Cargo Area", status: "online", lastHeartbeat: "1 min ago", totalScans: 8920, model: "ZKTeco F22" },
  { id: "7", name: "ZK-BIO-007", serialNumber: "ZKBIO2024007", ipAddress: "192.168.1.107", location: "Admin Building", status: "online", lastHeartbeat: "20 sec ago", totalScans: 31200, model: "ZKTeco ProFace X" },
  { id: "8", name: "ZK-BIO-008", serialNumber: "ZKBIO2024008", ipAddress: "192.168.1.108", location: "Terminal C Main", status: "offline", lastHeartbeat: "32 min ago", totalScans: 5430, model: "ZKTeco SpeedFace" },
]

export default function DevicesPage() {
  const onlineCount = mockDevices.filter((d) => d.status === "online").length
  const offlineCount = mockDevices.filter((d) => d.status === "offline").length

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Device Control Center</h1>
            <p className="text-sm text-muted-foreground">
              Monitor and manage biometric devices across all terminals
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync All
            </Button>
            <Button className="w-fit">
              <Plus className="mr-2 h-4 w-4" />
              Add Device
            </Button>
          </div>
        </div>

        {/* Stats & Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-teal-500" />
              <span className="text-sm font-medium text-card-foreground">{onlineCount} Online</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-destructive" />
              <span className="text-sm font-medium text-card-foreground">{offlineCount} Offline</span>
            </div>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search devices..."
              className="pl-10 bg-background"
            />
          </div>
        </div>

        {/* Device Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {mockDevices.map((device) => (
            <div
              key={device.id}
              className={cn(
                "rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md",
                device.status === "online" ? "border-border" : "border-destructive/30 bg-destructive/5"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {device.status === "online" ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10">
                      <Wifi className="h-5 w-5 text-teal-500" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                      <WifiOff className="h-5 w-5 text-destructive" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-card-foreground">{device.name}</h3>
                    <p className="text-xs text-muted-foreground">{device.model}</p>
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
                    <DropdownMenuItem>Sync Device</DropdownMenuItem>
                    <DropdownMenuItem>Restart</DropdownMenuItem>
                    <DropdownMenuItem>Edit Configuration</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">Remove Device</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Serial:</span>
                  <span className="font-mono text-card-foreground">{device.serialNumber}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">IP:</span>
                  <span className="font-mono text-card-foreground">{device.ipAddress}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-card-foreground truncate">{device.location}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Activity className="h-3.5 w-3.5" />
                  Last: {device.lastHeartbeat}
                </div>
                <Badge variant="secondary" className="text-xs">
                  {device.totalScans.toLocaleString()} scans
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
