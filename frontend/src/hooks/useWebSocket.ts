import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  WSEvent,
  ScanEventPayload,
  AttendanceUpdatePayload,
  DeptSummaryPayload,
  DeviceStatusPayload,
  LateAlertPayload,
  UnknownUserPayload,
} from '@/types'
import { useScanFeedStore } from '@/stores/scanFeedStore'
import { useDeptSummaryStore } from '@/stores/deptSummaryStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useAlertStore } from '@/stores/alertStore'
import { useAuthStore } from '@/stores/authStore'
import { eventBus } from '@/lib/eventBus'
import { eventsAPI } from '@/api/client'

export function useWebSocket() {
  const { isAuthenticated } = useAuthStore()
  const wsRef = useRef<WebSocket | null>(null)
  const queryClient = useQueryClient()
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>()
  const isFirstConnection = useRef(true)
  const isMounted = useRef(true)

  // ── Stable ref to connectFn ─────────────────────────────────────────────
  // Storing connect in a ref prevents it from participating in any useCallback
  // or useEffect dependency array. This ensures the WS lifecycle never causes
  // a React re-render loop.
  const connectRef = useRef<() => void>()

  // ── Event Bus subscriptions ─────────────────────────────────────────────
  useEffect(() => {
    const unsubScan = eventBus.subscribe('scan_event', (event) => {
      const scan = event.data as unknown as ScanEventPayload
      useScanFeedStore.getState().prependScan(scan)
      queryClient.invalidateQueries({ queryKey: ['attendance-live'] })
    })

    const unsubAttendance = eventBus.subscribe('attendance_update', () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-live'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    })

    const unsubDept = eventBus.subscribe('department_summary_update', (event) => {
      const d = event.data as unknown as DeptSummaryPayload
      useDeptSummaryStore.getState().updateDepartment(d)
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-charts'] })
    })

    const unsubDevice = eventBus.subscribe('device_status_update', () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    })

    const unsubDeviceLegacy = eventBus.subscribe('device.status', () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    })

    const unsubLate = eventBus.subscribe('alert.late_employee', (event) => {
      const d = event.data as Record<string, unknown>
      const name = (d.employee_name as string) || 'An employee'
      const mins = (d.late_minutes as number) || 0
      useAlertStore.getState().addAlert({
        event_id: event.event_id,
        severity: 'WARNING',
        title: 'Employee Late Alert',
        message: `${name} is ${mins} minutes late`,
        metadata: d,
      })
      toast.warning(`${name} is late`, {
        description: `${mins} minutes late`,
        duration: 6000,
      })
    })

    const unsubUnknown = eventBus.subscribe('unknown_user_alert', (event) => {
      const d = event.data as unknown as UnknownUserPayload
      useDeptSummaryStore.getState().prependUnknownUser(d)
      useAlertStore.getState().addAlert({
        event_id: event.event_id,
        severity: 'CRITICAL',
        title: 'Unknown Biometric User',
        message: `Device: ${d.device_name || d.device_serial_number} · ID: ${d.raw_device_user_id}`,
        metadata: d as unknown as Record<string, unknown>,
      })
      toast.warning('Unknown fingerprint detected', {
        description: `Device: ${d.device_name || d.device_serial_number} · ID: ${d.raw_device_user_id}`,
        duration: 8000,
      })
      queryClient.invalidateQueries({ queryKey: ['unrecognized-users'] })
    })

    const unsubRollover = eventBus.subscribe('day.rollover', (event) => {
      const d = event.data as Record<string, unknown>
      useScanFeedStore.getState().resetDuplicates()
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-charts'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-live'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-history'] })
      toast.info(`New day started — ${d.new_date}`, {
        description: 'Dashboard refreshed for today',
        duration: 8000,
      })
    })

    return () => {
      unsubScan()
      unsubAttendance()
      unsubDept()
      unsubDevice()
      unsubDeviceLegacy()
      unsubLate()
      unsubUnknown()
      unsubRollover()
    }
  }, [queryClient])

  // ── Replay recovery (stable — never changes reference) ──────────────────
  const performRecovery = useCallback(async (lastEventId: string) => {
    const connStore = useConnectionStore.getState()
    connStore.setStatus('replaying')
    console.log(`[WS Recovery] Initiating replay recovery for event ID: ${lastEventId}`)
    try {
      const { data } = await eventsAPI.replay(lastEventId)
      if (data && Array.isArray(data.items)) {
        console.log(`[WS Recovery] Received ${data.items.length} missed events to replay.`)
        data.items.forEach((event) => {
          eventBus.publish(event)
        })
      }
      connStore.setStatus('connected')
    } catch (e) {
      console.error('[WS Recovery] Replay failed. Continuing in degraded mode.', e)
      connStore.setStatus('degraded')
    }
  }, []) // stable — no deps

  // ── WebSocket connect function (stored in ref, never in dep array) ───────
  useEffect(() => {
    if (!isAuthenticated) return

    isMounted.current = true

    const connect = () => {
      if (!isMounted.current) return

      // Don't create a new WS if one is already connecting
      if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
        return
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

      // VITE_WS_URL bypasses the Vite proxy and connects directly to the backend.
      // Required in dev because Vite 6's WS upgrade proxying is unreliable.
      // In production, set VITE_WS_URL to the deployed WS endpoint.
      const wsUrl = import.meta.env.VITE_WS_URL
        || `${protocol}//${window.location.host}/ws`

      const connStore = useConnectionStore.getState()
      connStore.setStatus('reconnecting')

      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          if (!isMounted.current) {
            ws.close()
            return
          }
          console.log('[WS] Connected to', wsUrl)
          connStore.setStatus('connected')
          connStore.setLastHeartbeat(new Date().toISOString())

          // Keepalive ping every 20s
          const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping')
              connStore.setLastHeartbeat(new Date().toISOString())
            }
          }, 20000)
          ws.addEventListener('close', () => clearInterval(pingInterval))

          // Replay missed events on reconnect (not first connect)
          const lastId = eventBus.getLastEventId()
          if (!isFirstConnection.current && lastId) {
            performRecovery(lastId)
          }
          isFirstConnection.current = false
        }

        ws.onmessage = (event) => {
          if (event.data === 'pong') return
          try {
            const msg: WSEvent = JSON.parse(event.data)
            eventBus.publish(msg)
          } catch (e) {
            console.warn('[WS] Ingestion error:', e)
          }
        }

        ws.onclose = () => {
          if (!isMounted.current) return
          console.log('[WS] Connection closed, scheduling reconnect...')
          connStore.setStatus('disconnected')
          reconnectTimeout.current = setTimeout(() => connectRef.current?.(), 3000)
        }

        ws.onerror = (err) => {
          if (!isMounted.current) return
          console.error('[WS] Connection error:', err)
          ws.close()
        }
      } catch (e) {
        if (!isMounted.current) return
        console.error('[WS] Connection exception:', e)
        connStore.setStatus('disconnected')
        reconnectTimeout.current = setTimeout(() => connectRef.current?.(), 5000)
      }
    }

    // Store in ref so reconnect callbacks always call the latest version
    // without causing dependency changes
    connectRef.current = connect

    // Initial connection — runs on mount or auth change
    connect()

    return () => {
      isMounted.current = false
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [isAuthenticated]) // ← runs when authentication status changes

  return wsRef
}
