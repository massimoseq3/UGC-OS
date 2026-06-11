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
  createdAt: number
  // undefined → legacy (no dot), false → draft (orange dot),
  // true → user-confirmed via Save (green dot).
  confirmed?: boolean
}

export interface Model {
  id: string
  characterImage: string
  jsonProfile: Record<string, unknown> | null
  name: string
  notes: string
  source: 'character-studio' | 'image-dna-extractor' | 'manual-import'
  createdAt: number
}

export interface Script {
  id: string
  title: string
  scriptText: string
  linkedProductId: string
  source: 'script-architect' | 'manual'
  // Distinguishes a generated ad script ('remix', default) from a
  // reverse-engineered reconstruction prompt ('reverse-engineer').
  // Drives the SCRIPT/PROMPT badge in the Scripts bank.
  kind?: 'remix' | 'reverse-engineer'
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
  createdAt: number
}

// One script generation in the Scripts tab — auto-pushed on every successful
// generateScript run. Holds 1 variation (reverse-engineer mode) or 3
// variations (write / remix modes). Local-only (no cloud sync yet).
export interface ScriptHistoryItem {
  id: string
  mode: 'write' | 'remix' | 'reverse-engineer'
  variations: string[]
  inputSummary: string
  linkedProductId?: string
  productName?: string
  // Full inputs captured at generation time so selecting a history row can
  // restore the left panel (not just the output). Optional for back-compat
  // with rows saved before this was added.
  winningTranscript?: string
  reversePrompt?: string
  additionalContext?: string
  // Write New mode inputs. Plain string/number so store types don't import
  // app-level unions.
  brief?: string
  writeStyle?: string
  writeFormat?: 'script' | 'scenes'
  writeLength?: number
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
  createdAt: number
}

// One generation in the Characters tab — auto-pushed on every successful
// generateCharacter run. `imageRef` is an asset:// id (IndexedDB + R2 mirror).
// `profile` is the full form snapshot so the preview modal's "Send to
// Characters" can replace the live form with this generation's exact inputs.
// `linkedModelId` is written when the user saves the entry to the Characters
// bank — kept so the saved-state badge survives reloads and the cleanup pass
// leaves the asset blob alone when the row is deleted.
export interface CharacterHistoryItem {
  id: string
  imageRef: string
  // The form values used to generate this image. Profile snapshot is loose
  // by design — extra keys are tolerated so new form fields don't break
  // hydration of older rows.
  profile: Record<string, string>
  modelId: string
  aspectRatio: string
  resolution?: string
  linkedModelId?: string
  createdAt: number
}

// One B-Roll session — generated scenes + full per-card state (images, videos,
// prompt history, ref toggles). Clicking restores the workspace to the exact
// state it was in when the snapshot was last saved. Images/videos are
// `asset://` refs so the blobs live in IndexedDB (or R2 mirror) and the row
// stays small.
export interface BrollHistoryItem {
  id: string
  createdAt: number
  inputSummary: string
  productId?: string
  modelId?: string
  scriptId?: string
  scriptText?: string
  context?: string
  // Both stored as opaque JSON so this file stays decoupled from
  // broll-studio's internal types.
  result: unknown
  cardStates: Record<string, unknown>
}

// One analysis in the Ad Analyzer. Pushed before the request starts so the
// History rail can show an in-flight row immediately. We don't keep the
// source ad blob long-term — `uploadedRef` is held only while status is
// 'analyzing', then deleted on success or error. `thumbnailRef` is the
// first-frame still that persists for the row's lifetime.
export interface AdAnatomyHistoryItem {
  id: string
  createdAt: number
  // 'analyzing' → request in flight (or queued); 'complete' → result set;
  // 'error' → request failed. Mount-time reconciler flips orphaned
  // 'analyzing' rows to 'error' since chat completions can't resume.
  status: 'analyzing' | 'complete' | 'error'
  // Title Case descriptor. Empty until status === 'complete'; UI falls back
  // to fileName in the meantime.
  adTitle: string
  fileName: string
  mediaKind: 'video' | 'image'
  thumbnailRef?: string
  // Source ad asset id — only present while status === 'analyzing'. Dropped
  // on success/error so the bank doesn't accumulate large video blobs.
  uploadedRef?: string
  // kie.ai job id. Set after createTask returns. Persisted so a refresh-
  // mid-analysis can resume polling instead of dropping the result. Missing
  // when the analyser falls back to the streaming transport.
  taskId?: string
  // Opaque JSON so types.ts stays decoupled from ad-anatomy's internal types.
  // Undefined until status === 'complete'.
  result?: unknown
  errorMessage?: string
}

export interface InterAppPayload {
  targetApp: string
  targetField: string
  data: unknown
}
