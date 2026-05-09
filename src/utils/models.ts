// Model registry for UGC Lab.
//
// Single source of truth for every kie.ai model the app exposes. Add new entries
// here as we onboard models. Slugs must match kie.ai's `model` field exactly —
// confirm against the model's API doc page on https://docs.kie.ai/ before adding.
//
// Pricing is hard-coded from kie.ai's marketing pages (kie.ai/{model-slug}) and
// kie.ai/pricing — verify and update when prices drift. Last verified: 2026-05-09.

export type Task = 'chat' | 'vision' | 'image' | 'video' | 'tts'

export type ImageMode = 'text-to-image' | 'image-to-image' | 'image-edit'

export type VideoMode = 'text-to-video' | 'image-to-video' | 'frames-to-video' | 'reference-to-video'

// Union for cases where either category is acceptable (registry filters,
// per-app picker keys, etc.). Concrete callers should narrow.
export type Mode = ImageMode | VideoMode

export type Tag = 'recommended' | 'new' | 'fast' | 'cheap'

export interface Voice {
  id: string
  label: string
}

export interface Pricing {
  unit: 'per-call' | 'per-image' | 'per-second' | 'per-1k-tokens' | 'per-1k-chars'
  // kie.ai credits per unit. Refine per-model from https://kie.ai/pricing.
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
  charCount?: number
  resolution?: string
  audio?: boolean
}

export interface VideoConstraints {
  durations: number[]
  resolutions: string[]
  aspectRatios: string[]
  supportsAudio?: boolean
}

// Image-only: declarative caps for the image apps' resolution toggle.
// Resolutions are kie.ai's tier strings ('1K' | '2K' | '4K'). `default` is
// what new sessions land on if no user preference is stored — defaults to
// the first entry in `resolutions` if omitted.
export interface ImageConstraints {
  resolutions: string[]
  default?: string
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
  // Image-only: declarative caps for the resolution toggle.
  imageConstraints?: ImageConstraints
}

