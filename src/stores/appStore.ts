import { create } from 'zustand'
import type { InterAppPayload } from './types'
import { INVALID_KIE_KEY_MESSAGE, NO_KIE_CREDITS_MESSAGE, NO_KIE_KEY_MESSAGE } from '../utils/friendlyError'
import { KIE_BILLING_URL } from '../utils/constants'

// A toast's one button: the next step, taken from where the member is already
// looking — Connect Key, Undo, Open, Retry. Pressing it runs `run` and
// dismisses the toast. A toast holds at most one; two buttons is a dialog.
export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: string
  message: string
  type?: 'success' | 'info' | 'error'
  action?: ToastAction
}

interface AppState {
  activeApp: string | null
  runningApps: string[]
  interAppPayload: InterAppPayload | null
  toasts: Toast[]
  teamIntroOpen: boolean
  // The kie.ai key guide (ApiKeyGuide), hosted once by the menu bar so any
  // surface — a toast's Connect Key, the Dashboard's first step — opens the
  // same one without mounting a copy of its own.
  keyGuideOpen: boolean

  openApp: (appId: string) => void
  openTeamIntro: () => void
  closeTeamIntro: () => void
  setActiveApp: (appId: string | null) => void
  sendToApp: (payload: InterAppPayload) => void
  consumePayload: () => InterAppPayload | null
  openKeyGuide: () => void
  closeKeyGuide: () => void
  addToast: (message: string, type?: Toast['type'], action?: ToastAction) => void
  removeToast: (id: string) => void
}

let toastCounter = 0

// The fixes a member makes themselves get their button without every call
// site having to remember it: `humanizeError` hands back one of these exact
// sentences from dozens of catch blocks, and each of them lands here. Matched
// on the whole string, not a substring, so a message that merely mentions a
// key can't grow a button.
function memberFixAction(message: string, openKeyGuide: () => void): ToastAction | undefined {
  if (message === NO_KIE_KEY_MESSAGE || message === INVALID_KIE_KEY_MESSAGE) {
    return { label: 'Connect Key', run: openKeyGuide }
  }
  if (message === NO_KIE_CREDITS_MESSAGE) {
    return { label: 'Add Credits', run: () => window.open(KIE_BILLING_URL, '_blank', 'noopener,noreferrer') }
  }
  return undefined
}

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
  keyGuideOpen: false,

  openKeyGuide: () => set({ keyGuideOpen: true }),
  closeKeyGuide: () => set({ keyGuideOpen: false }),

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

  addToast: (message, type = 'success', action) => {
    // Dedupe: several code paths can report the same outcome back-to-back
    // (e.g. parallel saves). If an identical toast is already on screen,
    // don't stack a twin under it. A twin that brings its OWN button replaces
    // the one showing instead: that button belongs to the moment it was made
    // (Undo restores the form as it was before THIS overwrite), so keeping the
    // older toast would leave a button that undoes the wrong step.
    const twin = get().toasts.find((t) => t.message === message && (t.type ?? 'success') === type)
    if (twin && !action) return
    const id = `toast-${++toastCounter}`
    set((state) => ({
      toasts: [
        ...state.toasts.filter((t) => t !== twin),
        { id, message, type, action: action ?? memberFixAction(message, get().openKeyGuide) },
      ],
    }))
    // Auto-dismiss is driven by the ToastItem component so the fade-out
    // transition has a chance to play before the toast is unmounted.
  },

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),
}))
