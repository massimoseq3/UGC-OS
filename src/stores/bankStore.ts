import { create } from 'zustand'
import type { Product, Model, Script, VoicePreset, BRoll, VoiceHistoryItem, VideoHistoryItem, ImageHistoryItem, MusicHistoryItem, ScriptHistoryItem, BrollHistoryItem, CharacterHistoryItem, AdAnatomyHistoryItem } from './types'
import { isAssetRef, deleteAsset, saveFromDataUrl } from '../utils/assetStore'
import { useAuthStore } from './authStore'
import { isCloudEnabled } from '../lib/supabase'
import { saveRow, deleteRow, recordPendingUpsert, recordPendingDelete, clearPending, scheduleOutboxDrain, type BankKey } from '../lib/cloudSync'
import { useAppStore } from './appStore'

const STORAGE_KEY = 'ai-ugc-lab-banks'
const MIGRATION_FLAG = 'ai-ugc-lab-migrated-v2'

const BROLL_HISTORY_CAP = 50

type BankActionResult = void

interface BankState {
  products: Product[]
  models: Model[]
  scripts: Script[]
  voices: VoicePreset[]
  brolls: BRoll[]
  voiceHistory: VoiceHistoryItem[]
  videoHistory: VideoHistoryItem[]
  imageHistory: ImageHistoryItem[]
  musicHistory: MusicHistoryItem[]
  scriptHistory: ScriptHistoryItem[]
  brollHistory: BrollHistoryItem[]
  characterHistory: CharacterHistoryItem[]
  adAnatomyHistory: AdAnatomyHistoryItem[]

  // Product CRUD
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => Promise<string>
  updateProduct: (id: string, updates: Partial<Product>) => Promise<BankActionResult>
  deleteProduct: (id: string) => Promise<BankActionResult>
  getProductById: (id: string) => Product | undefined

  // Model CRUD
  addModel: (model: Omit<Model, 'id' | 'createdAt'>) => Promise<BankActionResult>
  updateModel: (id: string, updates: Partial<Model>) => Promise<BankActionResult>
  deleteModel: (id: string) => Promise<BankActionResult>
  getModelById: (id: string) => Model | undefined

  // Script CRUD
  addScript: (script: Omit<Script, 'id' | 'createdAt'>) => Promise<BankActionResult>
  updateScript: (id: string, updates: Partial<Script>) => Promise<BankActionResult>
  deleteScript: (id: string) => Promise<BankActionResult>
  getScriptById: (id: string) => Script | undefined

  // Voice CRUD
  addVoice: (voice: Omit<VoicePreset, 'id' | 'createdAt'>) => Promise<BankActionResult>
  updateVoice: (id: string, updates: Partial<VoicePreset>) => Promise<BankActionResult>
  deleteVoice: (id: string) => Promise<BankActionResult>
  getVoiceById: (id: string) => VoicePreset | undefined

  // B-Roll CRUD
  addBRoll: (broll: Omit<BRoll, 'id' | 'createdAt'>) => Promise<string>
  updateBRoll: (id: string, updates: Partial<BRoll>) => Promise<BankActionResult>
  deleteBRoll: (id: string) => Promise<BankActionResult>
  getBRollById: (id: string) => BRoll | undefined

  // Voice History
  addVoiceHistory: (item: VoiceHistoryItem) => Promise<BankActionResult>
  deleteVoiceHistory: (id: string) => Promise<BankActionResult>
  clearVoiceHistory: () => Promise<BankActionResult>

  // Video History (B-Roll Videos)
  addVideoHistory: (item: VideoHistoryItem) => Promise<BankActionResult>
  updateVideoHistory: (id: string, updates: Partial<VideoHistoryItem>) => Promise<BankActionResult>
  deleteVideoHistory: (id: string) => Promise<BankActionResult>
  clearVideoHistory: () => Promise<BankActionResult>

  // Image History (Playground)
  addImageHistory: (item: ImageHistoryItem) => Promise<BankActionResult>
  updateImageHistory: (id: string, updates: Partial<ImageHistoryItem>) => Promise<BankActionResult>
  deleteImageHistory: (id: string) => Promise<BankActionResult>
  clearImageHistory: () => Promise<BankActionResult>

