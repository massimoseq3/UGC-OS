// A wire, drawn in the colour of what it carries, with ×N where it carries
// more than one thing. It moves only while a run is feeding the block at its
// end — nothing animates on an idle canvas.

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'

export type WireEdgeType = Edge<{ color: string; count: number; live: boolean }, 'wire'>

export default function WireEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<WireEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const color = data?.color ?? '#71717a'
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={data?.live ? 'flow-wire-live' : undefined}
        style={{ stroke: color, strokeWidth: selected ? 2.5 : 1.75, opacity: selected ? 1 : 0.8 }}
      />
      {data && data.count > 1 && (
        <EdgeLabelRenderer>
          <span
            className="nodrag nopan pointer-events-none absolute rounded-full border border-ink/10 bg-surface-1 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-200"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            ×{data.count}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
