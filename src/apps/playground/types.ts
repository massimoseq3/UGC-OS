import type { Product, Model as Character, BRoll } from '../../stores/types'
import type { AspectRatio, ImageResolution, VideoMode } from '../../utils/models'

// One in-flight Playground generation. Persisted via usePersistedState so
// reload / app-switch / brief navigation doesn't lose the kie task — once
// `taskId` is populated, the resume-on-mount effect can poll it to completion
// even if this was a different session.
export interface InFlightGen {
  id: string
  mode: PlaygroundMode
  modelId: string
  prompt: string
  startedAt: number
  // Populated by startX once kie returns a taskId. Until then the job is
  // still in the createTask leg and isn't safely resumable.
  taskId?: string
  // Mode-specific resume params — kept narrow so the persisted blob stays small.
  imageParams?: {
    aspectRatio: AspectRatio
    resolution?: ImageResolution
  }
  videoParams?: {
    mode: VideoMode
    aspectRatio: string
    durationSeconds: number
    resolution: string
    audio: boolean
    // 'veo' identifies the Veo custom endpoint; '' / undefined = standard
    // createTask/recordInfo pipeline. Needed so resume picks the right poller.
    videoEndpoint?: 'veo'
  }
  musicParams?: {
    instrumental: boolean
  }
}

// One inline mention inserted into the prompt. We track the kind + the bank
// item id + the start/end character offsets into the prompt string so we can
// re-render the token chips and remove them when the user backspaces over.
export interface Mention {
  kind: 'product' | 'character' | 'broll'
  id: string
  // The display label used for the token in the prompt string. Wrapped in
  // square brackets in the textarea content, e.g. `[@Product:Nike Air]`.
  label: string
  // Character offsets into the prompt text (inclusive start, exclusive end)
  // for the token's bracketed substring.
  start: number
  end: number
}

export type PlaygroundMode = 'image' | 'video' | 'music'

export type BankReference =
  | { kind: 'product'; item: Product }
  | { kind: 'character'; item: Character }
  | { kind: 'broll'; item: BRoll }
