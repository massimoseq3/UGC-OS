// Per-user orphan asset cleanup. Walks the user's `assets` table and
// cross-references every `asset-…` ref embedded anywhere in their bank
// rows; anything in the assets table that no bank row references is an
// orphan and gets deleted (IDB + Supabase row + R2 object).
//
// Sound for the signed-in user only — relies on the local bank state being
// fully hydrated from cloud (which startCloudSync guarantees on sign-in).

import { getSupabase, isCloudEnabled } from '../lib/supabase'
import type { BankKey } from '../lib/cloudSync'
import { useAuthStore } from '../stores/authStore'
import { useBankStore } from '../stores/bankStore'
import { deleteAsset, isAssetRef } from './assetStore'

// Every bank that stores `asset-…` refs anywhere in its `data` JSONB. This MUST
// list every bank — a missing entry causes that bank's assets to be wrongly
// classified as orphans and purged on the next cloud sign-in (this previously
// silently deleted imageHistory/musicHistory, then characterHistory gens). The
// `satisfies Record<BankKey, true>` guard forces the compiler to fail if a new
// BankKey is added without listing it here, so the list can't drift again. A
// type-only import of BankKey keeps this free of the cloudSync import cycle.
const BANK_KEYS = Object.keys({
  products: true, models: true, scripts: true, voices: true, brolls: true,
  voiceHistory: true, videoHistory: true, imageHistory: true, musicHistory: true,
  characterHistory: true, adAnatomyHistory: true,
} satisfies Record<BankKey, true>) as BankKey[]

// Local-only banks (NOT cloud BankKeys — see cloudSync) that still embed
// `asset-…` refs in their on-device rows. `brollHistory` snapshots a whole
// B-Roll session (card images + videos) that lives only in localStorage, so
// its assets are referenced by nothing in the cloud bank set above. These MUST
// be walked too or the sweep purges B-Roll card media that wasn't separately
// saved to a bank — leaving a perpetual loading spinner when the session is
// reopened from History. (scriptHistory holds text only, but is listed for
// symmetry / future-proofing.)
const LOCAL_BANK_KEYS = ['brollHistory', 'scriptHistory'] as const

function walkAssetRefs(value: unknown, out: Set<string>) {
  if (typeof value === 'string') {
    if (isAssetRef(value)) out.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const v of value) walkAssetRefs(v, out)
    return
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) walkAssetRefs(v, out)
  }
}

export interface OrphanAsset {
  id: string
  byte_size: number
  mime_type: string
  created_at: string
}

export async function findOrphanAssets(): Promise<{
  orphans: OrphanAsset[]
  totalBytes: number
  // Total cloud-known assets and bytes — useful as denominators in the UI.
  total: number
  totalAssetBytes: number
}> {
  if (!isCloudEnabled()) return { orphans: [], totalBytes: 0, total: 0, totalAssetBytes: 0 }
  const userId = useAuthStore.getState().user?.id
  if (!userId) return { orphans: [], totalBytes: 0, total: 0, totalAssetBytes: 0 }

  const sb = getSupabase()
  const { data, error } = await sb
    .from('assets')
    .select('id, byte_size, mime_type, created_at')
    .eq('user_id', userId)
  if (error) throw new Error(`assets read: ${error.message}`)

  const all = (data ?? []) as OrphanAsset[]
  const totalAssetBytes = all.reduce((s, a) => s + Number(a.byte_size ?? 0), 0)

  const refs = new Set<string>()
  const bankState = useBankStore.getState()
  for (const key of BANK_KEYS) {
    const arr = bankState[key] as unknown[]
    for (const item of arr) walkAssetRefs(item, refs)
  }
  // Also count local-only history banks that embed asset refs (brollHistory),
  // otherwise the sweep deletes B-Roll session media still referenced on-device.
  for (const key of LOCAL_BANK_KEYS) {
    const arr = bankState[key] as unknown[]
    for (const item of arr) walkAssetRefs(item, refs)
  }

  const orphans = all.filter((a) => !refs.has(a.id))
  const totalBytes = orphans.reduce((s, a) => s + Number(a.byte_size ?? 0), 0)
  return { orphans, totalBytes, total: all.length, totalAssetBytes }
}

export async function purgeOrphans(
  ids: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: number; failed: Array<{ id: string; error: string }> }> {
  let ok = 0
  const failed: Array<{ id: string; error: string }> = []
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    try {
      await deleteAsset(id)
      ok++
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : String(e) })
    }
    onProgress?.(i + 1, ids.length)
  }
  return { ok, failed }
}

// Per-user storage cap. Mirrors the same value enforced in api/r2-sign.ts —
// keep them in sync if either ever changes.
export const STORAGE_CAP_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB

// Lightweight aggregate read for the Settings storage bar. Uses the same
// `assets` table read as findOrphanAssets but only returns totals.
export async function getStorageUsage(): Promise<{ totalBytes: number; assetCount: number }> {
  if (!isCloudEnabled()) return { totalBytes: 0, assetCount: 0 }
  const userId = useAuthStore.getState().user?.id
  if (!userId) return { totalBytes: 0, assetCount: 0 }

  const sb = getSupabase()
  const { data, error } = await sb
    .from('assets')
    .select('byte_size')
    .eq('user_id', userId)
  if (error) throw new Error(`storage usage: ${error.message}`)
  const rows = (data ?? []) as Array<{ byte_size: number }>
  return {
    totalBytes: rows.reduce((s, r) => s + Number(r.byte_size ?? 0), 0),
    assetCount: rows.length,
  }
}

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
