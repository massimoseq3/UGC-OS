// The flows being edited or run in this tab: one working copy per flow, the
// open one's selection, and undo. Every edit lands here first and reaches
// the bank (and the cloud) on a short debounce — a row is pushed whole, so a
// save per keystroke would flood the outbox.
//
// The run engine writes results through the same copies (setResults), so a
// run and an edit made while it runs can never overwrite each other's work.

import { create } from 'zustand'
import type { BlockKind, FlowBlock, FlowDoc, FlowGraph, FlowWire, InstanceResult } from '../types'
import { useBankStore } from '../../../stores/bankStore'
import { sourceOf } from '../engine/catalog'
import { canConnect, downstreamOf, itemPort, pruneWires, type ConnectCheck } from '../engine/graph'
import { tidyLayout } from '../engine/layout'
import { docFromRow, newBlock, rowFromDoc, shortId, withSlots } from './blocks'

const SAVE_DEBOUNCE_MS = 700
// The flow on screen, so a reload lands back in it. Draft prefix: sign-out
// wipes it with every other draft.
const OPEN_KEY = 'ai-ugc-lab:draft:flow:open'

function readOpen(): string | null {
  try { return localStorage.getItem(OPEN_KEY) } catch { return null }
}

function writeOpen(id: string | null) {
  try {
    if (id) localStorage.setItem(OPEN_KEY, id)
    else localStorage.removeItem(OPEN_KEY)
  } catch { /* a convenience, not state */ }
}
const UNDO_LIMIT = 80
// Edits to one field within this window are one undo step — a sentence typed
// into a prompt undoes as a sentence, not a letter.
const COALESCE_MS = 1_200

interface History {
  past: FlowGraph[]
  future: FlowGraph[]
  // The field the last step was for, and when, for coalescing.
  lastKey?: string
  lastAt?: number
}

export interface EditOptions {
  // Merge into the previous undo step when it was the same field, just now.
  coalesce?: string
  // Layout-only or result-only changes that undo shouldn't see.
  noUndo?: boolean
}

interface FlowStoreState {
  openId: string | null
  // The open flow as a canvas, or as an app (Run View).
  view: 'edit' | 'run'
  setView: (view: 'edit' | 'run') => void
  docs: Record<string, FlowDoc>
  selection: string[]
  history: Record<string, History>

  openFlow: (id: string | null) => void
  // The working copy of a flow, loaded from the bank on first ask.
  ensureDoc: (id: string) => FlowDoc | undefined
  createFlow: (init?: { name?: string; graph?: FlowGraph; template?: FlowDoc['template'] }) => string
  renameFlow: (id: string, name: string) => void
  setPinned: (id: string, pinned: boolean) => void
  removeFlow: (id: string) => void

  addBlock: (kind: BlockKind, at: { x: number; y: number }, extra?: Partial<FlowBlock>) => string
  // Paste, templates, Duplicate: blocks and the wires among them, re-id'd.
  insertGraph: (graph: FlowGraph, opts?: { offset?: { x: number; y: number }; select?: boolean }) => string[]
  patchBlock: (id: string, patch: Partial<FlowBlock>, opts?: EditOptions) => void
  patchSettings: (id: string, patch: Record<string, unknown>, opts?: EditOptions) => void
  moveBlocks: (positions: Record<string, { x: number; y: number }>) => void
  removeBlocks: (ids: string[]) => void
  duplicateBlocks: (ids: string[]) => void
  toggleOff: (ids: string[]) => void
  connect: (wire: Omit<FlowWire, 'id'>) => ConnectCheck
  reconnect: (wireId: string, wire: Omit<FlowWire, 'id'>) => ConnectCheck
  removeWire: (wireId: string) => void
  toggleItem: (blockId: string, itemId: string) => void
  deleteItem: (blockId: string, itemId: string) => void
  setItemsOff: (blockId: string, offIds: string[]) => void
  tidy: (sizeOf: (id: string) => { width: number; height: number }) => void
  setSelection: (ids: string[]) => void
  undo: () => void
  redo: () => void

