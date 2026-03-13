export type SceneType =
  | 'A-ROLL CHARACTER'
  | 'A-ROLL PRODUCT'
  | 'B-ROLL LIFESTYLE'
  | 'B-ROLL DETAIL'
  | 'B-ROLL REACTION'
  | 'B-ROLL ENVIRONMENT'

export interface PromptVariation {
  id: string
  label: string
  tag: 'LITERAL / ACTION' | 'EMOTIONAL / REACTION' | 'PRODUCT / DETAIL'
  prompt: string
}

export interface Scene {
  number: number
  type: SceneType
  scriptLine: string
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
  videoUrl: string | null
  isAnimating: boolean
}
