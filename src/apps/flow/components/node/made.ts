// What a block has made so far, read off its plan — for the faces the
// canvas draws of it.

import type { FlowValue } from '../../types'
import type { BlockPlan } from '../../engine/plan'

// The newest made value per slot, across the block's runs.
export function latestItems(bp: BlockPlan | undefined): Record<string, FlowValue> {
  const out: Record<string, FlowValue> = {}
  for (const inst of bp?.instances ?? []) {
    for (const [slot, v] of Object.entries(inst.cached?.items ?? {})) if (!out[slot]) out[slot] = v
  }
  return out
}

// Every value the block has made, newest run first.
export function madeValues(bp: BlockPlan | undefined): FlowValue[] {
  const out: FlowValue[] = []
  for (const inst of bp?.instances ?? []) {
    if (!inst.cached || inst.cached.off) continue
    out.push(...Object.values(inst.cached.outputs).flat(), ...Object.values(inst.cached.items ?? {}))
  }
  return out.filter((v) => !v.pending)
}
