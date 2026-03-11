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

  openApp: (appId: string) => void
  setActiveApp: (appId: string | null) => void
  sendToApp: (payload: InterAppPayload) => void
  consumePayload: () => InterAppPayload | null
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

let toastCounter = 0

export const useAppStore = create<AppState>((set, get) => ({
  activeApp: null,
  runningApps: [],
  interAppPayload: null,
  toasts: [],

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
    setTimeout(() => {
      get().removeToast(id)
    }, 3000)
  },

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),
}))
