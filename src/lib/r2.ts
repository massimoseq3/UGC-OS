// Client helpers for the R2 asset pipeline.
//
// We never talk to R2 directly with credentials — `/api/r2-sign` mints
// scoped, short-lived credentials for the current user, then we transfer
// against R2 with them. Uploads use a presigned POST policy (so R2 enforces
// the size + MIME caps at upload time); downloads use a presigned GET URL.

import { getSupabase, isCloudEnabled, ensureFreshSession } from './supabase'
import { useAuthStore } from '../stores/authStore'

interface SignedUrlResponse {
  url: string
  key: string
  expiresIn: number
  // Present only for 'put': the multipart form fields of a presigned POST
  // policy (key, Content-Type, policy, x-amz-*). Absent for 'get'.
  fields?: Record<string, string>
}

// 60s per network attempt. Beyond this we'd rather fail and surface the error
// than hold the UI on a dead connection.
const ATTEMPT_TIMEOUT_MS = 60_000

async function getAccessToken(): Promise<string | null> {
  // Delegated to the shared helper so r2 + cloudSync use the same refresh path.
  return ensureFreshSession()
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
    // Parse JSON error body so the toast shows the friendly server message
    // (e.g. "Storage cap reached — you're using 5.23 GB of 10 GB.") rather
    // than a raw "Presign failed (413): {...}".
    const text = await res.text().catch(() => '')
    let friendly = text || res.statusText
    try {
      const parsed = JSON.parse(text) as { error?: string }
      if (parsed.error) friendly = parsed.error
    } catch { /* not JSON — fall back to the raw text */ }
    throw new Error(friendly)
  }
  return await res.json() as SignedUrlResponse
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Network timeout after ${Math.round(ms / 1000)}s`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

// Atomic upload: resolves only after BOTH the R2 PUT and the `assets` row
// upsert succeed. Failure surfaces as a thrown error so the caller can react.
export async function uploadAssetToR2(assetId: string, blob: Blob): Promise<void> {
  if (!isCloudEnabled()) return
  const userId = useAuthStore.getState().user?.id
  if (!userId) throw new Error('Not signed in')

  const { url, key, fields } = await presign('put', assetId, blob.type, blob.size)
  if (!fields) throw new Error('R2 presign did not return POST policy fields')

  // Presigned POST (not PUT): the server-signed policy binds an exact
  // Content-Type and a content-length-range, so R2 rejects a wrong-type or
  // oversize body at upload time — the 200 MB / declared-size cap is enforced
  // here, not merely advised at sign time. The `file` part MUST be appended
  // last; S3/R2 ignore any form field that follows it.
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  form.append('file', blob)

  // fetch() throws (rather than returning a non-OK Response) on CORS rejection,
  // network failure, or timeout. The browser hides CORS detail for security
  // reasons — on a thrown error we name the R2 host and the current origin so
  // the user can fix the bucket CORS policy directly.
  let postRes: Response
  try {
    postRes = await withTimeout(fetch(url, {
      method: 'POST',
      body: form,
    }), ATTEMPT_TIMEOUT_MS)
  } catch (err) {
    const host = (() => { try { return new URL(url).host } catch { return 'r2.cloudflarestorage.com' } })()
    const origin = typeof window !== 'undefined' ? window.location.origin : '<unknown origin>'
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`R2 POST to ${host} failed (${reason}). Likely a CORS misconfiguration — verify the bucket CORS policy allows ${origin} with method POST.`)
  }
  // A successful POST object upload returns 201/204 with no JSON body.
  if (!postRes.ok) {
    const text = await postRes.text().catch(() => '')
    throw new Error(`R2 upload failed (${postRes.status}): ${text || postRes.statusText}`)
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
    throw new Error(`assets row insert failed: ${error.message}`)
  }
}

export async function hasRemoteAssetRow(assetId: string): Promise<boolean> {
  if (!isCloudEnabled()) return false
  const userId = useAuthStore.getState().user?.id
  if (!userId) return false
  const sb = getSupabase()
  const { data } = await sb.from('assets').select('id').eq('id', assetId).maybeSingle()
  return !!data
}

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

export async function downloadAssetFromR2(assetId: string): Promise<Blob | null> {
  if (!isCloudEnabled()) return null
  const userId = useAuthStore.getState().user?.id
  if (!userId) return null

  const sb = getSupabase()
  const { data, error } = await sb.from('assets').select('id, mime_type').eq('id', assetId).maybeSingle()
  if (error || !data) return null

  const { url } = await presign('get', assetId)
  const res = await fetch(url)
  if (!res.ok) return null
  return await res.blob()
}

// Awaited delete of both the `assets` metadata row AND the R2 binary itself.
// The metadata row delete is required (throws on failure). The R2 object
// delete is best-effort — if it fails the user can run the orphan-cleanup
// flow in Settings to sweep it later. We don't want a slow R2 region pinning
// bank deletes to its latency.
export async function deleteAssetFromR2(assetId: string): Promise<void> {
  if (!isCloudEnabled()) return
  const userId = useAuthStore.getState().user?.id
  if (!userId) return
  const sb = getSupabase()
  const { error } = await sb.from('assets').delete().eq('id', assetId).eq('user_id', userId)
  if (error) throw new Error(`assets row delete: ${error.message}`)

  try {
    const token = await getAccessToken()
    if (!token) return
    const res = await fetch('/api/r2-delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ assetId }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[r2] R2 object delete failed (${res.status}):`, text || res.statusText)
    }
  } catch (e) {
    console.warn('[r2] R2 object delete network error', e)
  }
}
