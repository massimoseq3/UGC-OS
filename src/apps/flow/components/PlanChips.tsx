// A flow at a glance, before it's opened: each block as a chip in the order
// the work runs, with its review stop and how many times it runs. Describe
// It and Save as Flow both show this above their Accept.

import { ArrowRight } from 'lucide-react'
import type { FlowBlock } from '../types'
import type { FlowPlan } from '../engine/plan'
import { isKnownKind, titleOf } from '../engine/catalog'

export default function PlanChips({ blocks, plan }: { blocks: FlowBlock[]; plan: FlowPlan | null }) {
  const shown = blocks
    .filter((b) => isKnownKind(b.kind) && b.kind !== 'note')
    .sort((a, b) => a.x - b.x || a.y - b.y)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((b, i) => {
        const runs = plan?.blocks[b.id]?.instances.length ?? 0
        return (
          <span key={b.id} className="flex items-center gap-1.5">
            <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11.5px] text-ink-200">
              {titleOf(b)}{b.review ? ' · Review' : ''}{runs > 1 ? ` ×${runs}` : ''}
            </span>
            {i < shown.length - 1 && <ArrowRight className="h-3 w-3 text-ink-600" />}
          </span>
        )
      })}
    </div>
  )
}
