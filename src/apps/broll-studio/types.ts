import type { VideoMode, ImageResolution } from '../../utils/models'

export type SceneType =
  | 'A-ROLL CHARACTER'
  | 'A-ROLL PRODUCT'
  | 'B-ROLL LIFESTYLE'
  | 'B-ROLL DETAIL'
  | 'B-ROLL REACTION'
  | 'B-ROLL ENVIRONMENT'

// Shot role for a variation. VAR_1 of every scene is always DIALOGUE (the
// lip-sync anchor) and VAR_5 is always STATIC (the locked anchor take); the
// three slots between them are picked by the LLM per line from the menu below,
// so the mix adapts to what each script line earns instead of forcing the same
// buckets on every scene.
//
// STATIC never comes from the LLM — it's synthesized client-side from a fixed
// template (see buildStaticDialoguePrompt) precisely so it does NOT vary, and
// is therefore absent from the model's selectable menu (ALL_TAGS).
export type VariationTag =
  | 'DIALOGUE'
  | 'STATIC'
  | 'ACTION'
  | 'EMOTIONAL'
  | 'PRODUCT'
  | 'POV'
  | 'ENVIRONMENT'
  | 'TRANSITION'
  | 'PROOF'

// LLM-emitted hint declaring which reference images this variation needs
// attached when we run image / reference-to-video generation. 'none' = no
// refs (rare — e.g. pure environment beats). 'character' = character only.
// 'product' = product only. 'both' = both refs. The card mirrors this into
// two user-overridable toggle pills (refsCharacter / refsProduct).
export type VariationRefs = 'character' | 'product' | 'both' | 'none'

// Where in the ad's narrative arc this line sits. Drives the LLM's choice
// of shot register (hook = urgent / mechanism = clearest / payoff = warm
// etc) — surfaced on the scene header for the user, otherwise informational.
export type LinePosition = 'hook' | 'reframe' | 'mechanism' | 'payoff' | 'CTA'

export interface PromptVariation {
  id: string
  // Canonical tag for chip coloring + filtering.
  tag: VariationTag
  // Descriptive shot label the LLM picks per the new prompt's menu (e.g.
  // "TALKING-TO-CAMERA / CLOSE-IN", "MIRROR REACTION"). Surfaced under the
  // tag chip so the user sees both the bucket and the actual shot intent.
  label: string
  // Which references the LLM thinks this variation should attach by default.
  // The user can override via the card's refs toggle pills.
  refs: VariationRefs
  prompt: string
}

export interface Scene {
  number: number
  type: SceneType
  scriptLine: string
  // Position of this line in the ad's arc. Informational for now.
  position?: LinePosition
  // LLM's call on whether the product is allowed on-screen for this line.
  // false on hook / reframe lines that should land before the product is
  // named. true once the line earns the product reveal.
  productVisible?: boolean
  variations: PromptVariation[]
}

export interface BrollResult {
  scenes: Scene[]
}

export interface ReferenceImage {
  dataUrl: string
  label: string
}

export interface BrollInput {
  productId: string | null
  modelId: string | null
  scriptId: string | null
  scriptText: string
  additionalContext: string
  productContext: string
  modelContext: string
  referenceImages: ReferenceImage[]
}

export interface GeneratedImage {
  imageUrl: string
  prompt: string
  // The image model that produced this generation, shown on the gallery tile.
  // Optional because entries persisted before this field existed won't have it.
  modelId?: string
  // Stamped on completion so the modal's right-column gallery can day-bucket
  // images the same way Playground does. Older persisted entries get
  // backfilled to Date.now() during hydrate.
  createdAt: number
}

// A completed video generation kept on the card. Multiple videos can be
// generated per card (regenerate, animate-from-different-stills, etc.) and
// the user picks which one is the "cover" — see CardState.selected.
export interface GeneratedVideo {
  url: string
  modelId: string
  prompt: string
  aspectRatio: string
  durationSeconds: number
  resolution: string
  audio: boolean
  mode: VideoMode
  sourceBRollId?: string
  createdAt: number
}

// Which output the user wants on the scene card's face. When unset, the
// face falls back to the most-recent generation (image preferred).
export interface SelectedOutput {
  kind: 'image' | 'video'
  index: number
}

