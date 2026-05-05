import { create } from 'zustand'

const STORAGE_KEY = 'ai-ugc-lab-settings'

interface SettingsState {
  kieApiKey: string
  googleApiKey: string
  perAppModel: Record<string, string>

  setKieApiKey: (key: string) => void
  setGoogleApiKey: (key: string) => void

  hasKieApiKey: () => boolean
  getKieApiKey: () => string

  hasApiKey: () => boolean
  getApiKey: () => string

  setAppModel: (appId: string, modelId: string) => void
  getAppModel: (appId: string) => string | undefined
}

interface PersistedShape {
  kieApiKey?: string
  googleApiKey?: string
  perAppModel?: Record<string, string>
}

function loadFromStorage(): { kieApiKey: string; googleApiKey: string; perAppModel: Record<string, string> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedShape
      return {
        kieApiKey: parsed.kieApiKey ?? '',
        googleApiKey: parsed.googleApiKey ?? '',
        perAppModel: parsed.perAppModel ?? {},
      }
    }
  } catch {
    // Corrupted data — start fresh
  }
  return { kieApiKey: '', googleApiKey: '', perAppModel: {} }
}

function saveToStorage(state: { kieApiKey: string; googleApiKey: string; perAppModel: Record<string, string> }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadFromStorage(),

  setKieApiKey: (key) => {
    const next = { ...get(), kieApiKey: key }
    saveToStorage({ kieApiKey: next.kieApiKey, googleApiKey: next.googleApiKey, perAppModel: next.perAppModel })
    set({ kieApiKey: key })
  },

  setGoogleApiKey: (key) => {
    const next = { ...get(), googleApiKey: key }
    saveToStorage({ kieApiKey: next.kieApiKey, googleApiKey: next.googleApiKey, perAppModel: next.perAppModel })
    set({ googleApiKey: key })
  },

  hasKieApiKey: () => get().kieApiKey.length > 0,

  getKieApiKey: () => {
    const key = get().kieApiKey
    if (!key) throw new Error('No kie.ai API key configured. Open Settings to add it.')
    return key
  },

  hasApiKey: () => get().googleApiKey.length > 0,

  getApiKey: () => {
    const key = get().googleApiKey
    if (!key) throw new Error('No Google AI API key configured. Open Settings to add it.')
    return key
  },

  setAppModel: (appId, modelId) => {
    const current = get()
    const next = { ...current.perAppModel, [appId]: modelId }
    saveToStorage({ kieApiKey: current.kieApiKey, googleApiKey: current.googleApiKey, perAppModel: next })
    set({ perAppModel: next })
  },

  getAppModel: (appId) => get().perAppModel[appId],
}))
