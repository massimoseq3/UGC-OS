// Client helpers for the R2 asset pipeline.
//
// We never talk to R2 directly with credentials — `/api/r2-sign` mints a
// presigned URL scoped to the current user, then we PUT/GET against R2 with it.

import { getSupabase, isCloudEnabled } from './supabase'
import { useAuthStore } from '../stores/authStore'
import { useSyncStore } from '../stores/syncStore'

interface SignedUrlResponse {
  url: string
  key: string
  expiresIn: number
}

// 60s per network attempt. Beyond this we'd rather fail and let the queue
// retry than tie up a worker slot indefinitely on a dead connection.
const ATTEMPT_TIMEOUT_MS = 60_000

async function getAccessToken(): Promise<string | null> {
  const session = useAuthStore.getState().session
  return session?.access_token ?? null
}

async function presign(op: 'put' | 'get', assetId: string, mimeType?: string, byteSize?: number): Promise<SignedUrlResponse> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not signed in')

  const res = await withTimeout(fetch('/api/r2-sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ op, assetId, mimeType, byteSize }),
  }), ATTEMPT_TIMEOUT_MS)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Presign failed (${res.status}): ${text || res.statusText}`)
  }
  return await res.json() as SignedUrlResponse
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Network timeout after ${Math.round(ms / 1000)}s`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

// Atomic upload: this resolves only after BOTH the R2 PUT and the `assets`
// row insert succeed. Failure surfaces as a thrown error so the upload queue
// can apply backoff. We deliberately do not touch useSyncStore here — the
// queue owns all sync-state accounting via subscribers.
export async function uploadAssetToR2(assetId: string, blob: Blob): Promise<void> {
  if (!isCloudEnabled()) return
  const userId = useAuthStore.getState().user?.id
  if (!userId) throw new Error('Not signed in')

  const { url, key } = await presign('put', assetId, blob.type, blob.size)

  // fetch() throws (rather than returning a non-OK Response) on CORS rejection,
  // network failure, or timeout. The browser deliberately hides CORS detail for
  // security reasons, so on a thrown error we name the R2 host and the current
  // origin — that combination tells the user exactly what to fix in the bucket
  // CORS policy. HTTP-level errors (4xx/5xx that did make it to R2) keep the
  // raw status + body.
  let putRes: Response
  try {
    putRes = await withTimeout(fetch(url, {
      method: 'PUT',
      headers: blob.type ? { 'content-type': blob.type } : {},
      body: blob,
    }), ATTEMPT_TIMEOUT_MS)
  } catch (err) {
    const host = (() => { try { return new URL(url).host } catch { return 'r2.cloudflarestorage.com' } })()
    const origin = typeof window !== 'undefined' ? window.location.origin : '<unknown origin>'
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`R2 PUT to ${host} failed (${reason}). Likely a CORS misconfiguration — verify the bucket CORS policy allows ${origin} with method PUT.`)
  }
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '')
    throw new Error(`R2 upload failed (${putRes.status}): ${text || putRes.statusText}`)
  }

  const sb = getSupabase()
  const { error } = await sb.from('assets').upsert({
    id: assetId,
    user_id: userId,
    r2_key: key,
    mime_type: blob.type || 'application/octet-stream',
    byte_size: blob.size,
  })
  if (error) {
    // Bubble up so the queue retries — a dangling R2 object without an
    // `assets` row is exactly the broken state we're trying to avoid.
    throw new Error(`assets row insert failed: ${error.message}`)
  }
}

// Returns true if a remote `assets` row exists for the given id under the
// current user. Used by cloudSync's backfill walk.
export async function hasRemoteAssetRow(assetId: string): Promise<boolean> {
  if (!isCloudEnabled()) return false
  const userId = useAuthStore.getState().user?.id
  if (!userId) return false
  const sb = getSupabase()
  const { data } = await sb.from('assets').select('id').eq('id', assetId).maybeSingle()
  return !!data
}

// Returns the set of asset ids the user already has in R2. Single round trip;
// callers pass the full set of refs they care about so we IN-filter server-side.
export async function existingRemoteAssetIds(assetIds: string[]): Promise<Set<string>> {
  if (!isCloudEnabled() || assetIds.length === 0) return new Set()
  const userId = useAuthStore.getState().user?.id
  if (!userId) return new Set()
  const sb = getSupabase()
  const { data, error } = await sb.from('assets').select('id').in('id', assetIds).eq('user_id', userId)
  if (error) {
    console.warn('[r2] existingRemoteAssetIds failed', error)
    return new Set()
  }
  return new Set((data ?? []).map((row) => row.id as string))
}

// Fetch a blob from R2 by asset id. Returns null if not found / not ours.
export async function downloadAssetFromR2(assetId: string): Promise<Blob | null> {
  if (!isCloudEnabled()) return null
  const userId = useAuthStore.getState().user?.id
  if (!userId) return null

  // Confirm the asset belongs to this user before paying for a presign call.
  const sb = getSupabase()
  const { data, error } = await sb.from('assets').select('id, mime_type').eq('id', assetId).maybeSingle()
  if (error || !data) return null

  const { url } = await presign('get', assetId)
  const res = await fetch(url)
  if (!res.ok) return null
  return await res.blob()
}

// Module-level batching for asset row deletes. When the user deletes a bank
// item that has an image (or worse, a project that touches several banks),
// we fire many deleteAssetFromR2 calls in quick succession. Without batching
// each one is its own ~300ms Supabase round trip; from a far region (e.g.
// South Africa → US West) that adds up to seconds of perceived lag. We
// coalesce all deletes scheduled within 100ms into a single DELETE…IN(…).
let pendingAssetDeletes: string[] = []
let assetDeleteTimer: ReturnType<typeof setTimeout> | null = null

export async function deleteAssetFromR2(assetId: string): Promise<void> {
  if (!isCloudEnabled()) return
  const userId = useAuthStore.getState().user?.id
  if (!userId) return

  pendingAssetDeletes.push(assetId)
  if (assetDeleteTimer) return
  assetDeleteTimer = setTimeout(async () => {
    assetDeleteTimer = null
    const ids = pendingAssetDeletes
    pendingAssetDeletes = []
    if (ids.length === 0) return
    useSyncStore.getState().startUpload()
    try {
      const sb = getSupabase()
      const { error } = await sb.from('assets').delete().in('id', ids).eq('user_id', userId)
      if (error) console.error('[r2] batch delete failed', error)
    } finally {
      useSyncStore.getState().endUpload()
    }
  }, 100)
}
