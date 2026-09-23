// What a block does when it runs. One executor per runnable kind, each a thin
// adapter from Flow's wired values to its app's own runner (apps/<app>/
// runner.ts) — so a block and the app it runs make the same thing the same
// way, write the same history row and count the same usage.

import type { EditPack, FlowBlock, InstanceResult } from '../types'
import type { HeldValue, PlannedInstance } from '../engine/plan'
import type { Lineage, Provenance } from '../../../stores/types'

// B-Roll runs twice around a review: its stills, then clips for the stills
// the member kept. Every other block runs in one go.
export type RunPhase = 'all' | 'stills' | 'clips'

export interface ExecContext {
  flowId: string
  runId: string
  block: FlowBlock
  inst: PlannedInstance
  test: boolean
  phase: RunPhase
  // Stops the waits. kie has no cancel, so anything already submitted still
  // finishes and bills; Stop only stops Flow waiting for it and submitting more.
  signal: AbortSignal
  // What `save` last stored for this run, when a reload interrupted it.
  resume?: unknown
  // Persist what a reload needs to pick this run back up — a submitted task
  // above all. Called BEFORE awaiting kie, the rule every app follows.
  save: (state: unknown) => void
  // A short status line for the block while it works ("Stills · 3 of 8").
  progress: (note: string) => void
  // Parents (the rows the inputs came from) and the flow's own ids, for every
  // history row this run writes.
  provenance: Provenance
  // The instance as it stood before this phase — B-Roll's clips phase reads
  // the stills its first phase made.
  prior?: InstanceResult
}

export interface ExecOutput {
  outputs?: Record<string, HeldValue[]>
  // Batch blocks: slot id → the item made for it.
  items?: Record<string, HeldValue>
  rows?: Lineage[]
  // A finished Edit Pack: what goes in each ad's folder.
  pack?: EditPack
}

export interface Executor {
  run: (ctx: ExecContext) => Promise<ExecOutput>
  // Recording Mode's stand-in: reveal what this run would have made, from
  // the rows the operator hid before filming. Spends nothing, and never
  // touches persisted state.
  replay?: (ctx: ExecContext) => Promise<ExecOutput | null>
}
