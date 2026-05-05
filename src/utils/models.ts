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
}

// Convention for default app ids: matches `AppConfig.id` in `src/utils/constants.ts`.
//   'ad-anatomy', 'script-architect', 'image-dna', 'character-studio',
//   'broll-studio', 'voice-studio', 'video-studio'

export const MODEL_REGISTRY: ModelEntry[] = [
  // ── Chat / Vision ─────────────────────────────────────────────

  {
    id: 'gemini-3-flash',
    displayName: 'Gemini 3 Flash',
    provider: 'Google',
    task: 'chat',
    tags: ['recommended', 'fast', 'cheap'],
    pricing: { unit: 'per-1k-tokens', usd: 0.00015 },
    defaultFor: ['ad-anatomy', 'script-architect', 'image-dna', 'character-studio', 'broll-studio'],
  },
  {
    id: 'gpt-5.5',
    displayName: 'GPT-5.5',
    provider: 'OpenAI',
    task: 'chat',
    tags: ['new'],
  },
  {
    id: 'claude-opus-4',
    displayName: 'Claude Opus 4',
    provider: 'Anthropic',
    task: 'chat',
    tags: [],
  },

  // ── Image generation ──────────────────────────────────────────

  {
    id: 'gpt-image-2-text-to-image',
    displayName: 'GPT Image 2',
    provider: 'OpenAI',
    task: 'image',
    modes: ['text-to-image'],
    tags: ['recommended'],
    pricing: { unit: 'per-image', usd: 0.04 },
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
    pricing: { unit: 'per-image', usd: 0.04 },
  },
  {
    id: 'wan-2.7-image',
    displayName: 'Wan 2.7 Image',
    provider: 'Wan',
    task: 'image',
    modes: ['text-to-image', 'image-to-image'],
    tags: ['new'],
    supportsReferenceImages: true,
  },

  // ── Video generation ──────────────────────────────────────────

  {
    id: 'seedance-2-0-text-to-video',
    displayName: 'Seedance 2.0',
    provider: 'ByteDance',
    task: 'video',
    modes: ['text-to-video'],
    tags: ['recommended', 'new'],
    pricing: { unit: 'per-second', usd: 0.10 },
    defaultFor: ['video-studio'],
  },
  {
    id: 'seedance-2-0-image-to-video',
    displayName: 'Seedance 2.0 (Animate)',
    provider: 'ByteDance',
    task: 'video',
    modes: ['image-to-video'],
    tags: ['recommended', 'new'],
    supportsReferenceImages: true,
    pricing: { unit: 'per-second', usd: 0.10 },
    defaultFor: ['broll-studio'],
  },
  {
    id: 'wan-2.7-video-text-to-video',
    displayName: 'Wan 2.7 Video',
    provider: 'Wan',
    task: 'video',
    modes: ['text-to-video'],
    tags: ['new'],
  },
  {
    id: 'happy-horse-1-0-text-to-video',
    displayName: 'HappyHorse 1.0',
    provider: 'Alibaba',
    task: 'video',
    modes: ['text-to-video', 'image-to-video'],
    tags: [],
    supportsReferenceImages: true,
  },

  // ── Text-to-Speech ────────────────────────────────────────────
  // Voice catalogs vary per engine. Confirmed slugs/voices to be added when we
  // wire up Voice Studio in Phase 5.
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

// ── Tag styling helper ─────────────────────────────────────────

export const TAG_STYLES: Record<Tag, { label: string; className: string }> = {
  recommended: { label: 'Recommended', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  new: { label: 'New', className: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20' },
  fast: { label: 'Fast', className: 'bg-sky-500/15 text-sky-300 border-sky-500/20' },
  cheap: { label: 'Cheap', className: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/20' },
}
