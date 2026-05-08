export type Gender = 'Female' | 'Male'
export type Accent = 'American' | 'British' | 'Australian' | 'Other'
export type Age = 'Young' | 'Middle-aged' | 'Old'
// Stability for ElevenLabs v3 — continuous 0..1.
// 0 = most variable / expressive, 1 = most stable / consistent.
export type Stability = number

export interface VoiceOption {
  id: string          // ElevenLabs voice_id (used in API calls)
  name: string        // Display name
  gender: Gender
  accent: Accent
  age: Age
  style: string       // Short descriptor shown in the row
}

// Curated subset of ElevenLabs' public voice library. v3 reuses the same
// voice IDs as earlier ElevenLabs models. Expand as needed.
export const VOICES: VoiceOption[] = [
  // ── Female ─────────────────────────────────────────────────
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',    gender: 'Female', accent: 'American',  age: 'Young',       style: 'Calm, narrative' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria',      gender: 'Female', accent: 'American',  age: 'Middle-aged', style: 'Expressive' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',     gender: 'Female', accent: 'American',  age: 'Young',       style: 'Soft, soothing' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura',     gender: 'Female', accent: 'American',  age: 'Young',       style: 'Upbeat' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica',   gender: 'Female', accent: 'American',  age: 'Young',       style: 'Conversational' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda',   gender: 'Female', accent: 'American',  age: 'Middle-aged', style: 'Friendly' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'Female', accent: 'Other',     age: 'Young',       style: 'Casual' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',     gender: 'Female', accent: 'British',   age: 'Middle-aged', style: 'Confident' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',      gender: 'Female', accent: 'British',   age: 'Middle-aged', style: 'Warm, narrative' },

  // ── Male ───────────────────────────────────────────────────
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',      gender: 'Male',   accent: 'American',  age: 'Middle-aged', style: 'Deep, narrative' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger',     gender: 'Male',   accent: 'American',  age: 'Middle-aged', style: 'Confident' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',      gender: 'Male',   accent: 'American',  age: 'Young',       style: 'Articulate' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will',      gender: 'Male',   accent: 'American',  age: 'Young',       style: 'Friendly' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric',      gender: 'Male',   accent: 'American',  age: 'Middle-aged', style: 'Conversational' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris',     gender: 'Male',   accent: 'American',  age: 'Middle-aged', style: 'Casual' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian',     gender: 'Male',   accent: 'American',  age: 'Middle-aged', style: 'Deep, narrative' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill',      gender: 'Male',   accent: 'American',  age: 'Old',         style: 'Trustworthy, narrative' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie',   gender: 'Male',   accent: 'Australian', age: 'Young',      style: 'Natural, casual' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George',    gender: 'Male',   accent: 'British',   age: 'Middle-aged', style: 'Warm' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',    gender: 'Male',   accent: 'British',   age: 'Middle-aged', style: 'Authoritative' },
]

export interface VoiceFilters {
  gender: Gender | 'All'
  accent: Accent | 'All'
}

export function filterVoices(voices: VoiceOption[], filters: VoiceFilters): VoiceOption[] {
  return voices.filter((v) => {
    if (filters.gender !== 'All' && v.gender !== filters.gender) return false
    if (filters.accent !== 'All' && v.accent !== filters.accent) return false
    return true
  })
}

export interface VoiceSettings {
  voiceId: string
  voiceName: string
  gender: Gender
  stability: Stability
}

export interface HistoryItem {
  id: string
  voiceId: string
  voiceName: string
  gender: Gender
  stability: Stability
  scriptText: string
  scriptPreview: string
  audioUrl: string
  duration: number
  createdAt: number
}

export function createDefaultSettings(): VoiceSettings {
  const def = VOICES[0]
  return {
    voiceId: def.id,
    voiceName: def.name,
    gender: def.gender,
    stability: 0.5,
  }
}
