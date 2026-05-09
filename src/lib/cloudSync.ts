// Bridges the client-side Zustand stores to Supabase Postgres.
//
// Design:
//  • Stores stay localStorage-backed (source of truth in the browser).
//  • On sign-in we hydrate stores from cloud, replacing local state.
//  • After hydration, we subscribe to store changes and diff-push to cloud.
//  • If the user has local-only data (e.g. they used the app pre-signup)
//    AND the cloud is empty, we upload everything once before subscribing.
//
// We deliberately keep the bank rows shaped close to the existing TS types:
// each bank table stores the full item in `data` JSONB plus extracted
// columns for filtering. That keeps the migration trivial.

import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'
import { useBankStore } from '../stores/bankStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSyncStore } from '../stores/syncStore'
import { getSupabase, isCloudEnabled } from './supabase'
import type { Project, Product, Model, Script, VoicePreset, BRoll, VoiceHistoryItem, VideoHistoryItem } from '../stores/types'

// Surface upsert/hydrate failures in the UI so users (and we) don't have to
// open the console to notice silent drift.
function reportError(context: string, err: unknown) {
  const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : JSON.stringify(err))
  console.error(`[cloudSync] ${context}:`, err)
  try { useAppStore.getState().addToast(`Cloud sync — ${context}: ${msg}`, 'error') } catch { /* store not ready */ }
  try { useSyncStore.getState().setError(`${context}: ${msg}`) } catch { /* store not ready */ }
}

type BankKey = 'projects' | 'products' | 'models' | 'scripts' | 'voices' | 'brolls' | 'voiceHistory' | 'videoHistory'

const BANK_TO_TABLE: Record<BankKey, string> = {
  projects: 'projects',
  products: 'products',
  models: 'models',
  scripts: 'scripts',
  voices: 'voices',
  brolls: 'brolls',
  voiceHistory: 'voice_history',
  videoHistory: 'video_history',
}

const BANK_KEYS: BankKey[] = ['projects', 'products', 'models', 'scripts', 'voices', 'brolls', 'voiceHistory', 'videoHistory']

interface RowShape {
  id: string
  project_ids?: string[]
  data: unknown
}

let started = false
let unsubscribers: Array<() => void> = []
let bankPushTimer: ReturnType<typeof setTimeout> | null = null
let settingsPushTimer: ReturnType<typeof setTimeout> | null = null
const pendingDirty = new Set<BankKey>()
const lastSnapshot: Partial<Record<BankKey, Map<string, string>>> = {}
// Reference equality lets us skip re-stringifying banks whose array didn't
// actually change. Zustand keeps array identity stable on shallow merges,
// so an unrelated state update (e.g. updating products) leaves models, scripts,
// etc. with the same array reference — no diff work needed.
const lastArrayRef: Partial<Record<BankKey, unknown>> = {}

function projectIdsOf(item: unknown): string[] {
  if (item && typeof item === 'object' && 'projectIds' in item) {
    const v = (item as { projectIds?: unknown }).projectIds
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  }
  return []
}

function snapshotBank<T extends { id: string }>(arr: T[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const item of arr) m.set(item.id, JSON.stringify(item))
  return m
}

async function hydrateFromCloud(userId: string) {
  const sb = getSupabase()

  // Profile → settings store
  const { data: profile } = await sb
    .from('profiles')
    .select('kie_api_key, per_app_model, active_project_id')
    .eq('id', userId)
    .maybeSingle()

  if (profile) {
    useSettingsStore.setState({
      kieApiKey: profile.kie_api_key ?? '',
      perAppModel: (profile.per_app_model as Record<string, string> | null) ?? {},
      activeProjectId: (profile.active_project_id as string | null) ?? null,
    })
    // Mirror to localStorage so reloads stay consistent.
    try {
      localStorage.setItem('ai-ugc-lab-settings', JSON.stringify({
        kieApiKey: profile.kie_api_key ?? '',
        perAppModel: profile.per_app_model ?? {},
        activeProjectId: profile.active_project_id ?? null,
      }))
    } catch { /* ignore */ }
  }

  // Banks
  const tables = await Promise.all(
    BANK_KEYS.map(async (key) => {
      const table = BANK_TO_TABLE[key]
      const { data, error } = await sb.from(table).select('id, data, project_ids').eq('user_id', userId)
      if (error) {
        reportError(`hydrate ${table}`, error)
        return [key, [] as unknown[]] as const
      }
      // The full item lives in data; project_ids is denormalised. Trust the
      // jsonb data shape — it's what the app already consumed.
      const items = (data ?? []).map((row) => row.data as unknown)
      return [key, items] as const
    }),
  )

  const next: Partial<Record<BankKey, unknown[]>> = {}
  for (const [key, items] of tables) next[key] = items

  useBankStore.setState({
    projects: (next.projects as Project[]) ?? [],
    products: (next.products as Product[]) ?? [],
    models: (next.models as Model[]) ?? [],
    scripts: (next.scripts as Script[]) ?? [],
    voices: (next.voices as VoicePreset[]) ?? [],
    brolls: (next.brolls as BRoll[]) ?? [],
    voiceHistory: (next.voiceHistory as VoiceHistoryItem[]) ?? [],
    videoHistory: (next.videoHistory as VideoHistoryItem[]) ?? [],
  })

  // Mirror to localStorage so the offline cache lines up.
  try {
    const s = useBankStore.getState()
    localStorage.setItem('ai-ugc-lab-banks', JSON.stringify({
      projects: s.projects, products: s.products, models: s.models,
      scripts: s.scripts, voices: s.voices, brolls: s.brolls,
      voiceHistory: s.voiceHistory, videoHistory: s.videoHistory,
    }))
  } catch { /* ignore */ }

  // Snapshot current state so the subscriber's first diff is empty.
  for (const key of BANK_KEYS) {
    const arr = useBankStore.getState()[key] as Array<{ id: string }>
    lastSnapshot[key] = snapshotBank(arr)
  }
}

