// A wire, drawn in the colour of what it carries, with ×N where it carries
// more than one thing. It moves only while a run is feeding the block at its
// end — nothing animates on an idle canvas.
//
// Pointed at or selected, its middle offers the two things a wire can have
// done to it: a block inserted into it, or cut.

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { Plus, Scissors } from 'lucide-react'
import { useCanvas } from './canvasContext'
import { useFlowStore } from '../store/flowStore'

export type WireEdgeType = Edge<{ color: string; count: number; live: boolean; hover?: boolean }, 'wire'>

export default function WireEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<WireEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const { openInsert, pointWire } = useCanvas()
  const removeWire = useFlowStore((s) => s.removeWire)
  const color = data?.color ?? '#71717a'
  const tools = selected || data?.hover
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={data?.live ? 'flow-wire-live' : undefined}
        style={{ stroke: color, strokeWidth: selected ? 2.5 : data?.hover ? 2.25 : 1.75, opacity: selected || data?.hover ? 1 : 0.8 }}
        interactionWidth={24}
      />
      {(tools || (data && data.count > 1)) && (
        <EdgeLabelRenderer>
          <span
            className={`nodrag nopan absolute flex items-center gap-0.5 rounded-full border border-ink/10 bg-surface-1 p-0.5 text-[10px] font-semibold tabular-nums text-ink-200 shadow-md shadow-black/20 ${tools ? 'pointer-events-auto' : 'pointer-events-none'}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onMouseEnter={() => pointWire(id)}
            onMouseLeave={() => pointWire(null)}
          >
            {data && data.count > 1 && <span className="px-1">×{data.count}</span>}
            {tools && (
              <>
                <button
                  type="button"
                  onClick={(e) => openInsert(id, e.clientX, e.clientY)}
                  title="Insert a block into this wire"
                  aria-label="Insert a Block"
                  className="flex h-5 w-5 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-flow-500/20 hover:text-flow-200"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => removeWire(id)}
                  title="Cut this wire"
                  aria-label="Cut Wire"
                  className="flex h-5 w-5 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-red-500/15 hover:text-red-300"
                >
                  <Scissors className="h-3 w-3" />
                </button>
              </>
            )}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
