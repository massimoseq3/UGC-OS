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

const MIGRATIONS_KEY = 'ai-ugc-lab-settings-migrations'

// One-shot migrations applied to perAppModel. Each runs once per browser, then
// its name is recorded under MIGRATIONS_KEY so it never runs again.
const MODEL_MIGRATIONS: Array<{ name: string; apply: (m: Record<string, string>) => void }> = [
  {
    // Earlier builds let users persist Nano Banana 2 as the Characters image
    // model. GPT Image 2 is the registered default for character-studio; clear
    // the stale entry so the registry default kicks in.
    name: '2026-05-character-studio-default',
    apply: (m) => { delete m['character-studio:image:text-to-image'] },
  },
  {
    // Default for character-studio flipped to Nano Banana 2. Clear any
    // persisted selection so users see the new default unless they pick
    // explicitly afterwards.
    name: '2026-05-character-studio-nano-banana-default',
    apply: (m) => { delete m['character-studio:image:text-to-image'] },
  },
]

function loadFromStorage(): { kieApiKey: string; perAppModel: Record<string, string> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedShape
      const perAppModel = { ...(parsed.perAppModel ?? {}) }

      let ranMigrations: Record<string, true> = {}
      try {
        const rawMig = localStorage.getItem(MIGRATIONS_KEY)
        if (rawMig) ranMigrations = JSON.parse(rawMig) as Record<string, true>
      } catch { /* ignore */ }

      let migrated = false
      for (const m of MODEL_MIGRATIONS) {
        if (!ranMigrations[m.name]) {
          m.apply(perAppModel)
          ranMigrations[m.name] = true
          migrated = true
        }
      }
      if (migrated) {
        localStorage.setItem(MIGRATIONS_KEY, JSON.stringify(ranMigrations))
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          kieApiKey: parsed.kieApiKey ?? '',
          perAppModel,
        }))
      }
      return {
        kieApiKey: parsed.kieApiKey ?? '',
        perAppModel,
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
