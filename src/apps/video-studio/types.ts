export type VideoMode = 'text-to-video' | 'image-to-video' | 'frames-to-video' | 'reference-to-video'

export interface VideoGenInput {
  prompt: string
  mode: VideoMode
  aspectRatio: string
  durationSeconds: number
  resolution: string
  audio?: boolean
  modelId: string
  // Per-mode inputs (caller passes whichever apply):
  firstFrameDataUri?: string
  lastFrameDataUri?: string
  referenceDataUris?: string[]
}

export interface VideoGenResult {
  assetId: string
  durationSeconds: number
  aspectRatio: string
}
