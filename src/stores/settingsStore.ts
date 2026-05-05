import { create } from 'zustand'

const STORAGE_KEY = 'ai-ugc-lab-settings'

interface SettingsState {
  googleApiKey: string
  perAppModel: Record<string, string>

  setGoogleApiKey: (key: string) => void
  hasApiKey: () => boolean
  getApiKey: () => string

  setAppModel: (appId: string, modelId: string) => void
  getAppModel: (appId: string) => string | undefined
}

interface PersistedShape {
  googleApiKey?: string
  perAppModel?: Record<string, string>
}

function loadFromStorage(): { googleApiKey: string; perAppModel: Record<string, string> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedShape
      return {
        googleApiKey: parsed.googleApiKey ?? '',
        perAppModel: parsed.perAppModel ?? {},
      }
    }
  } catch {
    // Corrupted data — start fresh
  }
  return { googleApiKey: '', perAppModel: {} }
}

function saveToStorage(state: { googleApiKey: string; perAppModel: Record<string, string> }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadFromStorage(),

  setGoogleApiKey: (key) => {
    const next = { googleApiKey: key, perAppModel: get().perAppModel }
    saveToStorage(next)
    set({ googleApiKey: key })
  },

  hasApiKey: () => get().googleApiKey.length > 0,

  getApiKey: () => {
    const key = get().googleApiKey
    if (!key) throw new Error('No API key configured. Open Settings to add your API key.')
    return key
  },

  setAppModel: (appId, modelId) => {
    const next = { googleApiKey: get().googleApiKey, perAppModel: { ...get().perAppModel, [appId]: modelId } }
    saveToStorage(next)
    set({ perAppModel: next.perAppModel })
  },

  getAppModel: (appId) => get().perAppModel[appId],
}))
