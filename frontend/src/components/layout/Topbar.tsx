import { useState, useEffect } from 'react'
import { Bell, Search, Maximize2, Minimize2, Menu, User, Settings as SettingsIcon, LogOut } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

interface TopbarProps {
  title: string
  subtitle?: string
  onMenuToggle: () => void
}

const badgeDisplay = (count: number): string =>
  count > 99 ? '99+' : count > 0 ? String(count) : ''

export default function Topbar({ title, subtitle, onMenuToggle }: TopbarProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [time, setTime] = useState(new Date())

  const handleLogout = () => {
    logout()
    navigate('/login')
  }
  const [searchValue, setSearchValue] = useState('')
  const [notifCount] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  return (
    <header className="h-16 border-b border-[var(--color-border)] bg-white flex items-center justify-between px-6 sticky top-0 z-40">
      {/* Left - Hamburger (mobile) + Title */}
      <div className="flex items-center">
        <button
          onClick={onMenuToggle}
          className="flex md:hidden p-2 rounded-lg hover:bg-[var(--color-slate-100)] text-[var(--color-slate-500)] mr-2"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-slate-800)]">{title}</h1>
          {subtitle && (
            <p className="text-sm text-[var(--color-slate-400)] -mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-slate-50)] border border-[var(--color-border)] focus-within:border-[var(--color-primary)] transition-colors">
          <Search size={15} className="text-[var(--color-slate-400)] flex-shrink-0" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value.slice(0, 200))}
            placeholder="Search anything..."
            className="bg-transparent text-sm text-[var(--color-slate-700)] placeholder:text-[var(--color-slate-400)] outline-none w-40 md:w-56"
            maxLength={200}
          />
        </div>

        {/* Clock */}
        <div className="hidden lg:flex items-center gap-1.5 text-sm text-[var(--color-slate-500)] font-medium tabular-nums">
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>

        {/* Notifications */}
        <button
          className="relative p-2 rounded-lg hover:bg-[var(--color-slate-50)] text-[var(--color-slate-500)] transition-colors"
          id="notifications-btn"
        >
          <Bell size={20} />
          {badgeDisplay(notifCount) && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-[var(--color-danger)] text-white text-[10px] font-bold flex items-center justify-center px-1">
              {badgeDisplay(notifCount)}
            </span>
          )}
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-lg hover:bg-[var(--color-slate-50)] text-[var(--color-slate-500)] transition-colors hidden md:flex"
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>

        {/* User */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <div className="flex items-center gap-3 pl-3 border-l border-[var(--color-border)] cursor-pointer select-none">
              <div className="text-right hidden md:block">
                <p className="text-sm font-medium text-[var(--color-slate-800)]">
                  {user?.full_name || user?.username}
                </p>
                <p className="text-xs text-[var(--color-slate-400)]">
                  {user?.role_type === 'super_admin' ? 'Super Admin' : user?.role}
                </p>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] flex items-center justify-center">
                <span className="text-white text-sm font-semibold">
                  {user?.full_name?.[0] || user?.username?.[0] || 'A'}
                </span>
              </div>
            </div>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 min-w-[180px] rounded-lg border border-[var(--color-border)] bg-white p-1 shadow-lg"
            >
              <DropdownMenu.Item
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--color-slate-700)] hover:bg-[var(--color-slate-50)] cursor-pointer outline-none"
                onSelect={() => navigate('/profile')}
              >
                <User size={15} />
                Profile
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--color-slate-700)] hover:bg-[var(--color-slate-50)] cursor-pointer outline-none"
                onSelect={() => navigate('/settings')}
              >
                <SettingsIcon size={15} />
                Settings
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--color-border)]" />
              <DropdownMenu.Item
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer outline-none"
                onSelect={handleLogout}
              >
                <LogOut size={15} />
                Logout
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
