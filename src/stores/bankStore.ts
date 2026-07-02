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

  // Star toggle — the four starrable banks share one action. Starred items
  // surface first in the bank pickers.
  toggleStar: (bank: StarrableBank, id: string) => void

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

// Banks whose items can be starred (pinned) by the user.
export type StarrableBank = 'products' | 'models' | 'scripts' | 'brolls'

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
// internally self-bounding (two attempts hard-aborted at 6s each, plus two
// 3s-capped session checks ≈ 18s worst case), so in practice they settle on
// their own; this outer guard only exists so a hung request can't keep a
// background push pending forever (which would pile up retries). The push runs
// in the background now — the user never waits on it — so this is invisible to
// the UI. Must stay ABOVE the inner worst case or it fires mid-retry.
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

// Fire-and-forget cloud push for one bank row. The caller has ALREADY written
// local Zustand state + localStorage synchronously, so the UI must never wait
// on this network round-trip — awaiting it was the 15-20s "save stuck loading,
// then times out" hang. Durability survives without the wait: recordPendingUpsert
// persists the full row to the localStorage outbox synchronously (before the
// first await below), so even if this push fails or the tab closes mid-flight,
// the row is overlaid back onto the next cloud hydrate (applyOutbox) and replayed
// by the scheduled drain. A failure is logged, never toasted — the data is safe
// on this device and syncs on its own. Returns void: there is nothing for a
// caller to await.
function pushRow(table: BankKey, row: { id: string }): void {
  if (!cloudActive()) return
  recordPendingUpsert(table, row)
  void withTimeout(saveRow(table, row), CLOUD_SYNC_TIMEOUT_MS, `Cloud save (${table})`)
    .then(() => clearPending(table, row.id))
    .catch((e) => {
      scheduleOutboxDrain()
      console.warn(`[bankStore] cloud sync deferred — ${table}/${row.id} saved locally, will retry`, e)
    })
}

