// The one path an app's generation runs through.
//
// Each creation app exports a runner (`apps/<app>/runner.ts`) and its own
// Generate button calls it. Flow's blocks will call the same runner, so a
// Voiceovers block and the Voiceovers app can never drift into two ways of
// making the same thing — which is the whole reason these exist ahead of Flow
// (Phase 0 of the Flow build spec).
//
// A runner is transport and bookkeeping, never UI. It prices a run, submits
// it, waits for it, saves what it made and writes the history row — so every
// caller lands in the same bank with the same usage counted. What the caller
// keeps is everything a member sees: in-flight tiles, toasts, which result is
// selected, and the persisting of a submitted task between `start` and
// `finish` so a reload can resume it.

import type { Lineage, Provenance } from '../stores/types'
import { isRecordingActive } from '../stores/recordingStore'
import { FriendlyError } from './friendlyError'

export interface RunContext {
  // Stops the WAIT — polling and the result download — never the generation
  // itself: kie has no cancel, so a task already submitted still finishes and
  // bills. What an abort saves is the tab's attention, not the credits.
  signal?: AbortSignal
  // Where this run's inputs came from. `start` carries it on the task it
  // returns, so a run resumed after a reload still stamps its history row.
  provenance?: Provenance
}

export interface BlockRunner<Input, Task, Output> {
  // Credits one run is expected to cost, or null when it can't be priced.
  estimate(input: Input): number | null
  // Submits one run and resolves as soon as kie has accepted it. The task is
  // plain JSON: the caller persists it BEFORE awaiting `finish`, or a reload
  // mid-generation loses a result that was already paid for. A runner whose
  // generation is streamed chat (Scripts) has no task to persist, so its
  // `start` does the whole job and its task carries the result.
  start(input: Input, ctx?: RunContext): Promise<Task>
  // Waits for a submitted task, saves the result and writes its history row.
  // The same call resumes a task persisted by an earlier page load.
  finish(task: Task, ctx?: Pick<RunContext, 'signal'>): Promise<Output>
  // Recording Mode's stand-in for start + finish: wait out the replay length,
  // then reveal the oldest hidden row of the bank this input would have
  // landed in. Spends nothing. `extraMs` staggers a batch; a runner whose app
  // can cancel a tile honours `signal` by revealing nothing.
  replay(input: Input, opts?: { extraMs?: number; signal?: AbortSignal }): Promise<Output | null>
  // The sentence a member reads when this runner throws.
  describeError(err: unknown): string
}

// Recording Mode promises the operator that Generate spends nothing, and every
// Generate press is meant to branch to `replay` before it gets here. This is
// the backstop for a call site that forgot: it fails loudly on camera instead
// of billing real credits.
export function refuseWhileRecording(): void {
  if (isRecordingActive()) {
    throw new FriendlyError(
      'Recording Mode is on, so nothing was generated. Switch it off from the button beside the dock to generate for real.',
    )
  }
}

// One entry per row, in first-seen order; undefined when there are none, so a
// row with no parents doesn't carry an empty array into its cloud copy.
type LineageSource = Lineage | null | undefined

export function lineageOf(...sources: Array<LineageSource | LineageSource[]>): Lineage[] | undefined {
  const out: Lineage[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    for (const parent of Array.isArray(source) ? source : [source]) {
      if (!parent?.id) continue
      const key = `${parent.bank}:${parent.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(parent)
    }
  }
  return out.length > 0 ? out : undefined
}

// The history row with its provenance stamped on. Only fields that hold
// something are written, so an unstamped run leaves the row exactly as it was.
export function withProvenance<T extends Provenance>(row: T, provenance: Provenance | undefined): T {
  const stamped: T = { ...row }
  const parents = lineageOf(provenance?.parents)
  if (parents) stamped.parents = parents
  if (provenance?.flowId) stamped.flowId = provenance.flowId
  if (provenance?.flowRunId) stamped.flowRunId = provenance.flowRunId
  if (provenance?.flowBlockId) stamped.flowBlockId = provenance.flowBlockId
  return stamped
}
