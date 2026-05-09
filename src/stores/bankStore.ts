import { create } from 'zustand'
import type { Product, Model, Script, VoicePreset, BRoll, VoiceHistoryItem, VideoHistoryItem, Project } from './types'
import { isAssetRef, deleteAsset, saveFromDataUrl } from '../utils/assetStore'
import { useSettingsStore } from './settingsStore'

const STORAGE_KEY = 'ai-ugc-lab-banks'
const MIGRATION_FLAG = 'ai-ugc-lab-migrated-v2'

interface BankState {
  projects: Project[]
  products: Product[]
  models: Model[]
  scripts: Script[]
  voices: VoicePreset[]
  brolls: BRoll[]
  voiceHistory: VoiceHistoryItem[]
  videoHistory: VideoHistoryItem[]

  // Project CRUD
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => string
  updateProject: (id: string, updates: Partial<Project>) => void
  deleteProject: (id: string) => void
  getProjectById: (id: string) => Project | undefined
  // Tag/untag any item across banks. The store knows which array to mutate.
  addItemToProject: (bank: 'products' | 'models' | 'scripts' | 'voices' | 'brolls' | 'videoHistory', itemId: string, projectId: string) => void
  removeItemFromProject: (bank: 'products' | 'models' | 'scripts' | 'voices' | 'brolls' | 'videoHistory', itemId: string, projectId: string) => void

  // Product CRUD
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => void
  updateProduct: (id: string, updates: Partial<Product>) => void
  deleteProduct: (id: string) => void
  getProductById: (id: string) => Product | undefined

  // Model CRUD
  addModel: (model: Omit<Model, 'id' | 'createdAt'>) => void
  updateModel: (id: string, updates: Partial<Model>) => void
  deleteModel: (id: string) => void
  getModelById: (id: string) => Model | undefined

  // Script CRUD
  addScript: (script: Omit<Script, 'id' | 'createdAt'>) => void
  updateScript: (id: string, updates: Partial<Script>) => void
  deleteScript: (id: string) => void
  getScriptById: (id: string) => Script | undefined

  // Voice CRUD
  addVoice: (voice: Omit<VoicePreset, 'id' | 'createdAt'>) => void
  updateVoice: (id: string, updates: Partial<VoicePreset>) => void
  deleteVoice: (id: string) => void
  getVoiceById: (id: string) => VoicePreset | undefined

  // B-Roll CRUD
  addBRoll: (broll: Omit<BRoll, 'id' | 'createdAt'>) => void
  updateBRoll: (id: string, updates: Partial<BRoll>) => void
  deleteBRoll: (id: string) => void
  getBRollById: (id: string) => BRoll | undefined

  // Voice History
  addVoiceHistory: (item: VoiceHistoryItem) => void
  deleteVoiceHistory: (id: string) => void
  clearVoiceHistory: () => void

  // Video History (B-Roll Videos)
  addVideoHistory: (item: VideoHistoryItem) => void
  updateVideoHistory: (id: string, updates: Partial<VideoHistoryItem>) => void
  deleteVideoHistory: (id: string) => void
  clearVideoHistory: () => void
}

function generateId(): string {
  return crypto.randomUUID()
}

type BankData = Pick<BankState, 'projects' | 'products' | 'models' | 'scripts' | 'voices' | 'brolls' | 'voiceHistory' | 'videoHistory'>

// Reads the currently-active project id from the settings store. Returns
// `[activeProjectId]` if one is active, else `undefined` so the spread no-ops.
// Centralized here so every `addX` method auto-tags consistently.
function autoProjectIds(existing?: string[]): string[] | undefined {
  const active = useSettingsStore.getState().activeProjectId
  if (!active) return existing
  if (existing?.includes(active)) return existing
  return [active, ...(existing ?? [])]
}

