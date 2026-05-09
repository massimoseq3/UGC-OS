// A user-defined "smart folder" that aggregates references across banks. An
// item can belong to many projects (multi-membership). The active project,
// if set, auto-tags every newly created item via the bank store's add
// methods — see `useSettingsStore.activeProjectId`.
export interface Project {
  id: string
  name: string
  // Optional accent (hex) — used for chips/dots in the UI.
  color?: string
  createdAt: number
}

export interface Product {
  id: string
  productImage: string
  productName: string
  productDescription: string
  targetMarket: string
  painPoints: string
  usps: string
  benefits: string
  offer: string
  cta: string
  projectIds?: string[]
  createdAt: number
}

export interface Model {
  id: string
  characterImage: string
  jsonProfile: Record<string, unknown> | null
  name: string
  notes: string
  source: 'character-studio' | 'image-dna-extractor' | 'manual-import'
  projectIds?: string[]
  createdAt: number
}

export interface Script {
  id: string
  title: string
  scriptText: string
  linkedProductId: string
  source: 'script-architect' | 'manual'
  projectIds?: string[]
  createdAt: number
}

export interface VoicePreset {
  id: string
  label: string
  voiceId: string
  voiceName: string
  gender?: 'Female' | 'Male'
  stability: number
  similarityBoost: number
  style: number
  speed: number
  linkedModelId: string
  projectIds?: string[]
  createdAt: number
}

export interface BRollVideo {
  url: string
  aspectRatio: string
  createdAt: number
}

export interface BRoll {
  id: string
  imageUrl: string
  prompt: string
  productId?: string
  modelId?: string
  scriptId?: string
  videoUrl?: string
  videos?: BRollVideo[]
  projectIds?: string[]
  createdAt: number
}

// One generation in B-Roll Videos. Pushed automatically on every successful
// generate; rendered in the right-hand History panel as a Flow-style grid.
// `videoUrl` is an asset:// ref (see assetStore) so the blob persists across
// reloads. `linkedBRollId` is set if the user has saved the entry to the
// B-Roll bank — kept so the saved-state UI survives reloads.
export interface VideoHistoryItem {
  id: string
  modelId: string
  prompt: string
  mode: 'text-to-video' | 'image-to-video' | 'frames-to-video' | 'reference-to-video'
  aspectRatio: string
  durationSeconds?: number
  resolution?: string
  audio?: boolean
  videoUrl: string
  thumbnailUrl?: string
  linkedBRollId?: string
  // If this generation was kicked off from a B-Roll Bank still (i.e. the
  // slot's start frame, end frame, or one of the reference images came
  // from the bank), keep the source id so a later "Save to Bank" can
  // append the video to that record instead of creating a new one.
  sourceBRollId?: string
  projectIds?: string[]
  createdAt: number
}

export interface VoiceHistoryItem {
  id: string
  voiceId: string
  voiceName: string
  gender?: 'Female' | 'Male'
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

export interface InterAppPayload {
  targetApp: string
  targetField: string
  data: unknown
}
