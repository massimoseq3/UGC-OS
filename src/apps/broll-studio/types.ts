import type { VideoMode } from '../../utils/models'

export type SceneType =
  | 'A-ROLL CHARACTER'
  | 'A-ROLL PRODUCT'
  | 'B-ROLL LIFESTYLE'
  | 'B-ROLL DETAIL'
  | 'B-ROLL REACTION'
  | 'B-ROLL ENVIRONMENT'

export type VariationTag =
  | 'DIALOGUE'
  | 'ACTION'
  | 'EMOTIONAL'
  | 'PRODUCT'

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
}

export interface CardState {
  editablePrompt: string
  images: GeneratedImage[]
  currentImageIndex: number
  isGeneratingImage: boolean
  imageError: string | null
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
