import { useState, useEffect, useCallback } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useAuthStore } from '@/stores/authStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { Toaster } from 'sonner'
import { CommandPalette } from '@/components/ui/command-palette/CommandPalette'

export default function AppLayout() {
  const { isAuthenticated } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // Connect WebSocket for real-time updates
  useWebSocket()

  // Global Ctrl+K shortcut for Command Palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--pz-bg)' }}>
      <Sidebar
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          onMenuToggle={() => setMobileOpen(true)}
          onCommandPalette={openCommandPalette}
        />
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-[var(--pz-content-max-width)] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {/* Toast Notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--pz-surface-1)',
            border: '1px solid var(--pz-border)',
            color: 'var(--pz-text)',
            boxShadow: 'var(--pz-shadow-dropdown)',
            borderRadius: 'var(--pz-radius-lg)',
            fontSize: '13px',
          },
        }}
        richColors
        closeButton
      />
    </div>
  )
}
