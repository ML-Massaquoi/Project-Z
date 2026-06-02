import { useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useAuthStore } from '@/stores/authStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { Toaster } from 'sonner'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: "Welcome back! Here's what's happening today." },
  '/live-monitor': { title: 'Live Operations Monitor', subtitle: 'Real-time biometric scan feed — every scan, instantly.' },
  '/employees': { title: 'Employees', subtitle: 'Manage your workforce.' },
  '/attendance': { title: 'Attendance', subtitle: 'Real-time attendance tracking.' },
  '/devices': { title: 'Devices', subtitle: 'Biometric terminal management.' },
  '/departments': { title: 'Departments', subtitle: 'Organizational structure.' },
  '/shifts': { title: 'Shifts', subtitle: 'Work schedule management.' },
  '/reports': { title: 'Reports', subtitle: 'Generate and export reports.' },
  '/settings': { title: 'Settings', subtitle: 'System configuration and offices.' },
  '/calendar': { title: 'Attendance', subtitle: 'Real-time attendance tracking.' },
  '/leave': { title: 'Attendance', subtitle: 'Real-time attendance tracking.' },
  '/unrecognized': { title: 'Unrecognized Users', subtitle: 'Map unknown device fingerprints to employees.' },
  '/users': { title: 'Users & Roles', subtitle: 'Manage system users and permissions.' },
  '/audit': { title: 'Settings', subtitle: 'System configuration and offices.' },
}

export default function AppLayout() {
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Connect WebSocket for real-time updates
  useWebSocket()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const pageInfo = pageTitles[location.pathname] || { title: 'Project Z', subtitle: '' }

  return (
    <div className="flex min-h-screen bg-[#090D16]">
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={pageInfo.title} subtitle={pageInfo.subtitle} onMenuToggle={() => setMobileOpen(true)} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#111827',
            border: '1px solid var(--color-border)',
            color: '#F9FAFB',
            boxShadow: 'var(--shadow-lg)',
          },
        }}
        richColors
        closeButton
      />
    </div>
  )
}

