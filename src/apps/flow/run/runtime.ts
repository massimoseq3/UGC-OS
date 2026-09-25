// The run engine. A run is a plan (engine/plan.ts) worked through block by
// block: a block starts once every block upstream of it in the run has
// settled, re-planned against what they actually made, and its runs go out
// together — creates queue through kie's submit gate like every other
// generation in the app, so a 40-generation run queues instead of 429ing.
//
// It lives at module scope, not in a component: a run keeps going while the
// member is in another app, and only stops with the tab. Everything a reload
// needs is in localStorage under the draft prefix (so sign-out wipes it):
// the run's block states, and every submitted task's handle — so reopening
// UGC OS resumes the polls instead of paying for the same generations twice.
// A handle outlives a failed or stopped run for the same reason: Run again,
// and a task kie already made is fetched rather than re-submitted.
//
// Recording Mode runs never touch any of that. They replay block by block
// from the rows the operator hid before filming.

import { create } from 'zustand'
import type { BlockRunState, FlowBlock, FlowGraph, InstanceResult, RunRecord } from '../types'
import type { ExecContext, ExecOutput, RunPhase } from './types'
import type { FlowPlan, PlannedInstance, PlanDeps } from '../engine/plan'
import { planFlow, traceFor } from '../engine/plan'
import { heldValues } from '../engine/held'
import { blockCost, generationsOf } from '../engine/cost'
import { isBatch, KINDS, titleOf } from '../engine/catalog'
import { liveItems, upstreamOf } from '../engine/graph'
import { EXECUTORS } from './executors'
import { taskIsDead } from './errors'
import { useFlowStore } from '../store/flowStore'
import { knownGraph } from '../store/blocks'
import { isRecordingActive } from '../../../stores/recordingStore'
import { useAppStore } from '../../../stores/appStore'
import { useActivityStore } from '../../../stores/activityStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { localBanksReady } from '../../../stores/bankStore'
import { FriendlyError, humanizeError } from '../../../utils/friendlyError'
import { lineageOf } from '../../../utils/blockRunner'

export const PLAN_DEPS: PlanDeps = { held: heldValues, cost: blockCost, generations: generationsOf }

const RUNS_KEY = 'ai-ugc-lab:draft:flow:runs'
const TASKS_KEY = 'ai-ugc-lab:draft:flow:tasks'
const LOG_KEY = 'ai-ugc-lab:draft:flow:log'
const LOG_LIMIT = 12

// Runs of one block at once. B-Roll's are a storyboard plus a dozen images
// and clips each, so fewer of them overlap; the gate paces the creates anyway.
const BLOCK_CONCURRENCY: Partial<Record<string, number>> = { broll: 3 }
const DEFAULT_CONCURRENCY = 8

export interface InstanceRun {
  status: 'queued' | 'running' | 'done' | 'error'
  note?: string
  error?: string
}

export interface LiveRun extends RunRecord {
  instances: Record<string, Record<string, InstanceRun>>
  // Blocks waiting on the member, oldest first.
  reviews: string[]
  // A Recording Mode replay: kept in memory only.
  replay?: boolean
}

// One finished run, as the History rail lists it and Load Run restores it:
// the flow as it was, and what the run made.
export interface RunLogEntry {
  id: string
  startedAt: number
  endedAt: number
  test: boolean
  status: RunRecord['status']
  spent: number
  graph: FlowGraph
  made: Record<string, Record<string, InstanceResult>>
  summary: string
}

interface RunStoreState {
  runs: Record<string, LiveRun>
  // Submitted tasks' handles, flow → block → run key → what the executor saved.
  tasks: Record<string, Record<string, Record<string, unknown>>>
  log: Record<string, RunLogEntry[]>
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    console.warn(`[flow] could not persist ${key}`, e)
    return false
  }
}

export const useFlowRunStore = create<RunStoreState>(() => ({
  runs: readJson<Record<string, LiveRun>>(RUNS_KEY, {}),
  tasks: readJson<RunStoreState['tasks']>(TASKS_KEY, {}),
  log: readJson<RunStoreState['log']>(LOG_KEY, {}),
}))

