// Graph rules: which wires are allowed, what order blocks run in, and what
// sits upstream or downstream of what. Pure functions over a FlowGraph.

import type { FlowBlock, FlowGraph, FlowItem, FlowWire, PortSpec, PortType } from '../types'
import { accepts, insOf, isBatch, itemNoun, outsOf, TYPE_META, titleOf } from './catalog'

export const ITEM_PREFIX = 'item:'

export function itemPort(itemId: string): string {
  return `${ITEM_PREFIX}${itemId}`
}

export function itemIdOf(port: string): string | null {
  return port.startsWith(ITEM_PREFIX) ? port.slice(ITEM_PREFIX.length) : null
}

export function blockById(graph: FlowGraph, id: string): FlowBlock | undefined {
  return graph.blocks.find((b) => b.id === id)
}

// A batch's slots as the canvas lists them — deleted ones gone.
export function liveItems(block: FlowBlock): FlowItem[] {
  return (block.items ?? []).filter((it) => !it.deleted)
}

export function enabledItems(block: FlowBlock): FlowItem[] {
  return liveItems(block).filter((it) => !it.off)
}

// The type an output port carries. An item port carries its batch's type.
export function outputType(block: FlowBlock, portKey: string): PortType | null {
  const outs = outsOf(block)
  if (itemIdOf(portKey) !== null) {
    if (!isBatch(block)) return null
    if (!liveItems(block).some((it) => itemPort(it.id) === portKey)) return null
    return outs[0]?.type ?? null
  }
  return outs.find((p) => p.key === portKey)?.type ?? null
}

export function inputSpec(block: FlowBlock, portKey: string): PortSpec | undefined {
  return insOf(block).find((p) => p.key === portKey)
}

// A readable name for where a wire starts: "Scripts · Hook 3".
export function outputLabel(block: FlowBlock, portKey: string): string {
  const itemId = itemIdOf(portKey)
  if (itemId !== null) {
    const index = liveItems(block).findIndex((it) => it.id === itemId)
    return `${titleOf(block)} · ${itemNoun(block)} ${index + 1}`
  }
  const out = outsOf(block).find((p) => p.key === portKey)
  return out && outsOf(block).length > 1 ? `${titleOf(block)} · ${out.label}` : titleOf(block)
}

export function wiresInto(graph: FlowGraph, blockId: string, portKey?: string): FlowWire[] {
  return graph.wires.filter((w) => w.to === blockId && (portKey === undefined || w.toPort === portKey))
}

export function wiresOutOf(graph: FlowGraph, blockId: string): FlowWire[] {
  return graph.wires.filter((w) => w.from === blockId)
}

// Every block that feeds `id`, however far back.
export function upstreamOf(graph: FlowGraph, id: string): Set<string> {
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const x = stack.pop()!
    for (const w of graph.wires) {
      if (w.to === x && !seen.has(w.from)) {
        seen.add(w.from)
        stack.push(w.from)
      }
    }
  }
  return seen
}

// Every block fed by any of `ids`, however far on — `ids` included.
export function downstreamOf(graph: FlowGraph, ids: string[]): Set<string> {
  const seen = new Set<string>(ids)
  const stack = [...ids]
  while (stack.length) {
    const x = stack.pop()!
    for (const w of graph.wires) {
      if (w.from === x && !seen.has(w.to)) {
        seen.add(w.to)
        stack.push(w.to)
      }
    }
  }
  return seen
}

export function wouldCycle(graph: FlowGraph, from: string, to: string): boolean {
  return from === to || upstreamOf(graph, from).has(to)
}

export type ConnectCheck = { ok: true } | { ok: false; reason: string }

// Whether a wire from an output to an input may be drawn, and if not, the
// sentence that says why.
export function canConnect(graph: FlowGraph, wire: Omit<FlowWire, 'id'>): ConnectCheck {
  const from = blockById(graph, wire.from)
  const to = blockById(graph, wire.to)
  if (!from || !to) return { ok: false, reason: 'That block is gone.' }
  const outType = outputType(from, wire.fromPort)
  const input = inputSpec(to, wire.toPort)
  if (!outType || !input) return { ok: false, reason: `${titleOf(to)} has no input there.` }
  if (!accepts(input.type, outType)) {
    return {
      ok: false,
      reason: `${input.label} takes ${acceptsLabel(input.type)}, not ${TYPE_META[outType].label}.`,
    }
  }
  if (wouldCycle(graph, wire.from, wire.to)) {
    return { ok: false, reason: 'That wire would loop back on itself, so the flow could never finish.' }
  }
  if (graph.wires.some((w) => w.from === wire.from && w.fromPort === wire.fromPort && w.to === wire.to && w.toPort === wire.toPort)) {
    return { ok: false, reason: 'Those two are already wired.' }
  }
  return { ok: true }
}

