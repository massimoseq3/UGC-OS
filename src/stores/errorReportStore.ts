import { create } from 'zustand'

// "Send Error Reports" — whether this browser tells the operator when
// something breaks (utils/errorReporter.ts, read in Admin → Errors).
//
// ON for everyone and never asked about: the operator wanted bugs to reach
// them without members having to write in, and a consent prompt on the way
// into the workspace would be one more thing between a member and their work.
// The switch in Settings → Account is the way out, and the Privacy Policy says
// what is sent.
//
// Per-browser, like the theme: its own localStorage key, never cloud-synced,
// and untouched by the sign-out wipe.

const STORAGE_KEY = 'ai-ugc-lab-error-reports'

function loadEnabled(): boolean {
  try {
    // Only an explicit 'off' turns it off. An absent, corrupt or unreadable
    // value means ON, so every member lands on the default without a migration.
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

interface ErrorReportState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

export const useErrorReportStore = create<ErrorReportState>((set) => ({
  enabled: loadEnabled(),

  setEnabled: (enabled) => {
    try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off') } catch { /* ignore */ }
    set({ enabled })
  },
}))
