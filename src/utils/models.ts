// Model registry for UGC Lab.
//
// Single source of truth for every kie.ai model the app exposes. Add new entries
// here as we onboard models. Slugs must match kie.ai's `model` field exactly —
// confirm against the model's API doc page on https://docs.kie.ai/ before adding.
//
// Pricing is hard-coded from https://kie.ai/pricing — verify and update when prices
// drift. Last verified: 2026-05-05.

export type Task = 'chat' | 'vision' | 'image' | 'video' | 'tts'

export type Mode =
  | 'text-to-image'
  | 'image-to-image'
  | 'image-edit'
  | 'text-to-video'
  | 'image-to-video'

export type Tag = 'recommended' | 'new' | 'fast' | 'cheap'

export interface Voice {
  id: string
  label: string
}

export interface Pricing {
  unit: 'per-call' | 'per-image' | 'per-second' | 'per-1k-tokens'
  usd: number
}

export interface ModelEntry {
  id: string
  displayName: string
  provider: string
  task: Task
  modes?: Mode[]
  tags: Tag[]
  supportsReferenceImages?: boolean
  voices?: Voice[]
  fetchVoicesAtRuntime?: boolean
  pricing?: Pricing
  defaultFor?: string[]
  // Chat-only: OpenAI-compatible endpoint path on api.kie.ai.
  // e.g. '/gemini-3-flash/v1/chat/completions'
  chatEndpoint?: string
}

// Convention for default app ids: matches `AppConfig.id` in `src/utils/constants.ts`.
//   'ad-anatomy', 'script-architect', 'image-dna', 'character-studio',
//   'broll-studio', 'voice-studio', 'video-studio'

export const MODEL_REGISTRY: ModelEntry[] = [
  // ── Chat / Vision ─────────────────────────────────────────────

  // Chat: Gemini 3 Flash is hard-coded for every text/vision call across the app.
  // No model picker is exposed for chat — it adds friction without enough upside.
  {
    id: 'gemini-3-flash',
    displayName: 'Gemini 3 Flash',
    provider: 'Google',
    task: 'chat',
    tags: ['recommended', 'fast', 'cheap'],
    pricing: { unit: 'per-1k-tokens', usd: 0.00015 },
    defaultFor: ['ad-anatomy', 'script-architect', 'image-dna', 'character-studio', 'broll-studio'],
    chatEndpoint: '/gemini-3-flash/v1/chat/completions',
  },

  // ── Image generation ──────────────────────────────────────────

  {
    id: 'flux-2/pro-text-to-image',
    displayName: 'Flux 2 Pro',
    provider: 'Black Forest Labs',
    task: 'image',
    modes: ['text-to-image'],
    tags: ['recommended'],
    pricing: { unit: 'per-image', usd: 0.05 },
    defaultFor: ['character-studio'],
  },
  {
    id: 'seedream/5-lite-text-to-image',
    displayName: 'SeeDream 5 Lite',
    provider: 'ByteDance',
    task: 'image',
    modes: ['text-to-image'],
    tags: ['new', 'fast'],
    pricing: { unit: 'per-image', usd: 0.03 },
  },
  {
    id: 'google/imagen4',
    displayName: 'Imagen 4',
    provider: 'Google',
    task: 'image',
    modes: ['text-to-image'],
    tags: [],
    pricing: { unit: 'per-image', usd: 0.04 },
  },
  {
    id: 'gpt-image-2-text-to-image',
    displayName: 'GPT Image 2',
    provider: 'OpenAI',
    task: 'image',
    modes: ['text-to-image'],
    tags: [],
    pricing: { unit: 'per-image', usd: 0.04 },
    defaultFor: ['broll-studio'],
  },
  {
    id: 'gpt-image-2-image-to-image',
    displayName: 'GPT Image 2 (Edit)',
    provider: 'OpenAI',
    task: 'image',
    modes: ['image-to-image', 'image-edit'],
    tags: ['recommended'],
    supportsReferenceImages: true,
    pricing: { unit: 'per-image', usd: 0.04 },
  },

  // ── Video generation ──────────────────────────────────────────
  // Seedance 2.0 uses one slug for both modes — caller toggles by passing
  // first_frame_url (image-to-video) or omitting it (text-to-video).

  {
    id: 'bytedance/seedance-2',
    displayName: 'Seedance 2.0',
    provider: 'ByteDance',
    task: 'video',
    modes: ['text-to-video', 'image-to-video'],
    tags: ['recommended', 'new'],
    supportsReferenceImages: true,
    pricing: { unit: 'per-second', usd: 0.10 },
    defaultFor: ['broll-studio', 'video-studio'],
  },

  // ── Text-to-Speech ────────────────────────────────────────────
  // Voice Studio uses ElevenLabs Turbo 2.5 exclusively (no picker).
  // Voice catalog is a curated subset — full list at https://docs.kie.ai/market/elevenlabs/text-to-speech-turbo-2-5

  {
    id: 'elevenlabs/text-to-speech-turbo-2-5',
    displayName: 'ElevenLabs Turbo 2.5',
    provider: 'ElevenLabs',
    task: 'tts',
    tags: ['recommended', 'fast'],
    defaultFor: ['voice-studio'],
    voices: [
      { id: 'Rachel', label: 'Rachel — calm, warm female' },
      { id: 'Aria', label: 'Aria — expressive female' },
      { id: 'Roger', label: 'Roger — confident male' },
      { id: 'Sarah', label: 'Sarah — soft female' },
      { id: 'Laura', label: 'Laura — upbeat female' },
      { id: 'Charlie', label: 'Charlie — natural male' },
      { id: 'George', label: 'George — warm British male' },
    ],
  },
]

