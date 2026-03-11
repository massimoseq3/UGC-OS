const DB_NAME = 'ai-ugc-lab-assets'
const DB_VERSION = 1
const STORE_NAME = 'assets'

interface StoredAsset {
  id: string
  blob: Blob
  mimeType: string
  createdAt: number
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

  if (fallbackStore) {
    fallbackStore.set(id, asset)
    return id
  }

  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(asset)
      tx.oncomplete = () => resolve(id)
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Fallback to memory if DB fails
    if (!fallbackStore) fallbackStore = new Map()
    fallbackStore.set(id, asset)
    return id
  }
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
  if (fallbackStore) {
    return fallbackStore.get(assetId)?.blob ?? null
  }

  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(assetId)
      request.onsuccess = () => {
        const asset = request.result as StoredAsset | undefined
        resolve(asset?.blob ?? null)
      }
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
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
