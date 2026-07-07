import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'
import AppLayout from '@/components/layout/AppLayout'
import { PageErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PageTransition } from '@/components/ui/page-transition'

// ── Lazy-loaded pages ─────────────────────────────────────
const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Employees = lazy(() => import('@/pages/Employees'))
const Attendance = lazy(() => import('@/pages/Attendance'))
const Devices = lazy(() => import('@/pages/Devices'))
const Departments = lazy(() => import('@/pages/Departments'))
const Shifts = lazy(() => import('@/pages/Shifts'))
const Reports = lazy(() => import('@/pages/Reports'))
const Settings = lazy(() => import('@/pages/Settings'))
const UsersRoles = lazy(() => import('@/pages/UsersRoles'))
const UnrecognizedUsers = lazy(() => import('@/pages/UnrecognizedUsers'))
const LiveMonitor = lazy(() => import('@/pages/LiveMonitor'))
const DeviceUsers = lazy(() => import('@/pages/DeviceUsers'))
const AuditLogs = lazy(() => import('@/pages/AuditLogs'))
const DataIntegrity = lazy(() => import('@/pages/DataIntegrity'))
const DepartmentWorkforceView = lazy(() => import('@/pages/DepartmentWorkforceView'))
const EmployeeWorkforceProfile = lazy(() => import('@/pages/EmployeeWorkforceProfile'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const LeaveManagement = lazy(() => import('@/pages/LeaveManagement'))
const Schedules = lazy(() => import('@/pages/Schedules'))
const RosterManagement = lazy(() => import('@/pages/RosterManagement'))
const HolidayCalendar = lazy(() => import('@/pages/HolidayCalendar'))
const SchedulingAnalytics = lazy(() => import('@/pages/SchedulingAnalytics'))
const DailyReport = lazy(() => import('@/pages/DailyReport'))
const SystemHealth = lazy(() => import('@/pages/SystemHealth'))
const Backups = lazy(() => import('@/pages/Backups'))
const SyncCenter = lazy(() => import('@/pages/SyncCenter'))
const EnrollmentMonitor = lazy(() => import('@/pages/EnrollmentMonitor'))

function PageLoader() {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-xs text-[var(--pz-text-muted)]">Loading...</p>
      </div>
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

const withPageBoundary = (Page: React.LazyExoticComponent<React.ComponentType>) => (
  <PageErrorBoundary>
    <Suspense fallback={<PageLoader />}>
      <PageTransition>
        <Page />
      </PageTransition>
    </Suspense>
  </PageErrorBoundary>
)

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary
        onReset={() => { queryClient.resetQueries() }}
        fallbackRender={({ error, resetErrorBoundary }) => (
          <div className="min-h-screen bg-[var(--pz-bg)] flex items-center justify-center p-4">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">!</span>
              </div>
              <h2 className="text-xl font-bold text-[var(--pz-text)] mb-2">Application Error</h2>
              <p className="text-sm text-[var(--pz-text-muted)] mb-4">{error instanceof Error ? error.message : 'An unexpected error occurred'}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => window.location.href = '/'}
                  className="px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm font-semibold text-[var(--pz-text-secondary)] hover:bg-[var(--pz-surface-3)] transition-all"
                >
                  Go to Dashboard
                </button>
                <button
                  onClick={resetErrorBoundary}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}
      >
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            <Route path="/login" element={withPageBoundary(Login)} />

            <Route element={<AppLayout />}>
              <Route path="/" element={withPageBoundary(Dashboard)} />
              <Route path="/live-monitor" element={withPageBoundary(LiveMonitor)} />
              <Route path="/employees" element={withPageBoundary(Employees)} />
              <Route path="/attendance" element={withPageBoundary(Attendance)} />
              <Route path="/devices" element={withPageBoundary(Devices)} />
              <Route path="/sync-center" element={withPageBoundary(SyncCenter)} />
              <Route path="/device-users" element={withPageBoundary(DeviceUsers)} />
              <Route path="/enrollment" element={withPageBoundary(EnrollmentMonitor)} />
              <Route path="/departments" element={withPageBoundary(Departments)} />
              <Route path="/shifts" element={withPageBoundary(Shifts)} />
              <Route path="/schedules" element={withPageBoundary(Schedules)} />
              <Route path="/roster" element={withPageBoundary(RosterManagement)} />
              <Route path="/holidays" element={withPageBoundary(HolidayCalendar)} />
              <Route path="/scheduling-analytics" element={withPageBoundary(SchedulingAnalytics)} />
              <Route path="/reports" element={withPageBoundary(Reports)} />
              <Route path="/daily-report" element={withPageBoundary(DailyReport)} />
              <Route path="/settings" element={withPageBoundary(Settings)} />
              <Route path="/users" element={withPageBoundary(UsersRoles)} />
              <Route path="/unrecognized" element={withPageBoundary(UnrecognizedUsers)} />
              <Route path="/audit" element={withPageBoundary(AuditLogs)} />
              <Route path="/integrity" element={withPageBoundary(DataIntegrity)} />
              <Route path="/system-health" element={withPageBoundary(SystemHealth)} />
              <Route path="/backups" element={withPageBoundary(Backups)} />
              <Route path="/departments/:deptId" element={withPageBoundary(DepartmentWorkforceView)} />
              <Route path="/workforce/employee/:empId" element={withPageBoundary(EmployeeWorkforceProfile)} />
              <Route path="/calendar" element={<Navigate to="/attendance" replace />} />
              <Route path="/leave" element={withPageBoundary(LeaveManagement)} />
            </Route>

            <Route path="*" element={withPageBoundary(NotFound)} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  )
}
