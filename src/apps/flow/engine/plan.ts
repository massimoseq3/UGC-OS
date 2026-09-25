// The planner: for every block, which runs the flow asks of it (one per
// combination of what's wired in), which of those are already made, what it
// hands downstream, and what the rest will cost. Run Flow, Test With 1, the
// counts on the canvas and every estimate read from the same plan, so what a
// member is shown is what will run.
//
// Multiplication follows the items. A block runs once per combination of the
// values on its inputs — 5 hooks × 2 faces is 10 B-Roll runs — except where
// two values descend from the SAME run of an upstream block by different
// items: hook 1's voiceover never pairs with hook 3's clips. That rule (see
// `compatible`) is what makes Edit Pack pair its inputs rather than multiply
// them, without a special case.
//
// Nothing re-runs unless it changed. A run's identity is its block's
// generation settings plus the identities of its input values; a run whose
// identity is already in the block's results is reused as it is. A value an
// upstream block hasn't made yet is a pending stand-in, so everything
// downstream of a changed block is planned too.

import type {
  FlowBlock,
  FlowGraph,
  FlowOutputs,
  FlowValue,
  InstanceResult,
  PortSpec,
  PortType,
  Trace,
} from '../types'
import { generationSettings, inlineText, insOf, isBatch, isRunnable, KINDS, outsOf, sourceOf, takesTyped } from './catalog'
import { blockById, enabledItems, itemIdOf, topoOrder, upstreamOf, wiresInto } from './graph'
import { fingerprint } from './hash'
import { missingClips, wantedClips } from './sceneShots'

// ── Values held without running ────────────────────────────────────────────

// What a Bank, Image, Text or List block — or an app block sourced From Bank
// or From History — holds. The editor resolves these from the banks; tests
// hand them in directly.
export type Held =
  | { outputs: Record<string, HeldValue[]>; items?: Record<string, HeldValue> }
  | { missing: string }

// A value before it's stamped with where it came from. Distributive, so a
// held value still narrows on its `type` like a FlowValue does.
export type HeldValue = FlowValue extends infer V ? (V extends FlowValue ? Omit<V, 'trace'> : never) : never

export interface PlanDeps {
  held(block: FlowBlock): Held
  // Credits one run of a block is expected to cost, for `slots` new items
  // when it's a batch, or null when it can't be priced ahead. `test` is Test
  // With 1, which cuts a block's own takes and scenes to one too.
  cost(block: FlowBlock, inputs: Record<string, FlowValue[]>, slots: number, test?: boolean): number | null
  // Generations one run starts, for the big-run confirmation; one, or one
  // per slot, when left out.
  generations?(block: FlowBlock, inputs: Record<string, FlowValue[]>, slots: number, test?: boolean): number
}

export interface PlanOptions {
  // Test With 1: every batch cut to one item, every block run at most once.
  test?: boolean
  // Run Block: this block, every run of it made again — and whatever it
  // needs upstream that isn't made yet, first. Nothing else runs.
  only?: string
  // Blocks a live run has finished with: whatever they didn't make (a run
  // that failed) hands on nothing, rather than a stand-in for later.
  settled?: Set<string>
}

// ── The plan ───────────────────────────────────────────────────────────────

export interface PlannedInstance {
  key: string
  trace: Trace
  inputs: Record<string, FlowValue[]>
  // An input is a stand-in for something not made yet.
  pending: boolean
  cached?: InstanceResult
  // Must run: new, changed, incomplete, or forced by Run Block.
  run: boolean
  // A batch run's slots to fill (all of them, or the missing ones of a
  // block whose slots are made one at a time).
  slots?: string[]
  credits: number | null
}

export interface BlockPlan {
  blockId: string
  // Why it can't run, when it can't.
  blocked?: string
  instances: PlannedInstance[]
  // What it hands downstream per output port — made values, or pending
  // stand-ins for what this plan will make.
  values: Record<string, FlowValue[]>
  // Runs this plan would make, what they cost, and whether any couldn't be
  // priced ahead.
  runs: number
  credits: number
  unpriced: boolean
  // Every run the block has, made or not, priced — the Whole Flow figure.
  creditsAll: number
}

