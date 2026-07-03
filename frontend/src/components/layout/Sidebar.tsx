import { useState, useMemo } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Users, Fingerprint, Monitor, Building2,
  Clock, FileBarChart, UserCog, Settings, ScrollText,
  ChevronLeft, ChevronRight, LogOut, AlertCircle,
  Activity, Calendar, Shield, Database, Moon, Sun, RefreshCw,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { usePermission } from '@/hooks/usePermission'
import { devicesAPI } from '@/api/client'
import { useThemeStore } from '@/stores/themeStore'

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  badge?: boolean
  permission?: string
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { to: '/',            icon: LayoutDashboard, label: 'Dashboard',    permission: 'employee:view'   },
      { to: '/live-monitor',icon: Activity,         label: 'Live Monitor', permission: 'attendance:view' },
      { to: '/attendance',  icon: Fingerprint,      label: 'Attendance',   permission: 'attendance:view' },
    ],
  },
  {
    id: 'workforce',
    label: 'Workforce',
    items: [
      { to: '/employees',   icon: Users,      label: 'Employees',         permission: 'employee:view'   },
      { to: '/departments', icon: Building2,  label: 'Departments',        permission: 'department:view' },
      { to: '/shifts',      icon: Clock,      label: 'Shifts & Schedules', permission: 'shift:view'      },
      { to: '/roster',      icon: Calendar,   label: 'Roster Management',  permission: 'shift:view'      },
      { to: '/scheduling-analytics', icon: FileBarChart, label: 'Scheduling Analytics', permission: 'shift:view' },
      { to: '/holidays',    icon: Calendar,   label: 'Holiday Calendar',   permission: 'shift:view'      },
      { to: '/leave',       icon: Calendar,   label: 'Leave Management',   permission: 'attendance:view' },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    items: [
      { to: '/devices',      icon: Monitor,      label: 'Devices',            permission: 'device:view'   },
      { to: '/sync-center',  icon: RefreshCw,    label: 'Sync Center',        permission: 'device:view'   },
      { to: '/device-users', icon: Fingerprint,  label: 'Device Users',       permission: 'device:view'   },
      { to: '/enrollment',   icon: Fingerprint,  label: 'Enrollment Monitor', permission: 'device:view'   },
      { to: '/unrecognized', icon: AlertCircle,  label: 'Unrecognized Users', badge: true, permission: 'device:update' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    items: [
      { to: '/daily-report',icon: FileBarChart, label: 'Daily Report', permission: 'report:view' },
      { to: '/reports',     icon: FileBarChart, label: 'Reports',      permission: 'report:view' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      { to: '/users',        icon: UserCog,   label: 'Users & Roles',  permission: 'user:view'     },
      { to: '/settings',     icon: Settings,  label: 'Settings',        permission: 'settings:view' },
      { to: '/audit',        icon: ScrollText,label: 'Audit Logs',      permission: 'audit:view'    },
      { to: '/integrity',    icon: Shield,    label: 'Data Integrity',  permission: 'audit:view'    },
      { to: '/system-health',icon: Activity,  label: 'System Health',   permission: 'settings:view' },
      { to: '/backups',      icon: Database,  label: 'Backups',         permission: 'settings:view' },
    ],
  },
]

export default function Sidebar({
  mobileOpen,
  setMobileOpen,
}: {
  mobileOpen?: boolean
  setMobileOpen?: (v: boolean) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout } = useAuthStore()
  const { can } = usePermission()
  const navigate = useNavigate()
  const location = useLocation()
  const { isDark, toggle } = useThemeStore()

  const activeItem = useMemo(() => {
    for (const group of navGroups) {
      for (const item of group.items.filter(i => !i.permission || can(i.permission))) {
        const match = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
        if (match) return { groupId: group.id, to: item.to }
      }
    }
    return null
  }, [location.pathname, can])

  const visibleGroups = useMemo(() =>
    navGroups
      .map(g => ({ ...g, items: g.items.filter(i => !i.permission || can(i.permission)) }))
      .filter(g => g.items.length > 0),
    [can]
  )

  const { data: unrecognizedData } = useQuery({
    queryKey: ['unrecognized-users'],
    queryFn: async () => (await devicesAPI.getUnrecognizedUsers()).data,
    refetchInterval: 60000,
    retry: false,
  })
  const unrecognizedCount: number = unrecognizedData?.total ?? 0

  const initials = (user?.full_name || user?.username || 'A')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const navContent = (isCollapsed: boolean) => (
    <>
      <div
        className="flex items-center gap-3 px-5 flex-shrink-0 border-b"
        style={{
          height: 60,
          borderColor: 'var(--pz-sidebar-border)',
          backgroundColor: 'var(--pz-sidebar-bg)',
        }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, var(--pz-brand), var(--pz-brand-hover))',
            boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
          }}
        >
          <span className="text-white font-bold text-base leading-none">Z</span>
        </div>

        {!isCollapsed && (
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="font-semibold text-sm leading-tight truncate" style={{ color: '#F8FAFC' }}>
              Project Z
            </p>
            <p className="text-[11px] leading-tight" style={{ color: 'var(--pz-sidebar-text)' }}>
              Workforce Operations
            </p>
          </div>
        )}

        {!isCollapsed ? (
          <button
            onClick={() => setCollapsed(true)}
            className="ml-auto p-1.5 rounded-lg transition-colors hover:bg-[var(--pz-sidebar-hover-bg)]"
            style={{ color: 'var(--pz-text-muted)' }}
          >
            <ChevronLeft size={15} />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute -right-3 top-5 w-6 h-6 rounded-full flex items-center justify-center shadow-sm border z-10"
            style={{
              background: '#1F2937',
              borderColor: '#374151',
              color: '#9CA3AF',
            }}
          >
            <ChevronRight size={12} />
          </button>
        )}
      </div>

      <nav
        className="flex-1 overflow-y-auto py-3"
        style={{ paddingInline: isCollapsed ? '10px' : '12px' }}
      >
        {visibleGroups.map((group) => (
          <div key={group.id} className="mb-6">
            {!isCollapsed && (
              <div className="px-3.5 mb-2">
                <span
                  className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: 'var(--pz-sidebar-text-muted)' }}
                >
                  {group.label}
                </span>
              </div>
            )}

            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = activeItem?.to === item.to
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMobileOpen?.(false)}
                    title={isCollapsed ? item.label : undefined}
                    className="relative flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150"
                    style={({ isActive: routerActive }) => {
                      const active = isActive || routerActive
                      return {
                        padding: isCollapsed ? '10px' : '10px 12px',
                        justifyContent: isCollapsed ? 'center' : undefined,
                        background: active ? 'var(--pz-sidebar-active-bg)' : 'transparent',
                        color: active ? 'var(--pz-sidebar-active-text)' : 'var(--pz-sidebar-text)',
                      }
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement
                      if (!isActive) el.style.background = 'var(--pz-sidebar-hover-bg)'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement
                      if (!isActive) el.style.background = 'transparent'
                    }}
                  >
                    {isActive && !isCollapsed && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                        style={{ background: 'var(--pz-sidebar-active-bar)' }}
                      />
                    )}

                    <item.icon
                      size={17}
                      className="flex-shrink-0"
                      strokeWidth={isActive ? 2.5 : 1.75}
                      style={{ color: isActive ? 'var(--pz-sidebar-active-icon)' : 'var(--pz-sidebar-icon)' }}
                    />

                    {!isCollapsed && (
                      <span className="flex-1 whitespace-nowrap">{item.label}</span>
                    )}

                    {!isCollapsed && item.badge && unrecognizedCount > 0 && (
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[20px] text-center"
                        style={{
                          background: 'var(--pz-warning-50)',
                          color: 'var(--pz-warning-600)',
                          border: '1px solid var(--pz-warning-border)',
                        }}
                      >
                        {unrecognizedCount}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div
        className="flex-shrink-0 border-t"
        style={{ borderColor: 'var(--pz-sidebar-border)' }}
      >
        {/* Theme toggle */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={isCollapsed ? { justifyContent: 'center', padding: '12px 0' } : {}}
        >
          {!isCollapsed && (
            <span className="text-[11px] font-medium" style={{ color: 'var(--pz-sidebar-text-muted)' }}>
              Appearance
            </span>
          )}
          <button
            onClick={toggle}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--pz-sidebar-hover-bg)]"
            style={{ color: 'var(--pz-text-muted)' }}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        {/* User */}
        <div className="p-3 pt-1">
          <div
            className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors cursor-pointer ${isCollapsed ? 'justify-center' : ''}`}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--pz-sidebar-hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
              style={{
                background: 'linear-gradient(135deg, var(--pz-brand), var(--pz-brand-hover))',
              }}
            >
              {initials}
            </div>

          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#F8FAFC' }}>
                  {user?.full_name || user?.username || 'Admin'}
                </p>
                <p className="text-[11px] truncate" style={{ color: 'var(--pz-sidebar-text)' }}>
                  {user?.role_type === 'super_admin' ? 'Super Admin' : user?.role || 'Operator'}
                </p>
              </div>
                <button
                  onClick={() => { logout(); navigate('/login') }}
                  className="p-1.5 rounded-lg transition-colors"
                  title="Logout"
                  style={{ color: 'var(--pz-sidebar-text)' }}
                  onMouseEnter={e => {
                    (e.currentTarget.style.background = 'var(--pz-danger-50)')
                    ;(e.currentTarget.style.color = 'var(--pz-danger-500)')
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget.style.background = 'transparent')
                    ;(e.currentTarget.style.color = 'var(--pz-text-muted)')
                  }}
                >
                  <LogOut size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )

  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 md:hidden"
            style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', zIndex: 50 }}
            onClick={() => setMobileOpen?.(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-0 top-0 h-screen w-[260px] flex flex-col border-r md:hidden"
            style={{
              background: 'var(--pz-sidebar-bg)',
              borderColor: 'var(--pz-sidebar-border)',
              boxShadow: '4px 0 24px rgba(0,0,0,0.08)',
              zIndex: 51,
            }}
          >
            {navContent(false)}
          </motion.aside>
        )}
      </AnimatePresence>

      <motion.aside
        animate={{ width: collapsed ? 64 : 260 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="hidden md:flex h-screen sticky top-0 flex-col border-r relative"
        style={{
          minWidth: collapsed ? 64 : 260,
          background: 'var(--pz-sidebar-bg)',
          borderColor: 'var(--pz-sidebar-border)',
          boxShadow: 'var(--pz-shadow-sidebar)',
          zIndex: 50,
        }}
      >
        {navContent(collapsed)}
      </motion.aside>
    </>
  )
}
