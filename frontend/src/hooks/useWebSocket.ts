import { useEffect, useRef, useState, useCallback } from 'react'

interface WSEvent {
  event: string
  data: Record<string, unknown>
}

interface UseWebSocketReturn {
  lastEvent: Record<string, unknown> | null
  isConnected: boolean
  send: (event: string, data: unknown) => void
}

export function useWebSocket(eventFilter?: string | null): UseWebSocketReturn {
  const [lastEvent, setLastEvent] = useState<Record<string, unknown> | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const authFailedRef = useRef(false)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    if (authFailedRef.current) return

    const token = localStorage.getItem('access_token')
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws-app?token=${encodeURIComponent(token)}`

    try {
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setIsConnected(true)
        authFailedRef.current = false
        console.log('[WebSocket] Connected')
      }

      ws.onmessage = (event) => {
        try {
          const payload: WSEvent = JSON.parse(event.data)
          if (!eventFilter || payload.event === eventFilter) {
            setLastEvent({ ...payload.data, event: payload.event })
          }
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e)
        }
      }

      ws.onclose = (event) => {
        setIsConnected(false)
        if (event.code === 4001 || event.code === 4003 || event.code === 4029) {
          console.warn(`[WebSocket] Auth/connection rejected (code ${event.code}), not reconnecting`)
          authFailedRef.current = true
          return
        }
        console.log('[WebSocket] Disconnected, reconnecting in 3s...')
        reconnectTimeoutRef.current = setTimeout(connect, 3000)
      }

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
        ws.close()
      }

      wsRef.current = ws
    } catch (e) {
      console.error('[WebSocket] Connection failed:', e)
      reconnectTimeoutRef.current = setTimeout(connect, 3000)
    }
  }, [eventFilter])

  useEffect(() => {
    authFailedRef.current = false
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  const send = useCallback((event: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }))
    }
  }, [])

  return { lastEvent, isConnected, send }
}