// An image generation that's currently mid-flight. Stored as an array on
// CardState so the user can fire multiple Generate Image clicks in parallel
// (matches Playground's parallel queue). Each entry survives a refresh via
// usePersistedState; the resume effect picks them up by taskId.
export interface InFlightImage {
  id: string
  taskId: string | null
  modelId: string | null
  startedAt: number
  prompt: string
  aspectRatio: string
  resolution: string
  error?: string | null
}

// An in-flight video generation. Same parallel-queue semantics as images.
export interface InFlightVideo {
  id: string
  taskId: string | null
  modelId: string
  endpoint?: 'veo'
  startedAt: number
  prompt: string
  mode: VideoMode
  aspectRatio: string
  durationSeconds: number
  resolution: string
  audio: boolean
  sourceBRollId?: string
  error?: string | null
}

export interface CardState {
  editablePrompt: string
  // Linear undo/redo history for the prompt. Each entry is a snapshot pushed
  // on Done-after-edit, Enhance, or Regenerate prompt. promptHistoryIndex
  // points at the live entry; Undo decrements, Redo increments. Trimmed of
  // forward branch on new push.
  promptHistory: string[]
  promptHistoryIndex: number
  images: GeneratedImage[]
  currentImageIndex: number
  // Completed videos for this card. The legacy CardState held one `videoUrl`
  // string slot — the sanitize pass migrates that into the first entry here
  // so older sessions don't lose their videos.
  videos: GeneratedVideo[]
  currentVideoIndex: number
  // Which output appears on the scene card's face. Updated when the user
  // clicks a thumbnail in the modal's right column. Null = let the card
  // fall back to whatever generation it has (image preferred).
  selected: SelectedOutput | null
  // Parallel queue of mid-flight image generations. Each Generate Image
  // click pushes an entry; refresh-resume walks this list. On success the
  // entry is removed and the result appended to `images`.
  inFlightImages: InFlightImage[]
  // Same for videos.
  inFlightVideos: InFlightVideo[]
  isGeneratingImage: boolean
  imageError: string | null
  // Per-card image generation settings — owned by each card, not the page.
  // Switches the mini-playground modal's Image tab inputs.
  cardImageAspectRatio: string
  cardImageResolution: ImageResolution
  // Per-card video generation settings.
  cardVideoAspectRatio: string
  cardVideoDurationSeconds: number
  cardVideoResolution: string
  cardVideoAudio: boolean
  // True while the prompt-rewrite LLM call is in flight (Enhance or Regenerate).
  // Drives a "Working…" overlay on the prompt section.
  isPromptWorking?: boolean
  promptError?: string | null
  // In-flight kie taskId persisted across refresh so polling can resume.
  // Cleared once the image lands in `images[]` or when the user resets the card.
  pendingTaskId: string | null
  pendingModelId: string | null
  pendingStartedAt: number | null
  // Per-card manual override of which references attach when the user runs
  // image gen or reference-to-video. Initialised from the variation's `refs`
  // field via refsToToggles(), then preserved across regenerates.
  refsCharacter: boolean
  refsProduct: boolean
  // Video gen state for this card. The card produces at most one video at a time.
  videoStatus: 'idle' | 'generating' | 'error'
  videoUrl: string | null
  videoError: string | null
  videoTaskId: string | null
  videoModelId: string | null
  // 'veo' identifies the Veo custom endpoint so the resume effect picks the
  // right poller. Undefined for the standard createTask/recordInfo pipeline.
  videoEndpoint?: 'veo'
  videoStartedAt: number | null
  // Preserves save-linkage if the card's image was sourced from a bank still.
  videoSourceBRollId?: string
  // Snapshot of constraints used to start the in-flight video, so a resumed
  // history item is byte-identical to one finished in-session.
  videoAspectRatio: string | null
  videoDurationSeconds: number | null
  videoResolution: string | null
  videoAudio: boolean | null
  videoMode: VideoMode | null
  videoPrompt: string | null
}

// Helpers for translating the LLM's `refs` enum into the two toggle booleans
// the card stores. Kept in this module so OutputPanel + the migration in
// BrollStudio.tsx share the same logic.
export function refsToToggles(refs: VariationRefs): { refsCharacter: boolean; refsProduct: boolean } {
  switch (refs) {
    case 'character': return { refsCharacter: true, refsProduct: false }
    case 'product':   return { refsCharacter: false, refsProduct: true }
    case 'both':      return { refsCharacter: true, refsProduct: true }
    case 'none':      return { refsCharacter: false, refsProduct: false }
  }
}
