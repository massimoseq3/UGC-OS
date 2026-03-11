import { create } from 'zustand'

const STORAGE_KEY = 'ai-ugc-lab-settings'

interface SettingsState {
  googleApiKey: string

  setGoogleApiKey: (key: string) => void
  hasApiKey: () => boolean
  getApiKey: () => string
}

function loadFromStorage(): Pick<SettingsState, 'googleApiKey'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { googleApiKey: parsed.googleApiKey ?? '' }
    }
  } catch {
    // Corrupted data — start fresh
  }
  return { googleApiKey: '' }
}

function saveToStorage(googleApiKey: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ googleApiKey }))
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadFromStorage(),

  setGoogleApiKey: (key) => {
    saveToStorage(key)
    set({ googleApiKey: key })
  },

  hasApiKey: () => get().googleApiKey.length > 0,

  getApiKey: () => {
    const key = get().googleApiKey
    if (!key) throw new Error('No API key configured. Open Settings to add your Google AI API key.')
    return key
  },
}))
