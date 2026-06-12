import { create } from 'zustand'

// Designed Gemini Omni voices (minted via kie's /omni/audio/create).
// Deliberately per-browser (own localStorage key, no cloud sync) — the
// kieAudioId is scoped to the member's kie.ai account, which lives next to
// the equally browser-local kie API key. Tiny metadata rows only; no blobs.

export interface OmniVoice {
  kieAudioId: string
  name: string
  // Preset base voice the design started from (see OMNI_BASE_VOICES).
  baseVoiceId: string
  voiceDescription?: string
  exampleDialogue?: string
  createdAt: number
}

const STORAGE_KEY = 'ai-ugc-lab-omni-voices'

function load(): OmniVoice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as OmniVoice[]) : []
  } catch {
    return []
  }
}

function persist(voices: OmniVoice[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(voices)) } catch { /* ignore */ }
}

interface OmniVoiceState {
  voices: OmniVoice[]
  addVoice: (voice: OmniVoice) => void
  removeVoice: (kieAudioId: string) => void
}

export const useOmniVoiceStore = create<OmniVoiceState>((set) => ({
  voices: load(),

  addVoice: (voice) =>
    set((state) => {
      const next = [voice, ...state.voices.filter((v) => v.kieAudioId !== voice.kieAudioId)]
      persist(next)
      return { voices: next }
    }),

  removeVoice: (kieAudioId) =>
    set((state) => {
      const next = state.voices.filter((v) => v.kieAudioId !== kieAudioId)
      persist(next)
      return { voices: next }
    }),
}))