// Convention for default app ids: matches `AppConfig.id` in `src/utils/constants.ts`.
//   'ad-anatomy', 'script-architect', 'character-studio',
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
    // Source: https://kie.ai/gemini-3-flash. Input $0.15/M tokens (30 cr/M =
    // 0.030 cr/1k), output $0.90/M tokens (180 cr/M = 0.180 cr/1k). We use a
    // blended 0.10 since most chat calls in this app skew toward output.
    pricing: { unit: 'per-1k-tokens', credits: 0.1 },
    defaultFor: ['ad-anatomy', 'script-architect', 'character-studio', 'broll-studio'],
    chatEndpoint: '/gemini-3-flash/v1/chat/completions',
  },

  // ── Image generation ──────────────────────────────────────────

  // Image models — pricing from kie.ai/{slug} marketing pages. Resolution
  // tiers map to the `resolution` cost param: '1K' (default), '2K', '4K'.
  {
    id: 'nano-banana-2',
    displayName: 'Nano Banana 2',
    provider: 'Google',
    task: 'image',
    modes: ['text-to-image', 'image-to-image', 'image-edit'],
    tags: ['new'],
    supportsReferenceImages: true,
    pricing: {
      unit: 'per-image',
      credits: 8,
      priceFor: ({ imageCount = 1, resolution = '1K' }) => {
        const perImage = resolution === '4K' ? 18 : resolution === '2K' ? 12 : 8
        return perImage * imageCount
      },
    },
    imageConstraints: { resolutions: ['1K', '2K', '4K'] },
    defaultFor: ['character-studio'],
  },
  {
    id: 'flux-2/pro-text-to-image',
    displayName: 'Flux 2 Pro',
    provider: 'Black Forest Labs',
    task: 'image',
    modes: ['text-to-image'],
    tags: [],
    pricing: {
      unit: 'per-image',
      credits: 14,
      priceFor: ({ imageCount = 1, resolution = '1K' }) => {
        const perImage = resolution === '2K' ? 24 : 14  // Pro tier; Flash variant exists separately
        return perImage * imageCount
      },
    },
    imageConstraints: { resolutions: ['1K', '2K'] },
  },
  {
    id: 'seedream/5-lite-text-to-image',
    displayName: 'Seedream 5 Lite',
    provider: 'ByteDance',
    task: 'image',
    modes: ['text-to-image'],
    tags: ['new', 'fast'],
    pricing: { unit: 'per-image', credits: 3.5 },
    imageConstraints: { resolutions: ['1K'] },
  },
  {
    id: 'gpt-image-2-text-to-image',
    displayName: 'GPT Image 2',
    provider: 'OpenAI',
    task: 'image',
    modes: ['text-to-image'],
    tags: ['recommended'],
    pricing: {
      unit: 'per-image',
      credits: 3,
      priceFor: ({ imageCount = 1, resolution = '1K' }) => {
        const perImage = resolution === '4K' ? 8 : resolution === '2K' ? 5 : 3
        return perImage * imageCount
      },
    },
    imageConstraints: { resolutions: ['1K', '2K', '4K'], default: '2K' },
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
    pricing: {
      unit: 'per-image',
      credits: 6,
      priceFor: ({ imageCount = 1, resolution = '1K' }) => {
        const perImage = resolution === '4K' ? 16 : resolution === '2K' ? 10 : 6
        return perImage * imageCount
      },
    },
    imageConstraints: { resolutions: ['1K', '2K', '4K'], default: '2K' },
    defaultFor: ['broll-studio', 'character-studio'],
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
    // Per-second × resolution. Source: https://kie.ai/seedance-2-0 (the
    // marketing page lists a "with video input" tier we don't expose — none
    // of our flows pass a video URL, only image inputs, so the higher
    // text-or-image rate applies across the board).
    pricing: {
      unit: 'per-second',
      credits: 41,
      priceFor: ({ durationSeconds = 5, resolution = '720p' }) => {
        const perSec = resolution === '1080p' ? 102 : resolution === '720p' ? 41 : 19
        return perSec * durationSeconds
      },
    },
    videoEndpoint: 'createTask',
    videoConstraints: {
      durations: [4, 5, 6, 8, 10, 12, 15],
      resolutions: ['480p', '720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      supportsAudio: true,
    },
    defaultFor: ['broll-studio'],
  },
  {
    id: 'bytedance/seedance-2-fast',
    displayName: 'Seedance 2.0 Fast',
    provider: 'ByteDance',
    task: 'video',
    modes: ['text-to-video', 'image-to-video', 'frames-to-video', 'reference-to-video'],
    tags: ['fast', 'cheap'],
    supportsReferenceImages: true,
    pricing: {
      unit: 'per-second',
      credits: 33,
      priceFor: ({ durationSeconds = 5, resolution = '720p' }) => {
        const perSec = resolution === '720p' ? 33 : 15.5  // 480p
        return perSec * durationSeconds
      },
    },
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
  // Veo 3.1: per-video pricing keyed on (duration, resolution). Source:
  // https://kie.ai/veo-3-1. The tables below are total credits PER VIDEO
  // (not per second) — Veo bills the whole clip as a unit, with 5s and 10s
  // priced separately rather than linearly.
  {
    id: 'veo3_fast',
    displayName: 'Veo 3.1 Fast',
    provider: 'Google',
    task: 'video',
    modes: ['text-to-video', 'image-to-video', 'frames-to-video', 'reference-to-video'],
    tags: ['fast'],
    supportsReferenceImages: true,
    pricing: {
      unit: 'per-second',
      credits: 6,
      priceFor: ({ durationSeconds = 5, resolution = '720p' }) => {
        const long = durationSeconds >= 10
        if (resolution === '4k') return long ? 180 : 150
        if (resolution === '1080p') return long ? 65 : 35
        return long ? 60 : 30  // 720p
      },
    },
    videoEndpoint: 'veo',
    videoConstraints: {
      durations: [5, 10],
      resolutions: ['720p', '1080p', '4k'],
      aspectRatios: ['16:9', '9:16'],
    },
    defaultFor: ['video-studio'],
  },
  {
    id: 'veo3_lite',
    displayName: 'Veo 3.1 Lite',
    provider: 'Google',
    task: 'video',
    modes: ['text-to-video', 'image-to-video', 'frames-to-video'],
    tags: ['cheap'],
    pricing: {
      unit: 'per-second',
      credits: 2,
      priceFor: ({ durationSeconds = 5, resolution = '720p' }) => {
        const long = durationSeconds >= 10
        if (resolution === '4k') return long ? 60 : 50
        if (resolution === '1080p') return long ? 25 : 15
        return long ? 20 : 10  // 720p
      },
    },
    videoEndpoint: 'veo',
    videoConstraints: {
      durations: [5, 10],
      resolutions: ['720p', '1080p', '4k'],
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
      credits: 30,
      priceFor: ({ durationSeconds = 5, resolution = '720p' }) => {
        const long = durationSeconds >= 10
        if (resolution === '4k') return long ? 370 : 190
        if (resolution === '1080p') return long ? 255 : 155
        return long ? 250 : 150  // 720p
      },
    },
    videoEndpoint: 'veo',
    videoConstraints: {
      durations: [5, 10],
      resolutions: ['720p', '1080p', '4k'],
      aspectRatios: ['16:9', '9:16'],
    },
  },

  // ── Text-to-Speech ────────────────────────────────────────────
  // Voiceovers uses ElevenLabs Multilingual v2 exclusively (no picker).
  // Spec: https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2
  // Voice catalog lives in src/apps/voice-studio/types.ts — VOICES.

  {
    id: 'elevenlabs/text-to-speech-multilingual-v2',
    displayName: 'Eleven Multilingual v2',
    provider: 'ElevenLabs',
    task: 'tts',
    tags: ['recommended'],
    // Source: https://kie.ai/elevenlabs-tts. 12 credits per 1,000 characters.
    pricing: { unit: 'per-1k-chars', credits: 12 },
    defaultFor: ['voice-studio'],
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

// Convenience for chat-using services. Returns the registered chat endpoint
// path for the configured chat model, throwing if misconfigured.
export function getChatEndpointPath(modelId: string = 'gemini-3-flash'): string {
  const m = getModel(modelId)
  if (!m?.chatEndpoint) {
    throw new Error(`Chat model ${modelId} is missing a chatEndpoint. Check src/utils/models.ts.`)
  }
  return m.chatEndpoint
}

// ── Cost estimation ─────────────────────────────────────────────

export interface CostEstimateParams {
  durationSeconds?: number
  imageCount?: number
  tokenCount?: number
  charCount?: number
  resolution?: string
  audio?: boolean
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
    case 'per-1k-chars':
      return credits * ((params.charCount ?? 1000) / 1000)
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

export type ImageResolution = '1K' | '2K' | '4K'

export interface ImageGenOptions {
  prompt: string
  aspectRatio?: AspectRatio
  // kie.ai's resolution tier. Defaults to '1K'. Caller should clamp to the
  // model's supported set (`imageConstraints.resolutions`) before calling.
  resolution?: ImageResolution
  inputUrls?: string[]
}

export function buildImageInput(modelId: string, opts: ImageGenOptions): Record<string, unknown> {
  const ar = opts.aspectRatio ?? '9:16'
  const resolution = opts.resolution ?? '1K'

  if (modelId.startsWith('gpt-image-2')) {
    return {
      prompt: opts.prompt,
      aspect_ratio: ar,
      resolution,
      ...(opts.inputUrls?.length ? { input_urls: opts.inputUrls } : {}),
    }
  }
  if (modelId === 'nano-banana-2') {
    // Nano Banana 2 uses `image_input` (not `input_urls`) for refs.
    return {
      prompt: opts.prompt,
      aspect_ratio: ar,
      resolution,
      output_format: 'jpg',
      ...(opts.inputUrls?.length ? { image_input: opts.inputUrls } : {}),
    }
  }
  if (modelId === 'flux-2/pro-text-to-image') {
    return {
      prompt: opts.prompt,
      aspect_ratio: ar,
      resolution,
    }
  }
  if (modelId === 'seedream/5-lite-text-to-image') {
    // Seedream Lite is single-tier; map any resolution to its 'basic' quality.
    return {
      prompt: opts.prompt,
      aspect_ratio: ar,
      quality: resolution === '1K' ? 'basic' : 'high',
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