// One-shot migration for older voice shapes:
//   - v3 dropped creativity / ambience / styleInstructions (legacy keys stripped)
//   - Multilingual v2 added similarityBoost / style / speed — backfill with the
//     model's recommended defaults so existing presets keep generating audio
//     that resembles what they did before.
// Drop any entry missing voiceId (would fail mid-generation).
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

function loadFromStorage(): BankData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        products: parsed.products ?? [],
        models: parsed.models ?? [],
        scripts: parsed.scripts ?? [],
        voices: migrateVoiceShape<VoicePreset>(parsed.voices),
        brolls: parsed.brolls ?? [],
        voiceHistory: migrateVoiceShape<VoiceHistoryItem>(parsed.voiceHistory),
        videoHistory: Array.isArray(parsed.videoHistory) ? parsed.videoHistory : [],
      }
    }
  } catch {
    // Corrupted data — start fresh
  }
  return { projects: [], products: [], models: [], scripts: [], voices: [], brolls: [], voiceHistory: [], videoHistory: [] }
}

// localStorage write debounced to the next idle tick. Without this, every
// add/update/delete blocks the UI for as long as JSON.stringify of the
// whole bank takes — which scales linearly with how many videos / images
// the user has in their history. For a heavy user that's hundreds of ms
// per click and feels like the app is freezing.
let pendingSave: BankData | null = null
let saveScheduled = false

function flushSaveToStorage() {
  saveScheduled = false
  if (!pendingSave) return
  const state = pendingSave
  pendingSave = null
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      projects: state.projects,
      products: state.products,
      models: state.models,
      scripts: state.scripts,
      voices: state.voices,
      brolls: state.brolls,
      voiceHistory: state.voiceHistory,
      videoHistory: state.videoHistory,
    }))
  } catch (error) {
    console.error('Failed to save to storage', error)
  }
}

function saveToStorage(state: BankData) {
  pendingSave = state
  if (saveScheduled) return
  saveScheduled = true
  // Prefer the browser's idle window; fall back for older Safari.
  const schedule = (cb: () => void) => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: unknown) => void }).requestIdleCallback
    if (ric) ric(cb, { timeout: 500 })
    else setTimeout(cb, 0)
  }
  schedule(flushSaveToStorage)
}

// Persist immediately before the page unloads so we don't lose the most
// recent change. Cheap because it only writes whatever's still pending.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushSaveToStorage)
  window.addEventListener('pagehide', flushSaveToStorage)
}

// Clean up IndexedDB assets when deleting bank items
function cleanupAssets(...refs: (string | undefined)[]) {
  for (const ref of refs) {
    if (ref && isAssetRef(ref)) {
      deleteAsset(ref) // fire-and-forget
    }
  }
}

