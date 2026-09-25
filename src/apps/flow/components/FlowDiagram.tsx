// A flow at a glance, drawn as the canvas would: each block a chip with its
// app's tile, in columns in the order the work runs, wired in the colour of
// what the wire carries. The cover of a template card and of a flow on Flow
// Home. Edit Pack and Notes are left off — every flow ends in the one and the
// other isn't work — so a cover shows the part that differs.
//
// One SVG in its own coordinates, fitted to the box it's given.

import type { FlowBlock, FlowGraph } from '../types'
import { BANK_TYPE, isKnownKind, TYPE_META } from '../engine/catalog'
import { outputType } from '../engine/graph'
import type { BankType } from '../../../utils/constants'
import { blockAccent, blockIcon } from './blockMeta'

const CHIP_H = 28
const TILE = 18
const PAD = 14
const COL_GAP = 22
const ROW_GAP = 12
const CHAR_W = 6.1

// What a chip says: short, the way a member would name the step.
function chipLabel(b: FlowBlock): string {
  const s = b.settings
  switch (b.kind) {
    case 'bank': return BANK_TYPE[(s.bank as BankType) ?? 'products']?.one ?? 'Bank'
    case 'scripts':
      if (s.mode === 'remix') return 'Remix'
      return s.writeFormat === 'hooks' ? `Hooks ×${Number(s.hookCount) || 10}` : `Scripts ×${Number(s.variationCount) || 3}`
    case 'characters': return (Number(s.count) || 1) > 1 ? `Faces ×${Number(s.count)}` : 'Character'
    case 'voice': return 'Voice'
    case 'broll': return 'B-Roll'
    case 'playground': return s.mode === 'video' ? 'Video' : s.mode === 'music' ? 'Music' : 'Image'
    case 'analyzer': return 'Break Down'
    case 'outliers': return 'Find Ads'
    case 'image': return 'Image'
    case 'text': return 'Text'
    case 'list': return `Batch ×${Array.isArray(s.entries) ? s.entries.length : 0}`
    default: return b.kind
  }
}

export default function FlowDiagram({ graph, className = '' }: { graph: FlowGraph; className?: string }) {
  const shown = graph.blocks.filter((b) => isKnownKind(b.kind) && b.kind !== 'note' && b.kind !== 'edit' && !b.suggested)
  const ids = new Set(shown.map((b) => b.id))
  const wires = graph.wires.filter((w) => ids.has(w.from) && ids.has(w.to))

  // A block's column is how far down the chain it sits.
  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const depthOf = (id: string): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return 0
    visiting.add(id)
    let d = 0
    for (const w of wires) if (w.to === id) d = Math.max(d, depthOf(w.from) + 1)
    visiting.delete(id)
    depth.set(id, d)
    return d
  }
  const columns: FlowBlock[][] = []
  for (const b of [...shown].sort((a, c) => a.y - c.y)) (columns[depthOf(b.id)] ??= []).push(b)
  const cols = columns.filter(Boolean)
  if (!cols.length) return null

  // Chip sizes from their labels; a column is as wide as its widest chip.
  const widthOf = (b: FlowBlock) => Math.round(PAD * 0.4 + TILE + 6 + chipLabel(b).length * CHAR_W + 10)
  const colW = cols.map((col) => Math.max(...col.map(widthOf)))
  const rows = Math.max(...cols.map((c) => c.length))
  const height = PAD * 2 + rows * CHIP_H + (rows - 1) * ROW_GAP
  const width = PAD * 2 + colW.reduce((a, w) => a + w, 0) + (cols.length - 1) * COL_GAP

  const place = new Map<string, { x: number; y: number; w: number }>()
  let x = PAD
  cols.forEach((col, ci) => {
    const colHeight = col.length * CHIP_H + (col.length - 1) * ROW_GAP
    let y = (height - colHeight) / 2
    for (const b of col) {
      place.set(b.id, { x, y, w: widthOf(b) })
      y += CHIP_H + ROW_GAP
    }
    x += colW[ci] + COL_GAP
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className={className} role="img" aria-label="The flow's blocks">
      {wires.map((w) => {
        const a = place.get(w.from)
        const b = place.get(w.to)
        const from = shown.find((x) => x.id === w.from)
        if (!a || !b || !from) return null
        const type = outputType(from, w.fromPort)
        const x1 = a.x + a.w
        const y1 = a.y + CHIP_H / 2
        const x2 = b.x
        const y2 = b.y + CHIP_H / 2
        const bend = Math.max(12, (x2 - x1) / 2)
        return (
          <path
            key={w.id}
            d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={type ? TYPE_META[type].color : '#71717a'}
            strokeOpacity={0.7}
            strokeWidth={1.4}
          />
        )
      })}
      {shown.map((b) => {
        const p = place.get(b.id)
        if (!p) return null
        const Icon = blockIcon(b)
        const tileX = p.x + 5
        const tileY = p.y + (CHIP_H - TILE) / 2
        return (
          <g key={b.id}>
            <rect x={p.x} y={p.y} width={p.w} height={CHIP_H} rx={9} style={{ fill: 'var(--color-surface-2)', stroke: 'color-mix(in oklab, var(--color-ink) 12%, transparent)' }} strokeWidth={1} />
            <rect x={tileX} y={tileY} width={TILE} height={TILE} rx={5.5} fill={blockAccent(b)} />
            <rect x={tileX} y={tileY} width={TILE} height={TILE / 2} rx={5.5} fill="white" fillOpacity={0.14} />
            <Icon x={tileX + 3.5} y={tileY + 3.5} width={TILE - 7} height={TILE - 7} color="#ffffff" strokeWidth={2.2} />
            <text x={tileX + TILE + 6} y={p.y + CHIP_H / 2 + 3.6} fontSize={10.5} fontWeight={600} style={{ fill: 'var(--color-ink-100)' }}>
              {chipLabel(b)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
