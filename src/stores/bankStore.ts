import { create } from 'zustand'
import type { Product, Model, Script, VoicePreset, BRoll, VoiceHistoryItem } from './types'
import { isAssetRef, deleteAsset, saveFromDataUrl } from '../utils/assetStore'

const STORAGE_KEY = 'ai-ugc-lab-banks'
const MIGRATION_FLAG = 'ai-ugc-lab-migrated-v2'

interface BankState {
  products: Product[]
  models: Model[]
  scripts: Script[]
  voices: VoicePreset[]
  brolls: BRoll[]
  voiceHistory: VoiceHistoryItem[]

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
}

function generateId(): string {
  return crypto.randomUUID()
}

type BankData = Pick<BankState, 'products' | 'models' | 'scripts' | 'voices' | 'brolls' | 'voiceHistory'>

function loadFromStorage(): BankData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        products: parsed.products ?? [],
        models: parsed.models ?? [],
        scripts: parsed.scripts ?? [],
        voices: parsed.voices ?? [],
        brolls: parsed.brolls ?? [],
        voiceHistory: parsed.voiceHistory ?? [],
      }
    }
  } catch {
    // Corrupted data — start fresh
  }
  return { products: [], models: [], scripts: [], voices: [], brolls: [], voiceHistory: [] }
}

function saveToStorage(state: BankData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: state.products,
      models: state.models,
      scripts: state.scripts,
      voices: state.voices,
      brolls: state.brolls,
      voiceHistory: state.voiceHistory,
    }))
  } catch (error) {
    console.error('Failed to save to storage', error)
  }
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

  // Products
  addProduct: (product) => set((state) => {
    const next = {
      products: [...state.products, { ...product, id: generateId(), createdAt: Date.now() }],
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
    const next = {
      models: [...state.models, { ...model, id: generateId(), createdAt: Date.now() }],
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
    const next = {
      scripts: [...state.scripts, { ...script, id: generateId(), createdAt: Date.now() }],
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
    const next = {
      voices: [...state.voices, { ...voice, id: generateId(), createdAt: Date.now() }],
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
    const next = {
      brolls: [...state.brolls, { ...broll, id: generateId(), createdAt: Date.now() }],
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