// Persisted synchronously, on every change: a task handle saved a moment
// before the tab closes is the whole resume story.
function persistRuns() {
  const { runs } = useFlowRunStore.getState()
  const real: Record<string, LiveRun> = {}
  for (const [id, r] of Object.entries(runs)) if (!r.replay) real[id] = r
  writeJson(RUNS_KEY, real)
}

function persistTasks() {
  writeJson(TASKS_KEY, useFlowRunStore.getState().tasks)
}

function persistLog() {
  const { log } = useFlowRunStore.getState()
  if (writeJson(LOG_KEY, log)) return
  // Full: keep the newest few of each flow rather than none.
  const trimmed: RunStoreState['log'] = {}
  for (const [id, entries] of Object.entries(log)) trimmed[id] = entries.slice(0, 3)
  useFlowRunStore.setState({ log: trimmed })
  writeJson(LOG_KEY, trimmed)
}

function patchRun(flowId: string, fn: (run: LiveRun) => LiveRun) {
  const run = useFlowRunStore.getState().runs[flowId]
  if (!run) return
  useFlowRunStore.setState((s) => ({ runs: { ...s.runs, [flowId]: fn(run) } }))
  if (!run.replay) persistRuns()
}

function patchBlock(flowId: string, blockId: string, patch: Partial<BlockRunState>) {
  patchRun(flowId, (r) => ({ ...r, blocks: { ...r.blocks, [blockId]: { ...r.blocks[blockId], ...patch } } }))
}

function patchInstance(flowId: string, blockId: string, key: string, patch: Partial<InstanceRun>) {
  patchRun(flowId, (r) => ({
    ...r,
    instances: {
      ...r.instances,
      [blockId]: { ...r.instances[blockId], [key]: { ...(r.instances[blockId]?.[key] ?? { status: 'queued' }), ...patch } },
    },
  }))
}

function taskState(flowId: string, blockId: string, key: string): unknown {
  return useFlowRunStore.getState().tasks[flowId]?.[blockId]?.[key]
}

function setTaskState(flowId: string, blockId: string, key: string, state: unknown | undefined) {
  useFlowRunStore.setState((s) => {
    const flow = { ...(s.tasks[flowId] ?? {}) }
    const block = { ...(flow[blockId] ?? {}) }
    if (state === undefined) delete block[key]
    else block[key] = state
    flow[blockId] = block
    return { tasks: { ...s.tasks, [flowId]: flow } }
  })
  persistTasks()
}

function say(message: string, kind: 'success' | 'error' | 'info' = 'info') {
  try { useAppStore.getState().addToast(message, kind) } catch { /* ignore */ }
}

// Live controllers, one per running flow. Not persisted: a reload makes new.
const controllers = new Map<string, AbortController>()
const activeBlocks = new Set<string>()

const SETTLED: BlockRunState['status'][] = ['done', 'skipped', 'error']

export function isRunActive(run: LiveRun | undefined): boolean {
  return !!run && run.status === 'running'
}

// ── Starting ───────────────────────────────────────────────────────────────

export type StartResult = { ok: true } | { ok: false; reason: string }

export function startRun(flowId: string, opts: { test?: boolean; only?: string; fresh?: boolean } = {}): StartResult {
  const existing = useFlowRunStore.getState().runs[flowId]
  if (isRunActive(existing)) return { ok: false, reason: 'This flow is already running.' }
  const doc = useFlowStore.getState().ensureDoc(flowId)
  if (!doc) return { ok: false, reason: 'That flow is gone.' }
  const replay = isRecordingActive()
  // The field, not getKieApiKey(): the getter throws on an empty key, which
  // would escape the Run click as an uncaught error instead of this refusal.
  if (!replay && !useSettingsStore.getState().kieApiKey) {
    return { ok: false, reason: 'Add your kie.ai API key in Settings to run a flow.' }
  }
  const graph = knownGraph(doc)
  const plan = planFlow(graph, doc.outputs, PLAN_DEPS, { test: opts.test, only: opts.only, fresh: opts.fresh })
  if (!plan.planned.length) return { ok: false, reason: nothingToRun(graph, plan, opts.only) }
  const blocks: Record<string, BlockRunState> = {}
  for (const id of plan.planned) blocks[id] = { status: 'queued', total: plan.blocks[id].runs, finished: 0, failed: 0 }
  const run: LiveRun = {
    id: crypto.randomUUID(),
    flowId,
    test: !!opts.test,
    onlyBlockId: opts.only,
    fresh: opts.fresh || undefined,
    startedAt: Date.now(),
    status: 'running',
    blocks,
    estimate: plan.credits,
    spent: 0,
    instances: {},
    reviews: [],
    replay: replay || undefined,
  }
  useFlowRunStore.setState((s) => ({ runs: { ...s.runs, [flowId]: run } }))
  if (!replay) persistRuns()
  controllers.set(flowId, new AbortController())
  useActivityStore.getState().begin('flow')
  pump(flowId)
  return { ok: true }
}

