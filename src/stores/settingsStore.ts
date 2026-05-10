import { create } from 'zustand'
import { saveProfile } from '../lib/cloudSync'
import { isCloudEnabled } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { useAppStore } from './appStore'

const STORAGE_KEY = 'ai-ugc-lab-settings'

function cloudActive(): boolean {
  return isCloudEnabled() && !!useAuthStore.getState().user
}

// Best-effort profile push. Awaited inline; failures toast and re-throw so
// the caller can surface them too.
async function pushProfile(): Promise<void> {
  if (!cloudActive()) return
  try {
    await saveProfile()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    try { useAppStore.getState().addToast(`Settings sync failed: ${msg}`, 'error') } catch { /* ignore */ }
    throw e
  }
}

interface SettingsState {
  kieApiKey: string
  perAppModel: Record<string, string>
  // The currently-active project (null = none). Set by the header switcher.
  // The bank store reads this when adding new items so they auto-tag into
  // the active project — see `autoProjectIds` in `bankStore.ts`.
  activeProjectId: string | null

  setKieApiKey: (key: string) => void

  hasKieApiKey: () => boolean
  getKieApiKey: () => string

  setAppModel: (appId: string, modelId: string) => void
  getAppModel: (appId: string) => string | undefined

  setActiveProject: (id: string | null) => void
}

interface PersistedShape {
  kieApiKey?: string
  perAppModel?: Record<string, string>
  activeProjectId?: string | null
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
  {
    // B-Roll Videos dropped its mode toggle. Old per-mode keys
    // ('video-studio:video:image-to-video', etc.) collapse into a single
    // 'video-studio:video' slot. Take whichever per-mode value the user
    // had selected last (image-to-video is the most common starting point)
    // as the new flat selection.
    name: '2026-05-video-studio-flatten-modes',
    apply: (m) => {
      const modes = ['image-to-video', 'frames-to-video', 'reference-to-video', 'text-to-video']
      if (!m['video-studio:video']) {
        for (const mode of modes) {
          const old = m[`video-studio:video:${mode}`]
          if (old) {
            m['video-studio:video'] = old
            break
          }
        }
      }
      for (const mode of modes) {
        delete m[`video-studio:video:${mode}`]
      }
    },
  },
]

function loadFromStorage(): { kieApiKey: string; perAppModel: Record<string, string>; activeProjectId: string | null } {
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
          activeProjectId: parsed.activeProjectId ?? null,
        }))
      }
      return {
        kieApiKey: parsed.kieApiKey ?? '',
        perAppModel,
        activeProjectId: parsed.activeProjectId ?? null,
      }
    }
  } catch {
    // Corrupted data — start fresh
  }
  return { kieApiKey: '', perAppModel: {}, activeProjectId: null }
}

function saveToStorage(state: { kieApiKey: string; perAppModel: Record<string, string>; activeProjectId: string | null }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadFromStorage(),

  setKieApiKey: (key) => {
    const next = { kieApiKey: key, perAppModel: get().perAppModel, activeProjectId: get().activeProjectId }
    saveToStorage(next)
    set({ kieApiKey: key })
    pushProfile().catch(() => { /* toast already raised */ })
  },

  hasKieApiKey: () => get().kieApiKey.length > 0,

  getKieApiKey: () => {
    const key = get().kieApiKey
    if (!key) throw new Error('No kie.ai API key configured. Open Settings to add it.')
    return key
  },

  setAppModel: (appId, modelId) => {
    const next = { kieApiKey: get().kieApiKey, perAppModel: { ...get().perAppModel, [appId]: modelId }, activeProjectId: get().activeProjectId }
    saveToStorage(next)
    set({ perAppModel: next.perAppModel })
    pushProfile().catch(() => { /* toast already raised */ })
  },

  getAppModel: (appId) => get().perAppModel[appId],

  setActiveProject: (id) => {
    const next = { kieApiKey: get().kieApiKey, perAppModel: get().perAppModel, activeProjectId: id }
    saveToStorage(next)
    set({ activeProjectId: id })
    pushProfile().catch(() => { /* toast already raised */ })
  },
}))
