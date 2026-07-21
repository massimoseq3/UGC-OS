export type Gender = 'Female' | 'Male'

// Gemini 3.1 Flash TTS ships 30 prebuilt voices. We group them by delivery
// vibe so the picker's filter chips are useful for ad work (not by gender —
// gender is shown separately). Each voice's `description` is Google's canonical
// one-word character for that voice.
export type VoiceCategory =
  | 'Energetic'
  | 'Warm'
  | 'Authoritative'
  | 'Friendly'

export const VOICE_CATEGORIES: VoiceCategory[] = [
  'Energetic',
  'Warm',
  'Authoritative',
  'Friendly',
]

export interface VoiceOption {
  // For Gemini the voice IS the name (e.g. "Zephyr") — it's what the API's
  // `voice_name` field wants. `id` mirrors it so bank rows / seed colours keep
  // keying on a stable string.
  id: string
  name: string
  description: string       // Google's one-word character for the voice
  category: VoiceCategory
  gender?: Gender
}

// The 30 Gemini 3.1 Flash TTS voices. Names + genders are from Google's TTS
// voice docs; the one-word characters are Google's published descriptors.
// Do not rename — the name is the `voice_name` sent to kie.ai.
export const VOICES: VoiceOption[] = [
  // ── Energetic ──────────────────────────────────────────────────
  { id: 'Puck',          name: 'Puck',          description: 'Upbeat and lively',        category: 'Energetic',     gender: 'Male' },
  { id: 'Zephyr',        name: 'Zephyr',        description: 'Bright and clear',         category: 'Energetic',     gender: 'Female' },
  { id: 'Autonoe',       name: 'Autonoe',       description: 'Bright and buoyant',       category: 'Energetic',     gender: 'Female' },
  { id: 'Laomedeia',     name: 'Laomedeia',     description: 'Upbeat and peppy',         category: 'Energetic',     gender: 'Female' },
  { id: 'Fenrir',        name: 'Fenrir',        description: 'Excitable and eager',      category: 'Energetic',     gender: 'Male' },
  { id: 'Sadachbia',     name: 'Sadachbia',     description: 'Lively and animated',      category: 'Energetic',     gender: 'Male' },
  { id: 'Pulcherrima',   name: 'Pulcherrima',   description: 'Forward and expressive',   category: 'Energetic',     gender: 'Female' },

  // ── Warm ───────────────────────────────────────────────────────
  { id: 'Sulafat',       name: 'Sulafat',       description: 'Warm and inviting',        category: 'Warm',          gender: 'Female' },
  { id: 'Achernar',      name: 'Achernar',      description: 'Soft and gentle',          category: 'Warm',          gender: 'Female' },
  { id: 'Vindemiatrix',  name: 'Vindemiatrix',  description: 'Gentle and soothing',      category: 'Warm',          gender: 'Female' },
  { id: 'Aoede',         name: 'Aoede',         description: 'Breezy and easy',          category: 'Warm',          gender: 'Female' },
  { id: 'Enceladus',     name: 'Enceladus',     description: 'Breathy and mellow',       category: 'Warm',          gender: 'Male' },
  { id: 'Algieba',       name: 'Algieba',       description: 'Smooth and rich',          category: 'Warm',          gender: 'Male' },
  { id: 'Despina',       name: 'Despina',       description: 'Smooth and calm',          category: 'Warm',          gender: 'Female' },

  // ── Authoritative ──────────────────────────────────────────────
  { id: 'Charon',        name: 'Charon',        description: 'Informative and steady',   category: 'Authoritative', gender: 'Male' },
  { id: 'Rasalgethi',    name: 'Rasalgethi',    description: 'Informative and precise',  category: 'Authoritative', gender: 'Male' },
  { id: 'Kore',          name: 'Kore',          description: 'Firm and confident',       category: 'Authoritative', gender: 'Female' },
  { id: 'Orus',          name: 'Orus',          description: 'Firm and grounded',        category: 'Authoritative', gender: 'Male' },
  { id: 'Alnilam',       name: 'Alnilam',       description: 'Firm and assured',         category: 'Authoritative', gender: 'Male' },
  { id: 'Iapetus',       name: 'Iapetus',       description: 'Clear and articulate',     category: 'Authoritative', gender: 'Male' },
  { id: 'Erinome',       name: 'Erinome',       description: 'Clear and crisp',          category: 'Authoritative', gender: 'Female' },
  { id: 'Algenib',       name: 'Algenib',       description: 'Gravelly and textured',    category: 'Authoritative', gender: 'Male' },
  { id: 'Schedar',       name: 'Schedar',       description: 'Even and measured',        category: 'Authoritative', gender: 'Male' },
  { id: 'Gacrux',        name: 'Gacrux',        description: 'Mature and composed',      category: 'Authoritative', gender: 'Female' },
  { id: 'Sadaltager',    name: 'Sadaltager',    description: 'Knowledgeable and calm',   category: 'Authoritative', gender: 'Male' },

  // ── Friendly ───────────────────────────────────────────────────
  { id: 'Achird',        name: 'Achird',        description: 'Friendly and open',        category: 'Friendly',      gender: 'Male' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', description: 'Casual and relaxed',       category: 'Friendly',      gender: 'Male' },
  { id: 'Leda',          name: 'Leda',          description: 'Youthful and fresh',       category: 'Friendly',      gender: 'Female' },
  { id: 'Callirrhoe',    name: 'Callirrhoe',    description: 'Easy-going and mellow',    category: 'Friendly',      gender: 'Female' },
  { id: 'Umbriel',       name: 'Umbriel',       description: 'Easy-going and laid back', category: 'Friendly',      gender: 'Male' },
]

export function getVoiceById(id: string): VoiceOption | undefined {
  return VOICES.find((v) => v.id === id)
}

// ── Delivery controls (Gemini 3.1 Flash TTS `speakers` fields) ──────
// These are the exact option sets kie.ai exposes for the model's `style`,
// `pace`, and `accent` selects — do not invent values, the model only
// recognizes these. Verified against https://kie.ai/gemini-3.1-flash-tts.
export const VOICE_STYLES = [
  'Vocal Smile',
  'Newscaster',
  'Whisper',
  'Empathetic',
  'Promo/Hype',
  'Deadpan',
] as const

export const VOICE_PACES = ['Natural', 'Rapid Fire', 'The Drift', 'Staccato'] as const

export const VOICE_ACCENTS = [
  'Neutral',
  'American (Gen)',
  'American (Valley)',
  'American (South)',
  'British (RP)',
  'British (Brixton)',
  'Transatlantic',
  'Australian',
] as const

export interface VoiceSettings {
  // For Gemini, voiceId === the voice_name (kept as `voiceId` so bank rows,
  // cloud sync, and seed colours don't have to change shape).
  voiceId: string
  voiceName: string
  gender?: Gender
  // Gemini 3.1 Flash TTS delivery parameters:
  style: string              // overall delivery style ('Natural' = neutral)
  pace: string               // 'Slow' | 'Natural' | 'Fast'
  accent: string             // 'Neutral' | 'American' | …
  temperature: number        // 0–2 — variation in delivery (1 = default)
  scene: string              // optional scene description (empty = unused)
  sampleContext: string      // optional overall tone / context (empty = unused)
}

export const DEFAULT_VOICE_SETTINGS: Omit<VoiceSettings, 'voiceId' | 'voiceName' | 'gender'> = {
  // 'Vocal Smile' = warm, engaged, natural — the best default for UGC ads
  // (kie's own default is the flat 'Deadpan', which reads wrong for ads).
  style: 'Vocal Smile',
  pace: 'Natural',
  accent: 'Neutral',
  temperature: 1,
  scene: '',
  sampleContext: '',
}

// Coerce any style/pace/accent that isn't a current option back to its default.
// Guards against settings persisted before the option lists changed (localStorage
// survives across versions and isn't run through the bank's migrateVoiceShape).
export function sanitizeVoiceSettings(s: VoiceSettings): VoiceSettings {
  const fix = (v: string, opts: readonly string[], fallback: string) =>
    opts.includes(v) ? v : fallback
  return {
    ...s,
    style: fix(s.style, VOICE_STYLES, DEFAULT_VOICE_SETTINGS.style),
    pace: fix(s.pace, VOICE_PACES, DEFAULT_VOICE_SETTINGS.pace),
    accent: fix(s.accent, VOICE_ACCENTS, DEFAULT_VOICE_SETTINGS.accent),
  }
}

export interface HistoryItem {
  id: string
  voiceId: string
  voiceName: string
  gender?: Gender
  style: string
  pace: string
  accent: string
  temperature: number
  scene?: string
  sampleContext?: string
  scriptText: string
  scriptPreview: string
  audioUrl: string
  duration: number
  createdAt: number
}

export function createDefaultSettings(): VoiceSettings {
  // Default to "Puck — Upbeat and lively": an energetic read that suits most
  // AI UGC ads. Falls back to the first voice if Puck ever leaves the catalog.
  const def = VOICES.find((v) => v.id === 'Puck') ?? VOICES[0]
  return {
    voiceId: def.id,
    voiceName: def.name,
    gender: def.gender,
    ...DEFAULT_VOICE_SETTINGS,
  }
}