export const useBankStore = create<BankState>((set, get) => ({
  ...loadFromStorage(),

  // Projects
  addProject: (project) => {
    const id = generateId()
    set((state) => {
      const next = {
        projects: [...state.projects, { ...project, id, createdAt: Date.now() }],
      }
      saveToStorage({ ...state, ...next })
      return next
    })
    return id
  },
  updateProject: (id, updates) => set((state) => {
    const next = {
      projects: state.projects.map((p) => p.id === id ? { ...p, ...updates } : p),
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  // Deleting a project scrubs its id from every item's projectIds — items
  // themselves are not deleted, just untagged. We also clear it from the
  // active-project setting so the header switcher doesn't dangle.
  deleteProject: (id) => set((state) => {
    const scrub = <T extends { projectIds?: string[] }>(arr: T[]): T[] =>
      arr.map((item) =>
        item.projectIds?.includes(id)
          ? { ...item, projectIds: item.projectIds.filter((pid) => pid !== id) }
          : item,
      )
    const next: Partial<BankState> = {
      projects: state.projects.filter((p) => p.id !== id),
      products: scrub(state.products),
      models: scrub(state.models),
      scripts: scrub(state.scripts),
      voices: scrub(state.voices),
      brolls: scrub(state.brolls),
      videoHistory: scrub(state.videoHistory),
    }
    if (useSettingsStore.getState().activeProjectId === id) {
      useSettingsStore.getState().setActiveProject(null)
    }
    saveToStorage({ ...state, ...next } as BankData)
    return next
  }),
  getProjectById: (id) => get().projects.find((p) => p.id === id),
  addItemToProject: (bank, itemId, projectId) => set((state) => {
    const items = state[bank] as Array<{ id: string; projectIds?: string[] }>
    const updated = items.map((item) =>
      item.id === itemId
        ? { ...item, projectIds: Array.from(new Set([...(item.projectIds ?? []), projectId])) }
        : item,
    )
    const next = { [bank]: updated } as Partial<BankState>
    saveToStorage({ ...state, ...next } as BankData)
    return next
  }),
  removeItemFromProject: (bank, itemId, projectId) => set((state) => {
    const items = state[bank] as Array<{ id: string; projectIds?: string[] }>
    const updated = items.map((item) =>
      item.id === itemId
        ? { ...item, projectIds: (item.projectIds ?? []).filter((pid) => pid !== projectId) }
        : item,
    )
    const next = { [bank]: updated } as Partial<BankState>
    saveToStorage({ ...state, ...next } as BankData)
    return next
  }),

  // Products
  addProduct: (product) => set((state) => {
    const projectIds = autoProjectIds(product.projectIds)
    const next = {
      products: [...state.products, { ...product, projectIds, id: generateId(), createdAt: Date.now() }],
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  updateProduct: (id, updates) => set((state) => {
    // If replacing an image, clean up the old one
    if (updates.productImage) {
      const old = state.products.find((p) => p.id === id)
      if (old?.productImage && old.productImage !== updates.productImage) {
        cleanupAssets(old.productImage)
      }
    }
    const next = {
      products: state.products.map((p) => p.id === id ? { ...p, ...updates } : p),
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  deleteProduct: (id) => set((state) => {
    const item = state.products.find((p) => p.id === id)
    if (item) cleanupAssets(item.productImage)
    const next = { products: state.products.filter((p) => p.id !== id) }
    saveToStorage({ ...state, ...next })
    return next
  }),
  getProductById: (id) => get().products.find((p) => p.id === id),

  // Models
  addModel: (model) => set((state) => {
    const projectIds = autoProjectIds(model.projectIds)
    const next = {
      models: [...state.models, { ...model, projectIds, id: generateId(), createdAt: Date.now() }],
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  updateModel: (id, updates) => set((state) => {
    if (updates.characterImage) {
      const old = state.models.find((m) => m.id === id)
      if (old?.characterImage && old.characterImage !== updates.characterImage) {
        cleanupAssets(old.characterImage)
      }
    }
    const next = {
      models: state.models.map((m) => m.id === id ? { ...m, ...updates } : m),
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  deleteModel: (id) => set((state) => {
    const item = state.models.find((m) => m.id === id)
    if (item) cleanupAssets(item.characterImage)
    const next = { models: state.models.filter((m) => m.id !== id) }
    saveToStorage({ ...state, ...next })
    return next
  }),
  getModelById: (id) => get().models.find((m) => m.id === id),

  // Scripts
  addScript: (script) => set((state) => {
    const projectIds = autoProjectIds(script.projectIds)
    const next = {
      scripts: [...state.scripts, { ...script, projectIds, id: generateId(), createdAt: Date.now() }],
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  updateScript: (id, updates) => set((state) => {
    const next = {
      scripts: state.scripts.map((s) => s.id === id ? { ...s, ...updates } : s),
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  deleteScript: (id) => set((state) => {
    const next = { scripts: state.scripts.filter((s) => s.id !== id) }
    saveToStorage({ ...state, ...next })
    return next
  }),
  getScriptById: (id) => get().scripts.find((s) => s.id === id),

  // Voices
  addVoice: (voice) => set((state) => {
    const projectIds = autoProjectIds(voice.projectIds)
    const next = {
      voices: [...state.voices, { ...voice, projectIds, id: generateId(), createdAt: Date.now() }],
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  updateVoice: (id, updates) => set((state) => {
    const next = {
      voices: state.voices.map((v) => v.id === id ? { ...v, ...updates } : v),
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  deleteVoice: (id) => set((state) => {
    const next = { voices: state.voices.filter((v) => v.id !== id) }
    saveToStorage({ ...state, ...next })
    return next
  }),
  getVoiceById: (id) => get().voices.find((v) => v.id === id),

  // B-Rolls
  addBRoll: (broll) => set((state) => {
    const projectIds = autoProjectIds(broll.projectIds)
    const next = {
      brolls: [...state.brolls, { ...broll, projectIds, id: generateId(), createdAt: Date.now() }],
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  updateBRoll: (id, updates) => set((state) => {
    if (updates.imageUrl) {
      const old = state.brolls.find((b) => b.id === id)
      if (old?.imageUrl && old.imageUrl !== updates.imageUrl) {
        cleanupAssets(old.imageUrl)
      }
    }
    const next = {
      brolls: state.brolls.map((b) => b.id === id ? { ...b, ...updates } : b),
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  deleteBRoll: (id) => set((state) => {
    const item = state.brolls.find((b) => b.id === id)
    if (item) {
      cleanupAssets(item.imageUrl, item.videoUrl)
      item.videos?.forEach((v) => cleanupAssets(v.url))
    }
    const next = { brolls: state.brolls.filter((b) => b.id !== id) }
    saveToStorage({ ...state, ...next })
    return next
  }),
  getBRollById: (id) => get().brolls.find((b) => b.id === id),

  // Voice History
  addVoiceHistory: (item) => set((state) => {
    const next = { voiceHistory: [item, ...state.voiceHistory] }
    saveToStorage({ ...state, ...next })
    return next
  }),
  deleteVoiceHistory: (id) => set((state) => {
    const item = state.voiceHistory.find((h) => h.id === id)
    if (item) cleanupAssets(item.audioUrl)
    const next = { voiceHistory: state.voiceHistory.filter((h) => h.id !== id) }
    saveToStorage({ ...state, ...next })
    return next
  }),
  clearVoiceHistory: () => set((state) => {
    for (const item of state.voiceHistory) {
      cleanupAssets(item.audioUrl)
    }
    const next = { voiceHistory: [] as VoiceHistoryItem[] }
    saveToStorage({ ...state, ...next })
    return next
  }),

  // Video History
  addVideoHistory: (item) => set((state) => {
    const projectIds = autoProjectIds(item.projectIds)
    const next = { videoHistory: [{ ...item, projectIds }, ...state.videoHistory] }
    saveToStorage({ ...state, ...next })
    return next
  }),
  updateVideoHistory: (id, updates) => set((state) => {
    const next = {
      videoHistory: state.videoHistory.map((h) => h.id === id ? { ...h, ...updates } : h),
    }
    saveToStorage({ ...state, ...next })
    return next
  }),
  deleteVideoHistory: (id) => set((state) => {
    const item = state.videoHistory.find((h) => h.id === id)
    // Only clean the asset if it's not also linked to a saved BRoll record —
    // otherwise we'd orphan the bank entry's blob.
    if (item && !item.linkedBRollId) cleanupAssets(item.videoUrl, item.thumbnailUrl)
    const next = { videoHistory: state.videoHistory.filter((h) => h.id !== id) }
    saveToStorage({ ...state, ...next })
    return next
  }),
  clearVideoHistory: () => set((state) => {
    for (const item of state.videoHistory) {
      if (!item.linkedBRollId) cleanupAssets(item.videoUrl, item.thumbnailUrl)
    }
    const next = { videoHistory: [] as VideoHistoryItem[] }
    saveToStorage({ ...state, ...next })
    return next
  }),
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

// Run migration on app start
migrateToAssetStore()