  // Music History (Playground)
  addMusicHistory: (item: MusicHistoryItem) => Promise<BankActionResult>
  updateMusicHistory: (id: string, updates: Partial<MusicHistoryItem>) => Promise<BankActionResult>
  deleteMusicHistory: (id: string) => Promise<BankActionResult>
  clearMusicHistory: () => Promise<BankActionResult>

  // Script History (Scripts tab) — local-only
  addScriptHistory: (item: ScriptHistoryItem) => Promise<BankActionResult>
  deleteScriptHistory: (id: string) => Promise<BankActionResult>
  clearScriptHistory: () => Promise<BankActionResult>

  // B-Roll History (Scenes sessions) — local-only
  upsertBrollHistory: (item: BrollHistoryItem) => Promise<BankActionResult>
  deleteBrollHistory: (id: string) => Promise<BankActionResult>
  clearBrollHistory: () => Promise<BankActionResult>
  getBrollHistoryById: (id: string) => BrollHistoryItem | undefined

  // Character History (Characters tab)
  addCharacterHistory: (item: CharacterHistoryItem) => Promise<BankActionResult>
  updateCharacterHistory: (id: string, updates: Partial<CharacterHistoryItem>) => Promise<BankActionResult>
  deleteCharacterHistory: (id: string) => Promise<BankActionResult>
  clearCharacterHistory: () => Promise<BankActionResult>

  // Ad Anatomy History (Ad Analyzer)
  addAdAnatomyHistory: (item: AdAnatomyHistoryItem) => Promise<BankActionResult>
  updateAdAnatomyHistory: (id: string, updates: Partial<AdAnatomyHistoryItem>) => Promise<BankActionResult>
  deleteAdAnatomyHistory: (id: string) => Promise<BankActionResult>
  clearAdAnatomyHistory: () => Promise<BankActionResult>
  getAdAnatomyHistoryById: (id: string) => AdAnatomyHistoryItem | undefined
}

function generateId(): string {
  return crypto.randomUUID()
}

type BankData = Pick<BankState, 'products' | 'models' | 'scripts' | 'voices' | 'brolls' | 'voiceHistory' | 'videoHistory' | 'imageHistory' | 'musicHistory' | 'scriptHistory' | 'brollHistory' | 'characterHistory' | 'adAnatomyHistory'>

function migrateVoiceShape<T>(arr: unknown): T[] {
  if (!Array.isArray(arr)) return []
  return arr
    .filter((v) => v && typeof v === 'object' && 'voiceId' in v && typeof v.voiceId === 'string')
    .map((v) => {
      const item = { ...(v as Record<string, unknown>) }
      delete item.creativity
      delete item.ambience
      delete item.styleInstructions
      if (typeof item.stability !== 'number') item.stability = 0.5
      if (typeof item.similarityBoost !== 'number') item.similarityBoost = 0.75
      if (typeof item.style !== 'number') item.style = 0
      if (typeof item.speed !== 'number') item.speed = 1
      return item as unknown as T
    })
}

const EMPTY_BANKS: BankData = {
  products: [],
  models: [],
  scripts: [],
  voices: [],
  brolls: [],
  voiceHistory: [],
  videoHistory: [],
  imageHistory: [],
  musicHistory: [],
  scriptHistory: [],
  brollHistory: [],
  characterHistory: [],
  adAnatomyHistory: [],
}

// Wipe the in-memory bank state and the localStorage snapshot. Called on
// sign-out so a different user signing in on the same browser can't see
// the previous user's data through a pre-hydration window or an offline reload.
export function resetBankStore(): void {
  pendingSave = null
  saveScheduled = false
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  useBankStore.setState(EMPTY_BANKS)
}

