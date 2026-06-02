import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Users, Fingerprint, Monitor, Building2,
  Clock, FileBarChart, UserCog,
  Settings, ScrollText, ChevronLeft, ChevronRight, LogOut, AlertCircle,
  Activity,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { devicesAPI } from '@/api/client'

const mainNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/live-monitor', icon: Activity, label: 'Live Monitor' },
  { to: '/employees', icon: Users, label: 'Employees' },
  { to: '/attendance', icon: Fingerprint, label: 'Attendance' },
  { to: '/devices', icon: Monitor, label: 'Devices' },
  { to: '/unrecognized', icon: AlertCircle, label: 'Unrecognized Users', badge: true },
  { to: '/departments', icon: Building2, label: 'Departments' },
  { to: '/shifts', icon: Clock, label: 'Shifts' },
  { to: '/reports', icon: FileBarChart, label: 'Reports' },
]

const adminNav = [
  { to: '/users', icon: UserCog, label: 'Users & Roles' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/audit', icon: ScrollText, label: 'Audit Logs' },
]

export default function Sidebar({ mobileOpen, setMobileOpen }: {
  mobileOpen?: boolean
  setMobileOpen?: (v: boolean) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const { data: unrecognizedData } = useQuery({
    queryKey: ['unrecognized-users'],
    queryFn: async () => (await devicesAPI.getUnrecognizedUsers()).data,
    refetchInterval: 60000,
    retry: false,
  })
  const unrecognizedCount: number = unrecognizedData?.total ?? 0

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  /** Shared nav content used by both desktop and mobile drawers */
  const navContent = (isCollapsed: boolean) => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-[var(--color-sidebar-border)]">
        <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">Z</span>
        </div>
        <AnimatePresence>
          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="font-semibold text-[var(--color-sidebar-text)] text-base whitespace-nowrap"
            >
              Project Z
            </motion.span>
          )}
        </AnimatePresence>
        {/* Collapse toggle — only shown on desktop sidebar */}
        {isCollapsed !== undefined && (
          <button
            onClick={() => setCollapsed(!isCollapsed)}
            className="ml-auto p-1.5 rounded-md hover:bg-[var(--color-sidebar-hover-bg)] transition-colors text-[var(--color-sidebar-icon)]"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {!isCollapsed && (
          <p className="px-5 text-[10px] font-semibold text-[var(--color-sidebar-text-muted)] uppercase tracking-wider mb-2">
            Main
          </p>
        )}
        {mainNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => setMobileOpen?.(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
              ${isActive
                ? 'bg-[var(--color-sidebar-active-bg)] text-[var(--color-sidebar-active-text)]'
                : 'text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover-bg)]'
              }
              ${isCollapsed ? 'justify-center' : ''}`
            }
          >
            <item.icon size={20} className="flex-shrink-0" />
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="whitespace-nowrap flex-1"
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
            {!isCollapsed && item.badge && unrecognizedCount > 0 && (
              <span className="ml-auto px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold min-w-[18px] text-center">
                {unrecognizedCount}
              </span>
            )}
          </NavLink>
        ))}

        <div className="my-4 mx-5 border-t border-[var(--color-sidebar-border)]" />

        {!isCollapsed && (
          <p className="px-5 text-[10px] font-semibold text-[var(--color-sidebar-text-muted)] uppercase tracking-wider mb-2">
            ADMIN
          </p>
        )}
        {adminNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen?.(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
              ${isActive
                ? 'bg-[var(--color-sidebar-active-bg)] text-[var(--color-sidebar-active-text)]'
                : 'text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover-bg)]'
              }
              ${isCollapsed ? 'justify-center' : ''}`
            }
          >
            <item.icon size={20} className="flex-shrink-0" />
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="whitespace-nowrap"
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        ))}
      </nav>

      {/* User Profile */}
      <div className="border-t border-[var(--color-sidebar-border)] p-3">
        <div className={`flex items-center gap-3 p-2 rounded-lg bg-[var(--color-sidebar-user-bg)] cursor-pointer transition-colors ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-semibold">
              {user?.full_name?.[0] || user?.username?.[0] || 'A'}
            </span>
          </div>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-sidebar-text)] truncate">
                  {user?.full_name || user?.username || 'Admin'}
                </p>
                <p className="text-xs text-[var(--color-sidebar-text-muted)] truncate">
                  {user?.role_type === 'super_admin' ? 'Super Admin' : user?.role || 'User'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          {!isCollapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md hover:bg-red-900/30 text-[var(--color-sidebar-icon)] hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileOpen?.(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -260 }}
            animate={{ x: 0 }}
            exit={{ x: -260 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="fixed left-0 top-0 h-screen w-[260px] z-50 flex flex-col border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] md:hidden"
          >
            {/* Logo */}
            <div className="flex items-center gap-3 px-5 h-16 border-b border-[var(--color-sidebar-border)]">
              <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">Z</span>
              </div>
              <span className="font-semibold text-[var(--color-sidebar-text)] text-base whitespace-nowrap">
                Project Z
              </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 overflow-y-auto">
              <p className="px-5 text-[10px] font-semibold text-[var(--color-sidebar-text-muted)] uppercase tracking-wider mb-2">
                Main
              </p>
              {mainNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMobileOpen?.(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                    ${isActive
                      ? 'bg-[var(--color-sidebar-active-bg)] text-[var(--color-sidebar-active-text)]'
                      : 'text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover-bg)]'
                    }`
                  }
                >
                  <item.icon size={20} className="flex-shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </NavLink>
              ))}

              <div className="my-4 mx-5 border-t border-[var(--color-sidebar-border)]" />

              <p className="px-5 text-[10px] font-semibold text-[var(--color-sidebar-text-muted)] uppercase tracking-wider mb-2">
                ADMIN
              </p>
              {adminNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen?.(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                    ${isActive
                      ? 'bg-[var(--color-sidebar-active-bg)] text-[var(--color-sidebar-active-text)]'
                      : 'text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover-bg)]'
                    }`
                  }
                >
                  <item.icon size={20} className="flex-shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* User Profile */}
            <div className="border-t border-[var(--color-sidebar-border)] p-3">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--color-sidebar-user-bg)] cursor-pointer transition-colors">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-semibold">
                    {user?.full_name?.[0] || user?.username?.[0] || 'A'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-sidebar-text)] truncate">
                    {user?.full_name || user?.username || 'Admin'}
                  </p>
                  <p className="text-xs text-[var(--color-sidebar-text-muted)] truncate">
                    {user?.role_type === 'super_admin' ? 'Super Admin' : user?.role || 'User'}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-md hover:bg-red-900/30 text-[var(--color-sidebar-icon)] hover:text-red-400 transition-colors"
                  title="Logout"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="hidden md:flex h-screen sticky top-0 flex-col border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] z-50"
        style={{ minWidth: collapsed ? 72 : 260 }}
      >
        {navContent(collapsed)}
      </motion.aside>
    </>
  )
}
