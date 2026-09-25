// Flow's data model: blocks, the typed ports they wire through, and the values
// a run carries along the wires. The graph rules that act on these live in
// engine/ (pure TypeScript, unit-tested); what each block DOES when it runs
// lives in engine/executors/, which call the apps' own runners.

import type { Lineage } from '../../stores/types'
import type { BankType } from '../../utils/constants'

// ── Ports ──────────────────────────────────────────────────────────────────

// What travels along a wire. A wire connects an output to an input only when
// the input accepts the output's type (ACCEPTS in engine/catalog.ts).
export type PortType =
  | 'product'
  | 'character'
  | 'script'
  | 'text'
  | 'transcript'
  | 'audio'
  | 'image'
  | 'video'
  | 'voice'
  | 'style'
  | 'ad'
  | 'music'

export interface PortSpec {
  key: string
  label: string
  type: PortType
  // The block can't run without something here.
  required?: boolean
  // Takes everything wired in at once, and never multiplies the block's runs
  // (Playground's References).
  many?: boolean
}

// ── Blocks ─────────────────────────────────────────────────────────────────

export type BlockKind =
  | 'characters'
  | 'scripts'
  | 'voice'
  | 'broll'
  | 'playground'
  | 'scenes'
  | 'analyzer'
  | 'outliers'
  | 'edit'
  | 'bank'
  | 'image'
  | 'text'
  | 'list'
  | 'note'

// Where an app block's result comes from. Generate runs the app; From Bank
// and From History reuse something the member already has, cost nothing and
// are done the moment they're picked.
export type BlockSource = 'generate' | 'bank' | 'history'

// One output slot of a batch block (a hook, a face, an ad, a list entry).
// Slots exist before the block has ever run, so a single hook can be wired
// downstream ahead of time; a run fills them in order.
export interface FlowItem {
  id: string
  // Nothing downstream runs for an item that's off, so it costs nothing.
  off?: boolean
  // Deleted from a batch whose items are made in one call (a hook): the slot
  // stays so the others keep their place, but it's gone from the canvas and
  // hands on nothing. A face or a list entry is removed outright instead.
  deleted?: boolean
}

export interface FlowBlock {
  id: string
  kind: BlockKind
  // The member's own title ("Your Product"). Absent shows the kind's title.
  label?: string
  x: number
  y: number
  // Per-kind settings (engine/catalog.ts has each kind's defaults). Kept as a
  // loose record so a template from a newer build still loads — unknown keys
  // ride along untouched and the executors read only what they know.
  settings: Record<string, unknown>
  source?: BlockSource
  // The bank or history row a From Bank / From History block reuses, and the
  // row a Bank block hands on.
  pick?: string
  items?: FlowItem[]
  // Pause for Review: when this block finishes, its branch waits for the
  // member to keep the results worth spending more on.
  review?: boolean
  // Turned off: it doesn't run, and nothing downstream gets anything from it.
  off?: boolean
  // Run View shows this as a field whoever runs the flow fills in ("Your
  // Product"). Bank, Image and Text blocks only.
  field?: boolean
  // The faint block that suggests what comes next. Not part of the flow
  // until it's clicked.
  suggested?: boolean
}

export interface FlowWire {
  id: string
  from: string
  // An output port key, or `item:<id>` for one slot of a batch.
  fromPort: string
  to: string
  toPort: string
}

export interface FlowGraph {
  blocks: FlowBlock[]
  wires: FlowWire[]
}

// ── Values ─────────────────────────────────────────────────────────────────

// Which run of which block a value came from: block id → the instance key of
// that block's run (and `:<slot id>` for a batch item). Two values that name
// the same block with different keys came from different runs of it, which is
// what stops "hook 1's voiceover" pairing with "hook 2's clips".
export type Trace = Record<string, string>

export interface ClipRef {
  ref: string
  durationSeconds?: number
  prompt?: string
  historyId?: string
  // Scene Clips: which scene of the script this clip films, and which take
  // of it — so a run that adds takes keeps the ones already made.
  scene?: number
  take?: number
}

// What each port type carries at run time.
export interface PayloadByType {
  product: { productId: string }
  character: { imageRef: string; name?: string; modelRowId?: string; historyId?: string; profile?: Record<string, string> }
  // `staging` rides along from an analyzed ad a remix was written from: its
  // beats and shot craft, which B-Roll shoots the new script on.
  script: { text: string; voiceProfile?: string; staging?: string }
  text: { text: string }
  // `scenes` is the ad's staging (adBlueprint.ts): beats and shot craft,
  // never the original identity.
  transcript: { text: string; scenes?: string }
  audio: { ref: string; durationSeconds: number; historyId?: string }
  image: { ref: string; prompt?: string }
  // `stills` are the ones no clip was made from (an Edit Pack's inserts);
  // `cover` is the run's first still, for a card's face.
  video: { clips: ClipRef[]; stills?: string[]; scriptText?: string; cover?: string }
  voice: { presetId: string }
  style: { brief: string; name?: string; styleId?: string; thumbRefs?: string[] }
  ad: AdPayload
  music: { ref: string; durationSeconds?: number; historyId?: string }
}