// Fire-and-forget cloud delete. Same contract as pushRow: the local removal has
// already happened, and recordPendingDelete persists the intent to the outbox
// synchronously so a failed/slow delete can't resurrect the row on the next
// hydrate (applyOutbox replays the deletion).
function dropRow(table: BankKey, id: string): void {
  if (!cloudActive()) return
  recordPendingDelete(table, id)
  void withTimeout(deleteRow(table, id), CLOUD_SYNC_TIMEOUT_MS, `Cloud delete (${table})`)
    .then(() => clearPending(table, id))
    .catch((e) => {
      scheduleOutboxDrain()
      console.warn(`[bankStore] cloud delete deferred — ${table}/${id} removed locally, will retry`, e)
    })
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
  // Every add/update/delete writes local Zustand state + localStorage FIRST
  // (synchronously), then kicks the cloud sync in the background via
  // pushRow/dropRow. The UI never waits on the network — the action resolves as
  // soon as the local write lands, and the outbox guarantees the row reaches the
  // cloud eventually. This is what keeps the "Save to Bank" / "Add Product"
  // buttons from hanging when Supabase is slow or unreachable.
  addProduct: async (product) => {
    const newProduct: Product = { ...product, id: generateId(), createdAt: Date.now() }
    set((state) => {
      const next = { products: [...state.products, newProduct] }
      saveToStorage({ ...state, ...next })
      return next
    })
    pushRow('products', newProduct)
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
    pushRow('products', updated)
    reportSuccess('Product updated')
  },

  deleteProduct: async (id) => {
    const item = get().products.find((p) => p.id === id)
    if (!item) return
    set((state) => {
      const next = { products: state.products.filter((p) => p.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('products', id)
    if (item.productImage) void cleanupAssets(item.productImage)
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
    pushRow('models', newModel)
    reportSuccess('Character saved')
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
    pushRow('models', updated)
    reportSuccess('Character updated')
  },

  deleteModel: async (id) => {
    const item = get().models.find((m) => m.id === id)
    if (!item) return
    set((state) => {
      const next = { models: state.models.filter((m) => m.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('models', id)
    // Keep the blob if a character-history row still references it (e.g. when
    // un-saving a studio influencer — the gallery tile shares this image).
    if (item.characterImage && !get().characterHistory.some((h) => h.imageRef === item.characterImage)) {
      void cleanupAssets(item.characterImage)
    }
    if (item.sheetImage && !get().characterHistory.some((h) => h.imageRef === item.sheetImage)) {
      void cleanupAssets(item.sheetImage)
    }
    reportSuccess('Character deleted')
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
    pushRow('scripts', newScript)
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
    pushRow('scripts', updated)
    reportSuccess('Script updated')
  },

  deleteScript: async (id) => {
    const item = get().scripts.find((s) => s.id === id)
    if (!item) return
    set((state) => {
      const next = { scripts: state.scripts.filter((s) => s.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('scripts', id)
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
    pushRow('voices', newVoice)
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
    pushRow('voices', updated)
    reportSuccess('Voice updated')
  },

  deleteVoice: async (id) => {
    const item = get().voices.find((v) => v.id === id)
    if (!item) return
    set((state) => {
      const next = { voices: state.voices.filter((v) => v.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('voices', id)
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
    pushRow('brolls', newBRoll)
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
    pushRow('brolls', updated)
    reportSuccess('B-roll updated')
  },

  deleteBRoll: async (id) => {
    const item = get().brolls.find((b) => b.id === id)
    if (!item) return
    set((state) => {
      const next = { brolls: state.brolls.filter((b) => b.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('brolls', id)
    void cleanupAssets(item.imageUrl, item.videoUrl)
    if (item.videos) {
      for (const v of item.videos) void cleanupAssets(v.url)
    }
    reportSuccess('B-roll deleted')
  },

  getBRollById: (id) => get().brolls.find((b) => b.id === id),

  // ── Star toggle ──────────────────────────────────────────────────
  // Deliberately silent (no toast): starring is a lightweight pin, not a
  // save-worthy event. Same local-first + background-push contract as the
  // update actions; no asset cleanup is ever involved.
  toggleStar: (bank, id) => {
    const items = get()[bank] as Array<Product | Model | Script | BRoll>
    const old = items.find((item) => item.id === id)
    if (!old) return
    const updated = { ...old, starred: !old.starred }
    set((state) => {
      const nextArr = (state[bank] as Array<{ id: string }>).map((item) => (item.id === id ? updated : item))
      const next = { [bank]: nextArr } as unknown as Partial<BankState>
      saveToStorage({ ...state, ...next })
      return next
    })
    pushRow(bank, updated)
  },

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
    pushRow('voiceHistory', item)
  },

  deleteVoiceHistory: async (id) => {
    const item = get().voiceHistory.find((h) => h.id === id)
    if (!item) return
    set((state) => {
      const next = { voiceHistory: state.voiceHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('voiceHistory', id)
    if (item.audioUrl) void cleanupAssets(item.audioUrl)
    reportSuccess('Voiceover removed from history')
  },

  clearVoiceHistory: async () => {
    const items = get().voiceHistory
    set((state) => {
      const next = { voiceHistory: [] as VoiceHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    for (const item of items) {
      dropRow('voiceHistory', item.id)
      void cleanupAssets(item.audioUrl)
    }
    reportSuccess('Voice history cleared')
  },

  // ── Video History ────────────────────────────────────────────────
  addVideoHistory: async (item) => {
    set((state) => {
      const next = { videoHistory: [item, ...state.videoHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
    pushRow('videoHistory', item)
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
    pushRow('videoHistory', updated)
  },

  deleteVideoHistory: async (id) => {
    const item = get().videoHistory.find((h) => h.id === id)
    if (!item) return
    set((state) => {
      const next = { videoHistory: state.videoHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('videoHistory', id)
    if (!item.linkedBRollId) void cleanupAssets(item.videoUrl, item.thumbnailUrl)
    reportSuccess('Video removed from history')
  },

  clearVideoHistory: async () => {
    const items = get().videoHistory
    set((state) => {
      const next = { videoHistory: [] as VideoHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    for (const item of items) {
      dropRow('videoHistory', item.id)
      if (!item.linkedBRollId) void cleanupAssets(item.videoUrl, item.thumbnailUrl)
    }
    reportSuccess('Video history cleared')
  },

  // ── Image History (Playground) ──────────────────────────────────
  addImageHistory: async (item) => {
    set((state) => {
      const next = { imageHistory: [item, ...state.imageHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
    pushRow('imageHistory', item)
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
    pushRow('imageHistory', updated)
  },

  deleteImageHistory: async (id) => {
    const item = get().imageHistory.find((h) => h.id === id)
    if (!item) return
    set((state) => {
      const next = { imageHistory: state.imageHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('imageHistory', id)
    // Only purge the asset blob if the image isn't saved to a BRoll record
    // — saved entries reference the same `imageUrl`, and the BRoll owns it.
    if (!item.linkedBRollId) void cleanupAssets(item.imageUrl)
    reportSuccess('Image removed from history')
  },

  clearImageHistory: async () => {
    const items = get().imageHistory
    set((state) => {
      const next = { imageHistory: [] as ImageHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    for (const item of items) {
      dropRow('imageHistory', item.id)
      if (!item.linkedBRollId) void cleanupAssets(item.imageUrl)
    }
    reportSuccess('Image history cleared')
  },

  // ── Music History (Playground) ──────────────────────────────────
  addMusicHistory: async (item) => {
    set((state) => {
      const next = { musicHistory: [item, ...state.musicHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
    pushRow('musicHistory', item)
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
    pushRow('musicHistory', updated)
  },

  deleteMusicHistory: async (id) => {
    const item = get().musicHistory.find((h) => h.id === id)
    if (!item) return
    set((state) => {
      const next = { musicHistory: state.musicHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('musicHistory', id)
    void cleanupAssets(item.audioRef, item.coverImageRef)
    reportSuccess('Track removed from history')
  },

  clearMusicHistory: async () => {
    const items = get().musicHistory
    set((state) => {
      const next = { musicHistory: [] as MusicHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    for (const item of items) {
      dropRow('musicHistory', item.id)
      void cleanupAssets(item.audioRef, item.coverImageRef)
    }
    reportSuccess('Music history cleared')
  },

  // ── Script History (Scripts tab) ─────────────────────────────────
  // Cloud-synced like every other history bank so it survives browser
  // storage eviction (Safari ITP's 7-day sweep, "clear site data", etc.).
  addScriptHistory: async (item) => {
    set((state) => {
      const next = { scriptHistory: [item, ...state.scriptHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
    pushRow('scriptHistory', item)
  },

  deleteScriptHistory: async (id) => {
    set((state) => {
      const next = { scriptHistory: state.scriptHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('scriptHistory', id)
    reportSuccess('Script removed from history')
  },

  clearScriptHistory: async () => {
    const items = get().scriptHistory
    set((state) => {
      const next = { scriptHistory: [] as ScriptHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    for (const item of items) dropRow('scriptHistory', item.id)
    reportSuccess('Script history cleared')
  },

  // ── B-Roll History (Scenes sessions) ─────────────────────────────
  // Cloud-synced. The row is small (asset:// refs + metadata; the card media
  // already mirrors to R2 via video_history / image_history), so this mostly
  // persists the session layout so it survives browser storage eviction.
  // Upsert by id. Keeps the entry at the head of the list (most-recent first)
  // so an in-flight session sits at the top even as cardStates mutate. FIFO
  // capped at BROLL_HISTORY_CAP — drops the oldest entries past the cap.
  upsertBrollHistory: async (item) => {
    let evicted: BrollHistoryItem[] = []
    set((state) => {
      const filtered = state.brollHistory.filter((h) => h.id !== item.id)
      const combined = [item, ...filtered]
      evicted = combined.slice(BROLL_HISTORY_CAP)
      const next = { brollHistory: combined.slice(0, BROLL_HISTORY_CAP) }
      saveToStorage({ ...state, ...next })
      return next
    })
    pushRow('brollHistory', item)
    // Drop entries that fell off the cap from the cloud too, or hydrate (which
    // pulls every row) would resurrect them. Their asset blobs are reclaimed by
    // the orphan sweep once nothing else references them.
    for (const old of evicted) dropRow('brollHistory', old.id)
  },

  deleteBrollHistory: async (id) => {
    set((state) => {
      const next = { brollHistory: state.brollHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('brollHistory', id)
    reportSuccess('Session removed from history')
  },

  clearBrollHistory: async () => {
    const items = get().brollHistory
    set((state) => {
      const next = { brollHistory: [] as BrollHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    for (const item of items) dropRow('brollHistory', item.id)
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
    pushRow('characterHistory', item)
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
    pushRow('characterHistory', updated)
  },

  deleteCharacterHistory: async (id) => {
    const item = get().characterHistory.find((h) => h.id === id)
    if (!item) return
    set((state) => {
      const next = { characterHistory: state.characterHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('characterHistory', id)
    // Only purge the asset blob if it isn't referenced by a saved Model.
    // The Model owns the image once saved; the history row is just an index.
    if (!item.linkedModelId) void cleanupAssets(item.imageRef)
    reportSuccess('Character removed from history')
  },

  clearCharacterHistory: async () => {
    const items = get().characterHistory
    set((state) => {
      const next = { characterHistory: [] as CharacterHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    for (const item of items) {
      dropRow('characterHistory', item.id)
      if (!item.linkedModelId) void cleanupAssets(item.imageRef)
    }
    reportSuccess('Character history cleared')
  },

  // ── Ad Anatomy History (Ad Analyzer) ────────────────────────────
  addAdAnatomyHistory: async (item) => {
    set((state) => {
      const next = { adAnatomyHistory: [item, ...state.adAnatomyHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
    pushRow('adAnatomyHistory', item)
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
    pushRow('adAnatomyHistory', updated)
  },

  deleteAdAnatomyHistory: async (id) => {
    const item = get().adAnatomyHistory.find((h) => h.id === id)
    if (!item) return
    set((state) => {
      const next = { adAnatomyHistory: state.adAnatomyHistory.filter((h) => h.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    dropRow('adAnatomyHistory', id)
    void cleanupAssets(item.thumbnailRef, item.uploadedRef)
    reportSuccess('Analysis removed from history')
  },

  clearAdAnatomyHistory: async () => {
    const items = get().adAnatomyHistory
    set((state) => {
      const next = { adAnatomyHistory: [] as AdAnatomyHistoryItem[] }
      saveToStorage({ ...state, ...next })
      return next
    })
    for (const item of items) {
      dropRow('adAnatomyHistory', item.id)
      void cleanupAssets(item.thumbnailRef, item.uploadedRef)
    }
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
