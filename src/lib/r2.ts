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

async function getAccessToken(): Promise<string | null> {
  const session = useAuthStore.getState().session
  return session?.access_token ?? null
}

async function presign(op: 'put' | 'get', assetId: string, mimeType?: string): Promise<SignedUrlResponse> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not signed in')

  const res = await fetch('/api/r2-sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ op, assetId, mimeType }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Presign failed (${res.status}): ${text || res.statusText}`)
  }
  return await res.json() as SignedUrlResponse
}

// Hard ceiling on a single asset upload. fetch() doesn't time out by
// default, so a dead TCP connection can leave the upload counter stuck on
// "Uploading X files…" forever. 90s is generous for a typical image / short
// video on a decent connection.
const UPLOAD_TIMEOUT_MS = 90_000

// Upload a blob to R2 and register it in the `assets` table. The bank rows
// keep using the same `asset-…` id, so callers don't change.
export async function uploadAssetToR2(assetId: string, blob: Blob): Promise<void> {
  if (!isCloudEnabled()) return
  const userId = useAuthStore.getState().user?.id
  if (!userId) return

  useSyncStore.getState().startUpload()
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS)
  try {
    const { url, key } = await presign('put', assetId, blob.type)
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: blob.type ? { 'content-type': blob.type } : {},
      body: blob,
      signal: ctrl.signal,
    })
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
    if (error) console.error('[r2] assets row insert failed', error)
  } catch (e) {
    // Surface aborts and network failures so the user knows the upload didn't
    // land — without this, an aborted upload would silently bump the counter
    // back down and the user would think their data was saved.
    if ((e as Error).name === 'AbortError') {
      console.error('[r2] upload aborted after timeout', assetId)
    } else {
      console.error('[r2] upload error', e)
    }
  } finally {
    window.clearTimeout(timer)
    useSyncStore.getState().endUpload()
  }
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
//
// Deliberately *not* tracked in syncStore — asset row cleanup is background
// work and surfacing it as "Uploading…" misleads the user (they just clicked
// Delete) and adds anxiety with no actionable signal.
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
    const sb = getSupabase()
    const { error } = await sb.from('assets').delete().in('id', ids).eq('user_id', userId)
    if (error) console.error('[r2] batch delete failed', error)
  }, 100)
}
