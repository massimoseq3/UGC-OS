import { create } from 'zustand'
import * as uploadQueue from '../lib/uploadQueue'

export type SyncStatus = 'disabled' | 'starting' | 'syncing' | 'synced' | 'error'

interface SyncState {
  status: SyncStatus
  // Pending bank-row pushes (sub-second, debounced).
  pendingPushes: number
  // Sum of queue uploads + ad-hoc cloud round trips (e.g. batched asset deletes).
  // The two are tracked separately under the hood so they don't clobber.
  pendingUploads: number
  failedUploads: number
  lastSyncAt: number | null
  lastError: string | null
  // Internal split — never read by UI.
  _queueUploads: number
  _legacyUploads: number

  setStatus: (status: SyncStatus) => void
  markSynced: () => void
  setError: (msg: string) => void

  startPush: () => void
  endPush: () => void
  // Used by the delete batcher in r2.ts; uploads from the queue use _syncFromQueue.
  startUpload: () => void
  endUpload: () => void

  // Internal — wired up by the queue subscriber below. Components shouldn't
  // call this directly.
  _syncFromQueue: (pending: number, failed: number) => void
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'disabled',
  pendingPushes: 0,
  pendingUploads: 0,
  failedUploads: 0,
  lastSyncAt: null,
  lastError: null,
  _queueUploads: 0,
  _legacyUploads: 0,

  setStatus: (status) => set({ status }),
  markSynced: () => {
    const { failedUploads, pendingUploads } = get()
    if (failedUploads > 0) {
      set({ status: 'error', lastError: `${failedUploads} asset upload${failedUploads === 1 ? '' : 's'} failed` })
      return
    }
    if (pendingUploads > 0) {
      set({ status: 'syncing' })
      return
    }
    set({ status: 'synced', lastSyncAt: Date.now(), lastError: null })
  },
  setError: (msg) => set({ status: 'error', lastError: msg }),

  startPush: () => set((s) => ({ pendingPushes: s.pendingPushes + 1 })),
  endPush: () => set((s) => ({ pendingPushes: Math.max(0, s.pendingPushes - 1) })),
  startUpload: () => set((s) => {
    const next = s._legacyUploads + 1
    return { _legacyUploads: next, pendingUploads: s._queueUploads + next }
  }),
  endUpload: () => set((s) => {
    const next = Math.max(0, s._legacyUploads - 1)
    return { _legacyUploads: next, pendingUploads: s._queueUploads + next }
  }),

  _syncFromQueue: (pending, failed) => {
    const prev = get()
    const merged = pending + prev._legacyUploads
    set({ _queueUploads: pending, pendingUploads: merged, failedUploads: failed })
    if (failed > 0) {
      if (prev.status !== 'error') set({ status: 'error', lastError: `${failed} asset upload${failed === 1 ? '' : 's'} failed` })
    } else if (merged > 0) {
      if (prev.status === 'synced' || prev.status === 'error') set({ status: 'syncing', lastError: null })
    } else {
      if (prev.status === 'syncing' && prev.pendingPushes === 0) {
        set({ status: 'synced', lastSyncAt: Date.now(), lastError: null })
      } else if (prev.status === 'error') {
        set({ status: 'synced', lastSyncAt: Date.now(), lastError: null })
      }
    }
  },
}))

// Bridge the upload queue's counter changes into this store. We schedule the
// subscription as a microtask so any module-load circular import (r2 → this
// → uploadQueue → r2) finishes evaluating both sides before we touch the
// queue's exports — calling `subscribeCounters` synchronously here would
// blow up if uploadQueue's own internal state hadn't initialized yet.
if (typeof queueMicrotask === 'function') {
  queueMicrotask(() => {
    uploadQueue.subscribeCounters(() => {
      useSyncStore.getState()._syncFromQueue(uploadQueue.pendingCount(), uploadQueue.failedCount())
    })
  })
}

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
