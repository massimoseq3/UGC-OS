import { create } from 'zustand'
import type { Product, Model, Script, VoicePreset, BRoll, VoiceHistoryItem, VideoHistoryItem, Project } from './types'
import { isAssetRef, deleteAsset, saveFromDataUrl } from '../utils/assetStore'
import { useSettingsStore } from './settingsStore'
import { useAuthStore } from './authStore'
import { isCloudEnabled } from '../lib/supabase'
import { saveRow, saveRows, deleteRow, type BankKey } from '../lib/cloudSync'
import { useAppStore } from './appStore'

const STORAGE_KEY = 'ai-ugc-lab-banks'
const MIGRATION_FLAG = 'ai-ugc-lab-migrated-v2'

type BankActionResult = void

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
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => Promise<string>
  updateProject: (id: string, updates: Partial<Project>) => Promise<BankActionResult>
  deleteProject: (id: string) => Promise<BankActionResult>
  getProjectById: (id: string) => Project | undefined
  addItemToProject: (bank: 'products' | 'models' | 'scripts' | 'voices' | 'brolls' | 'videoHistory', itemId: string, projectId: string) => Promise<BankActionResult>
  removeItemFromProject: (bank: 'products' | 'models' | 'scripts' | 'voices' | 'brolls' | 'videoHistory', itemId: string, projectId: string) => Promise<BankActionResult>

  // Product CRUD
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => Promise<BankActionResult>
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
  addBRoll: (broll: Omit<BRoll, 'id' | 'createdAt'>) => Promise<BankActionResult>
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
}

function generateId(): string {
  return crypto.randomUUID()
}

type BankData = Pick<BankState, 'projects' | 'products' | 'models' | 'scripts' | 'voices' | 'brolls' | 'voiceHistory' | 'videoHistory'>

function autoProjectIds(existing?: string[]): string[] | undefined {
  const active = useSettingsStore.getState().activeProjectId
  if (!active) return existing
  if (existing?.includes(active)) return existing
  return [active, ...(existing ?? [])]
}

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
    /* corrupted — start fresh */
  }
  return { projects: [], products: [], models: [], scripts: [], voices: [], brolls: [], voiceHistory: [], videoHistory: [] }
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

// Cloud-aware single-row save. Awaited; throws on failure.
async function pushRow(table: BankKey, row: { id: string }): Promise<void> {
  if (!cloudActive()) return
  await saveRow(table, row)
}

async function pushRows(table: BankKey, rows: Array<{ id: string }>): Promise<void> {
  if (!cloudActive() || rows.length === 0) return
  await saveRows(table, rows)
}

async function dropRow(table: BankKey, id: string): Promise<void> {
  if (!cloudActive()) return
  await deleteRow(table, id)
}

