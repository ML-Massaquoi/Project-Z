import { create } from 'zustand'
import type { ScanEventPayload } from '@/types'

const MAX_FEED_ITEMS = 500

interface ScanFeedState {
  scans: ScanEventPayload[]
  duplicates: ScanEventPayload[]
  prependScan: (scan: ScanEventPayload) => void
  resetDuplicates: () => void
}

export const useScanFeedStore = create<ScanFeedState>((set) => ({
  scans: [],
  duplicates: [],

  prependScan: (scan) =>
    set((state) => {
      // Prevent duplicates by scan_event_id in memory arrays
      const isDuplicateId = state.scans.some((s) => s.scan_event_id === scan.scan_event_id)
      if (isDuplicateId) {
        return state
      }

      const newScans = [scan, ...state.scans].slice(0, MAX_FEED_ITEMS)
      const newDuplicates =
        scan.scan_result === 'duplicate'
          ? [scan, ...state.duplicates].slice(0, MAX_FEED_ITEMS)
          : state.duplicates
      return { scans: newScans, duplicates: newDuplicates }
    }),

  resetDuplicates: () => set({ duplicates: [] }),
}))
