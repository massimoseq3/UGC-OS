import { useEffect } from 'react'
import { create } from 'zustand'

// Tracks which apps currently have a generation in flight, so the dock can
// pulse their running dot ("Bubbles is out shooting"). Apps report via
// useReportActivity below; counts (not booleans) so overlapping reporters
// in one app can't stomp each other.
//
// Caveat by design: apps are code-split and only mount on first open, so a
// resumed background task in a never-opened app won't pulse until the user
// visits it once that session.

interface ActivityState {
  counts: Record<string, number>
  begin: (appId: string) => void
  end: (appId: string) => void
}

export const useActivityStore = create<ActivityState>((set) => ({
  counts: {},
  begin: (appId) =>
    set((s) => ({ counts: { ...s.counts, [appId]: (s.counts[appId] ?? 0) + 1 } })),
  end: (appId) =>
    set((s) => ({ counts: { ...s.counts, [appId]: Math.max(0, (s.counts[appId] ?? 0) - 1) } })),
}))

// Mirror a component's "busy" boolean into the store. Call once at the app
// root with the app's combined generating state; cleanup keeps the count
// balanced across unmounts and flag flips.
export function useReportActivity(appId: string, busy: boolean) {
  const begin = useActivityStore((s) => s.begin)
  const end = useActivityStore((s) => s.end)

  useEffect(() => {
    if (!busy) return
    begin(appId)
    return () => end(appId)
  }, [appId, busy, begin, end])
}