function reportError(prefix: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  try { useAppStore.getState().addToast(`${prefix}: ${msg}`, 'error') } catch { /* ignore */ }
  throw e
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

  // ── Projects ─────────────────────────────────────────────────────
  addProject: async (project) => {
    const id = generateId()
    const newProject: Project = { ...project, id, createdAt: Date.now() }
    try { await pushRow('projects', newProject) } catch (e) { reportError('Save project', e) }
    set((state) => {
      const next = { projects: [...state.projects, newProject] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess(`Project "${newProject.name}" created`)
    return id
  },

  updateProject: async (id, updates) => {
    const existing = get().projects.find((p) => p.id === id)
    if (!existing) return
    const updated: Project = { ...existing, ...updates }
    try { await pushRow('projects', updated) } catch (e) { reportError('Update project', e) }
    set((state) => {
      const next = { projects: state.projects.map((p) => p.id === id ? updated : p) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Project updated')
  },

  deleteProject: async (id) => {
    const state = get()
    const scrub = <T extends { id: string; projectIds?: string[] }>(arr: T[]): T[] =>
      arr.map((item) =>
        item.projectIds?.includes(id)
          ? { ...item, projectIds: item.projectIds.filter((pid) => pid !== id) }
          : item,
      )
    const scrubbed = {
      products: scrub(state.products),
      models: scrub(state.models),
      scripts: scrub(state.scripts),
      voices: scrub(state.voices),
      brolls: scrub(state.brolls),
      videoHistory: scrub(state.videoHistory),
    }

    try {
      await dropRow('projects', id)
      // Push the scrub-updated rows so cloud reflects the untag.
      const dirty: Array<[BankKey, Array<{ id: string; projectIds?: string[] }>]> = [
        ['products', scrubbed.products.filter((it, i) => it !== state.products[i])],
        ['models', scrubbed.models.filter((it, i) => it !== state.models[i])],
        ['scripts', scrubbed.scripts.filter((it, i) => it !== state.scripts[i])],
        ['voices', scrubbed.voices.filter((it, i) => it !== state.voices[i])],
        ['brolls', scrubbed.brolls.filter((it, i) => it !== state.brolls[i])],
        ['videoHistory', scrubbed.videoHistory.filter((it, i) => it !== state.videoHistory[i])],
      ]
      for (const [table, rows] of dirty) {
        if (rows.length > 0) await pushRows(table, rows)
      }
    } catch (e) { reportError('Delete project', e) }

    if (useSettingsStore.getState().activeProjectId === id) {
      useSettingsStore.getState().setActiveProject(null)
    }
    const projectName = state.projects.find((p) => p.id === id)?.name
    set((s) => {
      const next = {
        projects: s.projects.filter((p) => p.id !== id),
        products: scrubbed.products,
        models: scrubbed.models,
        scripts: scrubbed.scripts,
        voices: scrubbed.voices,
        brolls: scrubbed.brolls,
        videoHistory: scrubbed.videoHistory,
      }
      saveToStorage({ ...s, ...next })
      return next
    })
    reportSuccess(projectName ? `Project "${projectName}" deleted` : 'Project deleted')
  },

  getProjectById: (id) => get().projects.find((p) => p.id === id),

  addItemToProject: async (bank, itemId, projectId) => {
    const items = get()[bank] as Array<{ id: string; projectIds?: string[] }>
    const item = items.find((x) => x.id === itemId)
    if (!item) return
    const updated = { ...item, projectIds: Array.from(new Set([...(item.projectIds ?? []), projectId])) }
    try { await pushRow(bank, updated) } catch (e) { reportError('Tag project', e) }
    set((s) => {
      const arr = s[bank] as Array<{ id: string }>
      const newArr = arr.map((x) => x.id === itemId ? updated : x)
      const next = { [bank]: newArr } as Partial<BankState>
      saveToStorage({ ...s, ...next } as BankData)
      return next
    })
  },

  removeItemFromProject: async (bank, itemId, projectId) => {
    const items = get()[bank] as Array<{ id: string; projectIds?: string[] }>
    const item = items.find((x) => x.id === itemId)
    if (!item) return
    const updated = { ...item, projectIds: (item.projectIds ?? []).filter((pid) => pid !== projectId) }
    try { await pushRow(bank, updated) } catch (e) { reportError('Untag project', e) }
    set((s) => {
      const arr = s[bank] as Array<{ id: string }>
      const newArr = arr.map((x) => x.id === itemId ? updated : x)
      const next = { [bank]: newArr } as Partial<BankState>
      saveToStorage({ ...s, ...next } as BankData)
      return next
    })
  },

  // ── Products ─────────────────────────────────────────────────────
  addProduct: async (product) => {
    const projectIds = autoProjectIds(product.projectIds)
    const newProduct: Product = { ...product, projectIds, id: generateId(), createdAt: Date.now() }
    try { await pushRow('products', newProduct) } catch (e) { reportError('Save product', e) }
    set((state) => {
      const next = { products: [...state.products, newProduct] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Product saved')
  },

  updateProduct: async (id, updates) => {
    const old = get().products.find((p) => p.id === id)
    if (!old) return
    const updated: Product = { ...old, ...updates }
    try { await pushRow('products', updated) } catch (e) { reportError('Update product', e) }

    if (updates.productImage && old.productImage && old.productImage !== updates.productImage) {
      cleanupAssets(old.productImage)
    }

    set((state) => {
      const next = { products: state.products.map((p) => p.id === id ? updated : p) }
      saveToStorage({ ...state, ...next })
      return next
    })
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
    const projectIds = autoProjectIds(model.projectIds)
    const newModel: Model = { ...model, projectIds, id: generateId(), createdAt: Date.now() }
    try { await pushRow('models', newModel) } catch (e) { reportError('Save character', e) }
    set((state) => {
      const next = { models: [...state.models, newModel] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Character saved')
  },

  updateModel: async (id, updates) => {
    const old = get().models.find((m) => m.id === id)
    if (!old) return
    const updated: Model = { ...old, ...updates }
    try { await pushRow('models', updated) } catch (e) { reportError('Update character', e) }

    if (updates.characterImage && old.characterImage && old.characterImage !== updates.characterImage) {
      cleanupAssets(old.characterImage)
    }

    set((state) => {
      const next = { models: state.models.map((m) => m.id === id ? updated : m) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Character updated')
  },

  deleteModel: async (id) => {
    const item = get().models.find((m) => m.id === id)
    if (!item) return
    try { await dropRow('models', id) } catch (e) { reportError('Delete character', e) }
    if (item.characterImage) await cleanupAssets(item.characterImage)
    set((state) => {
      const next = { models: state.models.filter((m) => m.id !== id) }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Character deleted')
  },

  getModelById: (id) => get().models.find((m) => m.id === id),

  // ── Scripts ──────────────────────────────────────────────────────
  addScript: async (script) => {
    const projectIds = autoProjectIds(script.projectIds)
    const newScript: Script = { ...script, projectIds, id: generateId(), createdAt: Date.now() }
    try { await pushRow('scripts', newScript) } catch (e) { reportError('Save script', e) }
    set((state) => {
      const next = { scripts: [...state.scripts, newScript] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Script saved')
  },

  updateScript: async (id, updates) => {
    const old = get().scripts.find((s) => s.id === id)
    if (!old) return
    const updated: Script = { ...old, ...updates }
    try { await pushRow('scripts', updated) } catch (e) { reportError('Update script', e) }
    set((state) => {
      const next = { scripts: state.scripts.map((s) => s.id === id ? updated : s) }
      saveToStorage({ ...state, ...next })
      return next
    })
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
    const projectIds = autoProjectIds(voice.projectIds)
    const newVoice: VoicePreset = { ...voice, projectIds, id: generateId(), createdAt: Date.now() }
    try { await pushRow('voices', newVoice) } catch (e) { reportError('Save voice', e) }
    set((state) => {
      const next = { voices: [...state.voices, newVoice] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Voice saved')
  },

  updateVoice: async (id, updates) => {
    const old = get().voices.find((v) => v.id === id)
    if (!old) return
    const updated: VoicePreset = { ...old, ...updates }
    try { await pushRow('voices', updated) } catch (e) { reportError('Update voice', e) }
    set((state) => {
      const next = { voices: state.voices.map((v) => v.id === id ? updated : v) }
      saveToStorage({ ...state, ...next })
      return next
    })
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
    const projectIds = autoProjectIds(broll.projectIds)
    const newBRoll: BRoll = { ...broll, projectIds, id: generateId(), createdAt: Date.now() }
    try { await pushRow('brolls', newBRoll) } catch (e) { reportError('Save B-roll', e) }
    set((state) => {
      const next = { brolls: [...state.brolls, newBRoll] }
      saveToStorage({ ...state, ...next })
      return next
    })
    reportSuccess('Saved to B-Rolls bank')
  },

  updateBRoll: async (id, updates) => {
    const old = get().brolls.find((b) => b.id === id)
    if (!old) return
    const updated: BRoll = { ...old, ...updates }
    try { await pushRow('brolls', updated) } catch (e) { reportError('Update B-roll', e) }

    if (updates.imageUrl && old.imageUrl && old.imageUrl !== updates.imageUrl) {
      cleanupAssets(old.imageUrl)
    }

    set((state) => {
      const next = { brolls: state.brolls.map((b) => b.id === id ? updated : b) }
      saveToStorage({ ...state, ...next })
      return next
    })
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
  addVoiceHistory: async (item) => {
    try { await pushRow('voiceHistory', item) } catch (e) { reportError('Save voice history', e) }
    set((state) => {
      const next = { voiceHistory: [item, ...state.voiceHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
  },

  deleteVoiceHistory: async (id) => {
    const item = get().voiceHistory.find((h) => h.id === id)
    if (!item) return
    try { await dropRow('voiceHistory', id) } catch (e) { reportError('Delete voice history', e) }
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
    const projectIds = autoProjectIds(item.projectIds)
    const newItem: VideoHistoryItem = { ...item, projectIds }
    try { await pushRow('videoHistory', newItem) } catch (e) { reportError('Save video history', e) }
    set((state) => {
      const next = { videoHistory: [newItem, ...state.videoHistory] }
      saveToStorage({ ...state, ...next })
      return next
    })
  },

  updateVideoHistory: async (id, updates) => {
    const old = get().videoHistory.find((h) => h.id === id)
    if (!old) return
    const updated: VideoHistoryItem = { ...old, ...updates }
    try { await pushRow('videoHistory', updated) } catch (e) { reportError('Update video history', e) }
    set((state) => {
      const next = { videoHistory: state.videoHistory.map((h) => h.id === id ? updated : h) }
      saveToStorage({ ...state, ...next })
      return next
    })
  },

  deleteVideoHistory: async (id) => {
    const item = get().videoHistory.find((h) => h.id === id)
    if (!item) return
    try { await dropRow('videoHistory', id) } catch (e) { reportError('Delete video history', e) }
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