// Returns true if we should push the local snapshot up (first cloud login
// while local has data and cloud is empty). Otherwise false.
async function shouldUploadLocalSnapshot(userId: string): Promise<boolean> {
  const flag = `ugc-lab:cloud-migrated:${userId}`
  if (localStorage.getItem(flag)) return false

  // Cheap check: are any bank tables non-empty for this user?
  const sb = getSupabase()
  const checks = await Promise.all(
    BANK_KEYS.map((k) => sb.from(BANK_TO_TABLE[k]).select('id', { count: 'exact', head: true }).eq('user_id', userId)),
  )
  const cloudHasAny = checks.some((r) => (r.count ?? 0) > 0)
  if (cloudHasAny) {
    localStorage.setItem(flag, '1')
    return false
  }

  // Local has data?
  const localState = useBankStore.getState()
  const localHasAny = BANK_KEYS.some((k) => (localState[k] as unknown[]).length > 0)
  return localHasAny
}

async function uploadEntireSnapshot(userId: string) {
  const sb = getSupabase()
  const state = useBankStore.getState()
  for (const key of BANK_KEYS) {
    const items = state[key] as Array<{ id: string }>
    if (items.length === 0) continue
    const rows: RowShape[] = items.map((item) => ({
      id: item.id,
      project_ids: projectIdsOf(item),
      data: item,
    }))
    const { error } = await sb.from(BANK_TO_TABLE[key]).upsert(rows.map((r) => ({
      ...r,
      user_id: userId,
    })))
    if (error) reportError(`initial upload of ${BANK_TO_TABLE[key]}`, error)
  }
  // Also push profile fields.
  const settings = useSettingsStore.getState()
  await sb.from('profiles').update({
    kie_api_key: settings.kieApiKey || null,
    per_app_model: settings.perAppModel,
    active_project_id: settings.activeProjectId,
  }).eq('id', userId)

  localStorage.setItem(`ugc-lab:cloud-migrated:${userId}`, '1')
}

function scheduleBankPush() {
  if (bankPushTimer) clearTimeout(bankPushTimer)
  bankPushTimer = setTimeout(() => {
    bankPushTimer = null
    flushPending().catch((e) => reportError('flush', e))
  }, 250)
}

async function flushPending() {
  const userId = useAuthStore.getState().user?.id
  if (!userId) return
  const sb = getSupabase()

  const dirty = Array.from(pendingDirty)
  pendingDirty.clear()
  if (dirty.length === 0) return

  useSyncStore.getState().setStatus('syncing')
  let hadError = false

  // Build per-bank work plans first (synchronous, fast), then fire all
  // network calls in parallel. Each bank can have an upsert and/or a delete;
  // we run them concurrently and await the lot.
  const work: Array<PromiseLike<unknown>> = []
  const newSnapshots: Partial<Record<BankKey, Map<string, string>>> = {}
  const isoNow = new Date().toISOString()

  for (const key of dirty) {
    const table = BANK_TO_TABLE[key]
    const arr = useBankStore.getState()[key] as Array<{ id: string }>
    const next = snapshotBank(arr)
    const prev = lastSnapshot[key] ?? new Map()

    const upserts: RowShape[] = []
    for (const [id, json] of next) {
      if (prev.get(id) !== json) {
        const item = arr.find((x) => x.id === id)!
        upserts.push({ id, project_ids: projectIdsOf(item), data: item })
      }
    }
    const deletedIds: string[] = []
    for (const id of prev.keys()) {
      if (!next.has(id)) deletedIds.push(id)
    }

    if (upserts.length > 0) {
      work.push(
        sb.from(table).upsert(upserts.map((r) => ({ ...r, user_id: userId, updated_at: isoNow })))
          .then(({ error }) => { if (error) { reportError(`upsert ${table}`, error); hadError = true } }),
      )
    }
    if (deletedIds.length > 0) {
      work.push(
        sb.from(table).delete().in('id', deletedIds).eq('user_id', userId)
          .then(({ error }) => { if (error) { reportError(`delete ${table}`, error); hadError = true } }),
      )
    }

    newSnapshots[key] = next
  }

  await Promise.all(work)
  for (const key of dirty) lastSnapshot[key] = newSnapshots[key]!

  if (!hadError) useSyncStore.getState().markSynced()
}

