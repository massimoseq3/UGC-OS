import { create } from 'zustand'

export type SyncStatus = 'disabled' | 'starting' | 'syncing' | 'synced' | 'error'

interface SyncState {
  status: SyncStatus
  // Counts of in-flight work. Bank row pushes are usually sub-second; asset
  // (R2) uploads can run for many seconds depending on file size. Both are
  // surfaced in the chip and used by the unload guard so users don't refresh
  // mid-sync and lose data.
  pendingPushes: number
  pendingUploads: number
  lastSyncAt: number | null
  lastError: string | null

  setStatus: (status: SyncStatus) => void
  markSynced: () => void
  setError: (msg: string) => void

  startPush: () => void
  endPush: () => void
  startUpload: () => void
  endUpload: () => void
  // Manual escape hatch when the counters get stuck (e.g. a tab that never
  // ran the finally because the user closed it before fetch settled).
  resetCounters: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'disabled',
  pendingPushes: 0,
  pendingUploads: 0,
  lastSyncAt: null,
  lastError: null,

  setStatus: (status) => set({ status }),
  markSynced: () => set({ status: 'synced', lastSyncAt: Date.now(), lastError: null }),
  setError: (msg) => set({ status: 'error', lastError: msg }),

  startPush: () => set((s) => ({ pendingPushes: s.pendingPushes + 1 })),
  endPush: () => set((s) => ({ pendingPushes: Math.max(0, s.pendingPushes - 1) })),
  startUpload: () => set((s) => ({ pendingUploads: s.pendingUploads + 1 })),
  endUpload: () => set((s) => ({ pendingUploads: Math.max(0, s.pendingUploads - 1) })),
  resetCounters: () => set({ pendingPushes: 0, pendingUploads: 0 }),
}))

// Block reload/close while there's unsynced work. Modern browsers ignore the
// returned string and show their own "Leave site?" prompt — the important
// part is calling preventDefault and returning a non-empty value.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    const { pendingPushes, pendingUploads } = useSyncStore.getState()
    if (pendingPushes === 0 && pendingUploads === 0) return
    e.preventDefault()
    e.returnValue = 'You have changes that haven’t finished syncing. Leave anyway?'
  })
}