// Why a Run found nothing to do, in words that point at the fix. Run Block
// names the block upstream that's holding it up — the one a member has to
// go and fill — rather than the block they pressed.
function nothingToRun(graph: FlowGraph, plan: FlowPlan, only?: string): string {
  if (!only) {
    const stuck = plan.order.map((id) => ({ id, bp: plan.blocks[id] })).find(({ bp }) => bp?.blocked && bp.blocked !== 'Turned off')
    if (!stuck) return 'Nothing has changed since the last run.'
    const b = graph.blocks.find((x) => x.id === stuck.id)
    return `${b ? titleOf(b) : 'A block'} isn't ready: ${lowerFirst(stuck.bp.blocked!)}.`
  }
  const reach = [...upstreamOf(graph, only), only]
  const first = plan.order.find((id) => reach.includes(id) && plan.blocks[id]?.blocked && plan.blocks[id].blocked !== 'Turned off')
    ?? plan.order.find((id) => reach.includes(id) && plan.blocks[id]?.blocked)
  if (!first) return 'Nothing to run.'
  const b = graph.blocks.find((x) => x.id === first)
  const why = plan.blocks[first].blocked!
  return first === only ? `${why}.` : `${b ? titleOf(b) : 'A block before it'} isn't ready: ${lowerFirst(why)}.`
}

function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s
}

// Stops the waiting and the submitting. kie has no cancel: what was already
// submitted still finishes and bills, and its handle is kept, so running the
// flow again fetches it rather than paying twice.
export function stopRun(flowId: string) {
  const run = useFlowRunStore.getState().runs[flowId]
  if (!isRunActive(run)) return
  controllers.get(flowId)?.abort()
  finishRun(flowId, 'stopped')
}

// ── The loop ───────────────────────────────────────────────────────────────

function pump(flowId: string) {
  const run = useFlowRunStore.getState().runs[flowId]
  if (!isRunActive(run)) return
  const doc = useFlowStore.getState().ensureDoc(flowId)
  if (!doc) {
    // The member deleted the flow mid-run: stopped, not failed — no block
    // failed, and a "finished with 0 blocks that failed" toast would say so.
    finishRun(flowId, 'stopped')
    return
  }
  const graph = knownGraph(doc)
  const settled = new Set(Object.entries(run.blocks).filter(([, b]) => SETTLED.includes(b.status)).map(([id]) => id))
  // What this run already made. A block can be queued twice in one run — B-Roll
  // after its review, a running block after a reload — and Run Again or Run
  // Block remaking it must not remake (and pay for) these a second time.
  const made = new Set(Object.entries(run.instances).flatMap(([id, insts]) =>
    Object.entries(insts ?? {}).filter(([, i]) => i.status === 'done').map(([key]) => `${id}:${key}`)))
  const plan = planFlow(graph, doc.outputs, PLAN_DEPS, { test: run.test, only: run.onlyBlockId, settled, fresh: run.fresh, made })
  // A block settled right here (skipped, or nothing left to make) is still
  // 'queued' in `run` for the blocks after it, and nothing else would pump
  // again — so the loop goes round once more, re-planned. Each extra pass
  // settles at least one more block, so it ends.
  let settledHere = false

  for (const [blockId, state] of Object.entries(run.blocks)) {
    if (state.status !== 'queued' || activeBlocks.has(`${flowId}:${blockId}`)) continue
    const block = graph.blocks.find((b) => b.id === blockId)
    if (!block) {
      patchBlock(flowId, blockId, { status: 'skipped', reason: 'Removed from the flow' })
      settledHere = true
      continue
    }
    const waiting = [...upstreamOf(graph, blockId)].some((id) => run.blocks[id] && !SETTLED.includes(run.blocks[id].status))
    if (waiting) continue
    const bp = plan.blocks[blockId]
    if (!bp || bp.blocked) {
      patchBlock(flowId, blockId, { status: 'skipped', reason: bp?.blocked ?? 'Nothing to run', endedAt: Date.now() })
      settledHere = true
      continue
    }
    const toRun = bp.instances.filter((i) => i.run)
    if (!toRun.length) {
      patchBlock(flowId, blockId, { status: 'done', total: 0, endedAt: Date.now() })
      settledHere = true
      continue
    }
    void runBlock(flowId, block, toRun)
  }

  if (settledHere) {
    pump(flowId)
    return
  }

  const after = useFlowRunStore.getState().runs[flowId]
  if (!after || !isRunActive(after)) return
  const all = Object.values(after.blocks)
  if (all.every((b) => SETTLED.includes(b.status))) {
    finishRun(flowId, all.some((b) => b.status === 'error') ? 'error' : 'done')
  }
}

