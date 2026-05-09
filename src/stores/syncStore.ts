import { create } from 'zustand'

export type SyncStatus = 'disabled' | 'starting' | 'syncing' | 'synced' | 'error'

interface SyncState {
  status: SyncStatus
  lastSyncAt: number | null
  lastError: string | null

  setStatus: (status: SyncStatus) => void
  markSynced: () => void
  setError: (msg: string) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'disabled',
  lastSyncAt: null,
  lastError: null,

  setStatus: (status) => set({ status }),
  markSynced: () => set({ status: 'synced', lastSyncAt: Date.now(), lastError: null }),
  setError: (msg) => set({ status: 'error', lastError: msg }),
}))
