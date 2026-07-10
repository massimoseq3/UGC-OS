import { create } from 'zustand'
import type { InterAppPayload } from './types'

export interface Toast {
  id: string
  message: string
  type?: 'success' | 'info' | 'error'
}

interface AppState {
  activeApp: string | null
  runningApps: string[]
  interAppPayload: InterAppPayload | null
  toasts: Toast[]
  teamIntroOpen: boolean

  openApp: (appId: string) => void
  openTeamIntro: () => void
  closeTeamIntro: () => void
  setActiveApp: (appId: string | null) => void
  sendToApp: (payload: InterAppPayload) => void
  consumePayload: () => InterAppPayload | null
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

let toastCounter = 0

const TEAM_INTRO_KEY = 'ugc-lab:team-intro-seen'

// The Meet the Team screen auto-opens once per browser: open unless the
// seen flag is already set. Dismissing it (any path) writes the flag.
function loadTeamIntroOpen(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(TEAM_INTRO_KEY) !== '1'
  } catch {
    return false
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  activeApp: null,
  runningApps: [],
  interAppPayload: null,
  toasts: [],
  teamIntroOpen: loadTeamIntroOpen(),

  openTeamIntro: () => set({ teamIntroOpen: true }),

  closeTeamIntro: () => {
    try {
      window.localStorage.setItem(TEAM_INTRO_KEY, '1')
    } catch {
      // ignore
    }
    set({ teamIntroOpen: false })
  },

  openApp: (appId) => set((state) => ({
    activeApp: appId,
    runningApps: state.runningApps.includes(appId)
      ? state.runningApps
      : [...state.runningApps, appId],
  })),

  setActiveApp: (appId) => set({ activeApp: appId }),

  sendToApp: (payload) => set({
    interAppPayload: payload,
    activeApp: payload.targetApp,
    runningApps: get().runningApps.includes(payload.targetApp)
      ? get().runningApps
      : [...get().runningApps, payload.targetApp],
  }),

  consumePayload: () => {
    const payload = get().interAppPayload
    if (payload) {
      set({ interAppPayload: null })
    }
    return payload
  },

  addToast: (message, type = 'success') => {
    // Dedupe: several code paths can report the same outcome back-to-back
    // (e.g. parallel saves). If an identical toast is already on screen,
    // don't stack a twin under it.
    if (get().toasts.some((t) => t.message === message && (t.type ?? 'success') === type)) return
    const id = `toast-${++toastCounter}`
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }))
    // Auto-dismiss is driven by the ToastItem component so the fade-out
    // transition has a chance to play before the toast is unmounted.
  },

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),
}))
