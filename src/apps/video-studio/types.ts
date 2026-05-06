export type VideoMode = 'text-to-video' | 'image-to-video'

export interface VideoGenInput {
  prompt: string
  mode: VideoMode
  firstFrameDataUri?: string
  aspectRatio: '9:16' | '16:9' | '1:1'
  durationSeconds: 4 | 5 | 6 | 8 | 10 | 12 | 15
  resolution: '480p' | '720p' | '1080p'
  modelId: string
}

export interface VideoGenResult {
  assetId: string
  durationSeconds: number
  aspectRatio: string
}
