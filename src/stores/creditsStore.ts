import { create } from 'zustand'
import { kieTestConnection } from '../utils/kie'
import { useSettingsStore } from './settingsStore'

interface CreditsState {
  balance: number | null
  loading: boolean
  /** Fetch the current kie.ai credit balance. No-op if no API key is set. */
  refresh: () => Promise<void>
}

export const useCreditsStore = create<CreditsState>((set) => ({
  balance: null,
  loading: false,
  refresh: async () => {
    const apiKey = useSettingsStore.getState().kieApiKey
    if (!apiKey) {
      set({ balance: null, loading: false })
      return
    }
    set({ loading: true })
    try {
      const res = await kieTestConnection(apiKey)
      if (res.ok) set({ balance: res.credits, loading: false })
      else set({ loading: false })
    } catch {
      set({ loading: false })
    }
  },
}))
