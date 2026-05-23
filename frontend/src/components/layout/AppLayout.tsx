import { useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useAuthStore } from '@/stores/authStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { Toaster } from 'sonner'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: "Welcome back! Here's what's happening today." },
  '/employees': { title: 'Employees', subtitle: 'Manage your workforce.' },
  '/attendance': { title: 'Attendance', subtitle: 'Real-time attendance tracking.' },
  '/devices': { title: 'Devices', subtitle: 'Biometric terminal management.' },
  '/departments': { title: 'Departments', subtitle: 'Organizational structure.' },
  '/shifts': { title: 'Shifts', subtitle: 'Work schedule management.' },
  '/reports': { title: 'Reports', subtitle: 'Generate and export reports.' },
  '/settings': { title: 'Settings', subtitle: 'System configuration.' },
  '/calendar': { title: 'Calendar', subtitle: 'View attendance calendar.' },
  '/leave': { title: 'Leave Management', subtitle: 'Manage employee leave requests.' },
  '/users': { title: 'Users & Roles', subtitle: 'Manage system users and permissions.' },
  '/audit': { title: 'Audit Logs', subtitle: 'System activity and audit trail.' },
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
    <div className="flex min-h-screen bg-[var(--color-slate-50)]">
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
            background: 'white',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-lg)',
          },
        }}
        richColors
        closeButton
      />
    </div>
  )
}
