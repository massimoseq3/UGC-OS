// Bridges the Zustand stores to Supabase Postgres with a strictly synchronous
// save model. There is no diff-push subscriber, no debounced background pump,
// no persistent retry queue. Each user-initiated change awaits the full
// cloud round trip before reporting success — that's the contract that fixes
// "stuck on syncing" and "refresh loses data".
//
// Public surface:
//   • startCloudSync() / stopCloudSync() — hydrate-on-signin, reset-on-signout
//   • saveRow / deleteRow                — used by bankStore actions
//   • saveProfile                        — used by settingsStore actions
//
// Stores stay localStorage-backed (source of truth in the browser). On
// sign-in we hydrate stores from cloud, replacing local state.

import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'
import { useBankStore } from '../stores/bankStore'
import { useSettingsStore } from '../stores/settingsStore'
import { getSupabase, isCloudEnabled, ensureFreshSession } from './supabase'
import { existingRemoteAssetIds, uploadAssetToR2 } from './r2'
import { isAssetRef, getBlob } from '../utils/assetStore'
import { findOrphanAssets, purgeOrphans } from '../utils/orphanCleanup'
import type { Product, Model, Script, VoicePreset, BRoll, VoiceHistoryItem, VideoHistoryItem, ImageHistoryItem, MusicHistoryItem, CharacterHistoryItem, AdAnatomyHistoryItem } from '../stores/types'

export type BankKey =
  | 'products' | 'models' | 'scripts' | 'voices' | 'brolls'
  | 'voiceHistory' | 'videoHistory' | 'imageHistory' | 'musicHistory'
  | 'characterHistory' | 'adAnatomyHistory'

const BANK_TO_TABLE: Record<BankKey, string> = {
  products: 'products',
  models: 'models',
  scripts: 'scripts',
  voices: 'voices',
  brolls: 'brolls',
  voiceHistory: 'voice_history',
  videoHistory: 'video_history',
  imageHistory: 'image_history',
  musicHistory: 'music_history',
  characterHistory: 'character_history',
  adAnatomyHistory: 'ad_anatomy_history',
}

const BANK_KEYS: BankKey[] = ['products', 'models', 'scripts', 'voices', 'brolls', 'voiceHistory', 'videoHistory', 'imageHistory', 'musicHistory', 'characterHistory', 'adAnatomyHistory']

function reportError(context: string, err: unknown) {
  const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : JSON.stringify(err))
  console.error(`[cloudSync] ${context}:`, err)
  try { useAppStore.getState().addToast(`Cloud — ${context}: ${msg}`, 'error') } catch { /* store not ready */ }
}

function walkAssetRefs(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (isAssetRef(value)) out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const v of value) walkAssetRefs(v, out)
    return out
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) walkAssetRefs(v, out)
  }
  return out
}

// ── Public mutation helpers ─────────────────────────────────────────

