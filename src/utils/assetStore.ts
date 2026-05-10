import { downloadAssetFromR2, deleteAssetFromR2 } from '../lib/r2'
import { isCloudEnabled } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { enqueueUpload, dropFromQueue, setBlobGetter } from '../lib/uploadQueue'

const DB_NAME = 'ai-ugc-lab-assets'
const DB_VERSION = 1
const STORE_NAME = 'assets'

interface StoredAsset {
  id: string
  blob: Blob
  mimeType: string
  createdAt: number
}

function cloudActive(): boolean {
  return isCloudEnabled() && !!useAuthStore.getState().user
}

// Object URL cache — prevents memory leaks from creating duplicate URLs
const urlCache = new Map<string, string>()

// In-memory fallback when IndexedDB is unavailable (e.g. private browsing)
let fallbackStore: Map<string, StoredAsset> | null = null

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        console.warn('IndexedDB unavailable, using in-memory fallback')
        fallbackStore = new Map()
        reject(request.error)
      }
    } catch {
      console.warn('IndexedDB unavailable, using in-memory fallback')
      fallbackStore = new Map()
      reject(new Error('IndexedDB not available'))
    }
  })
  return dbPromise
}

function generateAssetId(): string {
  return `asset-${crypto.randomUUID()}`
}

// The upload queue needs to read blobs out of our IndexedDB store but can't
// import from this file directly (circular). Hand it a getter at load time.
setBlobGetter((id) => getBlob(id))

export function isAssetRef(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith('asset-')
}

// ── Save operations ──────────────────────────────────────────────────

export async function saveAsset(blob: Blob, mimeType?: string): Promise<string> {
  const id = generateAssetId()
  const asset: StoredAsset = {
    id,
    blob,
    mimeType: mimeType ?? blob.type,
    createdAt: Date.now(),
  }

  // Always cache locally (so the current session keeps a fast object URL).
  if (fallbackStore) {
    fallbackStore.set(id, asset)
  } else {
    try {
      const db = await openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(asset)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch {
      if (!fallbackStore) fallbackStore = new Map()
      fallbackStore.set(id, asset)
    }
  }

  // Hand off to the durable upload queue. The queue owns retries, backoff,
  // and surfacing failures to the sync chip. cloudSync gates bank-row pushes
  // on queue readiness so a row referencing this asset never lands in
  // Supabase before the blob is durable in R2.
  if (cloudActive()) {
    enqueueUpload(id, blob, asset.mimeType).catch((e) =>
      console.warn('[assetStore] enqueueUpload failed', e),
    )
  }

  return id
}

export async function saveFromDataUrl(dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid data URL')
  const mimeType = match[1]

  const res = await fetch(dataUrl)
  const blob = await res.blob()

  return saveAsset(blob, mimeType)
}

export async function saveBase64Asset(base64: string, mimeType: string): Promise<string> {
  const res = await fetch(`data:${mimeType};base64,${base64}`)
  const blob = await res.blob()
  return saveAsset(blob, mimeType)
}

export async function saveFromBlobUrl(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl)
  const blob = await res.blob()
  return saveAsset(blob)
}

// ── Read operations ──────────────────────────────────────────────────

export async function getBlob(assetId: string): Promise<Blob | null> {
  // Local cache first.
  let local: Blob | null = null
  if (fallbackStore) {
    local = fallbackStore.get(assetId)?.blob ?? null
  } else {
    try {
      const db = await openDB()
      local = await new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const request = tx.objectStore(STORE_NAME).get(assetId)
        request.onsuccess = () => {
          const asset = request.result as StoredAsset | undefined
          resolve(asset?.blob ?? null)
        }
        request.onerror = () => reject(request.error)
      })
    } catch {
      local = null
    }
  }
  if (local) return local

  // Cloud miss → R2 fallback (cross-device).
  if (cloudActive()) {
    try {
      const remote = await downloadAssetFromR2(assetId)
      if (remote) {
        // Cache for next time. Best-effort, don't block.
        const asset: StoredAsset = { id: assetId, blob: remote, mimeType: remote.type, createdAt: Date.now() }
        if (fallbackStore) {
          fallbackStore.set(assetId, asset)
        } else {
          try {
            const db = await openDB()
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction(STORE_NAME, 'readwrite')
              tx.objectStore(STORE_NAME).put(asset)
              tx.oncomplete = () => resolve()
              tx.onerror = () => reject(tx.error)
            })
          } catch { /* cache miss only, not fatal */ }
        }
        return remote
      }
    } catch (e) {
      console.warn('[assetStore] R2 download failed', e)
    }
  }
  return null
}

export async function getUrl(assetId: string): Promise<string | null> {
  // Return cached URL if we already created one
  const cached = urlCache.get(assetId)
  if (cached) return cached

  const blob = await getBlob(assetId)
  if (!blob) return null

  const url = URL.createObjectURL(blob)
  urlCache.set(assetId, url)
  return url
}

export async function getAsBase64(assetId: string): Promise<{ base64: string; mimeType: string } | null> {
  const blob = await getBlob(assetId)
  if (!blob) return null

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve({ base64, mimeType: blob.type })
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ── Delete ───────────────────────────────────────────────────────────

export async function deleteAsset(assetId: string): Promise<void> {
  // Revoke cached object URL
  const cached = urlCache.get(assetId)
  if (cached) {
    URL.revokeObjectURL(cached)
    urlCache.delete(assetId)
  }

  // Stop any pending/failed upload retries for this asset — user no longer
  // wants it.
  dropFromQueue(assetId).catch(() => { /* best effort */ })

  // Best-effort: drop the cloud `assets` row (R2 object stays — leftovers
  // are cheap and a sweeper can clean them up later).
  if (cloudActive()) {
    deleteAssetFromR2(assetId).catch((e) => console.warn('[assetStore] R2 delete failed', e))
  }

  if (fallbackStore) {
    fallbackStore.delete(assetId)
    return
  }

  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(assetId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Silent fail — asset might already be gone
  }
}
