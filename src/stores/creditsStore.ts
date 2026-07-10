import { create } from 'zustand'
import { kieTestConnection } from '../utils/kie'
import { useSettingsStore } from './settingsStore'

interface CreditsState {
  balance: number | null
  /** Fetch the current kie.ai credit balance. No-op if no API key is set. */
  refresh: () => Promise<void>
}

export const useCreditsStore = create<CreditsState>((set) => ({
  balance: null,
  refresh: async () => {
    const apiKey = useSettingsStore.getState().kieApiKey
    if (!apiKey) {
      set({ balance: null })
      return
    }
    try {
      const res = await kieTestConnection(apiKey)
      if (res.ok) set({ balance: res.credits })
    } catch {
      // Leave the last-known balance in place on a transient fetch failure.
    }
  },
}))
