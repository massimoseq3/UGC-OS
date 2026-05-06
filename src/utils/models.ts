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
  | 'frames-to-video'
  | 'reference-to-video'

export type Tag = 'recommended' | 'new' | 'fast' | 'cheap'

export interface Voice {
  id: string
  label: string
}

export interface Pricing {
  unit: 'per-call' | 'per-image' | 'per-second' | 'per-1k-tokens'
  usd: number
  // Approximate kie.ai credits per unit. 1 credit ≈ $0.01 baseline; refine
  // per-model from https://kie.ai/pricing as exact values become known.
  credits: number
  // Optional richer pricing curve for models whose cost depends on multiple
  // dimensions (e.g. Kling: resolution + audio; Veo: 4K is ~2× others).
  // When provided, supersedes the flat `credits` rate.
  priceFor?: (opts: PriceParams) => number
}

export interface PriceParams {
  durationSeconds?: number
  imageCount?: number
  tokenCount?: number
  resolution?: string
  audio?: boolean
}

export interface VideoConstraints {
  durations: number[]
  resolutions: string[]
  aspectRatios: string[]
  supportsAudio?: boolean
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
  // Video-only: which kie endpoint family to hit.
  // 'createTask' (default) -> POST /api/v1/jobs/createTask
  // 'veo'                  -> POST /api/v1/veo/generate
  videoEndpoint?: 'createTask' | 'veo'
  // Video-only: declarative caps the UI uses to render constraint controls.
  videoConstraints?: VideoConstraints
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
    pricing: { unit: 'per-1k-tokens', usd: 0.00015, credits: 0.015 },
    defaultFor: ['ad-anatomy', 'script-architect', 'image-dna', 'character-studio', 'broll-studio'],
    chatEndpoint: '/gemini-3-flash/v1/chat/completions',
  },

  // ── Image generation ──────────────────────────────────────────

  {
    id: 'nano-banana-2',
    displayName: 'Nano Banana 2',
    provider: 'Google',
    task: 'image',
    modes: ['text-to-image', 'image-to-image', 'image-edit'],
    tags: ['new'],
    supportsReferenceImages: true,
    pricing: { unit: 'per-image', usd: 0.04, credits: 4 },
  },
  {
    id: 'flux-2/pro-text-to-image',
    displayName: 'Flux 2 Pro',
    provider: 'Black Forest Labs',
    task: 'image',
    modes: ['text-to-image'],
    tags: [],
    pricing: { unit: 'per-image', usd: 0.05, credits: 5 },
  },
  {
    id: 'seedream/5-lite-text-to-image',
    displayName: 'SeeDream 5 Lite',
    provider: 'ByteDance',
    task: 'image',
    modes: ['text-to-image'],
    tags: ['new', 'fast'],
    pricing: { unit: 'per-image', usd: 0.03, credits: 3 },
  },
  {
    id: 'google/imagen4',
    displayName: 'Imagen 4',
    provider: 'Google',
    task: 'image',
    modes: ['text-to-image'],
    tags: [],
    pricing: { unit: 'per-image', usd: 0.04, credits: 4 },
  },
  {
    id: 'gpt-image-2-text-to-image',
    displayName: 'GPT Image 2',
    provider: 'OpenAI',
    task: 'image',
    modes: ['text-to-image'],
    tags: ['recommended'],
    pricing: { unit: 'per-image', usd: 0.04, credits: 4 },
    defaultFor: ['broll-studio', 'character-studio'],
  },
  {
    id: 'gpt-image-2-image-to-image',
    displayName: 'GPT Image 2 (Edit)',
    provider: 'OpenAI',
    task: 'image',
    modes: ['image-to-image', 'image-edit'],
    tags: ['recommended'],
    supportsReferenceImages: true,
    pricing: { unit: 'per-image', usd: 0.04, credits: 4 },
  },

  // ── Video generation ──────────────────────────────────────────

  {
    id: 'bytedance/seedance-2',
    displayName: 'Seedance 2.0',
    provider: 'ByteDance',
    task: 'video',
    modes: ['text-to-video', 'image-to-video', 'frames-to-video', 'reference-to-video'],
    tags: ['recommended', 'new'],
    supportsReferenceImages: true,
    pricing: { unit: 'per-second', usd: 0.10, credits: 10 },
    videoEndpoint: 'createTask',
    videoConstraints: {
      durations: [4, 5, 6, 8, 10, 12, 15],
      resolutions: ['480p', '720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      supportsAudio: true,
    },
    defaultFor: ['broll-studio', 'video-studio'],
  },
  {
    id: 'bytedance/seedance-2-fast',
    displayName: 'Seedance 2.0 Fast',
    provider: 'ByteDance',
    task: 'video',
    modes: ['text-to-video', 'image-to-video', 'frames-to-video', 'reference-to-video'],
    tags: ['fast', 'cheap'],
    supportsReferenceImages: true,
    pricing: { unit: 'per-second', usd: 0.05, credits: 5 },
    videoEndpoint: 'createTask',
    videoConstraints: {
      durations: [4, 5, 6, 8, 10, 12, 15],
      resolutions: ['480p', '720p'],
      aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
      supportsAudio: true,
    },
  },
  {
    id: 'kling-3.0/video',
    displayName: 'Kling 3.0',
    provider: 'Kling AI',
    task: 'video',
    modes: ['text-to-video', 'image-to-video', 'frames-to-video'],
    tags: ['new'],
    pricing: {
      unit: 'per-second',
      usd: 0.07,
      credits: 14,
      // mode + sound change pricing live (verified against kie.ai/kling-3-0)
      priceFor: ({ durationSeconds = 5, resolution = 'std', audio = false }) => {
        const perSec =
          resolution === '4K' ? 67 :
          resolution === 'pro' ? (audio ? 27 : 18) :
          /* std */              (audio ? 20 : 14)
        return perSec * durationSeconds
      },
    },
    videoEndpoint: 'createTask',
    videoConstraints: {
      durations: [3, 5, 7, 10, 15],
      resolutions: ['std', 'pro', '4K'],
      aspectRatios: ['16:9', '9:16', '1:1'],
      supportsAudio: true,
    },
  },
  {
    id: 'veo3_fast',
    displayName: 'Veo 3.1 Fast',
    provider: 'Google',
    task: 'video',
    modes: ['text-to-video', 'image-to-video', 'frames-to-video', 'reference-to-video'],
    tags: ['fast'],
    supportsReferenceImages: true,
    pricing: { unit: 'per-second', usd: 0.10, credits: 10 },
    videoEndpoint: 'veo',
    videoConstraints: {
      durations: [5, 10],
      resolutions: ['720p', '1080p', '4k'],
      aspectRatios: ['16:9', '9:16'],
    },
  },
  {
    id: 'veo3_lite',
    displayName: 'Veo 3.1 Lite',
    provider: 'Google',
    task: 'video',
    modes: ['text-to-video', 'image-to-video', 'frames-to-video'],
    tags: [],
    pricing: { unit: 'per-second', usd: 0.15, credits: 15 },
    videoEndpoint: 'veo',
    videoConstraints: {
      durations: [5, 10],
      resolutions: ['720p', '1080p'],
      aspectRatios: ['16:9', '9:16'],
    },
  },
  {
    id: 'veo3',
    displayName: 'Veo 3.1 Quality',
    provider: 'Google',
    task: 'video',
    modes: ['text-to-video', 'image-to-video', 'frames-to-video'],
    tags: [],
    pricing: {
      unit: 'per-second',
      usd: 0.30,
      credits: 30,
      // 4K is ~2× the cost of 720p/1080p on Veo Quality
      priceFor: ({ durationSeconds = 5, resolution = '720p' }) =>
        (resolution === '4k' ? 60 : 30) * durationSeconds,
    },
    videoEndpoint: 'veo',
    videoConstraints: {
      durations: [5, 10],
      resolutions: ['720p', '1080p', '4k'],
      aspectRatios: ['16:9', '9:16'],
    },
  },

  // ── Text-to-Speech ────────────────────────────────────────────
  // Voice Studio uses ElevenLabs Turbo 2.5 exclusively (no picker).
  // Voice catalog is a curated subset — full list at https://docs.kie.ai/market/elevenlabs/text-to-speech-turbo-2-5

  {
    id: 'elevenlabs/text-to-dialogue-v3',
    displayName: 'ElevenLabs v3',
    provider: 'ElevenLabs',
    task: 'tts',
    tags: ['recommended', 'new'],
    defaultFor: ['voice-studio'],
    // Voice catalog lives in src/apps/voice-studio/types.ts — VOICES — to keep
    // this registry focused on model metadata. Each voice in that list maps
    // to an ElevenLabs voice_id that the v3 endpoint accepts directly.
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
  resolution?: string
  audio?: boolean
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

export function estimateCredits(modelId: string, params: CostEstimateParams = {}): number | null {
  const model = getModel(modelId)
  if (!model?.pricing) return null
  if (model.pricing.priceFor) return model.pricing.priceFor(params)
  const { unit, credits } = model.pricing
  switch (unit) {
    case 'per-call':
      return credits
    case 'per-image':
      return credits * (params.imageCount ?? 1)
    case 'per-second':
      return credits * (params.durationSeconds ?? 5)
    case 'per-1k-tokens':
      return credits * ((params.tokenCount ?? 1000) / 1000)
  }
}

export function formatCredits(credits: number | null): string | null {
  if (credits === null) return null
  if (credits < 1) return `< 1 credit`
  const rounded = Math.round(credits * 10) / 10
  return `${rounded} credit${rounded === 1 ? '' : 's'}`
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
  if (modelId === 'nano-banana-2') {
    // Nano Banana 2 uses `image_input` (not `input_urls`) for refs.
    return {
      prompt: opts.prompt,
      aspect_ratio: ar,
      resolution: high ? '2K' : '1K',
      output_format: 'jpg',
      ...(opts.inputUrls?.length ? { image_input: opts.inputUrls } : {}),
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

// ── Per-model video input builders ────────────────────────────
//
// Each video model expects a different body shape (Seedance:
// first_frame_url + last_frame_url, Kling: image_urls[] + mode + sound,
// Veo: imageUrls[] + model + generationType). This helper produces the
// right shape per model.

export type VideoMode = 'text-to-video' | 'image-to-video' | 'frames-to-video' | 'reference-to-video'

export interface VideoGenOptions {
  prompt: string
  mode: VideoMode
  aspectRatio?: string
  duration?: number
  resolution?: string
  audio?: boolean
  // Public URLs (already uploaded via ensureHostedUrl by the caller).
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[]
  imageUrl?: string  // single first-frame for image-to-video mode
}

export function buildVideoInput(modelId: string, opts: VideoGenOptions): Record<string, unknown> {
  const m = getModel(modelId)
  if (!m) throw new Error(`Unknown model: ${modelId}`)

  const ar = opts.aspectRatio ?? '9:16'
  const duration = opts.duration ?? 5
  const resolution = opts.resolution ?? '720p'

  // ── Veo family ──
  if (modelId.startsWith('veo3')) {
    const imageUrls: string[] = []
    let generationType: 'TEXT_2_VIDEO' | 'FIRST_AND_LAST_FRAMES_2_VIDEO' | 'REFERENCE_2_VIDEO' = 'TEXT_2_VIDEO'

    if (opts.mode === 'image-to-video' && opts.imageUrl) {
      imageUrls.push(opts.imageUrl)
      generationType = 'FIRST_AND_LAST_FRAMES_2_VIDEO'
    } else if (opts.mode === 'frames-to-video') {
      if (opts.firstFrameUrl) imageUrls.push(opts.firstFrameUrl)
      if (opts.lastFrameUrl) imageUrls.push(opts.lastFrameUrl)
      generationType = 'FIRST_AND_LAST_FRAMES_2_VIDEO'
    } else if (opts.mode === 'reference-to-video' && opts.referenceImageUrls?.length) {
      imageUrls.push(...opts.referenceImageUrls)
      generationType = 'REFERENCE_2_VIDEO'
    }

    return {
      prompt: opts.prompt,
      model: modelId,            // 'veo3' | 'veo3_fast' | 'veo3_lite'
      generationType,
      ...(imageUrls.length > 0 ? { imageUrls } : {}),
      aspect_ratio: ar,
      resolution,
    }
  }

  // ── Kling 3.0 ──
  if (modelId === 'kling-3.0/video') {
    const imageUrls: string[] = []
    if (opts.mode === 'image-to-video' && opts.imageUrl) imageUrls.push(opts.imageUrl)
    if (opts.mode === 'frames-to-video') {
      if (opts.firstFrameUrl) imageUrls.push(opts.firstFrameUrl)
      if (opts.lastFrameUrl) imageUrls.push(opts.lastFrameUrl)
    }
    return {
      prompt: opts.prompt,
      ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
      mode: resolution,           // 'std' | 'pro' | '4K' — Kling reuses the 'mode' field for tier
      sound: opts.audio ?? false,
      duration: String(duration), // Kling expects string enum
      aspect_ratio: ar,
      multi_shots: false,
    }
  }

  // ── Seedance 2.0 family (default) ──
  return {
    prompt: opts.prompt,
    ...(opts.firstFrameUrl ? { first_frame_url: opts.firstFrameUrl } : {}),
    ...(opts.lastFrameUrl ? { last_frame_url: opts.lastFrameUrl } : {}),
    ...(opts.imageUrl && opts.mode === 'image-to-video' ? { first_frame_url: opts.imageUrl } : {}),
    ...(opts.referenceImageUrls?.length ? { reference_image_urls: opts.referenceImageUrls } : {}),
    aspect_ratio: ar,
    duration,
    resolution,
    generate_audio: opts.audio ?? true,
  }
}

// ── Tag styling helper ─────────────────────────────────────────

export const TAG_STYLES: Record<Tag, { label: string; className: string }> = {
  recommended: { label: 'Recommended', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  new: { label: 'New', className: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20' },
  fast: { label: 'Fast', className: 'bg-sky-500/15 text-sky-300 border-sky-500/20' },
  cheap: { label: 'Cheap', className: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/20' },
}
