import type { WSEvent } from '@/types'

type EventCallback = (event: WSEvent) => void

class EventBus {
  private subscribers: Map<string, Set<EventCallback>> = new Map()
  private processedEventIds: Set<string> = new Set()
  private maxStoredEventIds = 1000
  private lastSequenceId = 0
  private lastEventId = ''

  constructor() {
    try {
      const storedLastSeq = localStorage.getItem('projectz_last_sequence_id')
      const storedLastId = localStorage.getItem('projectz_last_event_id')
      if (storedLastSeq) this.lastSequenceId = parseInt(storedLastSeq, 10)
      if (storedLastId) this.lastEventId = storedLastId
    } catch (e) {
      console.warn('[EventBus] Failed to load sequence from storage:', e)
    }
  }

  public subscribe(eventType: string, callback: EventCallback): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set())
    }
    this.subscribers.get(eventType)!.add(callback)

    return () => {
      const subs = this.subscribers.get(eventType)
      if (subs) {
        subs.delete(callback)
        if (subs.size === 0) {
          this.subscribers.delete(eventType)
        }
      }
    }
  }

  public publish(event: WSEvent): boolean {
    const eventId = event.event_id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const sequenceId = typeof event.sequence_id === 'number' ? event.sequence_id : this.lastSequenceId + 1
    
    const normalizedEvent: WSEvent = {
      ...event,
      event_id: eventId,
      sequence_id: sequenceId,
      timestamp: event.timestamp || new Date().toISOString(),
      version: event.version || 1,
    }

    // 1. Deduplicate by event_id
    if (this.processedEventIds.has(eventId)) {
      return false
    }

    // 2. Reject out-of-order stale events (sequence_id <= lastSequenceId)
    // Exception: websocket_status is a client-side system notification and doesn't update database sequences
    if (event.event !== 'websocket_status' && sequenceId <= this.lastSequenceId) {
      return false
    }

    // Store processed event_id
    this.processedEventIds.add(eventId)
    if (this.processedEventIds.size > this.maxStoredEventIds) {
      const oldestId = this.processedEventIds.values().next().value
      if (oldestId) this.processedEventIds.delete(oldestId)
    }

    // Update sequence trackers
    if (event.event !== 'websocket_status') {
      this.lastSequenceId = sequenceId
      this.lastEventId = eventId
      try {
        localStorage.setItem('projectz_last_sequence_id', String(sequenceId))
        localStorage.setItem('projectz_last_event_id', eventId)
      } catch (e) {
        // Safe fallback in incognito / restricted settings
      }
    }

    // Distribute to wildcard listeners or specific type listeners
    this.triggerCallbacks(normalizedEvent.event, normalizedEvent)
    this.triggerCallbacks('*', normalizedEvent)

    return true
  }

  private triggerCallbacks(eventType: string, event: WSEvent) {
    const subs = this.subscribers.get(eventType)
    if (subs) {
      subs.forEach((cb) => {
        try {
          cb(event)
        } catch (e) {
          console.error(`[EventBus] Error in subscriber for ${eventType}:`, e)
        }
      })
    }
  }

  public getLastSequenceId(): number {
    return this.lastSequenceId
  }

  public getLastEventId(): string {
    return this.lastEventId
  }

  public resetSequence() {
    this.lastSequenceId = 0
    this.lastEventId = ''
    this.processedEventIds.clear()
    localStorage.removeItem('projectz_last_sequence_id')
    localStorage.removeItem('projectz_last_event_id')
  }
}

export const eventBus = new EventBus()
