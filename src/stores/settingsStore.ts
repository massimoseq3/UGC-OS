import { create } from 'zustand'

const STORAGE_KEY = 'ai-ugc-lab-settings'

interface SettingsState {
  kieApiKey: string
  perAppModel: Record<string, string>

  setKieApiKey: (key: string) => void

  hasKieApiKey: () => boolean
  getKieApiKey: () => string

  setAppModel: (appId: string, modelId: string) => void
  getAppModel: (appId: string) => string | undefined
}

interface PersistedShape {
  kieApiKey?: string
  perAppModel?: Record<string, string>
  // Legacy field — read once during migration, never written again.
  googleApiKey?: string
}

function loadFromStorage(): { kieApiKey: string; perAppModel: Record<string, string> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedShape
      return {
        kieApiKey: parsed.kieApiKey ?? '',
        perAppModel: parsed.perAppModel ?? {},
      }
    }
  } catch {
    // Corrupted data — start fresh
  }
  return { kieApiKey: '', perAppModel: {} }
}

function saveToStorage(state: { kieApiKey: string; perAppModel: Record<string, string> }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadFromStorage(),

  setKieApiKey: (key) => {
    const next = { kieApiKey: key, perAppModel: get().perAppModel }
    saveToStorage(next)
    set({ kieApiKey: key })
  },

  hasKieApiKey: () => get().kieApiKey.length > 0,

  getKieApiKey: () => {
    const key = get().kieApiKey
    if (!key) throw new Error('No kie.ai API key configured. Open Settings to add it.')
    return key
  },

  setAppModel: (appId, modelId) => {
    const next = { kieApiKey: get().kieApiKey, perAppModel: { ...get().perAppModel, [appId]: modelId } }
    saveToStorage(next)
    set({ perAppModel: next.perAppModel })
  },

  getAppModel: (appId) => get().perAppModel[appId],
}))
