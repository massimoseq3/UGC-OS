// Making and reshaping blocks: a fresh block of each kind with its app's own
// defaults, and a batch block's slots kept in step with its settings.

import type { BlockKind, FlowBlock, FlowDoc, FlowGraph, FlowItem } from '../types'
import type { FlowRow } from '../../../stores/types'
import { desiredSlots, isBatch, isKnownKind, KINDS, sourceOf } from '../engine/catalog'
import { scriptHistoryItems } from '../engine/held'
import { createDefaultSettings } from '../../voice-studio/types'
import { createEmptyProfile } from '../../character-studio/types'

export function shortId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export function newBlock(kind: BlockKind, at: { x: number; y: number }, extra: Partial<FlowBlock> = {}): FlowBlock {
  const spec = KINDS[kind]
  const settings: Record<string, unknown> = { ...spec.defaults() }
  // A fresh Voiceovers or Characters block reads like a fresh app.
  if (kind === 'voice') Object.assign(settings, createDefaultSettings())
  if (kind === 'characters') settings.profile = createEmptyProfile()
  const block: FlowBlock = {
    id: shortId(kind),
    kind,
    x: Math.round(at.x),
    y: Math.round(at.y),
    settings: { ...settings, ...(extra.settings ?? {}) },
    ...(spec.sources.length ? { source: spec.sources[0] } : {}),
    ...extra,
  }
  if (extra.settings) block.settings = { ...settings, ...extra.settings }
  return withSlots(block)
}

// A batch block's slots follow its settings: more hooks asked for, more slots;
// fewer, the last ones go. A slot keeps its id (and its on/off) for as long
// as it exists, so a wire from "Hook 3" survives every edit that keeps three.
export function withSlots(block: FlowBlock): FlowBlock {
  if (!isBatch(block)) return block.items?.length ? { ...block, items: undefined } : block
  const want = block.kind === 'scripts' && sourceOf(block) === 'history'
    ? scriptHistoryItems(block.pick ?? '').length
    : desiredSlots(block)
  const items: FlowItem[] = [...(block.items ?? [])]
  if (items.length === want) return block
  while (items.length < want) items.push({ id: shortId('i') })
  items.length = want
  return { ...block, items }
}

// ── Rows ───────────────────────────────────────────────────────────────────

export function docFromRow(row: FlowRow): FlowDoc {
  return {
    id: row.id,
    name: row.name,
    blocks: (Array.isArray(row.blocks) ? row.blocks : []) as FlowBlock[],
    wires: (Array.isArray(row.wires) ? row.wires : []) as FlowDoc['wires'],
    outputs: (row.outputs && typeof row.outputs === 'object' ? row.outputs : {}) as FlowDoc['outputs'],
    template: row.template,
    pinned: row.pinned,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function rowFromDoc(doc: FlowDoc): FlowRow {
  return {
    id: doc.id,
    name: doc.name,
    blocks: doc.blocks,
    wires: doc.wires,
    outputs: doc.outputs,
    template: doc.template,
    pinned: doc.pinned,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

// The graph the engine reads: blocks a newer build made that this one
// doesn't know are left on the canvas, but out of every plan.
export function knownGraph(graph: FlowGraph): FlowGraph {
  const blocks = graph.blocks.filter((b) => isKnownKind(b.kind))
  if (blocks.length === graph.blocks.length) return graph
  const ids = new Set(blocks.map((b) => b.id))
  return { blocks, wires: graph.wires.filter((w) => ids.has(w.from) && ids.has(w.to)) }
}
