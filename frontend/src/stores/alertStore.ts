import { create } from 'zustand'
import type { OperationalAlert } from '@/types'
import { alertsAPI } from '@/api/client'

interface AlertState {
  alerts: OperationalAlert[]
  addAlert: (alert: Omit<OperationalAlert, 'id' | 'timestamp' | 'acknowledged'>) => void
  acknowledgeAlert: (id: string, user?: string) => void
  acknowledgeAlertServer: (id: string, resolutionNote?: string) => Promise<void>
  acknowledgeAllServer: () => Promise<void>
  loadFromAPI: () => Promise<void>
  clearAll: () => void
}

const MAX_ALERTS = 500

export const useAlertStore = create<AlertState>((set, get) => {
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

    acknowledgeAlertServer: async (id, resolutionNote) => {
      try {
        await alertsAPI.acknowledge(id, resolutionNote)
        set((state) => {
          const updated = state.alerts.map((a) =>
            a.id === id
              ? { ...a, acknowledged: true, acknowledged_at: new Date().toISOString() }
              : a
          )
          saveToStorage(updated)
          return { alerts: updated }
        })
      } catch (e) {
        console.warn('[AlertStore] Failed to acknowledge on server:', e)
      }
    },

    acknowledgeAllServer: async () => {
      try {
        await alertsAPI.acknowledgeAll()
        const now = new Date().toISOString()
        set((state) => {
          const updated = state.alerts.map((a) =>
            a.acknowledged ? a : { ...a, acknowledged: true, acknowledged_at: now }
          )
          saveToStorage(updated)
          return { alerts: updated }
        })
      } catch (e) {
        console.warn('[AlertStore] Failed to acknowledge all on server:', e)
      }
    },

    loadFromAPI: async () => {
      try {
        const { data } = await alertsAPI.list({ limit: MAX_ALERTS, acknowledged: false })
        if (data?.items) {
          const apiAlerts: OperationalAlert[] = data.items.map((item: Record<string, unknown>) => ({
            id: item.id as string,
            event_id: item.event_type as string | undefined,
            severity: item.severity as OperationalAlert['severity'],
            title: item.title as string,
            message: item.message as string,
            timestamp: item.created_at as string,
            acknowledged: item.acknowledged as boolean,
            acknowledged_by: item.acknowledged_by as string | undefined,
            acknowledged_at: item.acknowledged_at as string | undefined,
            metadata: (item.metadata as Record<string, unknown>) || {},
          }))

          set((state) => {
            const existingIds = new Set(state.alerts.map((a) => a.id))
            const newAlerts = apiAlerts.filter((a) => !existingIds.has(a.id))
            const updated = [...newAlerts, ...state.alerts].slice(0, MAX_ALERTS)
            saveToStorage(updated)
            return { alerts: updated }
          })
        }
      } catch (e) {
        console.warn('[AlertStore] Failed to load from API:', e)
      }
    },

    clearAll: () =>
      set(() => {
        saveToStorage([])
        return { alerts: [] }
      }),
  }
})
