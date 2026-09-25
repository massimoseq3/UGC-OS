// What a block window reads about its block's runs: one entry per run the
// plan asks of it, and where each stands. Kept apart from the window's
// components so those files export components only (Fast Refresh).

import type { BlockKind, FlowBlock, FlowDoc, FlowValue, InstanceResult, PortSpec } from '../../types'
import type { BlockPlan, FlowPlan } from '../../engine/plan'
import { insOf, titleOf } from '../../engine/catalog'
import { blockById, upstreamOf } from '../../engine/graph'
import type { LiveRun } from '../../run/runtime'
import type { RunRequest } from '../Editor'

export interface WindowProps {
  flowId: string
  doc: FlowDoc
  block: FlowBlock
  plan: FlowPlan | null
  run: LiveRun | undefined
  onRun: (req: RunRequest) => void
  onReview: (blockId: string) => void
}

// Each app's own Generate colour, for the band at the foot of its column.
export const ACCENT_BG: Partial<Record<BlockKind, string>> = {
  characters: 'bg-influencers-500',
  scripts: 'bg-scripts-500',
  voice: 'bg-voice-500',
  broll: 'bg-broll-500',
  playground: 'bg-playground-500',
  scenes: 'bg-playground-500',
  analyzer: 'bg-analyzer-500',
  outliers: 'bg-[#D9A404]',
  edit: 'bg-[#F77646]',
}

export type RunStatus = 'made' | 'changed' | 'planned' | 'queued' | 'running' | 'failed' | 'review'

export interface BlockRun {
  key: string
  index: number
  // What this run is for, in the words of what it reads.
  label: string
  status: RunStatus
  inputs: Record<string, FlowValue[]>
  result?: InstanceResult
  error?: string
  note?: string
}

// One entry per run the plan asks of the block — each combination of what's
// wired in — with where it stands: made, running now, failed, or still to
// make. What a window's output pane is built from.
export function blockRuns(block: FlowBlock, bp: BlockPlan | undefined, run: LiveRun | undefined): BlockRun[] {
  const live = run?.instances[block.id] ?? {}
  const waiting = run?.blocks[block.id]?.status === 'review'
  const ports = insOf(block)
  const instances = bp?.instances ?? []
  // The input that tells the runs apart — the one whose value differs from
  // run to run — names them; else the required one.
  const lead = ports.find((p) => !p.many && new Set(instances.map((i) => i.inputs[p.key]?.[0]?.key ?? '')).size > 1)
    ?? ports.find((p) => p.required)
    ?? ports.find((p) => !p.many && instances.some((i) => (i.inputs[p.key]?.length ?? 0) > 0))
  return instances.map((inst, index) => {
    const now = live[inst.key]
    let status: RunStatus = inst.cached ? (inst.run ? 'changed' : 'made') : 'planned'
    if (waiting && inst.cached) status = 'review'
    if (now?.status === 'queued') status = 'queued'
    else if (now?.status === 'running') status = 'running'
    else if (now?.status === 'error') status = 'failed'
    return {
      key: inst.key,
      index,
      label: runLabel(inst.inputs, lead, index),
      status,
      inputs: inst.inputs,
      result: inst.cached,
      error: now?.error,
      note: now?.note,
    }
  })
}

// What the wired input carries right now, run by run — pending ones say what
// they're waiting on.
export function arrivingLabels(values: FlowValue[] | undefined, fromTitle: string): string[] {
  return (values ?? []).map((v) => (v.pending ? `Waiting on ${fromTitle}` : v.label)).filter(Boolean)
}

export function blockTitle(doc: FlowDoc, id: string): string {
  const b = blockById(doc, id)
  return b ? titleOf(b) : 'a block'
}

// What a run is for, in the words of what it reads: the leading input's value
// ("Okay so I almost returned…"), or while that's still to be made, the input
// and the run's number ("Script 3").
function runLabel(inputs: Record<string, FlowValue[]>, lead: PortSpec | undefined, index: number): string {
  if (!lead) return `Run ${index + 1}`
  const v = inputs[lead.key]?.[0]
  if (v && !v.pending && v.label) return v.label
  return `${lead.label} ${index + 1}`
}

// What a block's own Generate spends: every run of the block, made again,
// plus whatever it reads from that isn't made yet — Run Block makes those
// first (engine/plan.ts) — and the names of those blocks, for the line
// under the button.
export function ownRunPrice(doc: FlowDoc, block: FlowBlock, plan: FlowPlan | null): { credits: number; unpriced: boolean; first: string[] } {
  const bp = plan?.blocks[block.id]
  let credits = bp?.creditsAll ?? 0
  let unpriced = !!bp?.unpriced
  const first: string[] = []
  for (const id of plan?.planned ?? []) {
    if (id === block.id || !upstreamOf(doc, block.id).has(id)) continue
    const up = plan!.blocks[id]
    credits += up.credits
    unpriced ||= up.unpriced
    const b = blockById(doc, id)
    if (b) first.push(titleOf(b))
  }
  return { credits, unpriced, first }
}
