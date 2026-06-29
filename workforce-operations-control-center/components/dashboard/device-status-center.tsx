"use client"

import { cn } from "@/lib/utils"
import { Wifi, WifiOff, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Device {
  id: string
  name: string
  location: string
  status: "online" | "offline"
  lastHeartbeat: string
  scansToday: number
}

const mockDevices: Device[] = [
  { id: "DEV001", name: "ZK-BIO-001", location: "Terminal A Gate 1", status: "online", lastHeartbeat: "2 min ago", scansToday: 245 },
  { id: "DEV002", name: "ZK-BIO-002", location: "Terminal A Gate 2", status: "online", lastHeartbeat: "1 min ago", scansToday: 189 },
  { id: "DEV003", name: "ZK-BIO-003", location: "Terminal B Gate 1", status: "online", lastHeartbeat: "30 sec ago", scansToday: 312 },
  { id: "DEV004", name: "ZK-BIO-004", location: "Terminal B Gate 3", status: "offline", lastHeartbeat: "15 min ago", scansToday: 87 },
  { id: "DEV005", name: "ZK-BIO-005", location: "Security Office", status: "online", lastHeartbeat: "45 sec ago", scansToday: 156 },
  { id: "DEV006", name: "ZK-BIO-006", location: "Cargo Area", status: "online", lastHeartbeat: "1 min ago", scansToday: 98 },
]

export function DeviceStatusCenter() {
  const onlineCount = mockDevices.filter((d) => d.status === "online").length
  const offlineCount = mockDevices.filter((d) => d.status === "offline").length

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="font-semibold text-card-foreground">Device Status Center</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-teal-600">
              <span className="h-2 w-2 rounded-full bg-teal-500" />
              {onlineCount} Online
            </span>
            <span className="flex items-center gap-1 text-destructive">
              <span className="h-2 w-2 rounded-full bg-destructive" />
              {offlineCount} Offline
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockDevices.map((device) => (
          <div
            key={device.id}
            className={cn(
              "rounded-lg border p-3 transition-colors",
              device.status === "online"
                ? "border-border bg-card hover:bg-muted/50"
                : "border-destructive/30 bg-destructive/5"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {device.status === "online" ? (
                  <Wifi className="h-4 w-4 text-teal-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-destructive" />
                )}
                <span className="font-medium text-sm text-card-foreground">{device.name}</span>
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  device.status === "online"
                    ? "bg-teal-500/10 text-teal-600"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {device.status.toUpperCase()}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground truncate">{device.location}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Last: {device.lastHeartbeat}</span>
              <span>{device.scansToday} scans</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
