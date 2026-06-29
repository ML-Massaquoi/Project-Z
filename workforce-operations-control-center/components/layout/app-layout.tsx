"use client"

import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"
import { useState, useEffect } from "react"

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true)
      }
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Topbar sidebarCollapsed={sidebarCollapsed} />
      <main
        className={`pt-16 transition-all duration-300 ${
          sidebarCollapsed ? "pl-16" : "pl-64"
        }`}
      >
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