export function acceptsLabel(inputType: PortType): string {
  const names = ACCEPT_ORDER.filter((t) => accepts(inputType, t)).map((t) => TYPE_META[t].label)
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

const ACCEPT_ORDER: PortType[] = ['script', 'text', 'transcript', 'image', 'product', 'character', 'style', 'audio', 'video', 'voice', 'ad', 'music']

// Blocks in an order where every block comes after everything it reads from.
// Canvas order breaks ties, so the list reads top-to-bottom, left-to-right.
export function topoOrder(graph: FlowGraph): string[] {
  const indeg = new Map<string, number>()
  for (const b of graph.blocks) indeg.set(b.id, 0)
  for (const w of graph.wires) {
    if (indeg.has(w.to) && indeg.has(w.from)) indeg.set(w.to, (indeg.get(w.to) ?? 0) + 1)
  }
  const byPos = [...graph.blocks].sort((a, b) => a.x - b.x || a.y - b.y)
  const order: string[] = []
  const done = new Set<string>()
  // Kahn's algorithm, picking the leftmost ready block each round.
  while (order.length < byPos.length) {
    const next = byPos.find((b) => !done.has(b.id) && (indeg.get(b.id) ?? 0) === 0)
    if (!next) {
      // A cycle — the wiring rules refuse these, but a hand-edited template
      // could carry one. Append the rest in canvas order rather than hang.
      for (const b of byPos) if (!done.has(b.id)) order.push(b.id)
      break
    }
    done.add(next.id)
    order.push(next.id)
    for (const w of graph.wires) {
      if (w.from === next.id && indeg.has(w.to)) indeg.set(w.to, (indeg.get(w.to) ?? 0) - 1)
    }
  }
  return order
}

// What a Scripts block's wiring decides about it, written onto its settings
// so its slots and its price agree with what the run will do:
// - a winning ad wired into Source makes it a remix, whatever the panel was
//   left on (executors/simple.ts scriptInput does the same at run time);
// - an ad's SCENES wired in (the Ad Analyzer's Scene Prompts, or a Scripts
//   block writing scenes) makes it the scene-by-scene rebuild, which writes
//   ONE take — so it has one slot, not the three a remix starts with.
// `sceneRemix` is left off when nothing is wired: the typed source decides.
export function settleScripts(graph: FlowGraph): FlowBlock[] {
  return graph.blocks.map((b) => {
    if (b.kind !== 'scripts') return b
    const wire = graph.wires.find((w) => w.to === b.id && w.toPort === 'source')
    const from = wire && blockById(graph, wire.from)
    const scenes = !!from && (
      (from.kind === 'analyzer' && wire!.fromPort === 'scenes')
      || (from.kind === 'scripts' && (from.settings.writeFormat === 'scenes' || from.settings.sceneRemix === true))
    )
    const mode = wire ? 'remix' : b.settings.mode
    const sceneRemix = wire ? scenes : undefined
    if (mode === b.settings.mode && sceneRemix === b.settings.sceneRemix) return b
    const settings: Record<string, unknown> = { ...b.settings, mode }
    if (sceneRemix === undefined) delete settings.sceneRemix
    else settings.sceneRemix = sceneRemix
    return { ...b, settings }
  })
}

// Wires that no longer make sense after an edit — a batch slot deleted, a
// source switched so an input vanished, an output whose type changed — go.
export function pruneWires(graph: FlowGraph): FlowWire[] {
  return graph.wires.filter((w) => {
    const from = blockById(graph, w.from)
    const to = blockById(graph, w.to)
    if (!from || !to) return false
    const outType = outputType(from, w.fromPort)
    const input = inputSpec(to, w.toPort)
    return !!outType && !!input && accepts(input.type, outType)
  })
}
