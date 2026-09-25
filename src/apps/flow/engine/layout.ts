// Tidy: lay the flow out left to right in the order the work runs. A block's
// column is how far down the chain it sits; within a column, blocks keep the
// dock's production order, then their current top-to-bottom order.

import type { FlowBlock, FlowGraph } from '../types'
import { blockWidth, isKnownKind, KINDS, PRODUCTION_ORDER } from './catalog'

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

// A block's size before the canvas has measured it: its width is fixed by
// kind, its height grows with its ports (and a batch's item rows).
// What each kind shows under its ports, in px, measured off the canvas: a
// Voiceovers block's voice and its takes, B-Roll's still strip and model
// tags, a Scene Clips block's scene rows. Guessing one height for every kind
// laid a Describe It flow's Voiceovers over the B-Roll under it.
const BODY: Partial<Record<FlowBlock['kind'], number>> = {
  voice: 150,
  broll: 120,
  scenes: 150,
  playground: 70,
  analyzer: 50,
  edit: 90,
  bank: 80,
  image: 120,
  text: 90,
  list: 40,
  note: 120,
}

export function estimatedSize(block: FlowBlock): { width: number; height: number } {
  const rows = isKnownKind(block.kind) ? Math.max(KINDS[block.kind].ins.length, KINDS[block.kind].outs.length) : 1
  const body = isKnownKind(block.kind) ? BODY[block.kind] ?? 40 : 40
  return { width: blockWidth(block.kind), height: 56 + rows * 22 + (block.items?.length ?? 0) * 26 + body }
}

// A graph nobody placed — one Describe It drafted, one Save as Flow traced —
// laid out left to right before it reaches the canvas.
export function laidOut(graph: FlowGraph): FlowGraph {
  const positions = tidyLayout(graph, (id) => {
    const b = graph.blocks.find((x) => x.id === id)
    return b ? estimatedSize(b) : { width: 240, height: 160 }
  })
  return { ...graph, blocks: graph.blocks.map((b) => ({ ...b, ...(positions[b.id] ?? {}) })) }
}

// Where a new block can go near `at` without covering one already there:
// `at` itself when it's clear, else the first clear spot below it. What a
// block added from the palette or a window lands on, so adding never hides
// part of the flow under the new block.
export function freeSpot(
  graph: FlowGraph,
  at: { x: number; y: number },
  kind: FlowBlock['kind'],
  sizeOf: (block: FlowBlock) => { width: number; height: number } = estimatedSize,
): { x: number; y: number } {
  const width = blockWidth(kind)
  const height = 180
  const margin = 24
  let y = at.y
  for (let i = 0; i < 60; i++) {
    const hit = graph.blocks.some((b) => {
      if (b.suggested) return false
      const size = sizeOf(b)
      return at.x < b.x + size.width + margin && at.x + width + margin > b.x && y < b.y + size.height + margin && y + height + margin > b.y
    })
    if (!hit) return { x: Math.round(at.x), y: Math.round(y) }
    y += 40
  }
  return { x: Math.round(at.x), y: Math.round(y) }
}
