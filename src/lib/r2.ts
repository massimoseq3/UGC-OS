// Client helpers for the R2 asset pipeline.
//
// We never talk to R2 directly with credentials — `/api/r2-sign` mints a
// presigned URL scoped to the current user, then we PUT/GET against R2 with it.

import { getSupabase, isCloudEnabled } from './supabase'
import { useAuthStore } from '../stores/authStore'

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

// Upload a blob to R2 and register it in the `assets` table. The bank rows
// keep using the same `asset-…` id, so callers don't change.
export async function uploadAssetToR2(assetId: string, blob: Blob): Promise<void> {
  if (!isCloudEnabled()) return
  const userId = useAuthStore.getState().user?.id
  if (!userId) return

  const { url, key } = await presign('put', assetId, blob.type)
  const putRes = await fetch(url, {
    method: 'PUT',
    headers: blob.type ? { 'content-type': blob.type } : {},
    body: blob,
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

export async function deleteAssetFromR2(assetId: string): Promise<void> {
  if (!isCloudEnabled()) return
  const userId = useAuthStore.getState().user?.id
  if (!userId) return

  // We delete the row; the R2 object is left to a future sweeper. For now
  // it's cheap enough to let it sit (R2 is $0.015/GB/mo). When you want
  // hard delete, add a DELETE op to the sign route.
  const sb = getSupabase()
  await sb.from('assets').delete().eq('id', assetId)
}