export interface FlowPlan {
  order: string[]
  blocks: Record<string, BlockPlan>
  // Blocks this plan runs, in run order.
  planned: string[]
  credits: number
  creditsAll: number
  // Generations it would start (runs, or slots for a batch) — what the
  // confirmation threshold counts.
  generations: number
  unpriced: boolean
}

// ── Trace rules ────────────────────────────────────────────────────────────

// Two values can meet in one run unless they came from the same upstream
// block by different runs or items.
export function compatible(a: Trace, b: Trace): boolean {
  for (const k of Object.keys(a)) {
    if (k in b && b[k] !== a[k]) return false
  }
  return true
}

function merge(a: Trace, b: Trace): Trace {
  return { ...a, ...b }
}

// ── Combinations ───────────────────────────────────────────────────────────

interface Combo {
  inputs: Record<string, FlowValue[]>
  trace: Trace
}

// Every run a block's inputs call for. Required inputs are placed first so an
// optional input only ever joins a combination, never splits one away: a
// voiceover that exists for hook 1 alone rides with hook 1's clips, and the
// clips for hooks 2 to 5 still run without one.
export function combinations(ins: PortSpec[], values: Record<string, FlowValue[]>): Combo[] {
  const single = ins.filter((p) => !p.many).sort((a, b) => Number(!!b.required) - Number(!!a.required))
  let combos: Combo[] = [{ inputs: {}, trace: {} }]
  for (const p of single) {
    const vals = values[p.key] ?? []
    if (vals.length === 0) {
      if (p.required) return []
      continue
    }
    const next: Combo[] = []
    for (const c of combos) {
      const fits = vals.filter((v) => compatible(c.trace, v.trace))
      if (fits.length === 0) {
        if (!p.required) next.push(c)
        continue
      }
      for (const v of fits) next.push({ inputs: { ...c.inputs, [p.key]: [v] }, trace: merge(c.trace, v.trace) })
    }
    combos = next
  }
  // Inputs that take many things at once ride with every run, never multiply.
  for (const p of ins.filter((q) => q.many)) {
    const vals = values[p.key] ?? []
    if (vals.length === 0) continue
    for (const c of combos) c.inputs[p.key] = vals.filter((v) => compatible(c.trace, v.trace))
  }
  return combos
}

export function instanceKey(block: FlowBlock, inputs: Record<string, FlowValue[]>): string {
  const ins: Record<string, string[]> = {}
  for (const [port, vals] of Object.entries(inputs)) ins[port] = vals.map((v) => v.key).sort()
  return fingerprint({ kind: block.kind, settings: generationSettings(block), ins })
}

// ── Planning ───────────────────────────────────────────────────────────────

export function planFlow(graph: FlowGraph, outputs: FlowOutputs, deps: PlanDeps, opts: PlanOptions = {}): FlowPlan {
  const test = !!opts.test
  const order = topoOrder(graph)
  const blocks: Record<string, BlockPlan> = {}
  const planned: string[] = []
  let credits = 0
  let creditsAll = 0
  let generations = 0
  let unpriced = false
  // Run Block's reach: the block, and everything it reads from.
  const scope = opts.only !== undefined ? new Set([opts.only, ...upstreamOf(graph, opts.only)]) : undefined

  for (const id of order) {
    const block = blockById(graph, id)!
    const bp = planBlock(graph, block, blocks, outputs, deps, { test, only: opts.only, scope, settled: opts.settled })
    blocks[id] = bp
    if (bp.runs > 0) {
      planned.push(id)
      credits += bp.credits
      const count = deps.generations ?? ((_b, _i, slots: number) => Math.max(1, slots))
      generations += bp.instances.filter((i) => i.run).reduce((n, i) => n + count(block, i.inputs, i.slots?.length ?? 1, test), 0)
      unpriced ||= bp.unpriced
    }
    creditsAll += bp.creditsAll
  }
  return { order, blocks, planned, credits, creditsAll, generations, unpriced }
}

