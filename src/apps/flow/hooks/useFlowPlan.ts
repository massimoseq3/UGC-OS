// The open flow's plan, recomputed whenever the flow, the banks it reads from
// or the model picks it prices with change. The canvas counts, every block's
// estimate and the Run button all read this one object.

import type { FlowDoc } from '../types'
import { planFlow, type FlowPlan, type PlanDeps } from '../engine/plan'
import { heldValues } from '../engine/held'
import { blockCost } from '../engine/cost'
import { knownGraph } from '../store/blocks'
import { useBankStore } from '../../../stores/bankStore'
import { useSettingsStore } from '../../../stores/settingsStore'

// The deps close over the bank and settings snapshots they're given, so the
// compiler re-runs the plan when either moves.
function depsFor(banks: unknown, models: unknown): PlanDeps {
  void banks
  void models
  return { held: heldValues, cost: blockCost }
}

export function useFlowPlans(doc: FlowDoc | undefined): { plan: FlowPlan | null; test: FlowPlan | null } {
  const banks = useBankStore((s) => s)
  const models = useSettingsStore((s) => s.perAppModel)
  if (!doc) return { plan: null, test: null }
  const deps = depsFor(banks, models)
  const graph = knownGraph(doc)
  return {
    plan: planFlow(graph, doc.outputs, deps),
    test: planFlow(graph, doc.outputs, deps, { test: true }),
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
