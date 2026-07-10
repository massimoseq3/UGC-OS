export type Gender = 'Female' | 'Male'

// Categories surfaced from the kie.ai ElevenLabs catalog. Filter chips in
// the picker map 1:1 onto these.
export type VoiceCategory =
  | 'Narration'
  | 'Conversational'
  | 'Social Media'
  | 'Characters'
  | 'Educational'
  | 'Advertisement'
  | 'Entertainment'

export const VOICE_CATEGORIES: VoiceCategory[] = [
  'Narration',
  'Conversational',
  'Social Media',
  'Characters',
  'Educational',
  'Advertisement',
  'Entertainment',
]

export interface VoiceOption {
  id: string                // ElevenLabs voice_id
  name: string              // Display name (without descriptor)
  description: string       // Short style descriptor shown beneath the name
  category: VoiceCategory
  gender?: Gender
}

// Full catalog from the kie.ai ElevenLabs OpenAPI enum. Voice IDs are shared
// across the ElevenLabs models, so the same list drives text-to-dialogue-v3.
// Voice IDs are copied verbatim — do not edit by hand. Each voice is assigned
// the most specific category from ElevenLabs' marketing buckets.
export const VOICES: VoiceOption[] = [
  // ── Narration ──────────────────────────────────────────────────
  { id: 'EkK5I93UQWFDigLMpZcX', name: 'James',          description: 'Husky, engaging and bold',           category: 'Narration',     gender: 'Male' },
  { id: 'Z3R5wn05IrDiVCyEkUrK', name: 'Arabella',       description: 'Mysterious and emotive',             category: 'Narration',     gender: 'Female' },
  { id: 'NNl6r8mD7vthiJatiJt1', name: 'Bradford',       description: 'Expressive and articulate',          category: 'Narration',     gender: 'Male' },
  { id: '5l5f8iK3YPeGga21rQIX', name: 'Adeline',        description: 'Feminine and conversational',        category: 'Narration',     gender: 'Female' },
  { id: 'x70vRnQBMBu4FAYhjJbO', name: 'Nathan',         description: 'Virtual radio host',                 category: 'Narration',     gender: 'Male' },
  { id: 'P1bg08DkjqiVEzOn76yG', name: 'Viraj',          description: 'Rich and soft',                      category: 'Narration',     gender: 'Male' },
  { id: 'qDuRKMlYmrm8trt5QyBn', name: 'Taksh',          description: 'Calm, serious and smooth',           category: 'Narration',     gender: 'Male' },
  { id: 'eR40ATw9ArzDf9h3v7t7', name: 'Addison 2.0',    description: 'Australian audiobook & podcast',     category: 'Narration' },
  { id: '8JVbfL6oEdmuxKn5DK2C', name: 'Johnny Kid',     description: 'Serious and calm narrator',          category: 'Narration',     gender: 'Male' },
  { id: 'iCrDUkL56s3C8sCRl7wb', name: 'Hope',           description: 'Poetic, romantic and captivating',   category: 'Narration',     gender: 'Female' },
  { id: 'wJqPPQ618aTW29mptyoc', name: 'Ana Rita',       description: 'Smooth, expressive and bright',      category: 'Narration',     gender: 'Female' },
  { id: 'EiNlNiXeDU1pqqOPrYMO', name: 'John Doe',       description: 'Deep',                               category: 'Narration',     gender: 'Male' },
  { id: '4YYIPFl9wE5c4L2eu2Gb', name: 'Burt Reynolds',  description: 'Deep, smooth and clear',             category: 'Narration',     gender: 'Male' },
  { id: 'YXpFCvM1S3JbWEJhoskW', name: 'Wyatt',          description: 'Wise rustic cowboy',                 category: 'Narration',     gender: 'Male' },
  { id: '1U02n4nD6AdIZ9CjF053', name: 'Viraj',          description: 'Smooth and gentle',                  category: 'Narration',     gender: 'Male' },
  { id: 'AeRdCCKzvd23BpJoofzx', name: 'Nathaniel',      description: 'Engaging, British and calm',         category: 'Narration',     gender: 'Male' },
  { id: 'LruHrtVF6PSyGItzMNHS', name: 'Benjamin',       description: 'Deep, warm, calming',                category: 'Narration',     gender: 'Male' },

  // ── Conversational ─────────────────────────────────────────────
  { id: '1SM7GgM6IMuvQlz2BwM3', name: 'Mark',           description: 'Casual, relaxed and light',          category: 'Conversational', gender: 'Male' },
  { id: 'scOwDtmlUjD3prqpp97I', name: 'Sam',            description: 'Support agent',                      category: 'Conversational', gender: 'Male' },
  { id: 'NOpBlnGInO9m6vDvFkFC', name: 'Spuds Oxley',    description: 'Wise and approachable',              category: 'Conversational', gender: 'Male' },
  { id: 'BZgkqPqms7Kj9ulSkVzn', name: 'Eve',            description: 'Authentic, energetic and happy',     category: 'Conversational', gender: 'Female' },
  { id: 'UgBBYS2sOqTuMpoF3BR0', name: 'Mark',           description: 'Natural conversations',              category: 'Conversational', gender: 'Male' },
  { id: 'uYXf8XasLslADfZ2MB4u', name: 'Hope',           description: 'Bubbly, gossipy and girly',          category: 'Conversational', gender: 'Female' },
  { id: 'gs0tAILXbY5DNrJrsM6F', name: 'Jeff',           description: 'Classy, resonating and strong',      category: 'Conversational', gender: 'Male' },
  { id: 'DTKMou8ccj1ZaWGBiotd', name: 'Jamahal',        description: 'Young, vibrant and natural',         category: 'Conversational', gender: 'Male' },
  { id: 'vBKc2FfBKJfcZNyEt1n6', name: 'Finn',           description: 'Youthful, eager and energetic',      category: 'Conversational', gender: 'Male' },
  { id: 'DYkrAHD8iwork3YSUBbs', name: 'Tom',            description: 'Conversations & books',              category: 'Conversational', gender: 'Male' },
  { id: '56AoDkrOh6qfVPDXZ7Pt', name: 'Cassidy',        description: 'Crisp, direct and clear',            category: 'Conversational', gender: 'Female' },
  { id: 'g6xIsTj2HwM6VR4iXFCw', name: 'Jessica',        description: 'Chatty and friendly',                category: 'Conversational', gender: 'Female' },
  { id: 'lcMyyd2HUfFzxdCaC4Ta', name: 'Lucy',           description: 'Fresh & casual',                     category: 'Conversational', gender: 'Female' },
  { id: '6aDn1KB0hjpdcocrUkmq', name: 'Tiffany',        description: 'Natural and welcoming',              category: 'Conversational', gender: 'Female' },
  { id: 'Sq93GQT4X1lKDXsQcixO', name: 'Felix',          description: 'Warm, positive & contemporary RP',   category: 'Conversational', gender: 'Male' },
  { id: 'hqfrgApggtO1785R4Fsn', name: 'Theodore HQ',    description: 'Serene and grounded',                category: 'Conversational', gender: 'Male' },

  // ── Social Media ───────────────────────────────────────────────
  { id: '2zRM7PkgwBPiau2jvVXc', name: 'Monika Sogam',   description: 'Deep and natural',                   category: 'Social Media',   gender: 'Female' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',           description: 'Energetic, social media creator',    category: 'Social Media',   gender: 'Male' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura',          description: 'Enthusiast, quirky attitude',        category: 'Social Media',   gender: 'Female' },
  { id: 'kPzsL2i3teMYv0FxEYQ6', name: 'Brittney',       description: 'Fun, youthful & informative',        category: 'Social Media',   gender: 'Female' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian',          description: 'Deep, resonant and comforting',      category: 'Social Media',   gender: 'Male' },

  // ── Characters ─────────────────────────────────────────────────
  { id: 'YOq2y2Up4RgXP2HyXjE5', name: 'Xavier',         description: 'Dominating, metallic announcer',     category: 'Characters',     gender: 'Male' },
  { id: 'B8gJV1IhpuegLxdpXFOE', name: 'Kuon',           description: 'Cheerful, clear and steady',         category: 'Characters',     gender: 'Male' },
  { id: 'wo6udizrrtpIxWGp2qJk', name: 'Northern Terry', description: 'Northern English character',        category: 'Characters',     gender: 'Male' },
  { id: 'gU0LNdkMOQCOrPrwtbee', name: 'Football Announcer', description: 'British football announcer',     category: 'Characters',     gender: 'Male' },
  { id: 'DGzg6RaUqxGRTHSBjfgF', name: 'Brock',          description: 'Commanding, loud sergeant',          category: 'Characters',     gender: 'Male' },
  { id: 'Sm1seazb4gs7RSlUVw7c', name: 'Anika',          description: 'Animated, friendly and engaging',    category: 'Characters',     gender: 'Female' },
  { id: 'qXpMhyvQqiRxWQs4qSSB', name: 'Horatius',       description: 'Energetic character voice',          category: 'Characters',     gender: 'Male' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',         description: 'Husky trickster',                    category: 'Characters',     gender: 'Male' },
  { id: 'flHkNRp1BlvT73UL6gyz', name: 'Jessica',        description: 'Eloquent villain',                   category: 'Characters',     gender: 'Female' },
  { id: '9yzdeviXkFddZ4Oz8Mok', name: 'Lutz',           description: 'Chuckling, giggly and cheerful',     category: 'Characters',     gender: 'Male' },
  { id: 'pPdl9cQBQq4p6mRkZy2Z', name: 'Emma',           description: 'Adorable and upbeat',                category: 'Characters',     gender: 'Female' },
  { id: 'zYcjlYFOd3taleS0gkk3', name: 'Edward',         description: 'Loud, confident and cocky',          category: 'Characters',     gender: 'Male' },
  { id: 'nzeAacJi50IvxcyDnMXa', name: 'Marshal',        description: 'Friendly, funny professor',          category: 'Characters',     gender: 'Male' },
  { id: 'ruirxsoakN0GWmGNIo04', name: 'John Morgan',    description: 'Gritty, rugged cowboy',              category: 'Characters',     gender: 'Male' },
  { id: 'TC0Zp7WVFzhA8zpTlRqV', name: 'Aria',           description: 'Sultry villain',                     category: 'Characters',     gender: 'Female' },
  { id: 'ljo9gAlSqKOvF6D8sOsX', name: 'Viking Bjorn',   description: 'Epic medieval raider',               category: 'Characters',     gender: 'Male' },
  { id: 'PPzYpIqttlTYA83688JI', name: 'Pirate Marshal', description: 'Swashbuckling pirate',               category: 'Characters',     gender: 'Male' },
  { id: 'LG95yZDEHg6fCZdQjLqj', name: 'Phil',           description: 'Explosive, passionate announcer',    category: 'Characters',     gender: 'Male' },
  { id: 'CeNX9CMwmxDxUF5Q2Inm', name: 'Johnny Dynamite', description: 'Vintage radio DJ',                  category: 'Characters',     gender: 'Male' },
  { id: 'mtrellq69YZsNwzUSyXh', name: 'Rex Thunder',    description: 'Deep n tough',                       category: 'Characters',     gender: 'Male' },
  { id: 'dHd5gvgSOzSfduK4CvEg', name: 'Ed',             description: 'Late night announcer',               category: 'Characters',     gender: 'Male' },
  { id: 'eVItLK1UvXctxuaRV2Oq', name: 'Jean',           description: 'Alluring, playful femme fatale',     category: 'Characters',     gender: 'Female' },
  { id: 'esy0r39YPLQjOczyOib8', name: 'Britney',        description: 'Calm and calculative villain',       category: 'Characters',     gender: 'Female' },

  // ── Educational ────────────────────────────────────────────────
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella',          description: 'Professional, bright, warm',         category: 'Educational',    gender: 'Female' },
  { id: 'MJ0RnG71ty4LH3dvNfSd', name: 'Leon',           description: 'Soothing and grounded',              category: 'Educational',    gender: 'Male' },

  // ── Advertisement ──────────────────────────────────────────────
  { id: 'Tsns2HvNFKfGiNjllgqo', name: 'Sven',           description: 'Emotional and nice',                 category: 'Advertisement',  gender: 'Male' },

  // ── Entertainment ──────────────────────────────────────────────
  { id: '6F5Zhi321D3Oq7v1oNT4', name: 'Hank',           description: 'Deep and engaging narrator',         category: 'Entertainment',  gender: 'Male' },
  { id: 'aD6riP1btT197c6dACmy', name: 'Rachel M',       description: 'Pro British radio presenter',        category: 'Entertainment',  gender: 'Female' },
  { id: '1wGbFxmAM3Fgw63G1zZJ', name: 'Allison',        description: 'Calm, soothing and meditative',      category: 'Entertainment',  gender: 'Female' },
]

export function getVoiceById(id: string): VoiceOption | undefined {
  return VOICES.find((v) => v.id === id)
}

// The two ElevenLabs TTS models the Voiceovers picker offers. V2 is the default
// (no prompt engineering needed); V3 is more expressive but expects audio tags.
export const TTS_V2_MODEL_ID = 'elevenlabs/text-to-speech-multilingual-v2'
export const TTS_V3_MODEL_ID = 'elevenlabs/text-to-dialogue-v3'

export function isV3(modelId: string): boolean {
  return modelId === TTS_V3_MODEL_ID
}

export interface VoiceSettings {
  // Which ElevenLabs model to call — see TTS_V2_MODEL_ID / TTS_V3_MODEL_ID.
  modelId: string
  voiceId: string
  voiceName: string
  gender?: Gender
  // V2: continuous 0–1. V3: discrete 0 / 0.5 / 1 (see STABILITY_OPTIONS).
  stability: number
  // V2-only knobs. V3 (Text to Dialogue) ignores these — it drives delivery
  // through audio tags in the text instead.
  similarityBoost: number    // 0–1
  style: number              // 0–1   (style exaggeration)
  speed: number              // 0.7–1.2
}

// The three stability presets v3 accepts (step 0.5). Labels match ElevenLabs'
// own naming for the setting.
export const STABILITY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Creative' },
  { value: 0.5, label: 'Natural' },
  { value: 1, label: 'Robust' },
]

export function stabilityLabel(value: number): string {
  return STABILITY_OPTIONS.find((o) => o.value === value)?.label ?? 'Natural'
}

// Snap an arbitrary stability onto the v3 grid (0 / 0.5 / 1) when switching a
// V2 value into V3, which only accepts those three.
export function snapStability(value: number): number {
  return Math.round(value * 2) / 2
}

export const DEFAULT_VOICE_SETTINGS: Omit<VoiceSettings, 'voiceId' | 'voiceName' | 'gender' | 'modelId'> = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0,
  speed: 1,
}