function loadFromStorage(): BankData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        products: parsed.products ?? [],
        models: parsed.models ?? [],
        scripts: parsed.scripts ?? [],
        voices: migrateVoiceShape<VoicePreset>(parsed.voices),
        brolls: parsed.brolls ?? [],
        voiceHistory: migrateVoiceShape<VoiceHistoryItem>(parsed.voiceHistory),
        videoHistory: Array.isArray(parsed.videoHistory) ? parsed.videoHistory : [],
        imageHistory: Array.isArray(parsed.imageHistory) ? parsed.imageHistory : [],
        musicHistory: Array.isArray(parsed.musicHistory) ? parsed.musicHistory : [],
        scriptHistory: Array.isArray(parsed.scriptHistory) ? parsed.scriptHistory : [],
        brollHistory: Array.isArray(parsed.brollHistory) ? parsed.brollHistory : [],
        characterHistory: Array.isArray(parsed.characterHistory) ? parsed.characterHistory : [],
        adAnatomyHistory: Array.isArray(parsed.adAnatomyHistory) ? parsed.adAnatomyHistory : [],
      }
    }
  } catch {
    /* corrupted — start fresh */
  }
  return { ...EMPTY_BANKS }
}

let pendingSave: BankData | null = null
let saveScheduled = false

function flushSaveToStorage() {
  saveScheduled = false
  if (!pendingSave) return
  const state = pendingSave
  pendingSave = null
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: state.products,
      models: state.models,
      scripts: state.scripts,
      voices: state.voices,
      brolls: state.brolls,
      voiceHistory: state.voiceHistory,
      videoHistory: state.videoHistory,
      imageHistory: state.imageHistory,
      musicHistory: state.musicHistory,
      scriptHistory: state.scriptHistory,
      brollHistory: state.brollHistory,
      characterHistory: state.characterHistory,
      adAnatomyHistory: state.adAnatomyHistory,
    }))
  } catch (error) {
    console.error('Failed to save to storage', error)
  }
}

function saveToStorage(state: BankData) {
  pendingSave = state
  if (saveScheduled) return
  saveScheduled = true
  const schedule = (cb: () => void) => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: unknown) => void }).requestIdleCallback
    if (ric) ric(cb, { timeout: 500 })
    else setTimeout(cb, 0)
  }
  schedule(flushSaveToStorage)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushSaveToStorage)
  window.addEventListener('pagehide', flushSaveToStorage)
}

function cloudActive(): boolean {
  return isCloudEnabled() && !!useAuthStore.getState().user
}

