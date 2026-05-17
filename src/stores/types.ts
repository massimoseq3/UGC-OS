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
  // Which app saved this BRoll. Drives B-Roll's Gallery tab so it surfaces
  // only items the B-Roll workflow produced, not items saved from Playground.
  // Missing on legacy entries (pre-2026-05); treated as 'playground' for
  // gallery filter purposes.
  sourceApp?: 'broll-studio' | 'playground'
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
  // Which app produced this video. Drives B-Roll's Gallery tab so it ignores
  // Playground video gens. Missing on legacy entries; treated as 'playground'.
  sourceApp?: 'broll-studio' | 'playground'
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

// One generation in the Playground image tab. Pushed automatically on every
// successful image generation. `linkedBRollId` is set if the user has saved
// the image to the B-Rolls bank — kept so the saved badge survives reloads
// and so cleanup leaves the asset alone when the entry is deleted.
export interface ImageHistoryItem {
  id: string
  modelId: string
  prompt: string
  aspectRatio: string
  resolution?: string
  imageUrl: string
  linkedBRollId?: string
  projectIds?: string[]
  createdAt: number
}

// One script generation in the Scripts tab — auto-pushed on every successful
// generateScript run. Holds 1 variation (reverse-engineer mode) or 3
// variations (remix mode). Local-only (no cloud sync yet).
export interface ScriptHistoryItem {
  id: string
  mode: 'remix' | 'reverse-engineer'
  variations: string[]
  inputSummary: string
  linkedProductId?: string
  productName?: string
  projectIds?: string[]
  createdAt: number
}

// One generation in the Playground music tab. Pushed automatically on every
// successful Suno generation. audioRef is an asset:// id so the audio blob
// persists across reloads (IndexedDB + R2 mirror when cloud is active).
export interface MusicHistoryItem {
  id: string
  modelId: string
  prompt: string
  instrumental: boolean
  audioRef: string
  coverImageRef?: string
  title?: string
  durationSeconds?: number
  projectIds?: string[]
  createdAt: number
}

export interface InterAppPayload {
  targetApp: string
  targetField: string
  data: unknown
}
