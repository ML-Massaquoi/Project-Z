import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  isDark: boolean
  toggle: () => void
  setDark: (dark: boolean) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: true,
      toggle: () =>
        set((state) => {
          const next = !state.isDark
          document.documentElement.classList.toggle('pz-light', !next)
          document.documentElement.classList.toggle('pz-dark', next)
          return { isDark: next }
        }),
      setDark: (dark: boolean) => {
        document.documentElement.classList.toggle('pz-light', !dark)
        document.documentElement.classList.toggle('pz-dark', dark)
        set({ isDark: dark })
      },
    }),
    {
      name: 'pz-theme',
      onRehydrateStorage: () => (state) => {
        const isDark = state?.isDark ?? true
        document.documentElement.classList.toggle('pz-light', !isDark)
        document.documentElement.classList.toggle('pz-dark', isDark)
      },
    }
  )
)
