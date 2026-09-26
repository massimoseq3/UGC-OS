// The selection's toolbar (Open, Run, Run Field, Duplicate, Copy, Turn Off,
// Delete), kept inside the canvas. React Flow centres it over the selection
// and lets it run past the canvas's edge, where the canvas clips it — a block
// near the left edge lost its Open and its Run Field. It slides sideways just
// enough to stay in, and sits under the selection when there's no room above.
// On the left, "in" means clear of the palette's rail, which paints over it.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { NodeToolbar, Position, useStore, type ReactFlowState } from '@xyflow/react'
import { shallow } from 'zustand/shallow'
import { PALETTE_INSET } from './Palette'

const MARGIN = 8
const OFFSET = 10

// The selection's left, top and right on screen, in the canvas's own pixels.
function screenBox(s: ReactFlowState, ids: string[]): [number, number, number] {
  const [tx, ty, zoom] = s.transform
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  for (const id of ids) {
    const node = s.nodeLookup.get(id)
    if (!node) continue
    const at = node.internals.positionAbsolute
    left = Math.min(left, at.x)
    top = Math.min(top, at.y)
    right = Math.max(right, at.x + (node.measured.width ?? 0))
  }
  if (left === Infinity) return [0, 0, 0]
  return [tx + left * zoom, ty + top * zoom, tx + right * zoom]
}

export default function SelectionToolbar({ ids, visible, children }: { ids: string[]; visible: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [left, top, right] = useStore((s) => screenBox(s, ids), shallow)
  const width = useStore((s) => s.width)
  // Its own size, for the sums below: measured when it appears and whenever
  // its buttons change (one block or several, a block that runs or doesn't).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])
  const start = (left + right) / 2 - size.w / 2
  const shift = start < PALETTE_INSET ? PALETTE_INSET - start : start + size.w > width - MARGIN ? width - MARGIN - start - size.w : 0
  const below = top - OFFSET - size.h < MARGIN
  return (
    <NodeToolbar nodeId={ids} isVisible={visible} position={below ? Position.Bottom : Position.Top} offset={OFFSET}>
      <div ref={ref} style={shift ? { transform: `translateX(${Math.round(shift)}px)` } : undefined}>
        {children}
      </div>
    </NodeToolbar>
  )
}
