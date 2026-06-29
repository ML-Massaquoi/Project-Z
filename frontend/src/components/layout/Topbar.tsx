import { useState, useEffect } from 'react'
import { Search, Maximize2, Minimize2, Menu, User, Settings as SettingsIcon, LogOut, WifiOff, Moon, Sun } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useThemeStore } from '@/stores/themeStore'
import { NotificationPanel } from '@/components/ui/NotificationPanel'

interface TopbarProps {
  onMenuToggle: () => void
  onCommandPalette?: () => void
}

export default function Topbar({ onMenuToggle, onCommandPalette }: TopbarProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [time, setTime] = useState(new Date())
  const connectionStatus = useConnectionStore((s) => s.status)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const { isDark, toggle: toggleTheme } = useThemeStore()

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
    if (!document.fullscreenElement) document.documentElement.requestFullscreen()
    else document.exitFullscreen()
  }

  const handleLogout = () => { logout(); navigate('/login') }
  const isConnected = connectionStatus === 'connected'

  const initials = (user?.full_name || user?.username || 'A')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <header
      className="flex items-center justify-between px-4 lg:px-6 flex-shrink-0"
      style={{
        position: 'sticky',
        top: 0,
        height: 60,
        background: 'var(--pz-surface-1)',
        borderBottom: '1px solid var(--pz-border)',
        boxShadow: 'var(--pz-shadow-topbar)',
        zIndex: 100,
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="flex md:hidden p-2 rounded-lg transition-colors hover:bg-[var(--pz-surface-3)]"
          style={{ color: 'var(--pz-text-muted)' }}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <div
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            color: isConnected ? 'var(--pz-success-500)' : 'var(--pz-warning-600)',
            background: isConnected ? 'var(--pz-success-50)' : 'var(--pz-warning-50)',
            border: `1px solid ${isConnected ? 'var(--pz-success-border)' : 'var(--pz-warning-border)'}`,
          }}
        >
          {isConnected ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: 'var(--pz-success-500)', animation: 'pulse-glow 2s ease-in-out infinite' }} />
                <span className="relative inline-flex rounded-full h-2 w-2"
                  style={{ background: 'var(--pz-success-500)' }} />
              </span>
              System Online
            </>
          ) : (
            <>
              <WifiOff size={13} />
              {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Degraded'}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 lg:gap-2">
        <button
          onClick={onCommandPalette}
          className="flex items-center gap-2.5 rounded-lg text-sm transition-all"
          style={{
            padding: '7px 12px',
            background: 'var(--pz-surface-2)',
            border: '1px solid var(--pz-border)',
            color: 'var(--pz-text-muted)',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement
            el.style.borderColor = 'var(--pz-border-strong)'
            el.style.color = 'var(--pz-text-secondary)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement
            el.style.borderColor = 'var(--pz-border)'
            el.style.color = 'var(--pz-text-muted)'
          }}
        >
          <Search size={14} />
          <span className="hidden md:inline text-xs">Search...</span>
          <kbd
            className="hidden md:flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono"
            style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)' }}
          >
            Ctrl K
          </kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-lg transition-colors hidden md:flex"
          style={{ color: 'var(--pz-text-muted)' }}
          onMouseEnter={e => {
            (e.currentTarget.style.background = 'var(--pz-surface-3)')
            ;(e.currentTarget.style.color = 'var(--pz-text-secondary)')
          }}
          onMouseLeave={e => {
            (e.currentTarget.style.background = 'transparent')
            ;(e.currentTarget.style.color = 'var(--pz-text-muted)')
          }}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <div
          className="hidden lg:flex items-center gap-2 text-xs font-mono font-semibold rounded-lg px-3 py-2 tabular-nums"
          style={{
            background: 'var(--pz-surface-2)',
            border: '1px solid var(--pz-border)',
            color: 'var(--pz-text-secondary)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--pz-success-500)', animation: 'pulse-dot 2s ease-in-out infinite' }}
          />
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>

        <NotificationPanel />

        <button
          onClick={toggleFullscreen}
          className="p-2.5 rounded-lg transition-colors hidden md:flex"
          style={{ color: 'var(--pz-text-muted)' }}
          onMouseEnter={e => {
            (e.currentTarget.style.background = 'var(--pz-surface-3)')
            ;(e.currentTarget.style.color = 'var(--pz-text-secondary)')
          }}
          onMouseLeave={e => {
            (e.currentTarget.style.background = 'transparent')
            ;(e.currentTarget.style.color = 'var(--pz-text-muted)')
          }}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        <div className="h-6 w-px hidden md:block" style={{ background: 'var(--pz-border)' }} />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <div className="flex items-center gap-2.5 cursor-pointer select-none px-1 py-1 rounded-lg transition-colors"
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--pz-surface-3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div className="text-right hidden md:block">
                <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--pz-text)' }}>
                  {user?.full_name || user?.username}
                </p>
                <p className="text-[11px] leading-tight" style={{ color: 'var(--pz-text-muted)' }}>
                  {user?.role_type === 'super_admin' ? 'Super Admin' : user?.role || 'Operator'}
                </p>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                style={{
                  background: 'linear-gradient(135deg, var(--pz-brand), var(--pz-brand-hover))',
                  boxShadow: '0 0 0 2px var(--pz-border)',
                }}
              >
                {initials}
              </div>
            </div>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="min-w-[180px] rounded-xl p-1.5"
              style={{
                background: 'var(--pz-surface-1)',
                border: '1px solid var(--pz-border)',
                boxShadow: 'var(--pz-shadow-dropdown)',
                zIndex: 'var(--pz-z-popover, 80)' as never,
              }}
            >
              {[
                { icon: User, label: 'Profile', action: () => navigate('/settings') },
                { icon: SettingsIcon, label: 'Settings', action: () => navigate('/settings') },
              ].map(({ icon: Icon, label, action }) => (
                <DropdownMenu.Item
                  key={label}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm cursor-pointer outline-none transition-colors"
                  style={{ color: 'var(--pz-text-secondary)' }}
                  onSelect={action}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--pz-surface-3)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <Icon size={14} style={{ color: 'var(--pz-text-muted)' }} />
                  {label}
                </DropdownMenu.Item>
              ))}

              <DropdownMenu.Separator className="my-1 h-px" style={{ background: 'var(--pz-border)' }} />

              <DropdownMenu.Item
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm cursor-pointer outline-none transition-colors"
                style={{ color: 'var(--pz-danger-500)' }}
                onSelect={handleLogout}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--pz-danger-50)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
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