// Save one bank row. Awaited. Throws on failure so callers can react.
export async function saveRow(table: BankKey, row: { id: string }): Promise<void> {
  const userId = useAuthStore.getState().user?.id
  if (!userId) throw new Error('Not signed in')
  await ensureFreshSession()
  const sb = getSupabase()
  const { error } = await sb.from(BANK_TO_TABLE[table]).upsert({
    id: row.id,
    user_id: userId,
    data: row,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`${BANK_TO_TABLE[table]} upsert: ${error.message}`)
}

// Bulk variant — kept for callers that need batched writes. Sequential per
// table to keep error reporting clean.
export async function saveRows(table: BankKey, rows: Array<{ id: string }>): Promise<void> {
  if (rows.length === 0) return
  const userId = useAuthStore.getState().user?.id
  if (!userId) throw new Error('Not signed in')
  await ensureFreshSession()
  const sb = getSupabase()
  const isoNow = new Date().toISOString()
  const { error } = await sb.from(BANK_TO_TABLE[table]).upsert(rows.map((r) => ({
    id: r.id,
    user_id: userId,
    data: r,
    updated_at: isoNow,
  })))
  if (error) throw new Error(`${BANK_TO_TABLE[table]} bulk upsert: ${error.message}`)
}

// Delete one bank row. Awaited.
export async function deleteRow(table: BankKey, id: string): Promise<void> {
  const userId = useAuthStore.getState().user?.id
  if (!userId) throw new Error('Not signed in')
  await ensureFreshSession()
  const sb = getSupabase()
  const { error } = await sb.from(BANK_TO_TABLE[table]).delete().eq('id', id).eq('user_id', userId)
  if (error) throw new Error(`${BANK_TO_TABLE[table]} delete: ${error.message}`)
}

// Save the profile sheet (per-app model selections only). The kie.ai API key
// is intentionally NOT included here — it lives in browser localStorage only,
// never in the database. See CLAUDE.md "Auth + cloud sync".
export async function saveProfile(): Promise<void> {
  const userId = useAuthStore.getState().user?.id
  if (!userId) throw new Error('Not signed in')
  await ensureFreshSession()
  const sb = getSupabase()
  const s = useSettingsStore.getState()
  const { error } = await sb.from('profiles').update({
    per_app_model: s.perAppModel,
  }).eq('id', userId)
  if (error) throw new Error(`profile update: ${error.message}`)
}

// ── Hydrate / startup ──────────────────────────────────────────────

async function hydrateFromCloud(userId: string) {
  const sb = getSupabase()

  const { data: profile } = await sb
    .from('profiles')
    .select('per_app_model')
    .eq('id', userId)
    .maybeSingle()

  if (profile) {
    // kieApiKey is browser-local; preserve whatever loadFromStorage already
    // hydrated from localStorage. Cloud hydration only refreshes perAppModel.
    const existingKey = useSettingsStore.getState().kieApiKey
    const nextPerAppModel = (profile.per_app_model as Record<string, string> | null) ?? {}
    useSettingsStore.setState({ perAppModel: nextPerAppModel })
    try {
      localStorage.setItem('ai-ugc-lab-settings', JSON.stringify({
        kieApiKey: existingKey,
        perAppModel: nextPerAppModel,
      }))
    } catch { /* ignore */ }
  }

  const tables = await Promise.all(
    BANK_KEYS.map(async (key) => {
      const table = BANK_TO_TABLE[key]
      const { data, error } = await sb.from(table).select('id, data').eq('user_id', userId)
      if (error) {
        reportError(`hydrate ${table}`, error)
        return [key, [] as unknown[]] as const
      }
      const items = (data ?? []).map((row) => row.data as unknown)
      return [key, items] as const
    }),
  )

  const next: Partial<Record<BankKey, unknown[]>> = {}
  for (const [key, items] of tables) next[key] = items

  useBankStore.setState({
    products: (next.products as Product[]) ?? [],
    models: (next.models as Model[]) ?? [],
    scripts: (next.scripts as Script[]) ?? [],
    voices: (next.voices as VoicePreset[]) ?? [],
    brolls: (next.brolls as BRoll[]) ?? [],
    voiceHistory: (next.voiceHistory as VoiceHistoryItem[]) ?? [],
    videoHistory: (next.videoHistory as VideoHistoryItem[]) ?? [],
    imageHistory: (next.imageHistory as ImageHistoryItem[]) ?? [],
    musicHistory: (next.musicHistory as MusicHistoryItem[]) ?? [],
    characterHistory: (next.characterHistory as CharacterHistoryItem[]) ?? [],
    adAnatomyHistory: (next.adAnatomyHistory as AdAnatomyHistoryItem[]) ?? [],
  })

  try {
    const s = useBankStore.getState()
    localStorage.setItem('ai-ugc-lab-banks', JSON.stringify({
      products: s.products, models: s.models,
      scripts: s.scripts, voices: s.voices, brolls: s.brolls,
      voiceHistory: s.voiceHistory, videoHistory: s.videoHistory,
      imageHistory: s.imageHistory, musicHistory: s.musicHistory,
      scriptHistory: s.scriptHistory, brollHistory: s.brollHistory,
      characterHistory: s.characterHistory,
      adAnatomyHistory: s.adAnatomyHistory,
    }))
  } catch { /* ignore */ }
}

// First cloud login on this browser: if the user already has local data and
// the cloud is empty, push everything up before subscribing to changes.
async function shouldUploadLocalSnapshot(userId: string): Promise<boolean> {
  const flag = `ugc-lab:cloud-migrated:${userId}`
  if (localStorage.getItem(flag)) return false

  const sb = getSupabase()
  const checks = await Promise.all(
    BANK_KEYS.map((k) => sb.from(BANK_TO_TABLE[k]).select('id', { count: 'exact', head: true }).eq('user_id', userId)),
  )
  const cloudHasAny = checks.some((r) => (r.count ?? 0) > 0)
  if (cloudHasAny) {
    localStorage.setItem(flag, '1')
    return false
  }

  const localState = useBankStore.getState()
  const localHasAny = BANK_KEYS.some((k) => (localState[k] as unknown[]).length > 0)
  return localHasAny
}

async function uploadEntireSnapshot(userId: string) {
  const state = useBankStore.getState()

  // First, walk all bank items for asset refs and upload any missing blobs to
  // R2. We do this BEFORE writing rows so other devices never see a row that
  // points at a missing asset.
  const allRefs = new Set<string>()
  for (const key of BANK_KEYS) {
    const arr = state[key] as Array<{ id: string }>
    for (const item of arr) for (const r of walkAssetRefs(item)) allRefs.add(r)
  }
  if (allRefs.size > 0) {
    const refList = Array.from(allRefs)
    const remote = await existingRemoteAssetIds(refList)
    for (const ref of refList) {
      if (remote.has(ref)) continue
      const blob = await getBlob(ref).catch(() => null)
      if (!blob) continue
      try { await uploadAssetToR2(ref, blob) } catch (e) {
        console.warn('[cloudSync] initial asset upload failed for', ref, e)
      }
    }
  }

  // Now push all bank rows.
  for (const key of BANK_KEYS) {
    const items = state[key] as Array<{ id: string }>
    if (items.length === 0) continue
    try {
      await saveRows(key, items)
    } catch (e) { reportError(`initial upload of ${BANK_TO_TABLE[key]}`, e) }
  }

  try { await saveProfile() } catch (e) { reportError('initial profile upload', e) }

  localStorage.setItem(`ugc-lab:cloud-migrated:${userId}`, '1')
}

// After hydrate: walk any local asset blobs that aren't yet in R2 and upload
// them. Recovers users who had partial-state from prior buggy sessions.
async function reconcileAssets() {
  const state = useBankStore.getState()
  const allRefs = new Set<string>()
  for (const key of BANK_KEYS) {
    const arr = state[key] as Array<{ id: string }>
    for (const item of arr) for (const r of walkAssetRefs(item)) allRefs.add(r)
  }
  if (allRefs.size === 0) return

  const refList = Array.from(allRefs)
  const remoteSet = await existingRemoteAssetIds(refList)

  let recovered = 0
  let lost = 0
  for (const ref of refList) {
    if (remoteSet.has(ref)) continue
    const blob = await getBlob(ref).catch(() => null)
    if (blob) {
      try {
        await uploadAssetToR2(ref, blob)
        recovered++
      } catch (e) {
        console.warn('[cloudSync] reconcile upload failed for', ref, e)
      }
    } else {
      lost++
    }
  }

  if (recovered > 0) {
    console.log(`[cloudSync] recovered ${recovered} asset(s) to R2`)
  }
  if (lost > 0) {
    console.warn(`[cloudSync] ${lost} asset(s) couldn't be recovered (missing locally and in cloud)`)
  }
}

// Once-per-session orphan sweep. Runs after hydrate so the bank state is
// accurate. Logs results to the console; no UI noise — users who care can
// see exact counts via Settings → Storage.
async function sweepOrphansInBackground(): Promise<void> {
  try {
    const { orphans, totalBytes } = await findOrphanAssets()
    if (orphans.length === 0) return
    console.log(`[cloudSync] sweeping ${orphans.length} orphan asset(s) (~${(totalBytes / 1024 / 1024).toFixed(1)} MB)`)
    const result = await purgeOrphans(orphans.map((o) => o.id))
    console.log(`[cloudSync] orphan sweep done: ${result.ok} cleaned, ${result.failed.length} failed`)
  } catch (e) {
    console.warn('[cloudSync] sweepOrphansInBackground threw', e)
  }
}

let started = false

export async function startCloudSync() {
  if (!isCloudEnabled()) {
    console.log('[cloudSync] disabled — Supabase env vars not set')
    return
  }
  if (started) return
  const userId = useAuthStore.getState().user?.id
  if (!userId) return

  started = true
  console.log('[cloudSync] starting for user', userId)

  try {
    if (await shouldUploadLocalSnapshot(userId)) {
      console.log('[cloudSync] uploading local snapshot to cloud (first login)')
      await uploadEntireSnapshot(userId)
    }
    await hydrateFromCloud(userId)
    console.log('[cloudSync] hydrated from cloud')

    // Stamp last_active_at so the admin members table can show "last seen"
    // instead of just join date. Fire-and-forget — failure isn't worth
    // surfacing to the user.
    getSupabase()
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', userId)
      .then(({ error }) => { if (error) console.warn('[cloudSync] last_active_at update failed', error) })

    // Best-effort recovery — don't block startup on this.
    reconcileAssets().catch((e) => console.warn('[cloudSync] reconcile failed', e))

    // Sweep orphan assets in the background. Most users will never click the
    // manual cleanup button; this keeps storage tidy without bothering them.
    sweepOrphansInBackground().catch((e) => console.warn('[cloudSync] orphan sweep failed', e))
  } catch (e) {
    reportError('startup', e)
    started = false
  }
}

export function stopCloudSync() {
  started = false
}
