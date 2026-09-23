// Tidy: lay the flow out left to right in the order the work runs. A block's
// column is how far down the chain it sits; within a column, blocks keep the
// dock's production order, then their current top-to-bottom order.

import type { FlowGraph } from '../types'
import { PRODUCTION_ORDER } from './catalog'

export const COLUMN_GAP = 96
export const ROW_GAP = 32

export function tidyLayout(
  graph: FlowGraph,
  sizeOf: (id: string) => { width: number; height: number },
): Record<string, { x: number; y: number }> {
  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const depthOf = (id: string): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return 0
    visiting.add(id)
    let d = 0
    for (const w of graph.wires) if (w.to === id) d = Math.max(d, depthOf(w.from) + 1)
    visiting.delete(id)
    depth.set(id, d)
    return d
  }
  for (const b of graph.blocks) depthOf(b.id)

  const columns: string[][] = []
  const rank = (kind: string) => PRODUCTION_ORDER.indexOf(kind as (typeof PRODUCTION_ORDER)[number])
  const ordered = [...graph.blocks].sort((a, b) => rank(a.kind) - rank(b.kind) || a.y - b.y)
  for (const b of ordered) {
    const d = depth.get(b.id) ?? 0
    ;(columns[d] ??= []).push(b.id)
  }

  const positions: Record<string, { x: number; y: number }> = {}
  let x = 0
  for (const col of columns) {
    if (!col?.length) continue
    let y = 0
    let width = 0
    for (const id of col) {
      const size = sizeOf(id)
      positions[id] = { x, y }
      y += size.height + ROW_GAP
      width = Math.max(width, size.width)
    }
    x += width + COLUMN_GAP
  }
  return positions
}
