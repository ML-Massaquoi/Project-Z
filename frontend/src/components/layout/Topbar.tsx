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
    <header className="h-16 border-b border-[var(--color-border)] bg-[#111827] flex items-center justify-between px-6 sticky top-0 z-40">
      {/* Left - Hamburger (mobile) + Title */}
      <div className="flex items-center">
        <button
          onClick={onMenuToggle}
          className="flex md:hidden p-2 rounded-lg hover:bg-[#1F2937] text-gray-400 mr-2 animate-pulse"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-100 tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-gray-400 -mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1F2937]/50 border border-[var(--color-border)] focus-within:border-[var(--color-primary)] transition-all">
          <Search size={14} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value.slice(0, 200))}
            placeholder="Search anything..."
            className="bg-transparent text-xs text-gray-200 placeholder:text-gray-500 outline-none w-32 md:w-48"
            maxLength={200}
          />
        </div>

        {/* Clock */}
        <div className="hidden lg:flex items-center gap-1 text-xs text-gray-300 font-semibold font-mono bg-[#1F2937] px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] tabular-nums">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>

        {/* Notifications */}
        <button
          className="relative p-2 rounded-lg hover:bg-[#1F2937] text-gray-400 transition-all"
          id="notifications-btn"
        >
          <Bell size={18} />
          {badgeDisplay(notifCount) && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-[var(--color-danger)] text-white text-[9px] font-bold flex items-center justify-center px-1">
              {badgeDisplay(notifCount)}
            </span>
          )}
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-lg hover:bg-[#1F2937] text-gray-400 transition-all hidden md:flex"
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        {/* User */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <div className="flex items-center gap-3 pl-3 border-l border-[var(--color-border)] cursor-pointer select-none">
              <div className="text-right hidden md:block">
                <p className="text-xs font-semibold text-gray-200">
                  {user?.full_name || user?.username}
                </p>
                <p className="text-[10px] text-gray-400">
                  {user?.role_type === 'super_admin' ? 'Super Admin' : user?.role || 'Operator'}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">
                  {user?.full_name?.[0] || user?.username?.[0] || 'A'}
                </span>
              </div>
            </div>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 min-w-[160px] rounded-lg border border-[var(--color-border)] bg-[#111827] p-1 shadow-xl animate-fade-in"
            >
              <DropdownMenu.Item
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-gray-300 hover:bg-[#1F2937] cursor-pointer outline-none transition-colors"
                onSelect={() => navigate('/profile')}
              >
                <User size={14} />
                Profile
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-gray-300 hover:bg-[#1F2937] cursor-pointer outline-none transition-colors"
                onSelect={() => navigate('/settings')}
              >
                <SettingsIcon size={14} />
                Settings
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--color-border)]" />
              <DropdownMenu.Item
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/20 cursor-pointer outline-none transition-colors"
                onSelect={handleLogout}
              >
                <LogOut size={14} />
                Logout
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