// The values wired into each of a block's inputs, from the plans of the
// blocks upstream of it. An input with nothing wired in holds what was typed
// into the block instead, when it takes that (catalog.ts inlineText).
export function inputValues(graph: FlowGraph, block: FlowBlock, upstream: Record<string, BlockPlan>): Record<string, FlowValue[]> {
  const out: Record<string, FlowValue[]> = {}
  for (const p of insOf(block)) {
    const vals: FlowValue[] = []
    const wires = wiresInto(graph, block.id, p.key)
    for (const w of wires) {
      vals.push(...(upstream[w.from]?.values[w.fromPort] ?? []))
    }
    const typed = wires.length ? null : inlineText(block, p.key)
    if (typed !== null) vals.push(typedValue(p.type, typed))
    out[p.key] = vals
  }
  return out
}

// A typed-in input as a value. It comes from no block, so its trace is empty
// and it pairs with anything; its key is its text, so editing the text is
// what makes the block run again.
function typedValue(type: PortType, text: string): FlowValue {
  const key = `typed:${fingerprint(text)}`
  const label = text.slice(0, 60)
  if (type === 'script') return { type: 'script', key, label, trace: {}, payload: { text } }
  if (type === 'transcript') return { type: 'transcript', key, label, trace: {}, payload: { text } }
  return { type: 'text', key, label, trace: {}, payload: { text } }
}

export function planBlock(
  graph: FlowGraph,
  block: FlowBlock,
  upstream: Record<string, BlockPlan>,
  outputs: FlowOutputs,
  deps: PlanDeps,
  opts: { test: boolean; only?: string; scope?: Set<string>; settled?: Set<string> },
): BlockPlan {
  const empty = (blocked?: string): BlockPlan => ({
    blockId: block.id, blocked, instances: [], values: {}, runs: 0, credits: 0, unpriced: false, creditsAll: 0,
  })
  if (block.suggested) return empty()
  if (block.off) return empty('Turned off')

  // Blocks that hold their values rather than making them.
  if (!isRunnable(block)) {
    if (KINDS[block.kind].runnable && sourceOf(block) === 'generate') return empty()
    const held = deps.held(block)
    if ('missing' in held) return empty(held.missing)
    return heldPlan(block, held, opts.test)
  }

  const values = inputValues(graph, block, upstream)
  const ins = insOf(block)
  for (const p of ins) {
    if (!p.required || (values[p.key]?.length ?? 0) > 0) continue
    const wires = wiresInto(graph, block.id, p.key)
    if (wires.length === 0) {
      return empty(takesTyped(block, p.key)
        ? `Needs ${article(p.label)} ${p.label.toLowerCase()}. Wire one in, or type one into it`
        : `Needs ${article(p.label)} ${p.label.toLowerCase()} wired in`)
    }
    const from = upstream[wires[0].from]
    return empty(from?.blocked ? `Nothing came in to ${p.label}` : `Its ${p.label.toLowerCase()} input is turned off`)
  }

  let combos = combinations(ins, values)
  if (combos.length === 0) return empty('Its inputs come from different items upstream, so they never pair')
  if (opts.test) combos = combos.slice(0, 1)

  const results = outputs[block.id]?.instances ?? {}
  const batch = isBatch(block)
  const perSlot = !!KINDS[block.kind].perSlot
  const slotsOn = enabledItems(block).map((it) => it.id)
  const wantSlots = opts.test ? slotsOn.slice(0, 1) : slotsOn
  // Run Block remakes its own block whole; what it reads from runs only what
  // isn't made yet, the way Run Flow would.
  const onlyThis = opts.only === block.id
  const inScope = !opts.settled?.has(block.id) && (!opts.scope || opts.scope.has(block.id))

  const instances: PlannedInstance[] = combos.map((c) => {
    const pending = Object.values(c.inputs).some((vals) => vals.some((v) => v.pending))
    const key = instanceKey(block, c.inputs)
    const cached = pending ? undefined : results[key]
    let slots: string[] | undefined
    let run: boolean
    if (!inScope) {
      run = false
    } else if (onlyThis) {
      run = true
      slots = batch ? wantSlots : undefined
    } else if (batch) {
      // A slot made one at a time is missing until it has an item; one filled
      // by a single call is missing only if that call wasn't asked for it.
      const asked = perSlot ? null : cached?.slots
      const missing = wantSlots.filter((s) => (asked ? !asked.includes(s) : !cached?.items?.[s]))
      run = pending || !cached || missing.length > 0
      // A block that fills every slot in one call remakes them all.
      slots = run ? (perSlot ? (cached ? missing : wantSlots) : wantSlots) : []
    } else {
      // A B-Roll run stopped between its stills and its clips isn't finished,
      // and neither is a Scene Clips run missing clips — the scenes a Test
      // With 1 left for later, or a take added since.
      run = pending || !cached || cached.phase === 'stills' || scenesLeft(block, c.inputs, cached, opts.test) > 0
    }
    let credits = run ? deps.cost(block, c.inputs, Math.max(1, slots?.length ?? 1), opts.test) : 0
    // What's left of a Scene Clips run is priced as its share of the whole.
    if (run && credits && cached && !onlyThis && block.kind === 'scenes') {
      const wanted = wantedClips(block, scriptOf(c.inputs), opts.test).length
      if (wanted) credits *= scenesLeft(block, c.inputs, cached, opts.test) / wanted
    }
    return { key, trace: c.trace, inputs: c.inputs, pending, cached, run, slots, credits }
  })

  // Nothing of a block outside Run Block's reach runs, and what it hands on
  // is only what it has already made.
  const plan: BlockPlan = {
    blockId: block.id,
    instances,
    values: {},
    runs: instances.filter((i) => i.run).length,
    credits: sum(instances.map((i) => (i.run ? i.credits ?? 0 : 0))),
    unpriced: instances.some((i) => i.run && i.credits === null),
    creditsAll: sum(
      instances.map((i) => deps.cost(block, i.inputs, batch ? Math.max(1, (opts.test ? wantSlots : slotsOn).length) : 1, opts.test) ?? 0),
    ),
  }
  plan.values = valuesOut(block, instances, opts.test)
  return plan
}