async function pushSettingsNow() {
  const userId = useAuthStore.getState().user?.id
  if (!userId) return
  const sb = getSupabase()
  const s = useSettingsStore.getState()
  useSyncStore.getState().setStatus('syncing')
  const { error } = await sb.from('profiles').update({
    kie_api_key: s.kieApiKey || null,
    per_app_model: s.perAppModel,
    active_project_id: s.activeProjectId,
  }).eq('id', userId)
  if (error) reportError('profile update', error)
  else useSyncStore.getState().markSynced()
}

let lastSettingsJson = ''

function startSubscribers() {
  // Banks: only inspect banks whose array reference changed. Zustand keeps
  // identities stable on shallow merges, so an unrelated state update leaves
  // the other banks' arrays untouched and we skip them entirely.
  const u1 = useBankStore.subscribe((state) => {
    let anyDirty = false
    for (const key of BANK_KEYS) {
      const arr = state[key] as Array<{ id: string }>
      if (lastArrayRef[key] === arr) continue
      lastArrayRef[key] = arr

      const prev = lastSnapshot[key]
      // First time seeing this bank — establish the baseline silently.
      if (!prev) { lastSnapshot[key] = snapshotBank(arr); continue }

      // Quick size check first; only stringify if sizes match (rare miss case).
      if (prev.size !== arr.length) {
        pendingDirty.add(key)
        anyDirty = true
        continue
      }
      const snap = snapshotBank(arr)
      let dirty = false
      for (const [id, json] of snap) {
        if (prev.get(id) !== json) { dirty = true; break }
      }
      if (dirty) {
        pendingDirty.add(key)
        anyDirty = true
      }
    }
    if (anyDirty) scheduleBankPush()
  })

  // Settings: any change → debounced push. Uses its own timer so a settings
  // burst can't cancel a pending bank push.
  const u2 = useSettingsStore.subscribe((state) => {
    const json = JSON.stringify({
      kieApiKey: state.kieApiKey,
      perAppModel: state.perAppModel,
      activeProjectId: state.activeProjectId,
    })
    if (json === lastSettingsJson) return
    lastSettingsJson = json
    if (settingsPushTimer) clearTimeout(settingsPushTimer)
    settingsPushTimer = setTimeout(() => { settingsPushTimer = null; pushSettingsNow() }, 250)
  })

  unsubscribers.push(u1, u2)
}

export async function startCloudSync() {
  if (!isCloudEnabled()) {
    console.log('[cloudSync] disabled — Supabase env vars not set')
    useSyncStore.getState().setStatus('disabled')
    return
  }
  if (started) return
  const userId = useAuthStore.getState().user?.id
  if (!userId) {
    console.log('[cloudSync] skipped — no user id')
    useSyncStore.getState().setStatus('disabled')
    return
  }

  started = true
  console.log('[cloudSync] starting for user', userId)
  useSyncStore.getState().setStatus('starting')

  try {
    // First-login local-snapshot upload (one-shot per user per browser).
    if (await shouldUploadLocalSnapshot(userId)) {
      console.log('[cloudSync] uploading local snapshot to cloud (first login)')
      await uploadEntireSnapshot(userId)
    }

    await hydrateFromCloud(userId)
    console.log('[cloudSync] hydrated from cloud')
  } catch (e) {
    reportError('startup', e)
    started = false
    return
  }

  // Seed the settings json snapshot so the subscriber doesn't echo the
  // hydrate back to the cloud.
  const s = useSettingsStore.getState()
  lastSettingsJson = JSON.stringify({
    kieApiKey: s.kieApiKey,
    perAppModel: s.perAppModel,
    activeProjectId: s.activeProjectId,
  })

  startSubscribers()
  console.log('[cloudSync] subscribers active — bank changes will sync to cloud')
  useSyncStore.getState().markSynced()
}

export function stopCloudSync() {
  for (const u of unsubscribers) u()
  unsubscribers = []
  if (bankPushTimer) clearTimeout(bankPushTimer)
  bankPushTimer = null
  if (settingsPushTimer) clearTimeout(settingsPushTimer)
  settingsPushTimer = null
  pendingDirty.clear()
  for (const k of BANK_KEYS) { delete lastSnapshot[k]; delete lastArrayRef[k] }
  started = false
  useSyncStore.getState().setStatus('disabled')
}
