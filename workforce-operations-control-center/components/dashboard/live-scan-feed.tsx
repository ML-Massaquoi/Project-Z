"use client"

import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Clock, User, DoorOpen } from "lucide-react"

interface ScanEvent {
  id: string
  employeeName: string
  employeeId: string
  device: string
  time: string
  type: "IN" | "OUT"
}

const mockScans: ScanEvent[] = [
  { id: "1", employeeName: "Ahmed Hassan", employeeId: "EMP001", device: "Terminal A Gate 1", time: "08:45:22", type: "IN" },
  { id: "2", employeeName: "Sarah Johnson", employeeId: "EMP045", device: "Terminal B Gate 3", time: "08:44:58", type: "IN" },
  { id: "3", employeeName: "Mohammed Ali", employeeId: "EMP023", device: "Security Office", time: "08:44:31", type: "IN" },
  { id: "4", employeeName: "Emily Chen", employeeId: "EMP067", device: "Terminal A Gate 2", time: "08:43:15", type: "IN" },
  { id: "5", employeeName: "David Miller", employeeId: "EMP012", device: "Cargo Area", time: "08:42:47", type: "OUT" },
  { id: "6", employeeName: "Fatima Al-Rashid", employeeId: "EMP089", device: "Terminal C Main", time: "08:41:33", type: "IN" },
  { id: "7", employeeName: "James Wilson", employeeId: "EMP034", device: "Admin Building", time: "08:40:19", type: "IN" },
  { id: "8", employeeName: "Lisa Wang", employeeId: "EMP056", device: "Terminal B Gate 1", time: "08:39:55", type: "IN" },
]

export function LiveScanFeed() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500"></span>
          </div>
          <h3 className="font-semibold text-card-foreground">Live Scan Feed</h3>
        </div>
        <span className="text-xs text-muted-foreground">Real-time</span>
      </div>
      <ScrollArea className="h-[340px]">
        <div className="divide-y divide-border">
          {mockScans.map((scan) => (
            <div
              key={scan.id}
              className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm text-card-foreground truncate">
                    {scan.employeeName}
                  </p>
                  <Badge
                    variant={scan.type === "IN" ? "default" : "secondary"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {scan.type}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{scan.employeeId}</span>
                  <span className="flex items-center gap-1">
                    <DoorOpen className="h-3 w-3" />
                    {scan.device}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {scan.time}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
