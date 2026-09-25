// Tidy: lay the flow out left to right in the order the work runs. A block's
// column is how far down the chain it sits; within a column, blocks keep the
// dock's production order, then their current top-to-bottom order.

import type { FlowBlock, FlowGraph } from '../types'
import { blockWidth, isKnownKind, KINDS, PRODUCTION_ORDER, scriptsFormat, sourceOf, wearsSquare } from './catalog'

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
// kind, its height grows with its ports and what it shows under them.
// What each kind shows under its ports, in px, measured off the canvas after
// a run (components/node/bodies.tsx): the Ad Analyzer's cover, scores, quote
// and scenes; the voice and four takes; two filmstrips; the scene tiles and
// their strip; the result square; the edit folders. A block shows the shape
// of what it will make before it runs, so the height barely moves when it
// does. Guessing one height for every kind laid a Describe It flow's
// Voiceovers over the B-Roll under it.
const BODY: Partial<Record<FlowBlock['kind'], number>> = {
  analyzer: 240,
  voice: 206,
  broll: 291,
  scenes: 190,
  playground: 302,
  edit: 193,
  text: 90,
  list: 40,
  note: 120,
}

// A square face (components/node/face.tsx), measured off the canvas: the
// header, the pill over the square with its gap, the square as wide as the
// block less its 12px inset either side and its border, and the space under.
const HEADER = 44
const PILL = 40
const INSET = 26
const FACE_GAP = 10
const TAGS = 28

export function estimatedSize(block: FlowBlock): { width: number; height: number } {
  const width = blockWidth(block.kind)
  if (!isKnownKind(block.kind)) return { width, height: 56 + 22 + 40 }
  const tags = block.field || (KINDS[block.kind].runnable && sourceOf(block) !== 'generate') ? TAGS : 0
  if (wearsSquare(block)) {
    // A character's face is a 9:16 card, everything else a square.
    const portrait = (block.kind === 'bank' && block.settings.bank === 'models') || block.kind === 'characters'
    return { width, height: Math.round(HEADER + PILL + (width - INSET) * (portrait ? 16 / 9 : 1) + 12 + tags) }
  }
  const rows = Math.max(KINDS[block.kind].ins.length, KINDS[block.kind].outs.length)
  const top = 56 + rows * 22
  const items = Math.max(1, block.items?.length ?? 1)
  // The Characters block's faces: 9:16 portraits, two across once there's
  // more than one.
  if (block.kind === 'characters') {
    const across = items > 1 ? 2 : 1
    const tile = ((width - INSET - (across - 1) * FACE_GAP) / across) * (16 / 9)
    const lines = Math.ceil(items / across)
    return { width, height: Math.round(top + FACE_GAP + PILL + lines * tile + (lines - 1) * FACE_GAP + 12) }
  }
  // Scripts: up to five hook cards, or a stack of script pages.
  if (block.kind === 'scripts') {
    const hooks = scriptsFormat(block) === 'hooks'
    return { width, height: hooks ? top + 22 + Math.min(5, items) * 54 + (items > 5 ? 18 : 0) : top + 263 }
  }
  // Outliers: the search, and up to six covers three across.
  if (block.kind === 'outliers') {
    const tile = ((width - INSET - 2 * FACE_GAP) / 3) * (16 / 9)
    const lines = Math.ceil(Math.min(6, items) / 3)
    return { width, height: Math.round(top + FACE_GAP + PILL + lines * tile + (lines - 1) * FACE_GAP + 12 + (items > 6 ? 18 : 0)) }
  }
  return { width, height: top + (block.items?.length ?? 0) * 26 + (BODY[block.kind] ?? 40) }
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
  // The new block's own height, so a tall one — a Bank pick's square, the
  // Characters grid — doesn't land over the block under it.
  const height = Math.max(180, estimatedSize({ id: '', kind, x: 0, y: 0, settings: {} }).height)
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
