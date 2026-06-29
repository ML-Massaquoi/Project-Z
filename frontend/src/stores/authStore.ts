import { create } from 'zustand'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (user: User, accessToken: string, refreshToken: string) => void
  logout: () => void
  loadFromStorage: () => void
  hasPermission: (permission: string) => boolean
  hasAnyPermission: (...permissions: string[]) => boolean
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (!payload.exp) return false
    // exp is in seconds, Date.now() is in ms
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,

  login: (user, accessToken, refreshToken) => {
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('refresh_token', refreshToken)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    set({ user: null, isAuthenticated: false })
  },

  loadFromStorage: () => {
    const token = localStorage.getItem('access_token')
    const userStr = localStorage.getItem('user')
    if (token && userStr) {
      // Check if token is expired before restoring session
      if (isTokenExpired(token)) {
        // Try refresh before giving up
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken && !isTokenExpired(refreshToken)) {
          // Token refresh will be handled by the API interceptor on first 401
          // Just load the user so the app can attempt the refresh
          try {
            const user = JSON.parse(userStr)
            set({ user, isAuthenticated: true })
          } catch {
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
            localStorage.removeItem('user')
            set({ user: null, isAuthenticated: false })
          }
          return
        }
        // Both tokens expired — force logout
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        set({ user: null, isAuthenticated: false })
        return
      }
      try {
        const user = JSON.parse(userStr)
        set({ user, isAuthenticated: true })
      } catch {
        set({ user: null, isAuthenticated: false })
      }
    }
  },

  hasPermission: (permission: string) => {
    const { user } = get()
    if (!user) return false
    if (user.role_type === 'super_admin') return true
    return user.permissions?.includes(permission) ?? false
  },

  hasAnyPermission: (...permissions: string[]) => {
    const { user } = get()
    if (!user) return false
    if (user.role_type === 'super_admin') return true
    return permissions.some(p => user.permissions?.includes(p) ?? false)
  },
}))
