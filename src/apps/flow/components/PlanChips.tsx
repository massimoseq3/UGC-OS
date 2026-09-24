// A flow at a glance, before it's opened: each block as a chip with its app's
// tile, in the order the work runs, with its review stop and how many times
// it runs. Describe It and Save as Flow both show this above their Accept.

import { ArrowRight, Hand } from 'lucide-react'
import type { FlowBlock } from '../types'
import type { FlowPlan } from '../engine/plan'
import { isKnownKind, titleOf } from '../engine/catalog'
import { GlassTile } from '../../../components/AppGlassTile'
import { blockAccent, blockIcon } from './blockMeta'

export default function PlanChips({ blocks, plan }: { blocks: FlowBlock[]; plan: FlowPlan | null }) {
  const shown = blocks
    .filter((b) => isKnownKind(b.kind) && b.kind !== 'note')
    .sort((a, b) => a.x - b.x || a.y - b.y)
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {shown.map((b, i) => {
        const runs = plan?.blocks[b.id]?.instances.length ?? 0
        return (
          <span key={b.id} className="flex items-center gap-1.5">
            <span className="flex items-center gap-1.5">
              <GlassTile icon={blockIcon(b)} accent={blockAccent(b)} size={22} />
              <span className="text-[12.5px] font-medium text-ink-100">
                {titleOf(b)}{runs > 1 ? ` ×${runs}` : ''}
              </span>
              {b.review && <Hand className="h-3 w-3 text-amber-400" aria-label="Pauses for review" />}
            </span>
            {i < shown.length - 1 && <ArrowRight className="mx-0.5 h-3.5 w-3.5 text-ink-600" />}
          </span>
        )
      })}
    </div>
  )
}