export interface HistoryItem {
  id: string
  modelId: string
  voiceId: string
  voiceName: string
  gender?: Gender
  stability: number
  similarityBoost: number
  style: number
  speed: number
  scriptText: string
  scriptPreview: string
  audioUrl: string
  duration: number
  createdAt: number
}

export function createDefaultSettings(): VoiceSettings {
  // Default to "Liam — Energetic, Social Media Creator" since this app is
  // built for AI UGC ads. Falls back to first voice if Liam ever leaves the
  // catalog. Defaults to V2 — the no-prompt-engineering model.
  const def = VOICES.find((v) => v.id === 'TX3LPaxmHKxFdv7VOQHJ') ?? VOICES[0]
  return {
    modelId: TTS_V2_MODEL_ID,
    voiceId: def.id,
    voiceName: def.name,
    gender: def.gender,
    ...DEFAULT_VOICE_SETTINGS,
  }
}

// Backfill any fields missing from persisted settings — chiefly `modelId` and
// the V2 param set, which older saved settings (pre model-picker) don't carry.
// Wired as usePersistedState's `sanitize` so hydration can't yield a partial
// object that crashes the sliders or sends an undefined modelId to kie.
export function normalizeSettings(s: Partial<VoiceSettings> | null | undefined): VoiceSettings {
  const base = createDefaultSettings()
  if (!s || typeof s !== 'object') return base
  return {
    ...base,
    ...s,
    modelId: typeof s.modelId === 'string' ? s.modelId : base.modelId,
    stability: typeof s.stability === 'number' ? s.stability : base.stability,
    similarityBoost: typeof s.similarityBoost === 'number' ? s.similarityBoost : base.similarityBoost,
    style: typeof s.style === 'number' ? s.style : base.style,
    speed: typeof s.speed === 'number' ? s.speed : base.speed,
  }
}
