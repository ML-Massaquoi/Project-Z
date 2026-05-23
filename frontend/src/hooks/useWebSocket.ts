import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { WSEvent } from '@/types'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const queryClient = useQueryClient()
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[WS] Connected')
      }

      ws.onmessage = (event) => {
        try {
          const msg: WSEvent = JSON.parse(event.data)

          switch (msg.event) {
            case 'attendance.created':
            case 'employee.checked_in':
            case 'employee.checked_out':
              // Invalidate attendance and dashboard queries for real-time updates
              queryClient.invalidateQueries({ queryKey: ['attendance-live'] })
              queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
              queryClient.invalidateQueries({ queryKey: ['dashboard-charts'] })
              break

            case 'device.status':
            case 'device.registered':
              queryClient.invalidateQueries({ queryKey: ['devices'] })
              queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
              break

            case 'alert.late_employee':
              queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
              break
          }
        } catch (e) {
          console.warn('[WS] Parse error:', e)
        }
      }

      ws.onclose = () => {
        console.log('[WS] Disconnected, reconnecting in 3s...')
        reconnectTimeout.current = setTimeout(connect, 3000)
      }

      ws.onerror = (err) => {
        console.error('[WS] Error:', err)
        ws.close()
      }
    } catch (e) {
      console.error('[WS] Connection failed:', e)
      reconnectTimeout.current = setTimeout(connect, 5000)
    }
  }, [queryClient])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current)
      wsRef.current?.close()
    }
  }, [connect])

  return wsRef
}
