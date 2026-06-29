"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  CalendarClock,
  Users,
  Building2,
  Clock,
  Cpu,
  UserCog,
  FileBarChart,
  ScrollText,
  Bell,
  Settings,
  Plane,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { useState } from "react"

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Attendance", href: "/attendance", icon: CalendarClock },
  { name: "Employees", href: "/employees", icon: Users },
  { name: "Departments", href: "/departments", icon: Building2 },
  { name: "Shifts", href: "/shifts", icon: Clock },
  { name: "Devices", href: "/devices", icon: Cpu },
  { name: "Device Users", href: "/device-users", icon: UserCog },
  { name: "Reports", href: "/reports", icon: FileBarChart },
  { name: "Audit Logs", href: "/audit-logs", icon: ScrollText },
  { name: "Notifications", href: "/notifications", icon: Bell },
  { name: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Plane className="h-5 w-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight">Project-Z</span>
                <span className="text-[10px] text-sidebar-foreground/60">Operations Control</span>
              </div>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
                title={collapsed ? item.name : undefined}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="border-t border-sidebar-border p-4">
            <div className="text-xs text-sidebar-foreground/50">
              <p>Airport Workforce</p>
              <p>Operations Control v1.0</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
