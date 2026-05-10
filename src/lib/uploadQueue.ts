// Persistent, resumable upload queue for R2 asset blobs.
//
// Why this exists: bank rows reference `asset-…` ids that point to blobs in
// IndexedDB + R2. The cloud sync layer cannot push a row that references an
// asset that hasn't reached R2 yet — otherwise other devices (or this device
// after IndexedDB is cleared) get dangling refs. This queue is the single
// authority on "is asset X durable in the cloud?".
//
// Design:
//  • State lives in IndexedDB so a refresh resumes in-flight work.
//  • A pump() loop drains pending entries with bounded concurrency (3).
//  • Failures retry with exponential backoff; after 5 attempts the entry is
//    marked `failed` and surfaces in the sync chip as a retryable error.
//  • cloudSync subscribes for status transitions to retry deferred row pushes.
//  • assetStore enqueues on every saveAsset(); queue takes it from there.

import { uploadAssetToR2 } from './r2'
import { isCloudEnabled } from './supabase'
import { useAuthStore } from '../stores/authStore'

const DB_NAME = 'ai-ugc-lab-upload-queue'
const DB_VERSION = 1
const STORE = 'queue'

const MAX_CONCURRENT = 3
const MAX_ATTEMPTS = 5
// Backoff schedule indexed by attempts-so-far (0 = first attempt).
const BACKOFF_MS = [0, 2_000, 8_000, 30_000, 120_000, 600_000]

export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed'

export interface QueueEntry {
  id: string                      // assetId (matches the bank row reference)
  status: UploadStatus
  attempts: number
  lastError?: string
  addedAt: number
  mimeType: string
  byteSize: number
}

type Listener = (entry: QueueEntry) => void

let dbPromise: Promise<IDBDatabase> | null = null
const memoryFallback = new Map<string, QueueEntry>()
let useMemoryFallback = false

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        useMemoryFallback = true
        reject(req.error)
      }
    } catch (e) {
      useMemoryFallback = true
      reject(e as Error)
    }
  })
  return dbPromise
}

async function dbGet(id: string): Promise<QueueEntry | undefined> {
  if (useMemoryFallback) return memoryFallback.get(id)
  try {
    const db = await openDB()
    return await new Promise<QueueEntry | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result as QueueEntry | undefined)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return memoryFallback.get(id)
  }
}

async function dbPut(entry: QueueEntry): Promise<void> {
  if (useMemoryFallback) { memoryFallback.set(entry.id, entry); return }
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    memoryFallback.set(entry.id, entry)
  }
}

async function dbDelete(id: string): Promise<void> {
  memoryFallback.delete(id)
  if (useMemoryFallback) return
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* best effort */ }
}

