// The open flow's plan, recomputed whenever the flow, the banks it reads from
// or the model picks it prices with change. The canvas counts, every block's
// estimate and the Run button all read this one object.

import type { FlowDoc } from '../types'
import type { LiveRun } from '../run/runtime'
import { KINDS } from '../engine/catalog'
import { planFlow, type FlowPlan, type PlanDeps } from '../engine/plan'
import { heldValues } from '../engine/held'
import { blockCost, generationsOf } from '../engine/cost'
import { knownGraph } from '../store/blocks'
import { useBankStore } from '../../../stores/bankStore'
import { useSettingsStore } from '../../../stores/settingsStore'

// The deps close over the bank and settings snapshots they're given, so the
// compiler re-runs the plan when either moves.
function depsFor(banks: unknown, models: unknown): PlanDeps {
  void banks
  void models
  // Generations counted the way the run counts them (a B-Roll run is a
  // storyboard plus a still and a clip per scene), so the big-run question
  // is asked at the same size a run would start at.
  return { held: heldValues, cost: blockCost, generations: generationsOf }
}

export function useFlowPlans(doc: FlowDoc | undefined): { plan: FlowPlan | null; test: FlowPlan | null; again: FlowPlan | null } {
  const banks = useBankStore((s) => s)
  const models = useSettingsStore((s) => s.perAppModel)
  if (!doc) return { plan: null, test: null, again: null }
  const deps = depsFor(banks, models)
  const graph = knownGraph(doc)
  const plan = planFlow(graph, doc.outputs, deps)
  return {
    plan,
    test: planFlow(graph, doc.outputs, deps, { test: true }),
    // Run Again's bill, only once there's nothing left to run.
    again: plan.planned.length ? null : planFlow(graph, doc.outputs, deps, { fresh: true }),
  }
}

// What the Run button says and does, in the header and in Run View alike:
// Run Flow; Run (or Re-run) N Blocks when only some are left; Run Again (everything
// afresh, new takes) when the flow is made and nothing changed — never a
// dead "Nothing to Run" on a flow a member wants more ads from.
export function runButton(doc: FlowDoc, plan: FlowPlan | null, again: FlowPlan | null, run: LiveRun | undefined): { label: string; again: boolean; credits: number; unpriced: boolean } {
  const states = run ? Object.values(run.blocks) : []
  if (run?.status === 'running') {
    const done = states.filter((b) => b.status === 'done' || b.status === 'skipped' || b.status === 'error').length
    const waiting = states.some((b) => b.status === 'review')
    return { label: waiting ? 'Waiting for Your Review' : `Running · ${done} of ${states.length}`, again: false, credits: 0, unpriced: false }
  }
  const runnable = doc.blocks.filter((b) => KINDS[b.kind]?.runnable && !b.suggested).length
  if (!plan?.planned.length) {
    if (again?.planned.length) return { label: 'Run Again', again: true, credits: again.credits, unpriced: again.unpriced }
    return { label: runnable ? 'Nothing to Run' : 'Add a Block to Run', again: false, credits: 0, unpriced: false }
  }
  const partial = plan.planned.length < runnable && Object.keys(doc.outputs).length > 0
  // "Re-run" only when every block it names has made something before: the
  // blocks after a Run Block have never run, and "Re-run" reads as paying twice.
  const remade = plan.planned.every((id) => Object.keys(doc.outputs[id]?.instances ?? {}).length > 0)
  const n = plan.planned.length
  return {
    label: partial ? `${remade ? 'Re-run' : 'Run'} ${n} ${n === 1 ? 'Block' : 'Blocks'}` : 'Run Flow',
    again: false,
    credits: plan.credits,
    unpriced: plan.unpriced,
  }
}

// "about 710 credits", "under a credit", "Free".
export function creditsLabel(credits: number, unpriced = false): string {
  if (credits <= 0) return unpriced ? 'Price unknown' : 'Free'
  const about = unpriced ? 'at least ' : 'about '
  if (credits < 1) return `${unpriced ? 'at least ' : ''}under a credit`
  if (credits < 100) return `${about}${Math.round(credits)} credits`
  return `${about}${(Math.round(credits / 10) * 10).toLocaleString('en-US')} credits`
}

// The figure a Run button's pill carries: "~1,180 credits". The panel above it
// spells out "about"; the pill has room for the number.
export function creditsPill(credits: number, unpriced = false): string {
  if (credits <= 0) return unpriced ? 'Unpriced' : 'Free'
  if (credits < 1) return '< 1 credit'
  const n = credits < 100 ? Math.round(credits) : Math.round(credits / 10) * 10
  return `${unpriced ? '≥' : '~'}${n.toLocaleString('en-US')} credits`
}

// The compact form a block's footer and a wire badge carry: "~42 cr".
export function creditsShort(credits: number): string {
  if (credits <= 0) return 'Free'
  if (credits < 1) return '<1 cr'
  if (credits < 100) return `~${Math.round(credits)} cr`
  return `~${(Math.round(credits / 10) * 10).toLocaleString('en-US')} cr`
}