async function runBlock(flowId: string, block: FlowBlock, instances: PlannedInstance[]) {
  const tag = `${flowId}:${block.id}`
  activeBlocks.add(tag)
  const run = useFlowRunStore.getState().runs[flowId]!
  const executor = EXECUTORS[block.kind]
  const signal = controllers.get(flowId)?.signal ?? new AbortController().signal
  const reviewing = !!block.review && KINDS[block.kind].reviewable
  patchBlock(flowId, block.id, { status: 'running', total: instances.length, finished: 0, failed: 0, startedAt: Date.now(), reason: undefined })
  for (const inst of instances) patchInstance(flowId, block.id, inst.key, { status: 'queued', error: undefined, note: undefined })

  let finished = 0
  let failed = 0
  // Replays that found nothing hidden to bring back: done, but nothing to
  // review.
  let emptyReplays = 0
  let firstError: string | undefined
  const phases = new Set<RunPhase>()

  const runOne = async (inst: PlannedInstance) => {
    if (signal.aborted) return
    const prior = inst.cached
    // B-Roll pauses between its stills and its clips when it's reviewed; a
    // run already approved picks up at its clips.
    const phase: RunPhase = block.kind !== 'broll' ? 'all'
      : prior?.phase === 'stills' && prior.keep ? 'clips'
      : reviewing ? 'stills' : 'all'
    const resume = run.replay ? undefined : taskState(flowId, block.id, inst.key)
    const ctx: ExecContext = {
      flowId,
      runId: run.id,
      block,
      inst,
      test: run.test,
      phase,
      signal,
      resume,
      save: (state) => {
        if (!run.replay) setTaskState(flowId, block.id, inst.key, state)
      },
      progress: (note) => patchInstance(flowId, block.id, inst.key, { note }),
      provenance: {
        parents: lineageOf(...Object.values(inst.inputs).flat().map((v) => v.lineage ?? [])),
        flowId,
        flowRunId: run.id,
        flowBlockId: block.id,
      },
      prior,
      fresh: run.fresh || run.onlyBlockId === block.id || undefined,
    }
    phases.add(phase)
    patchInstance(flowId, block.id, inst.key, { status: 'running' })
    try {
      let out: ExecOutput | null
      if (!executor) throw new Error(`No executor for ${block.kind}`)
      if (run.replay) {
        if (executor.replay) out = await executor.replay(ctx)
        else if (executor.realInReplay) out = await executor.run(ctx)
        else throw new FriendlyError(`${titleOf(block)} can't replay in Recording Mode, so it was skipped.`)
        if (!out) {
          emptyReplays += 1
          out = {}
        }
      } else {
        out = await executor.run(ctx)
      }
      if (signal.aborted) return
      writeResult(flowId, block, inst, out, run.test, phase)
      setTaskState(flowId, block.id, inst.key, undefined)
      finished += 1
      patchInstance(flowId, block.id, inst.key, { status: 'done', note: undefined })
      patchRun(flowId, (r) => ({ ...r, spent: r.spent + (phase === 'clips' ? 0 : inst.credits ?? 0) }))
    } catch (err) {
      if (signal.aborted) return
      console.error(`[flow] ${block.kind} run failed`, err)
      const message = humanizeError(err, `${titleOf(block)} failed.`)
      // Only a task kie itself failed loses its handle (run/errors.ts); a bad
      // key or a stalled download keeps it, so Run again fetches the result.
      if (taskIsDead(err)) setTaskState(flowId, block.id, inst.key, undefined)
      failed += 1
      firstError ??= message
      patchInstance(flowId, block.id, inst.key, { status: 'error', error: message, note: undefined })
    } finally {
      patchBlock(flowId, block.id, { finished, failed })
    }
  }

  // A small pool: enough in flight to keep the gate busy.
  const limit = BLOCK_CONCURRENCY[block.kind] ?? DEFAULT_CONCURRENCY
  const queue = [...instances]
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length && !signal.aborted) await runOne(queue.shift()!)
  }))

  activeBlocks.delete(tag)
  if (signal.aborted || !isRunActive(useFlowRunStore.getState().runs[flowId])) return

  if (finished === 0 && failed > 0) {
    patchBlock(flowId, block.id, { status: 'error', reason: firstError, endedAt: Date.now() })
  } else if (reviewing && finished > emptyReplays && (block.kind !== 'broll' || phases.has('stills'))) {
    patchBlock(flowId, block.id, { status: 'review', reason: failed ? `${failed} of ${instances.length} failed` : undefined })
    patchRun(flowId, (r) => ({ ...r, reviews: r.reviews.includes(block.id) ? r.reviews : [...r.reviews, block.id] }))
    say(`${titleOf(block)} is waiting for your review.`, 'info')
  } else {
    patchBlock(flowId, block.id, {
      status: 'done',
      reason: failed ? `${failed} of ${instances.length} failed. Run again to retry them` : undefined,
      endedAt: Date.now(),
    })
  }
  pump(flowId)
}

