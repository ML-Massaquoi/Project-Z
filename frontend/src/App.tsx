import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Employees from '@/pages/Employees'
import Attendance from '@/pages/Attendance'
import Devices from '@/pages/Devices'
import Departments from '@/pages/Departments'
import Shifts from '@/pages/Shifts'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import UsersRoles from '@/pages/UsersRoles'
import UnrecognizedUsers from '@/pages/UnrecognizedUsers'
import LiveMonitor from '@/pages/LiveMonitor'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Protected — wrapped in AppLayout (handles auth redirect) */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/live-monitor" element={<LiveMonitor />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/departments" element={<Departments />} />
            <Route path="/shifts" element={<Shifts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<UsersRoles />} />
            <Route path="/unrecognized" element={<UnrecognizedUsers />} />
            <Route path="/audit" element={<Navigate to="/settings" replace />} />
            <Route path="/calendar" element={<Navigate to="/attendance" replace />} />
            <Route path="/leave" element={<Navigate to="/attendance" replace />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