// What a block's runs hand downstream, per output port.
function valuesOut(block: FlowBlock, instances: PlannedInstance[], test: boolean): Record<string, FlowValue[]> {
  const outs = outsOf(block)
  const values: Record<string, FlowValue[]> = {}
  for (const p of outs) values[p.key] = []
  const batch = isBatch(block)
  const slotsOn = enabledItems(block).map((it) => it.id)

  for (const inst of instances) {
    const made = inst.run ? undefined : inst.cached
    // Not run and not made (outside Run Block's scope, or failed in a run
    // that's moved on): nothing to hand on. Left out at review: the same.
    if (!inst.run && !made) continue
    if (made?.off) continue
    if (batch) {
      const type = outs[0]?.type ?? 'text'
      const itemValue = (slot: string): FlowValue | undefined => {
        const trace = { ...inst.trace, [block.id]: `${inst.key}:${slot}` }
        if (made) {
          const v = made.items?.[slot]
          return v ? { ...v, trace } : undefined
        }
        return placeholder(block, type, `${inst.key}:${slot}`, trace)
      }
      const firstMade = test ? slotsOn.map(itemValue).find(Boolean) : undefined
      const allSlots = test ? slotsOn.slice(0, 1) : slotsOn
      values[outs[0].key].push(...allSlots.map(itemValue).filter((v): v is FlowValue => !!v))
      for (const slot of slotsOn) {
        // Test With 1 makes one item; a wire from any other item takes it.
        const v = itemValue(slot) ?? firstMade
        if (v) (values[`item:${slot}`] ??= []).push(v)
      }
    } else {
      for (const p of outs) {
        const trace = { ...inst.trace, [block.id]: inst.key }
        if (made) {
          values[p.key].push(...(made.outputs[p.key] ?? []).map((v) => ({ ...v, trace: { ...v.trace, ...trace } })))
        } else {
          values[p.key].push(placeholder(block, p.type, `${inst.key}:${p.key}`, trace))
        }
      }
    }
  }
  return values
}