export interface AdPayload {
  // A saved swipe, when the ad came from the Swipe File.
  swipeId?: string
  // The member's own ad, dropped in (AdUpload): the file the Ad Analyzer
  // reads, as it was dropped, and how long it runs.
  uploadRef?: string
  fileName?: string
  durationSeconds?: number
  platform?: 'tiktok' | 'instagram' | 'meta'
  sourceId?: string
  postUrl?: string
  mediaUrl?: string
  mediaKind?: 'video' | 'image'
  thumbUrl?: string
  caption?: string
  author?: string
  transcript?: string
  // Outliers' own result, kept whole so the Ad Analyzer can fetch it the way
  // Outliers' Analyze button does.
  result?: unknown
}

// An ad the member dropped in themselves rather than picked from the Swipe
// File. The ad block that feeds an Ad Analyzer (a Bank block on the Swipe
// File) holds it as `settings.upload`, in place of a pick.
export interface AdUpload {
  // The video, in the asset store.
  ref: string
  name: string
  // How long it runs, for the Analyze price, and how big it is, for the
  // Ad Analyzer's Compress First warning.
  seconds?: number
  size?: number
  // Its first frame, for the block's face and the field's thumbnail.
  thumb?: string
}

interface ValueBase {
  // Identity for caching: two runs fed values with the same keys, under the
  // same settings, would make the same thing — so the second is skipped.
  key: string
  label: string
  trace: Trace
  // The rows this value is, or was made from — what a block stamps as the
  // parents of the history row it writes.
  lineage?: Lineage[]
  // A stand-in for a value an upstream block hasn't made yet. Planning uses
  // these to count and price runs before anything has run.
  pending?: boolean
}

export type FlowValue = { [T in PortType]: ValueBase & { type: T; payload: PayloadByType[T] } }[PortType]
export type ValueOf<T extends PortType> = Extract<FlowValue, { type: T }>

// ── Results ────────────────────────────────────────────────────────────────

// One run of one block, for one combination of its inputs.
export interface InstanceResult {
  key: string
  trace: Trace
  // Output port key → what it made. A batch block's items are under `items`.
  outputs: Record<string, FlowValue[]>
  // A batch block's slot id → its item.
  items?: Record<string, FlowValue>
  // The slots the run was asked to fill. A call that writes every hook at
  // once is done even when the model wrote one fewer than asked — without
  // this, one missing hook would re-run the block on every Run Flow.
  slots?: string[]
  // Made during Test With 1, with every batch cut to one item.
  test?: boolean
  at: number
  // What the run was estimated to cost when it ran, for the run log.
  credits?: number
  // The rows this run wrote, newest-first — Open in the app, How Was This Made.
  rows?: Lineage[]
  // Review picks for this run: a B-Roll run's cards whose stills get
  // animated, a Scene Clips run's takes (scene:take), or — when a Scripts or
  // Characters block made several runs — the slots of this one kept.
  keep?: string[]
  // Left out at review (a voiceover take, an image): kept on record, handed
  // on to nothing.
  off?: boolean
  // What an Edit Pack run gathered for its ad's folder.
  pack?: EditPack
  // Where a run stopped between its phases (B-Roll, waiting on a review).
  phase?: 'stills'
  // Scripts: takes the member rewrote by hand in the flow, by the take's
  // index in its history row. The row keeps what the model wrote; the flow
  // runs on these (run/edits.ts).
  edits?: Record<string, string>
}

// One ad's folder in an Edit Pack, in the /video-editor skill's input layout.
export interface EditPack {
  title: string
  cover?: string
  script?: string
  voiceover?: string
  music?: string
  clips: string[]
  stills: string[]
}

// A block's latest results, by instance key. Stored on the flow's row so a
// flow reopens as it was left and a run skips everything nothing changed.
export interface BlockResults {
  instances: Record<string, InstanceResult>
}

export type FlowOutputs = Record<string, BlockResults>

// ── The document ───────────────────────────────────────────────────────────

export interface FlowDoc extends FlowGraph {
  id: string
  name: string
  outputs: FlowOutputs
  template?: { id: string; version: number; sourceUrl?: string; skipped?: number }
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

// ── Runs ───────────────────────────────────────────────────────────────────

export type BlockRunStatus = 'queued' | 'running' | 'review' | 'done' | 'skipped' | 'error'

export interface BlockRunState {
  status: BlockRunStatus
  // Why a block was skipped, or the friendly error it failed with.
  reason?: string
  // Instances this run had to make, and how many are finished.
  total: number
  finished: number
  failed: number
  startedAt?: number
  endedAt?: number
}

export interface RunRecord {
  id: string
  flowId: string
  test: boolean
  // Run Block: the one block the member asked for.
  onlyBlockId?: string
  // Run Again: everything made afresh.
  fresh?: boolean
  startedAt: number
  endedAt?: number
  status: 'running' | 'done' | 'stopped' | 'error'
  blocks: Record<string, BlockRunState>
  // Credits the plan was estimated at when it was confirmed.
  estimate: number
  // Credits spent so far, by the same estimates, per finished instance.
  spent: number
}

export type { BankType }