// A run's output as the block's result for that run key: values stamped with
// where they came from, a face made one at a time added to the ones before.
function writeResult(flowId: string, block: FlowBlock, inst: PlannedInstance, out: ExecOutput, test: boolean, phase: RunPhase) {
  useFlowStore.getState().setResults(flowId, block.id, (prev) => {
    const before = prev[inst.key]
    const result: InstanceResult = {
      key: inst.key,
      trace: inst.trace,
      outputs: {},
      test: test || undefined,
      at: Date.now(),
      credits: (phase === 'clips' ? before?.credits : inst.credits) ?? undefined,
      rows: out.rows ?? before?.rows,
      pack: out.pack,
      // B-Roll's picks carry from its review into its clips phase, and no
      // further: a new stills session is picked from afresh. A Scene Clips
      // run that adds takes is too (its review opens again, or with none,
      // every take goes on).
      keep: block.kind === 'broll' && phase === 'clips' ? before?.keep : undefined,
      phase: phase === 'stills' ? 'stills' : undefined,
    }
    for (const [port, vals] of Object.entries(out.outputs ?? {})) {
      result.outputs[port] = vals.map((v) => ({ ...v, trace: traceFor(block, inst) }) as InstanceResult['outputs'][string][number])
    }
    if (isBatch(block)) {
      const perSlot = !!KINDS[block.kind].perSlot
      const carry = perSlot ? { ...(before?.items ?? {}) } : {}
      for (const [slot, v] of Object.entries(out.items ?? {})) {
        carry[slot] = { ...v, trace: traceFor(block, inst, slot) } as NonNullable<InstanceResult['items']>[string]
      }
      result.items = carry
      // One call fills every slot the block shows (executors' slotIds).
      if (!perSlot) result.slots = liveItems(block).map((it) => it.id)
    }
    return { ...prev, [inst.key]: result }
  })
}

