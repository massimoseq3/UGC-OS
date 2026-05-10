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
  sidebarCollapsed: boolean
  mobileSidebarOpen: boolean

  openApp: (appId: string) => void
  setActiveApp: (appId: string | null) => void
  sendToApp: (payload: InterAppPayload) => void
  consumePayload: () => InterAppPayload | null
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
  toggleSidebar: () => void
  setMobileSidebarOpen: (open: boolean) => void
  closeMobileSidebar: () => void
}

let toastCounter = 0

const SIDEBAR_KEY = 'ugc-lab:sidebar-collapsed'

function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  activeApp: null,
  runningApps: [],
  interAppPayload: null,
  toasts: [],
  sidebarCollapsed: loadSidebarCollapsed(),
  mobileSidebarOpen: false,

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

  toggleSidebar: () => set((state) => {
    const next = !state.sidebarCollapsed
    try {
      window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
    } catch {
      // ignore
    }
    return { sidebarCollapsed: next }
  }),

  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  closeMobileSidebar: () => set({ mobileSidebarOpen: false }),
}))
