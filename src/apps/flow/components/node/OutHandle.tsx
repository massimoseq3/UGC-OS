// An output's dot, and — while nothing reads it — the + that opens What
// Next?. It sits on its parent's right edge, halfway down, so the parent is
// `relative`: a ports row, or a square face (face.tsx) carrying its block's
// one output beside the picture.

import { Handle, Position } from '@xyflow/react'
import { Plus } from 'lucide-react'
import type { FlowBlock, FlowValue, PortSpec } from '../../types'
import { accepts, KINDS, TYPE_META } from '../../engine/catalog'
import { wiresOutOf } from '../../engine/graph'
import { useCanvas } from '../canvasContext'

export function OutHandle({ block, port }: { block: FlowBlock; port: PortSpec }) {
  const { doc, askAtPort } = useCanvas()
  const used = wiresOutOf(doc, block.id).some((w) => w.fromPort === port.key)
  const color = TYPE_META[port.type].color
  return (
    <>
      <Handle
        type="source"
        position={Position.Right}
        id={port.key}
        className="flow-port"
        style={{ background: used ? color : 'var(--color-surface-1)', borderColor: color }}
        onClick={(e) => askAtPort(block.id, port.key, 'out', e.clientX, e.clientY)}
        title={`${port.label} · goes to ${goesTo(port.type)}. Click it to add what comes next.`}
      />
      {/* An output nothing reads yet ends in a + : the next step is one click
          away, without finding the dot. */}
      {!used && (
        <button
          type="button"
          onClick={(e) => askAtPort(block.id, port.key, 'out', e.clientX, e.clientY)}
          title={`Add what comes after ${port.label}`}
          aria-label={`Add what comes after ${port.label}`}
          className="flow-next nodrag nopan absolute -right-[34px] top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-md border border-ink/15 bg-surface-1 text-ink-400 transition-colors hover:border-flow-400/60 hover:text-flow-300"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </>
  )
}

function goesTo(type: FlowValue['type']): string {
  const names = Object.values(KINDS)
    .filter((k) => k.ins.some((p) => accepts(p.type, type)))
    .map((k) => k.title)
  return names.length ? names.join(', ') : 'nothing yet'
}