function finishRun(flowId: string, status: RunRecord['status']) {
  const run = useFlowRunStore.getState().runs[flowId]
  if (!run || run.status !== 'running') return
  controllers.delete(flowId)
  for (const tag of [...activeBlocks]) if (tag.startsWith(`${flowId}:`)) activeBlocks.delete(tag)
  useActivityStore.getState().end('flow')
  const ended: LiveRun = { ...run, status, endedAt: Date.now() }
  useFlowRunStore.setState((s) => ({ runs: { ...s.runs, [flowId]: ended } }))
  if (!run.replay) {
    persistRuns()
    logRun(ended)
  }
  const failed = Object.values(ended.blocks).filter((b) => b.status === 'error').length
  if (status === 'done') say(run.test ? 'Test run finished. Check the results, then Run Flow for the full batch.' : 'Flow finished.', 'success')
  else if (status === 'error') say(failed === 1 ? 'The flow finished with a block that failed. Its error is on the block.' : `The flow finished with ${failed} blocks that failed. Each error is on its block.`, 'error')
}

function logRun(run: LiveRun) {
  const doc = useFlowStore.getState().docs[run.flowId]
  if (!doc) return
  const made: RunLogEntry['made'] = {}
  for (const [blockId, insts] of Object.entries(run.instances)) {
    const results = doc.outputs[blockId]?.instances ?? {}
    for (const [key, state] of Object.entries(insts)) {
      if (state.status !== 'done' || !results[key]) continue
      ;(made[blockId] ??= {})[key] = results[key]
    }
  }
  const blocksRun = Object.keys(made).length
  const entry: RunLogEntry = {
    id: run.id,
    startedAt: run.startedAt,
    endedAt: run.endedAt ?? Date.now(),
    test: run.test,
    status: run.status,
    spent: run.spent,
    graph: { blocks: doc.blocks, wires: doc.wires },
    made,
    summary: `${blocksRun} ${blocksRun === 1 ? 'block' : 'blocks'}${run.test ? ' · Test With 1' : ''}`,
  }
  useFlowRunStore.setState((s) => ({ log: { ...s.log, [run.flowId]: [entry, ...(s.log[run.flowId] ?? [])].slice(0, LOG_LIMIT) } }))
  persistLog()
}

// ── Reviews ────────────────────────────────────────────────────────────────

export type ReviewPicks =
  // Scripts, Characters: the items to keep, of the ones the review showed.
  // The shown ones not kept turn off; anything the run didn't make (a Test
  // With 1 makes one face of four) is left as it was, for the full run.
  // A block that made several runs (a face per audience) is picked run by
  // run instead: `runs` is each run's kept slots, and turns nothing off.
  | { kind: 'items'; keep: string[]; shown?: string[]; runs?: Record<string, string[]> }
  // Voiceovers, Playground: the runs to keep. The rest are left out.
  | { kind: 'runs'; keep: string[] }
  // B-Roll: per run, the cards whose stills get animated.
  | { kind: 'stills'; keep: Record<string, string[]> }
  // Scene Clips: per run, the takes that go on to the edit (scene:take).
  | { kind: 'takes'; keep: Record<string, string[]> }

export function approveReview(flowId: string, blockId: string, picks: ReviewPicks) {
  const run = useFlowRunStore.getState().runs[flowId]
  if (!run || run.blocks[blockId]?.status !== 'review') return
  const store = useFlowStore.getState()
  const doc = store.ensureDoc(flowId)
  const block = doc?.blocks.find((b) => b.id === blockId)
  if (!doc || !block) return

  if (picks.kind === 'items' && picks.runs) {
    const runs = picks.runs
    store.setResults(flowId, blockId, (prev) => {
      const next = { ...prev }
      for (const [key, slots] of Object.entries(runs)) {
        if (!next[key]) continue
        const made = Object.keys(next[key].items ?? {})
        next[key] = slots.length === 0 ? { ...next[key], keep: undefined, off: true }
          : { ...next[key], off: undefined, keep: made.every((s) => slots.includes(s)) ? undefined : slots }
      }
      return next
    })
  } else if (picks.kind === 'items') {
    const shown = picks.shown ?? liveItems(block).map((it) => it.id)
    const off = liveItems(block)
      .filter((it) => (shown.includes(it.id) ? !picks.keep.includes(it.id) : !!it.off))
      .map((it) => it.id)
    if (store.openId !== flowId) store.openFlow(flowId)
    useFlowStore.getState().setItemsOff(blockId, off)
  } else if (picks.kind === 'runs') {
    const made = Object.keys(run.instances[blockId] ?? {})
    store.setResults(flowId, blockId, (prev) => {
      const next = { ...prev }
      for (const key of made) if (next[key]) next[key] = { ...next[key], off: picks.keep.includes(key) ? undefined : true }
      return next
    })
  } else {
    store.setResults(flowId, blockId, (prev) => {
      const next = { ...prev }
      for (const [key, cards] of Object.entries(picks.keep)) {
        if (!next[key]) continue
        // No take kept of an ad leaves that ad out, as Leave Out does for a
        // run, rather than handing its edit an empty set of clips.
        next[key] = picks.kind === 'takes' && cards.length === 0
          ? { ...next[key], keep: undefined, off: true }
          : { ...next[key], keep: cards }
      }
      return next
    })
  }

  patchRun(flowId, (r) => ({ ...r, reviews: r.reviews.filter((id) => id !== blockId) }))
  // B-Roll goes back in the queue for its clips; everything else is done.
  if (picks.kind === 'stills') patchBlock(flowId, blockId, { status: 'queued' })
  else patchBlock(flowId, blockId, { status: 'done', endedAt: Date.now() })
  pump(flowId)
}