// ── Helpers ─────────────────────────────────────────────────────

export function getModel(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id)
}

export function listModels(filter: { task?: Task; mode?: Mode } = {}): ModelEntry[] {
  return MODEL_REGISTRY.filter((m) => {
    if (filter.task && m.task !== filter.task) return false
    if (filter.mode && (!m.modes || !m.modes.includes(filter.mode))) return false
    return true
  })
}

export function getDefaultModel(appId: string, task: Task, mode?: Mode): ModelEntry | undefined {
  const candidates = listModels({ task, mode })
  return candidates.find((m) => m.defaultFor?.includes(appId)) ?? candidates[0]
}

// ── Cost estimation ─────────────────────────────────────────────

export interface CostEstimateParams {
  durationSeconds?: number
  imageCount?: number
  tokenCount?: number
}

export function estimateCost(modelId: string, params: CostEstimateParams = {}): number | null {
  const model = getModel(modelId)
  if (!model?.pricing) return null
  const { unit, usd } = model.pricing
  switch (unit) {
    case 'per-call':
      return usd
    case 'per-image':
      return usd * (params.imageCount ?? 1)
    case 'per-second':
      return usd * (params.durationSeconds ?? 5)
    case 'per-1k-tokens':
      return usd * ((params.tokenCount ?? 1000) / 1000)
  }
}

export function formatCost(usd: number | null): string | null {
  if (usd === null) return null
  if (usd < 0.01) return `< $0.01`
  return `$${usd.toFixed(2)}`
}

// ── Per-model input builders ──────────────────────────────────
// Different image models on kie.ai accept different field names
// (resolution vs quality, omitted size, different aspect-ratio enums).
// Concentrate that knowledge here so callers don't need to care.

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3' | '21:9'

export interface ImageGenOptions {
  prompt: string
  aspectRatio?: AspectRatio
  sizeHint?: 'standard' | 'high'
  inputUrls?: string[]
}

export function buildImageInput(modelId: string, opts: ImageGenOptions): Record<string, unknown> {
  const ar = opts.aspectRatio ?? '9:16'
  const high = opts.sizeHint === 'high'

  if (modelId.startsWith('gpt-image-2')) {
    return {
      prompt: opts.prompt,
      aspect_ratio: ar,
      resolution: high ? '2K' : '1K',
      ...(opts.inputUrls?.length ? { input_urls: opts.inputUrls } : {}),
    }
  }
  if (modelId === 'flux-2/pro-text-to-image') {
    return {
      prompt: opts.prompt,
      aspect_ratio: ar,
      resolution: high ? '2K' : '1K',
    }
  }
  if (modelId === 'seedream/5-lite-text-to-image') {
    return {
      prompt: opts.prompt,
      aspect_ratio: ar,
      quality: high ? 'high' : 'basic',
    }
  }
  if (modelId === 'google/imagen4') {
    // Imagen 4 accepts only 1:1, 16:9, 9:16, 3:4, 4:3
    const allowed: AspectRatio[] = ['1:1', '16:9', '9:16', '3:4', '4:3']
    return {
      prompt: opts.prompt,
      aspect_ratio: allowed.includes(ar) ? ar : '9:16',
    }
  }
  // Fallback: send prompt + aspect_ratio and hope for the best
  return { prompt: opts.prompt, aspect_ratio: ar }
}

// ── Tag styling helper ─────────────────────────────────────────

export const TAG_STYLES: Record<Tag, { label: string; className: string }> = {
  recommended: { label: 'Recommended', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  new: { label: 'New', className: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20' },
  fast: { label: 'Fast', className: 'bg-sky-500/15 text-sky-300 border-sky-500/20' },
  cheap: { label: 'Cheap', className: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/20' },
}
