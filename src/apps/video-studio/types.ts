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

// One in-flight VideoStudio generation. Persisted via usePersistedState so a
// tab refresh / app switch can resume polling the kie task — once `taskId` is
// populated, the resume-on-mount effect can poll it to completion even from a
// fresh session. Entries without `taskId` (died inside startVideoTask before
// kie returned an id) and entries older than 30 min are evicted on mount.
export interface InFlightGen {
  id: string
  slotIndex: number
  modelId: string
  prompt: string
  aspectRatio: string
  durationSeconds: number
  resolution: string
  audio: boolean
  mode: VideoMode
  // Preserves save-linkage across a refresh: if the user started this
  // generation from a B-Roll Bank still, the resumed history item still knows
  // its source so Save to Bank appends to the source's videos[].
  sourceBRollId?: string
  // 'veo' identifies the Veo custom endpoint; '' / undefined = standard
  // createTask/recordInfo pipeline. Needed so resume picks the right poller.
  videoEndpoint?: 'veo'
  // Populated by startVideoTask once kie returns a taskId. Until then the job
  // is still in the createTask leg and isn't safely resumable.
  taskId?: string
  startedAt: number
}