async function dbAll(): Promise<QueueEntry[]> {
  if (useMemoryFallback) return Array.from(memoryFallback.values())
  try {
    const db = await openDB()
    return await new Promise<QueueEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => resolve((req.result as QueueEntry[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return Array.from(memoryFallback.values())
  }
}

// ── Subscriber registry ─────────────────────────────────────────────

const listeners = new Set<Listener>()
const counterListeners = new Set<() => void>()

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

// Coarse listener fired whenever any counter (pending/failed) might have
// changed. Used by syncStore to recompute its derived status.
export function subscribeCounters(fn: () => void): () => void {
  counterListeners.add(fn)
  return () => { counterListeners.delete(fn) }
}

function emit(entry: QueueEntry) {
  for (const l of listeners) {
    try { l(entry) } catch (e) { console.error('[uploadQueue] listener threw', e) }
  }
  for (const l of counterListeners) {
    try { l() } catch (e) { console.error('[uploadQueue] counter listener threw', e) }
  }
}

// ── Counters cache (kept in memory, refreshed on every transition) ──

let pendingCountCache = 0
let failedCountCache = 0
let countersLoaded = false

async function refreshCounters() {
  const all = await dbAll()
  let pending = 0
  let failed = 0
  for (const e of all) {
    if (e.status === 'pending' || e.status === 'uploading') pending++
    else if (e.status === 'failed') failed++
  }
  pendingCountCache = pending
  failedCountCache = failed
  countersLoaded = true
  for (const l of counterListeners) {
    try { l() } catch { /* ignore */ }
  }
}

export function pendingCount(): number { return pendingCountCache }
export function failedCount(): number { return failedCountCache }
export function countersReady(): boolean { return countersLoaded }

// ── Public API ──────────────────────────────────────────────────────

// Treat unknown ids as "ready" so cloudSync doesn't block on legacy refs we
// have no record of. New saves always go through enqueueUpload first, so
// anything that genuinely needs to upload will be in the queue.
export async function isReady(assetId: string): Promise<boolean> {
  const e = await dbGet(assetId)
  if (!e) return true
  return e.status === 'uploaded'
}

export async function getStatus(assetId: string): Promise<UploadStatus | 'unknown'> {
  const e = await dbGet(assetId)
  return e?.status ?? 'unknown'
}

export async function enqueueUpload(assetId: string, blob: Blob, mimeType?: string): Promise<void> {
  // No cloud → nothing to do. The blob lives in IndexedDB; that's it.
  if (!isCloudEnabled()) return
  if (!useAuthStore.getState().user) return

  const existing = await dbGet(assetId)
  if (existing && existing.status === 'uploaded') return // already done

  const entry: QueueEntry = {
    id: assetId,
    status: 'pending',
    attempts: 0,
    addedAt: existing?.addedAt ?? Date.now(),
    mimeType: mimeType ?? blob.type ?? 'application/octet-stream',
    byteSize: blob.size,
  }
  await dbPut(entry)
  await refreshCounters()
  emit(entry)
  pump()
}

export async function retry(assetId: string): Promise<void> {
  const e = await dbGet(assetId)
  if (!e) return
  if (e.status === 'uploaded' || e.status === 'uploading') return
  const next: QueueEntry = { ...e, status: 'pending', attempts: 0, lastError: undefined }
  await dbPut(next)
  await refreshCounters()
  emit(next)
  pump()
}

export async function retryAll(): Promise<void> {
  const all = await dbAll()
  for (const e of all) {
    if (e.status === 'failed') {
      const next: QueueEntry = { ...e, status: 'pending', attempts: 0, lastError: undefined }
      await dbPut(next)
      emit(next)
    }
  }
  await refreshCounters()
  pump()
}

// Used when a bank item is deleted — we shouldn't keep retrying an upload for
// an asset the user no longer cares about.
export async function dropFromQueue(assetId: string): Promise<void> {
  await dbDelete(assetId)
  await refreshCounters()
}

export async function failedEntries(): Promise<QueueEntry[]> {
  const all = await dbAll()
  return all.filter((e) => e.status === 'failed')
}

// ── Worker ──────────────────────────────────────────────────────────

const inFlight = new Set<string>()
let pumping = false
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Lazy loader for asset blobs — we import at call time to avoid a circular
// import (assetStore imports from this file too).
let blobGetter: ((id: string) => Promise<Blob | null>) | null = null
export function setBlobGetter(fn: (id: string) => Promise<Blob | null>) {
  blobGetter = fn
}

async function getBlobLazy(id: string): Promise<Blob | null> {
  if (!blobGetter) return null
  return blobGetter(id)
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    while (inFlight.size < MAX_CONCURRENT) {
      const all = await dbAll()
      const next = all.find(
        (e) => e.status === 'pending' && !inFlight.has(e.id) && !pendingTimers.has(e.id),
      )
      if (!next) break
      // Mark as uploading and kick off the actual upload (don't await — we
      // want to fill the concurrency slots in this loop iteration).
      inFlight.add(next.id)
      runUpload(next).catch((e) => console.error('[uploadQueue] runUpload threw', e))
    }
  } finally {
    pumping = false
  }
}

async function runUpload(entry: QueueEntry): Promise<void> {
  const userBefore = useAuthStore.getState().user?.id
  if (!userBefore) {
    // User signed out mid-upload. Leave the entry as pending; we'll resume
    // when they sign back in.
    inFlight.delete(entry.id)
    return
  }

  const updating: QueueEntry = { ...entry, status: 'uploading' }
  await dbPut(updating)
  emit(updating)

  try {
    const blob = await getBlobLazy(entry.id)
    if (!blob) {
      throw new Error('Asset blob missing locally — cannot upload')
    }
    await uploadAssetToR2(entry.id, blob)

    const done: QueueEntry = { ...updating, status: 'uploaded', lastError: undefined }
    await dbPut(done)
    await refreshCounters()
    emit(done)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[uploadQueue] upload ${entry.id} failed:`, message)
    const attempts = entry.attempts + 1
    if (attempts >= MAX_ATTEMPTS) {
      const failedEntry: QueueEntry = { ...updating, status: 'failed', attempts, lastError: message }
      await dbPut(failedEntry)
      await refreshCounters()
      emit(failedEntry)
    } else {
      const delay = BACKOFF_MS[attempts] ?? BACKOFF_MS[BACKOFF_MS.length - 1]
      const retrying: QueueEntry = { ...updating, status: 'pending', attempts, lastError: message }
      await dbPut(retrying)
      await refreshCounters()
      emit(retrying)
      // Hold the slot reservation in pendingTimers so pump() doesn't pick the
      // same entry again immediately. The timer clears it when fired.
      const t = setTimeout(() => {
        pendingTimers.delete(entry.id)
        pump()
      }, delay)
      pendingTimers.set(entry.id, t)
    }
  } finally {
    inFlight.delete(entry.id)
    // Always try to fill the freed slot.
    pump()
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────

let initialized = false

// Called by cloudSync after sign-in. Recovers queue state from IndexedDB,
// resets any stuck `uploading` entries (probably from a prior crash or tab
// close), and gives `failed` entries one auto-retry per session.
export async function start(): Promise<void> {
  if (initialized) {
    // Re-pump in case there's queued work waiting for a sign-in.
    pump()
    return
  }
  initialized = true

  const all = await dbAll()
  for (const e of all) {
    // Stuck 'uploading' from a prior session → reset to pending.
    if (e.status === 'uploading') {
      const reset: QueueEntry = { ...e, status: 'pending' }
      await dbPut(reset)
      emit(reset)
    }
    // Auto-retry past failures once per session — most failures are transient.
    if (e.status === 'failed') {
      const reset: QueueEntry = { ...e, status: 'pending', attempts: 0, lastError: undefined }
      await dbPut(reset)
      emit(reset)
    }
  }
  await refreshCounters()
  pump()
}

// Called when the user signs out. Cancels in-flight slots; queue persists
// for the next sign-in.
export function stop(): void {
  for (const t of pendingTimers.values()) clearTimeout(t)
  pendingTimers.clear()
  inFlight.clear()
  initialized = false
}

// Kick the worker — public so cloudSync's "subscribe + retry" path doesn't
// need to know about pump() internals.
export function kick(): void {
  pump()
}