// Backstop timeout for any single cloud round-trip. saveRow/deleteRow are
// internally self-bounding now (two attempts hard-aborted at 6s each, plus
// two 3s-capped session checks ≈ 18s worst case), so in practice they settle
// on their own; this outer guard only exists so a future code path that
// forgets to bound itself can't freeze a save spinner forever. Must stay
// ABOVE the inner worst case or it fires mid-retry.
const CLOUD_SYNC_TIMEOUT_MS = 20_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s — saved on this device; will retry syncing automatically`))
    }, ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

// Cloud-aware single-row save. Awaited; throws on failure or timeout. The row
// is recorded in the persistent outbox first, so a failed/timed-out push is
// replayed on the next drain (startup / tab focus / in-session backoff timer —
// the scheduleOutboxDrain call below is what makes the toast's "will retry
// syncing automatically" true without a refresh).
async function pushRow(table: BankKey, row: { id: string }): Promise<void> {
  if (!cloudActive()) return
  recordPendingUpsert(table, row)
  try {
    await withTimeout(saveRow(table, row), CLOUD_SYNC_TIMEOUT_MS, `Cloud save (${table})`)
  } catch (e) {
    scheduleOutboxDrain()
    throw e
  }
  clearPending(table, row.id)
}

async function dropRow(table: BankKey, id: string): Promise<void> {
  if (!cloudActive()) return
  recordPendingDelete(table, id)
  try {
    await withTimeout(deleteRow(table, id), CLOUD_SYNC_TIMEOUT_MS, `Cloud delete (${table})`)
  } catch (e) {
    scheduleOutboxDrain()
    throw e
  }
  clearPending(table, id)
}

function reportError(prefix: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  try { useAppStore.getState().addToast(`${prefix}: ${msg}`, 'error') } catch { /* ignore */ }
  throw e
}

// Like reportError but doesn't re-throw — used by auto-history writes that
// must keep local state in sync even when the cloud upsert fails (e.g. a
// missing table migration, a transient RLS hiccup, network drop). The
// toast still surfaces the failure so the user knows cloud sync didn't
// land, but the local row is preserved so the gallery doesn't silently
// drop the generation.
function reportErrorSoft(prefix: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  console.warn(`[bankStore] ${prefix}:`, e)
  try { useAppStore.getState().addToast(`${prefix}: ${msg}`, 'error') } catch { /* ignore */ }
}

// Tiny helper so each action can fire one consistent confirmation toast.
function reportSuccess(msg: string) {
  try { useAppStore.getState().addToast(msg, 'success') } catch { /* ignore */ }
}

async function cleanupAssets(...refs: (string | undefined)[]) {
  for (const ref of refs) {
    if (ref && isAssetRef(ref)) {
      try { await deleteAsset(ref) } catch (e) { console.warn('[bankStore] asset delete failed', e) }
    }
  }
}

export const useBankStore = create<BankState>((set, get) => ({
  ...loadFromStorage(),

  // ── Products ─────────────────────────────────────────────────────
  // Every CRUD add/update writes local state BEFORE awaiting the cloud
  // round-trip. If the cloud push hangs or times out, the bank still
  // reflects the user's action — `reportError` then surfaces the failure
  // as a toast and rethrows so callers can react. This is what unblocks
  // the Characters "Save to Bank" spinner when Supabase is unresponsive.
  addProduct: async (product) => {
    const newProduct: Product = { ...product, id: generateId(), createdAt: Date.now() }
    set((state) => {
      const next = { products: [...state.products, newProduct] }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('products', newProduct) } catch (e) { reportError('Save product', e) }
    reportSuccess('Product saved')
    return newProduct.id
  },

  updateProduct: async (id, updates) => {
    const old = get().products.find((p) => p.id === id)
    if (!old) return
    const updated: Product = { ...old, ...updates }
    if (updates.productImage && old.productImage && old.productImage !== updates.productImage) {
      cleanupAssets(old.productImage)
    }
    set((state) => {
      const next = { products: state.products.map((p) => p.id === id ? updated : p) }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('products', updated) } catch (e) { reportError('Update product', e) }
    reportSuccess('Product updated')
  },

  deleteProduct: async (id) => {
    const item = get().products.find((p) => p.id === id)
    if (!item) return
    try { await dropRow('products', id) } catch (e) { reportError('Delete product', e) }
    if (item.productImage) await cleanupAssets(item.productImage)
    set((state) => {
      const next = { products: state.products.filter((p) => p.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Product deleted')
  },

  getProductById: (id) => get().products.find((p) => p.id === id),

  // ── Models ───────────────────────────────────────────────────────
  addModel: async (model) => {
    const newModel: Model = { ...model, id: generateId(), createdAt: Date.now() }
    set((state) => {
      const next = { models: [...state.models, newModel] }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('models', newModel) } catch (e) { reportError('Save influencer', e) }
    reportSuccess('Influencer saved')
  },

  updateModel: async (id, updates) => {
    const old = get().models.find((m) => m.id === id)
    if (!old) return
    const updated: Model = { ...old, ...updates }
    if (updates.characterImage && old.characterImage && old.characterImage !== updates.characterImage) {
      cleanupAssets(old.characterImage)
    }
    // Replacing an attached sheet: only purge the old blob when no history row
    // still shows it — the gallery tile would otherwise break.
    if (updates.sheetImage && old.sheetImage && old.sheetImage !== updates.sheetImage) {
      const stillInHistory = get().characterHistory.some((h) => h.imageRef === old.sheetImage)
      if (!stillInHistory) cleanupAssets(old.sheetImage)
    }
    set((state) => {
      const next = { models: state.models.map((m) => m.id === id ? updated : m) }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('models', updated) } catch (e) { reportError('Update influencer', e) }
    reportSuccess('Influencer updated')
  },

  deleteModel: async (id) => {
    const item = get().models.find((m) => m.id === id)
    if (!item) return
    try { await dropRow('models', id) } catch (e) { reportError('Delete influencer', e) }
    // Keep the blob if a character-history row still references it (e.g. when
    // un-saving a studio influencer — the gallery tile shares this image).
    if (item.characterImage && !get().characterHistory.some((h) => h.imageRef === item.characterImage)) {
      await cleanupAssets(item.characterImage)
    }
    if (item.sheetImage && !get().characterHistory.some((h) => h.imageRef === item.sheetImage)) {
      await cleanupAssets(item.sheetImage)
    }
    set((state) => {
      const next = { models: state.models.filter((m) => m.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Influencer deleted')
  },

  getModelById: (id) => get().models.find((m) => m.id === id),

  // ── Scripts ──────────────────────────────────────────────────────
  addScript: async (script) => {
    const newScript: Script = { ...script, id: generateId(), createdAt: Date.now() }
    set((state) => {
      const next = { scripts: [...state.scripts, newScript] }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('scripts', newScript) } catch (e) { reportError('Save script', e) }
    reportSuccess('Script saved')
  },

  updateScript: async (id, updates) => {
    const old = get().scripts.find((s) => s.id === id)
    if (!old) return
    const updated: Script = { ...old, ...updates }
    set((state) => {
      const next = { scripts: state.scripts.map((s) => s.id === id ? updated : s) }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('scripts', updated) } catch (e) { reportError('Update script', e) }
    reportSuccess('Script updated')
  },

  deleteScript: async (id) => {
    const item = get().scripts.find((s) => s.id === id)
    if (!item) return
    try { await dropRow('scripts', id) } catch (e) { reportError('Delete script', e) }
    set((state) => {
      const next = { scripts: state.scripts.filter((s) => s.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Script deleted')
  },

  getScriptById: (id) => get().scripts.find((s) => s.id === id),

  // ── Voices ───────────────────────────────────────────────────────
  addVoice: async (voice) => {
    const newVoice: VoicePreset = { ...voice, id: generateId(), createdAt: Date.now() }
    set((state) => {
      const next = { voices: [...state.voices, newVoice] }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('voices', newVoice) } catch (e) { reportError('Save voice', e) }
    reportSuccess('Voice saved')
  },

  updateVoice: async (id, updates) => {
    const old = get().voices.find((v) => v.id === id)
    if (!old) return
    const updated: VoicePreset = { ...old, ...updates }
    set((state) => {
      const next = { voices: state.voices.map((v) => v.id === id ? updated : v) }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('voices', updated) } catch (e) { reportError('Update voice', e) }
    reportSuccess('Voice updated')
  },

  deleteVoice: async (id) => {
    const item = get().voices.find((v) => v.id === id)
    if (!item) return
    try { await dropRow('voices', id) } catch (e) { reportError('Delete voice', e) }
    set((state) => {
      const next = { voices: state.voices.filter((v) => v.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Voice deleted')
  },

  getVoiceById: (id) => get().voices.find((v) => v.id === id),

  // ── B-Rolls ──────────────────────────────────────────────────────
  addBRoll: async (broll) => {
    const newBRoll: BRoll = { ...broll, id: generateId(), createdAt: Date.now() }
    set((state) => {
      const next = { brolls: [...state.brolls, newBRoll] }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('brolls', newBRoll) } catch (e) { reportError('Save B-roll', e) }
    reportSuccess('Saved to B-Rolls bank')
    return newBRoll.id
  },

  updateBRoll: async (id, updates) => {
    const old = get().brolls.find((b) => b.id === id)
    if (!old) return
    const updated: BRoll = { ...old, ...updates }
    if (updates.imageUrl && old.imageUrl && old.imageUrl !== updates.imageUrl) {
      cleanupAssets(old.imageUrl)
    }
    set((state) => {
      const next = { brolls: state.brolls.map((b) => b.id === id ? updated : b) }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('brolls', updated) } catch (e) { reportError('Update B-roll', e) }
    reportSuccess('B-roll updated')
  },

  deleteBRoll: async (id) => {
    const item = get().brolls.find((b) => b.id === id)
    if (!item) return
    try { await dropRow('brolls', id) } catch (e) { reportError('Delete B-roll', e) }
    if (item) {
      await cleanupAssets(item.imageUrl, item.videoUrl)
      if (item.videos) {
        for (const v of item.videos) await cleanupAssets(v.url)
      }
    }
    set((state) => {
      const next = { brolls: state.brolls.filter((b) => b.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('B-roll deleted')
  },

  getBRollById: (id) => get().brolls.find((b) => b.id === id),

  // ── Voice History ────────────────────────────────────────────────
  // Local set() runs first so the gallery updates synchronously; the cloud
  // upsert is fired in the background. A hung Supabase call must never block
  // localStorage from being written or the row would be lost on reload after
  // hydrateFromCloud replaces local state with what's on the server.
  addVoiceHistory: async (item) => {
    set((state) => {
      const next = { voiceHistory: [item, ...state.voiceHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('voiceHistory', item) } catch (e) { reportErrorSoft('Save voice history', e) }
  },

  deleteVoiceHistory: async (id) => {
    const item = get().voiceHistory.find((h) => h.id === id)
    if (!item) return
    try { await dropRow('voiceHistory', id) } catch (e) { reportErrorSoft('Delete voice history', e) }
    if (item.audioUrl) await cleanupAssets(item.audioUrl)
    set((state) => {
      const next = { voiceHistory: state.voiceHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Voiceover removed from history')
  },

  clearVoiceHistory: async () => {
    const items = get().voiceHistory
    if (cloudActive()) {
      for (const item of items) {
        try { await dropRow('voiceHistory', item.id) } catch (e) { console.warn('clear voice history', e) }
      }
    }
    for (const item of items) await cleanupAssets(item.audioUrl)
    set((state) => {
      const next = { voiceHistory: [] as VoiceHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Voice history cleared')
  },

  // ── Video History ────────────────────────────────────────────────
  addVideoHistory: async (item) => {
    set((state) => {
      const next = { videoHistory: [item, ...state.videoHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('videoHistory', item) } catch (e) { reportErrorSoft('Save video history', e) }
  },

  updateVideoHistory: async (id, updates) => {
    const old = get().videoHistory.find((h) => h.id === id)
    if (!old) return
    const updated: VideoHistoryItem = { ...old, ...updates }
    set((state) => {
      const next = { videoHistory: state.videoHistory.map((h) => h.id === id ? updated : h) }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('videoHistory', updated) } catch (e) { reportErrorSoft('Update video history', e) }
  },

  deleteVideoHistory: async (id) => {
    const item = get().videoHistory.find((h) => h.id === id)
    if (!item) return
    try { await dropRow('videoHistory', id) } catch (e) { reportErrorSoft('Delete video history', e) }
    if (!item.linkedBRollId) await cleanupAssets(item.videoUrl, item.thumbnailUrl)
    set((state) => {
      const next = { videoHistory: state.videoHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Video removed from history')
  },

  clearVideoHistory: async () => {
    const items = get().videoHistory
    if (cloudActive()) {
      for (const item of items) {
        try { await dropRow('videoHistory', item.id) } catch (e) { console.warn('clear video history', e) }
      }
    }
    for (const item of items) {
      if (!item.linkedBRollId) await cleanupAssets(item.videoUrl, item.thumbnailUrl)
    }
    set((state) => {
      const next = { videoHistory: [] as VideoHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Video history cleared')
  },

  // ── Image History (Playground) ──────────────────────────────────
  addImageHistory: async (item) => {
    set((state) => {
      const next = { imageHistory: [item, ...state.imageHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('imageHistory', item) } catch (e) { reportErrorSoft('Save image history', e) }
  },

  updateImageHistory: async (id, updates) => {
    const old = get().imageHistory.find((h) => h.id === id)
    if (!old) return
    const updated: ImageHistoryItem = { ...old, ...updates }
    set((state) => {
      const next = { imageHistory: state.imageHistory.map((h) => h.id === id ? updated : h) }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('imageHistory', updated) } catch (e) { reportErrorSoft('Update image history', e) }
  },

  deleteImageHistory: async (id) => {
    const item = get().imageHistory.find((h) => h.id === id)
    if (!item) return
    try { await dropRow('imageHistory', id) } catch (e) { reportErrorSoft('Delete image history', e) }
    // Only purge the asset blob if the image isn't saved to a BRoll record
    // — saved entries reference the same `imageUrl`, and the BRoll owns it.
    if (!item.linkedBRollId) await cleanupAssets(item.imageUrl)
    set((state) => {
      const next = { imageHistory: state.imageHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Image removed from history')
  },

  clearImageHistory: async () => {
    const items = get().imageHistory
    if (cloudActive()) {
      for (const item of items) {
        try { await dropRow('imageHistory', item.id) } catch (e) { console.warn('clear image history', e) }
      }
    }
    for (const item of items) {
      if (!item.linkedBRollId) await cleanupAssets(item.imageUrl)
    }
    set((state) => {
      const next = { imageHistory: [] as ImageHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Image history cleared')
  },

  // ── Music History (Playground) ──────────────────────────────────
  addMusicHistory: async (item) => {
    set((state) => {
      const next = { musicHistory: [item, ...state.musicHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('musicHistory', item) } catch (e) { reportErrorSoft('Save music history', e) }
  },

  updateMusicHistory: async (id, updates) => {
    const old = get().musicHistory.find((h) => h.id === id)
    if (!old) return
    const updated: MusicHistoryItem = { ...old, ...updates }
    set((state) => {
      const next = { musicHistory: state.musicHistory.map((h) => h.id === id ? updated : h) }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('musicHistory', updated) } catch (e) { reportErrorSoft('Update music history', e) }
  },

  deleteMusicHistory: async (id) => {
    const item = get().musicHistory.find((h) => h.id === id)
    if (!item) return
    try { await dropRow('musicHistory', id) } catch (e) { reportErrorSoft('Delete music history', e) }
    await cleanupAssets(item.audioRef, item.coverImageRef)
    set((state) => {
      const next = { musicHistory: state.musicHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Track removed from history')
  },

  clearMusicHistory: async () => {
    const items = get().musicHistory
    if (cloudActive()) {
      for (const item of items) {
        try { await dropRow('musicHistory', item.id) } catch (e) { console.warn('clear music history', e) }
      }
    }
    for (const item of items) await cleanupAssets(item.audioRef, item.coverImageRef)
    set((state) => {
      const next = { musicHistory: [] as MusicHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Music history cleared')
  },

  // ── Script History (Scripts tab) — local-only ────────────────────
  addScriptHistory: async (item) => {
    set((state) => {
      const next = { scriptHistory: [item, ...state.scriptHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
  },

  deleteScriptHistory: async (id) => {
    set((state) => {
      const next = { scriptHistory: state.scriptHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Script removed from history')
  },

  clearScriptHistory: async () => {
    set((state) => {
      const next = { scriptHistory: [] as ScriptHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Script history cleared')
  },

  // ── B-Roll History (Scenes sessions) — local-only ────────────────
  // Upsert by id. Keeps the entry at the head of the list (most-recent first)
  // so an in-flight session sits at the top even as cardStates mutate. FIFO
  // capped at BROLL_HISTORY_CAP — drops the oldest entries past the cap.
  upsertBrollHistory: async (item) => {
    set((state) => {
      const filtered = state.brollHistory.filter((h) => h.id !== item.id)
      const capped = [item, ...filtered].slice(0, BROLL_HISTORY_CAP)
      const next = { brollHistory: capped }
      saveToStorage({ ...state, ...next })
      return next
    })
  },

  deleteBrollHistory: async (id) => {
    set((state) => {
      const next = { brollHistory: state.brollHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Session removed from history')
  },

  clearBrollHistory: async () => {
    set((state) => {
      const next = { brollHistory: [] as BrollHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('B-Roll history cleared')
  },

  getBrollHistoryById: (id) => get().brollHistory.find((h) => h.id === id),

  // ── Character History (Characters tab) ──────────────────────────
  addCharacterHistory: async (item) => {
    set((state) => {
      const next = { characterHistory: [item, ...state.characterHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('characterHistory', item) } catch (e) { reportErrorSoft('Save influencer history', e) }
  },

  updateCharacterHistory: async (id, updates) => {
    const old = get().characterHistory.find((h) => h.id === id)
    if (!old) return
    const updated: CharacterHistoryItem = { ...old, ...updates }
    set((state) => {
      const next = { characterHistory: state.characterHistory.map((h) => h.id === id ? updated : h) }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('characterHistory', updated) } catch (e) { reportErrorSoft('Update influencer history', e) }
  },

  deleteCharacterHistory: async (id) => {
    const item = get().characterHistory.find((h) => h.id === id)
    if (!item) return
    try { await dropRow('characterHistory', id) } catch (e) { reportErrorSoft('Delete influencer history', e) }
    // Only purge the asset blob if it isn't referenced by a saved Model.
    // The Model owns the image once saved; the history row is just an index.
    if (!item.linkedModelId) await cleanupAssets(item.imageRef)
    set((state) => {
      const next = { characterHistory: state.characterHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Influencer removed from history')
  },

  clearCharacterHistory: async () => {
    const items = get().characterHistory
    if (cloudActive()) {
      for (const item of items) {
        try { await dropRow('characterHistory', item.id) } catch (e) { console.warn('clear character history', e) }
      }
    }
    for (const item of items) {
      if (!item.linkedModelId) await cleanupAssets(item.imageRef)
    }
    set((state) => {
      const next = { characterHistory: [] as CharacterHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Influencer history cleared')
  },

  // ── Ad Anatomy History (Ad Analyzer) ────────────────────────────
  addAdAnatomyHistory: async (item) => {
    set((state) => {
      const next = { adAnatomyHistory: [item, ...state.adAnatomyHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('adAnatomyHistory', item) } catch (e) { reportErrorSoft('Save ad analysis', e) }
  },

  updateAdAnatomyHistory: async (id, updates) => {
    const old = get().adAnatomyHistory.find((h) => h.id === id)
    if (!old) return
    const updated: AdAnatomyHistoryItem = { ...old, ...updates }
    set((state) => {
      const next = { adAnatomyHistory: state.adAnatomyHistory.map((h) => h.id === id ? updated : h) }
      saveToStorage({ ...state, ...next })
      return next
    })
    try { await pushRow('adAnatomyHistory', updated) } catch (e) { reportErrorSoft('Update ad analysis', e) }
  },

  deleteAdAnatomyHistory: async (id) => {
    const item = get().adAnatomyHistory.find((h) => h.id === id)
    if (!item) return
    try { await dropRow('adAnatomyHistory', id) } catch (e) { reportErrorSoft('Delete ad analysis', e) }
    await cleanupAssets(item.thumbnailRef, item.uploadedRef)
    set((state) => {
      const next = { adAnatomyHistory: state.adAnatomyHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Analysis removed from history')
  },

  clearAdAnatomyHistory: async () => {
    const items = get().adAnatomyHistory
    if (cloudActive()) {
      for (const item of items) {
        try { await dropRow('adAnatomyHistory', item.id) } catch (e) { console.warn('clear ad analysis history', e) }
      }
    }
    for (const item of items) await cleanupAssets(item.thumbnailRef, item.uploadedRef)
    set((state) => {
      const next = { adAnatomyHistory: [] as AdAnatomyHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Ad Analyzer history cleared')
  },

  getAdAnatomyHistoryById: (id) => get().adAnatomyHistory.find((h) => h.id === id),
}))

// ── One-time migration: data URLs → IndexedDB asset IDs ─────────────

async function migrateToAssetStore() {
  if (localStorage.getItem(MIGRATION_FLAG)) return

  const state = useBankStore.getState()
  let changed = false

  const migratedProducts = await Promise.all(state.products.map(async (p) => {
    if (p.productImage && p.productImage.startsWith('data:')) {
      try {
        const assetId = await saveFromDataUrl(p.productImage)
        changed = true
        return { ...p, productImage: assetId }
      } catch { return p }
    }
    return p
  }))

  const migratedModels = await Promise.all(state.models.map(async (m) => {
    if (m.characterImage && m.characterImage.startsWith('data:')) {
      try {
        const assetId = await saveFromDataUrl(m.characterImage)
        changed = true
        return { ...m, characterImage: assetId }
      } catch { return m }
    }
    return m
  }))

  const migratedBrolls = await Promise.all(state.brolls.map(async (b) => {
    if (b.imageUrl && b.imageUrl.startsWith('data:')) {
      try {
        const assetId = await saveFromDataUrl(b.imageUrl)
        changed = true
        return { ...b, imageUrl: assetId }
      } catch { return b }
    }
    return b
  }))

  if (changed) {
    useBankStore.setState({
      products: migratedProducts,
      models: migratedModels,
      brolls: migratedBrolls,
    })
    saveToStorage({
      ...useBankStore.getState(),
      products: migratedProducts,
      models: migratedModels,
      brolls: migratedBrolls,
    })
  }

  localStorage.setItem(MIGRATION_FLAG, '1')
}

migrateToAssetStore()