  // Results, written by the run engine and by Load Run. Never an undo step.
  setResults: (flowId: string, blockId: string, update: (prev: Record<string, InstanceResult>) => Record<string, InstanceResult>) => void
  // Ask Flow's edits, applied as one undo step.
  replaceGraph: (graph: FlowGraph) => void
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleSave(doc: FlowDoc) {
  const prev = saveTimers.get(doc.id)
  if (prev) clearTimeout(prev)
  saveTimers.set(doc.id, setTimeout(() => {
    saveTimers.delete(doc.id)
    const current = useFlowStore.getState().docs[doc.id]
    if (current) useBankStore.getState().saveFlow(rowFromDoc(current))
  }, SAVE_DEBOUNCE_MS))
}

// A tab closing mid-debounce still saves.
function flushSaves() {
  for (const [id, timer] of saveTimers) {
    clearTimeout(timer)
    saveTimers.delete(id)
    const doc = useFlowStore.getState().docs[id]
    if (doc) useBankStore.getState().saveFlow(rowFromDoc(doc))
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSaves)
  window.addEventListener('beforeunload', flushSaves)
}

function snapshot(doc: FlowDoc): FlowGraph {
  return { blocks: doc.blocks, wires: doc.wires }
}

// Results of blocks no longer on the canvas go with them.
function trimOutputs(doc: FlowDoc): FlowDoc['outputs'] {
  const ids = new Set(doc.blocks.map((b) => b.id))
  const out: FlowDoc['outputs'] = {}
  for (const [id, r] of Object.entries(doc.outputs)) if (ids.has(id)) out[id] = r
  return out
}

export const useFlowStore = create<FlowStoreState>((set, get) => {
  // Apply a graph edit to the open flow: undo step, slot sync, wire pruning,
  // save.
  const edit = (mutate: (doc: FlowDoc) => FlowGraph | null, opts: EditOptions = {}): void => {
    const { openId, docs, history } = get()
    if (!openId) return
    const doc = docs[openId]
    if (!doc) return
    const next = mutate(doc)
    if (!next) return
    const blocks = next.blocks.map(withSlots)
    const wires = pruneWires({ blocks, wires: next.wires })
    const nextDoc: FlowDoc = { ...doc, blocks, wires, updatedAt: Date.now() }
    nextDoc.outputs = trimOutputs(nextDoc)

    const h = history[openId] ?? { past: [], future: [] }
    let nextHistory = h
    if (!opts.noUndo) {
      const now = Date.now()
      const merge = opts.coalesce && h.lastKey === opts.coalesce && now - (h.lastAt ?? 0) < COALESCE_MS
      nextHistory = merge
        ? { ...h, lastAt: now, future: [] }
        : { past: [...h.past, snapshot(doc)].slice(-UNDO_LIMIT), future: [], lastKey: opts.coalesce, lastAt: now }
    }
    set({ docs: { ...docs, [openId]: nextDoc }, history: { ...history, [openId]: nextHistory } })
    scheduleSave(nextDoc)
  }

  const replaceBlock = (id: string, fn: (b: FlowBlock) => FlowBlock, opts?: EditOptions) =>
    edit((doc) => ({ blocks: doc.blocks.map((b) => (b.id === id ? fn(b) : b)), wires: doc.wires }), opts)

  return {
    openId: readOpen(),
    view: 'edit',
    setView: (view) => set({ view }),
    docs: {},
    selection: [],
    history: {},

    openFlow: (id) => {
      if (id) get().ensureDoc(id)
      writeOpen(id)
      set({ openId: id, selection: [] })
    },

    ensureDoc: (id) => {
      const held = get().docs[id]
      if (held) return held
      const row = useBankStore.getState().getFlowById(id)
      if (!row) return undefined
      const doc = docFromRow(row)
      set((s) => ({ docs: { ...s.docs, [id]: doc } }))
      return doc
    },

    createFlow: (init = {}) => {
      const now = Date.now()
      const doc: FlowDoc = {
        id: crypto.randomUUID(),
        name: init.name?.trim() || 'Untitled Flow',
        blocks: init.graph?.blocks.map(withSlots) ?? [],
        wires: init.graph?.wires ?? [],
        outputs: {},
        template: init.template,
        createdAt: now,
        updatedAt: now,
      }
      set((s) => ({ docs: { ...s.docs, [doc.id]: doc } }))
      useBankStore.getState().saveFlow(rowFromDoc(doc))
      return doc.id
    },

    renameFlow: (id, name) => {
      const doc = get().ensureDoc(id)
      const trimmed = name.trim()
      if (!doc || !trimmed || trimmed === doc.name) return
      const next = { ...doc, name: trimmed, updatedAt: Date.now() }
      set((s) => ({ docs: { ...s.docs, [id]: next } }))
      scheduleSave(next)
    },

    setPinned: (id, pinned) => {
      const doc = get().ensureDoc(id)
      if (!doc) return
      const next = { ...doc, pinned, updatedAt: Date.now() }
      set((s) => ({ docs: { ...s.docs, [id]: next } }))
      useBankStore.getState().saveFlow(rowFromDoc(next))
    },

    removeFlow: (id) => {
      const timer = saveTimers.get(id)
      if (timer) clearTimeout(timer)
      saveTimers.delete(id)
      set((s) => {
        const docs = { ...s.docs }
        delete docs[id]
        return { docs, openId: s.openId === id ? null : s.openId }
      })
      useBankStore.getState().deleteFlow(id)
    },

    addBlock: (kind, at, extra) => {
      const block = newBlock(kind, at, extra)
      edit((doc) => ({ blocks: [...doc.blocks.filter((b) => !b.suggested), block], wires: doc.wires }))
      set({ selection: [block.id] })
      return block.id
    },

    insertGraph: (graph, opts = {}) => {
      const ids = new Map<string, string>()
      const itemIds = new Map<string, string>()
      const dx = opts.offset?.x ?? 0
      const dy = opts.offset?.y ?? 0
      const blocks = graph.blocks.map((b) => {
        const id = shortId(b.kind)
        ids.set(b.id, id)
        const items = b.items?.map((it) => {
          const nid = shortId('i')
          itemIds.set(`${b.id}:${it.id}`, nid)
          return { ...it, id: nid }
        })
        return { ...structuredClone(b), id, x: b.x + dx, y: b.y + dy, items, suggested: undefined }
      })
      const port = (blockId: string, p: string) => {
        if (!p.startsWith('item:')) return p
        const nid = itemIds.get(`${blockId}:${p.slice(5)}`)
        return nid ? itemPort(nid) : p
      }
      const wires = graph.wires
        .filter((w) => ids.has(w.from) && ids.has(w.to))
        .map((w) => ({ id: shortId('w'), from: ids.get(w.from)!, fromPort: port(w.from, w.fromPort), to: ids.get(w.to)!, toPort: w.toPort }))
      edit((doc) => ({ blocks: [...doc.blocks, ...blocks], wires: [...doc.wires, ...wires] }))
      const newIds = blocks.map((b) => b.id)
      if (opts.select !== false) set({ selection: newIds })
      return newIds
    },

    patchBlock: (id, patch, opts) => replaceBlock(id, (b) => ({ ...b, ...patch }), opts),

    patchSettings: (id, patch, opts) => replaceBlock(id, (b) => ({ ...b, settings: { ...b.settings, ...patch } }), opts),

    moveBlocks: (positions) => {
      edit((doc) => ({
        blocks: doc.blocks.map((b) => (positions[b.id] ? { ...b, x: Math.round(positions[b.id].x), y: Math.round(positions[b.id].y) } : b)),
        wires: doc.wires,
      }), { coalesce: `move:${Object.keys(positions).sort().join(',')}` })
    },

    removeBlocks: (ids) => {
      if (!ids.length) return
      const gone = new Set(ids)
      edit((doc) => ({
        blocks: doc.blocks.filter((b) => !gone.has(b.id)),
        wires: doc.wires.filter((w) => !gone.has(w.from) && !gone.has(w.to)),
      }))
      set((s) => ({ selection: s.selection.filter((x) => !gone.has(x)) }))
    },

    // A copy keeps the originals' INPUT wires, so trying a second voice on the
    // same script is one click; wires among the copies are copied too.
    duplicateBlocks: (ids) => {
      const { openId, docs } = get()
      const doc = openId ? docs[openId] : undefined
      if (!doc || !ids.length) return
      const picked = doc.blocks.filter((b) => ids.includes(b.id) && !b.suggested)
      if (!picked.length) return
      const idMap = new Map<string, string>()
      const itemMap = new Map<string, string>()
      const copies = picked.map((b) => {
        const id = shortId(b.kind)
        idMap.set(b.id, id)
        const items = b.items?.map((it) => {
          const nid = shortId('i')
          itemMap.set(`${b.id}:${it.id}`, nid)
          return { ...it, id: nid }
        })
        return { ...structuredClone(b), id, x: b.x + 40, y: b.y + 40, items }
      })
      const remapPort = (from: string, p: string) => {
        if (!p.startsWith('item:')) return p
        return itemPort(itemMap.get(`${from}:${p.slice(5)}`) ?? p.slice(5))
      }
      const wires: FlowWire[] = []
      for (const w of doc.wires) {
        if (!idMap.has(w.to)) continue
        const fromCopy = idMap.get(w.from)
        wires.push({
          id: shortId('w'),
          from: fromCopy ?? w.from,
          fromPort: fromCopy ? remapPort(w.from, w.fromPort) : w.fromPort,
          to: idMap.get(w.to)!,
          toPort: w.toPort,
        })
      }
      edit((d) => ({ blocks: [...d.blocks, ...copies], wires: [...d.wires, ...wires] }))
      set({ selection: copies.map((c) => c.id) })
    },

    toggleOff: (ids) => {
      const { openId, docs } = get()
      const doc = openId ? docs[openId] : undefined
      if (!doc) return
      const turnOff = doc.blocks.some((b) => ids.includes(b.id) && !b.off)
      edit((d) => ({ blocks: d.blocks.map((b) => (ids.includes(b.id) ? { ...b, off: turnOff || undefined } : b)), wires: d.wires }))
    },

    connect: (wire) => {
      const { openId, docs } = get()
      const doc = openId ? docs[openId] : undefined
      if (!doc) return { ok: false, reason: 'No flow is open.' }
      const check = canConnect(doc, wire)
      if (!check.ok) return check
      edit((d) => ({ blocks: d.blocks, wires: [...d.wires, { ...wire, id: shortId('w') }] }))
      return check
    },

    reconnect: (wireId, wire) => {
      const { openId, docs } = get()
      const doc = openId ? docs[openId] : undefined
      if (!doc) return { ok: false, reason: 'No flow is open.' }
      const without = { blocks: doc.blocks, wires: doc.wires.filter((w) => w.id !== wireId) }
      const check = canConnect(without, wire)
      if (!check.ok) return check
      edit(() => ({ blocks: without.blocks, wires: [...without.wires, { ...wire, id: wireId }] }))
      return check
    },

    removeWire: (wireId) => edit((d) => ({ blocks: d.blocks, wires: d.wires.filter((w) => w.id !== wireId) })),

    toggleItem: (blockId, itemId) =>
      replaceBlock(blockId, (b) => ({ ...b, items: b.items?.map((it) => (it.id === itemId ? { ...it, off: !it.off || undefined } : it)) })),

    // A face or a list entry is its own thing, so it goes and the count drops
    // with it. A hook came out of one call with the rest, so its slot stays
    // (keeping every other hook where it is) and is marked deleted.
    deleteItem: (blockId, itemId) => {
      const { openId, docs } = get()
      const doc = openId ? docs[openId] : undefined
      const block = doc?.blocks.find((b) => b.id === blockId)
      if (!doc || !block?.items) return
      const index = block.items.findIndex((it) => it.id === itemId)
      if (index < 0) return
      edit((d) => ({
        blocks: d.blocks.map((b) => {
          if (b.id !== blockId) return b
          if (b.kind === 'characters' && sourceOf(b) === 'generate') {
            const items = b.items!.filter((it) => it.id !== itemId)
            return { ...b, items, settings: { ...b.settings, count: items.length } }
          }
          if (b.kind === 'list') {
            const entries = [...((b.settings.entries as string[]) ?? [])]
            entries.splice(index, 1)
            return { ...b, items: b.items!.filter((it) => it.id !== itemId), settings: { ...b.settings, entries } }
          }
          return { ...b, items: b.items!.map((it) => (it.id === itemId ? { ...it, deleted: true } : it)) }
        }),
        wires: d.wires.filter((w) => !(w.from === blockId && w.fromPort === itemPort(itemId))),
      }))
      get().setResults(doc.id, blockId, (prev) => {
        const next: Record<string, InstanceResult> = {}
        for (const [k, r] of Object.entries(prev)) {
          if (!r.items?.[itemId]) {
            next[k] = r
            continue
          }
          const items = { ...r.items }
          delete items[itemId]
          next[k] = { ...r, items }
        }
        return next
      })
    },

    setItemsOff: (blockId, offIds) =>
      replaceBlock(blockId, (b) => ({ ...b, items: b.items?.map((it) => ({ ...it, off: offIds.includes(it.id) || undefined })) })),

    tidy: (sizeOf) => {
      const { openId, docs } = get()
      const doc = openId ? docs[openId] : undefined
      if (!doc) return
      const positions = tidyLayout({ blocks: doc.blocks.filter((b) => !b.suggested), wires: doc.wires }, sizeOf)
      edit((d) => ({ blocks: d.blocks.map((b) => (positions[b.id] ? { ...b, ...positions[b.id] } : b)), wires: d.wires }))
    },

    setSelection: (ids) => {
      const cur = get().selection
      if (cur.length === ids.length && cur.every((x, i) => x === ids[i])) return
      set({ selection: ids })
    },

    undo: () => {
      const { openId, docs, history } = get()
      if (!openId) return
      const h = history[openId]
      const doc = docs[openId]
      if (!h?.past.length || !doc) return
      const prev = h.past[h.past.length - 1]
      const nextDoc = { ...doc, ...prev, updatedAt: Date.now() }
      set({
        docs: { ...docs, [openId]: nextDoc },
        history: { ...history, [openId]: { past: h.past.slice(0, -1), future: [snapshot(doc), ...h.future] } },
      })
      scheduleSave(nextDoc)
    },

    redo: () => {
      const { openId, docs, history } = get()
      if (!openId) return
      const h = history[openId]
      const doc = docs[openId]
      if (!h?.future.length || !doc) return
      const [next, ...rest] = h.future
      const nextDoc = { ...doc, ...next, updatedAt: Date.now() }
      set({
        docs: { ...docs, [openId]: nextDoc },
        history: { ...history, [openId]: { past: [...h.past, snapshot(doc)], future: rest } },
      })
      scheduleSave(nextDoc)
    },

    replaceGraph: (graph) => edit(() => graph),

    setResults: (flowId, blockId, update) => {
      const doc = get().ensureDoc(flowId)
      if (!doc) return
      const prev = doc.outputs[blockId]?.instances ?? {}
      const nextDoc: FlowDoc = { ...doc, outputs: { ...doc.outputs, [blockId]: { instances: update(prev) } }, updatedAt: Date.now() }
      set((s) => ({ docs: { ...s.docs, [flowId]: nextDoc } }))
      scheduleSave(nextDoc)
    },
  }
})

// Everything downstream of the given blocks, for "what would a change here re-run".
export function affectedBy(doc: FlowGraph, ids: string[]): Set<string> {
  return downstreamOf(doc, ids)
}

