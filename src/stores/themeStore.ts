import { create } from 'zustand'

// Appearance preference. Deliberately per-browser (own localStorage key, no
// cloud sync, survives resetSettingsStore on sign-out) — theme is a device
// preference, not account data. index.html sets data-theme before first paint
// from the same key so a light-mode user never sees a dark flash.

export type ThemePref = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

const STORAGE_KEY = 'ai-ugc-lab-theme'

function loadPref(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'system' || raw === 'dark') return raw
  } catch { /* ignore */ }
  return 'dark'
}

const systemQuery = window.matchMedia('(prefers-color-scheme: light)')

function resolve(pref: ThemePref): ResolvedTheme {
  if (pref === 'system') return systemQuery.matches ? 'light' : 'dark'
  return pref
}

function applyToDocument(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme
}

interface ThemeState {
  pref: ThemePref
  resolved: ResolvedTheme
  setPref: (pref: ThemePref) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  pref: loadPref(),
  resolved: resolve(loadPref()),

  setPref: (pref) => {
    try { localStorage.setItem(STORAGE_KEY, pref) } catch { /* ignore */ }
    const resolved = resolve(pref)
    applyToDocument(resolved)
    set({ pref, resolved })
  },
}))

// Keep `system` users in step with the OS while the app is open.
systemQuery.addEventListener?.('change', () => {
  const { pref } = useThemeStore.getState()
  if (pref !== 'system') return
  const resolved = resolve(pref)
  applyToDocument(resolved)
  useThemeStore.setState({ resolved })
})

// The index.html bootstrap already set data-theme pre-paint; re-apply here so
// the attribute is correct even if that script was stripped (e.g. tests).
applyToDocument(useThemeStore.getState().resolved)