// ── Load Run ───────────────────────────────────────────────────────────────

// Puts a past run's flow and results back, running nothing. One undo step.
export function loadRun(flowId: string, runId: string): boolean {
  const entry = useFlowRunStore.getState().log[flowId]?.find((e) => e.id === runId)
  if (!entry) return false
  const store = useFlowStore.getState()
  if (store.openId !== flowId) store.openFlow(flowId)
  const doc = useFlowStore.getState().docs[flowId]
  if (!doc) return false
  // Swap the graph back in as an edit so Undo takes it back out.
  useFlowStore.setState((s) => ({
    history: {
      ...s.history,
      [flowId]: { past: [...(s.history[flowId]?.past ?? []), { blocks: doc.blocks, wires: doc.wires }], future: [] },
    },
    docs: { ...s.docs, [flowId]: { ...doc, blocks: entry.graph.blocks, wires: entry.graph.wires, updatedAt: Date.now() } },
  }))
  for (const [blockId, results] of Object.entries(entry.made)) {
    useFlowStore.getState().setResults(flowId, blockId, (prev) => ({ ...prev, ...results }))
  }
  return true
}

// ── Resume ─────────────────────────────────────────────────────────────────

let resumed = false

// A page load picks up every run the last one left going: blocks that were
// running go back in the queue, and their runs find their saved task handles.
// Waits for the banks' local copy, since a run reads its flow from there.
export async function resumeRuns() {
  if (resumed) return
  resumed = true
  await localBanksReady
  const { runs } = useFlowRunStore.getState()
  for (const [flowId, run] of Object.entries(runs)) {
    if (run.status !== 'running') continue
    if (!useFlowStore.getState().ensureDoc(flowId)) {
      useFlowRunStore.setState((s) => ({ runs: { ...s.runs, [flowId]: { ...run, status: 'stopped', endedAt: Date.now() } } }))
      continue
    }
    const blocks: Record<string, BlockRunState> = {}
    for (const [id, b] of Object.entries(run.blocks)) blocks[id] = b.status === 'running' ? { ...b, status: 'queued' } : b
    useFlowRunStore.setState((s) => ({ runs: { ...s.runs, [flowId]: { ...run, blocks } } }))
    controllers.set(flowId, new AbortController())
    useActivityStore.getState().begin('flow')
    pump(flowId)
  }
  persistRuns()
}

export function hasRunsToResume(): boolean {
  return Object.values(readJson<Record<string, LiveRun>>(RUNS_KEY, {})).some((r) => r.status === 'running')
}

// The run's own words for a block, for its status line.
export function blockStatusLine(state: BlockRunState | undefined): string | null {
  if (!state) return null
  switch (state.status) {
    case 'queued': return 'Queued'
    case 'running': return state.total > 1 ? `Running · ${state.finished} of ${state.total}` : 'Running'
    case 'review': return 'Waiting for Your Review'
    case 'skipped': return state.reason ? `Skipped · ${state.reason}` : 'Skipped'
    case 'error': return state.reason ?? 'Failed'
    case 'done': return state.reason ?? 'Done'
  }
}
