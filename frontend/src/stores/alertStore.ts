import { create } from 'zustand'
import type { OperationalAlert } from '@/types'

interface AlertState {
  alerts: OperationalAlert[]
  addAlert: (alert: Omit<OperationalAlert, 'id' | 'timestamp' | 'acknowledged'>) => void
  acknowledgeAlert: (id: string, user?: string) => void
  clearAll: () => void
}

const MAX_ALERTS = 500

export const useAlertStore = create<AlertState>((set) => {
  let initialAlerts: OperationalAlert[] = []
  try {
    const data = localStorage.getItem('projectz_operational_alerts')
    if (data) initialAlerts = JSON.parse(data)
  } catch (e) {
    console.warn('[AlertStore] Failed to load alerts:', e)
  }

  const saveToStorage = (alerts: OperationalAlert[]) => {
    try {
      localStorage.setItem('projectz_operational_alerts', JSON.stringify(alerts))
    } catch (e) {
      // Safe fallback
    }
  }

  return {
    alerts: initialAlerts,
    addAlert: (newAlert) =>
      set((state) => {
        const alert: OperationalAlert = {
          ...newAlert,
          id: `alt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        }
        const updated = [alert, ...state.alerts].slice(0, MAX_ALERTS)
        saveToStorage(updated)
        return { alerts: updated }
      }),

    acknowledgeAlert: (id, user = 'Operator') =>
      set((state) => {
        const updated = state.alerts.map((a) =>
          a.id === id
            ? {
                ...a,
                acknowledged: true,
                acknowledged_by: user,
                acknowledged_at: new Date().toISOString(),
              }
            : a
        )
        saveToStorage(updated)
        return { alerts: updated }
      }),

    clearAll: () =>
      set(() => {
        saveToStorage([])
        return { alerts: [] }
      }),
  }
})