function heldPlan(block: FlowBlock, held: Exclude<Held, { missing: string }>, test: boolean): BlockPlan {
  const values: Record<string, FlowValue[]> = {}
  const trace = (suffix: string): Trace => ({ [block.id]: `held${suffix}` })
  if (isBatch(block)) {
    const outs = outsOf(block)
    const all: FlowValue[] = []
    const slotsOn = enabledItems(block).map((it) => it.id)
    for (const slot of slotsOn) {
      const v = held.items?.[slot]
      if (!v) continue
      const value = { ...v, trace: trace(`:${slot}`) } as FlowValue
      values[`item:${slot}`] = [value]
      if (!test || all.length === 0) all.push(value)
    }
    if (outs[0]) values[outs[0].key] = all
  } else {
    for (const [port, vals] of Object.entries(held.outputs)) {
      values[port] = vals.map((v) => ({ ...v, trace: trace('') }) as FlowValue)
    }
  }
  return { blockId: block.id, instances: [], values, runs: 0, credits: 0, unpriced: false, creditsAll: 0 }
}

function placeholder(block: FlowBlock, type: PortType, suffix: string, trace: Trace): FlowValue {
  return {
    type,
    key: `pending:${block.id}:${suffix}`,
    label: '',
    trace,
    pending: true,
    payload: { ...emptyPayload(type), ...sizeHint(block) },
  } as FlowValue
}

// What a script not written yet will probably look like, so what it feeds is
// priced on its likely size: a hook is one line, a take runs its length at
// about 2.5 words a second. Stand-in text, never shown and never sent.
function sizeHint(block: FlowBlock): { text?: string } {
  if (block.kind !== 'scripts') return {}
  const s = block.settings
  if (s.mode === 'write' && s.writeFormat === 'hooks') return { text: 'This is one opening line of about this length.' }
  const seconds = Number(s.writeLength) || 30
  return { text: 'A sentence of a typical spoken ad, about six words. '.repeat(Math.max(1, Math.round((seconds * 2.5) / 9))) }
}

function emptyPayload(type: PortType): FlowValue['payload'] {
  switch (type) {
    case 'product': return { productId: '' }
    case 'character': return { imageRef: '' }
    case 'audio': return { ref: '', durationSeconds: 0 }
    case 'image': return { ref: '' }
    case 'video': return { clips: [] }
    case 'voice': return { presetId: '' }
    case 'style': return { brief: '' }
    case 'ad': return {}
    case 'music': return { ref: '' }
    default: return { text: '' }
  }
}

function scriptOf(inputs: Record<string, FlowValue[]>): string {
  const p = inputs.script?.[0]?.payload as { text?: string } | undefined
  return typeof p?.text === 'string' ? p.text : ''
}

// Clips a finished Scene Clips run doesn't have yet.
function scenesLeft(block: FlowBlock, inputs: Record<string, FlowValue[]>, cached: InstanceResult | undefined, test: boolean): number {
  if (block.kind !== 'scenes' || !cached) return 0
  const clips = cached.outputs.clips?.[0]
  return missingClips(block, scriptOf(inputs), clips?.type === 'video' ? clips.payload.clips : [], test).length
}

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0)
}

function article(label: string): string {
  return /^[aeiou]/i.test(label) ? 'an' : 'a'
}

// The trace of a finished run's values, for an executor that made them.
export function traceFor(block: FlowBlock, inst: Pick<PlannedInstance, 'key' | 'trace'>, slot?: string): Trace {
  return { ...inst.trace, [block.id]: slot ? `${inst.key}:${slot}` : inst.key }
}

// Whether any input slot a block's runs read from came through an item port.
export function readsItem(graph: FlowGraph, blockId: string): boolean {
  return wiresInto(graph, blockId).some((w) => itemIdOf(w.fromPort) !== null)
}
