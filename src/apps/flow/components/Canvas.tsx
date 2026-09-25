// The canvas: React Flow drawing the flow's blocks and wires, with the store
// as the one source of truth. Nodes are derived from the flow on every
// render; the only state held here is what's mid-gesture — a drag in progress
// (committed on release, so a drag is one undo step and one save, not sixty)
// and the sizes React Flow measures.
//
// A block opens in its app's own window (double-click, Enter, or Open on its
// toolbar); the helpers — Text, List, Note, Image, a Bank pick — are edited
// right on the canvas.

import { useEffect, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  useViewport,
  type Connection,
  type Dimensions,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react'
import { ClipboardPaste, Copy, CopyPlus, Eye, FormInput, Hand, Maximize2, Minus, Pencil, Play, Plus, Power, Redo2, Scan, SquareDashedMousePointer, StickyNote, Trash2, Undo2, Unlink, Wand2 } from 'lucide-react'
import type { BlockKind, FlowBlock, FlowDoc, PortSpec, PortType } from '../types'
import type { FlowPlan } from '../engine/plan'
import { accepts, inlineText, insOf, isRunnable, outsOf, suggestNext, TYPE_META, KINDS, titleOf } from '../engine/catalog'
import { canConnect, inputSpec, outputLabel, outputType, topoOrder, wiresInto } from '../engine/graph'
import { useFlowStore } from '../store/flowStore'
import { newBlock } from '../store/blocks'
import { useFlowRunStore, type LiveRun } from '../run/runtime'
import { useAppStore } from '../../../stores/appStore'
import { saveAsset } from '../../../utils/assetStore'
import { copyToClipboard } from '../../../utils/clipboard'
import type { BankType } from '../../../utils/constants'
import BlockNode, { type BlockNodeType } from './BlockNode'
import WireEdge, { type WireEdgeType } from './WireEdge'
import Palette, { PALETTE_DRAG_TYPE } from './Palette'
import WhatNextMenu from './WhatNextMenu'
import { optionsForInput, optionsForInsert, optionsForOutput, type InsertOption, type WhatNextOption } from './whatNext'
import ContextMenu, { type ContextRow } from './ContextMenu'
import AddBlockMenu, { type AddOption } from './AddBlockMenu'
import { DELETE_KEY, MOD, SHIFT_MOD } from './keys'
import { creditsShort } from '../hooks/useFlowPlan'
import { CanvasContext, type CanvasContextValue } from './canvasContext'
import { blockWidth, isFieldable, kindFace, opensWindow } from './blockMeta'
import { clipFromSelection, parseFlowJson } from '../templates/io'
import AskFlow from './AskFlow'
import FlowHelp from './FlowHelp'
import WirePeek from './WirePeek'
import { estimatedSize, freeSpot } from '../engine/layout'

const NODE_TYPES = { block: BlockNode }
const EDGE_TYPES = { wire: WireEdge }
const SUGGESTION_ID = 'suggested'

interface WhatNextState {
  x: number
  y: number
  at: XYPosition
  type: PortType
  // The dragged end: an output looking for an input, or the reverse.
  from: { blockId: string; port: string; side: 'out' | 'in' }
  // Dropped on a block with more than one input that could take it: which of
  // THAT block's inputs, instead of which new block.
  into?: { blockId: string; options: WhatNextOption[] }
}

// Clipboard for copy/paste inside the tab; the system clipboard gets the same
// JSON, so a paste into another tab (or another member's canvas) works too.
let memoryClip: string | null = null

// The block under a point, read off the DOM — a wire let go over a block's
// body lands nowhere React Flow can see, since only the dots are targets.
function nodeIdAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  return el?.closest('.react-flow__node')?.getAttribute('data-id') ?? null
}

export default function Canvas({
  flowId,
  doc,
  plan,
  run,
  onReview,
  onRunBlock,
  keysActive,
}: {
  flowId: string
  doc: FlowDoc
  plan: FlowPlan | null
  run: LiveRun | undefined
  onReview: (blockId: string) => void
  onRunBlock: (blockId: string) => void
  keysActive: boolean
}) {
  const rf = useReactFlow()
  const { zoom } = useViewport()
  const selection = useFlowStore((s) => s.selection)
  const setSelection = useFlowStore((s) => s.setSelection)
  const addBlock = useFlowStore((s) => s.addBlock)
  const connect = useFlowStore((s) => s.connect)
  const reconnect = useFlowStore((s) => s.reconnect)
  const removeWire = useFlowStore((s) => s.removeWire)
  const moveBlocks = useFlowStore((s) => s.moveBlocks)
  const removeBlocks = useFlowStore((s) => s.removeBlocks)
  const duplicateBlocks = useFlowStore((s) => s.duplicateBlocks)
  const toggleOff = useFlowStore((s) => s.toggleOff)
  const patchBlock = useFlowStore((s) => s.patchBlock)
  const insertGraph = useFlowStore((s) => s.insertGraph)
  const openWindow = useFlowStore((s) => s.openWindow)
  const tidy = useFlowStore((s) => s.tidy)
  const undo = useFlowStore((s) => s.undo)
  const redo = useFlowStore((s) => s.redo)
  const activeApp = useAppStore((s) => s.activeApp)
  const addToast = useAppStore((s) => s.addToast)
  const running = useFlowRunStore((s) => s.runs[flowId]?.status === 'running')
  const canUndo = useFlowStore((s) => (s.history[flowId]?.past.length ?? 0) > 0)
  const canRedo = useFlowStore((s) => (s.history[flowId]?.future.length ?? 0) > 0)

  const [drag, setDrag] = useState<Record<string, XYPosition>>({})
  const [measured, setMeasured] = useState<Record<string, Dimensions>>({})
  const [selectedWire, setSelectedWire] = useState<string | null>(null)
  const [hoverWire, setHoverWire] = useState<string | null>(null)
  // Leaving a wire for the tools at its middle crosses a gap: the hover is
  // let go a moment late, and the tools hold it while they're pointed at.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointWire = (id: string | null) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    if (id) setHoverWire(id)
    else hoverTimer.current = setTimeout(() => setHoverWire(null), 350)
  }
  const [menu, setMenu] = useState<WhatNextState | null>(null)
  const [dragging, setDragging] = useState(false)
  // Right-click: on a block (or the selection), on the canvas, or on a wire.
  const [ctx, setCtx] = useState<{ x: number; y: number; at: XYPosition; on: 'block' | 'pane' | 'wire'; id?: string } | null>(null)
  // Add Block, where it was asked for.
  const [adder, setAdder] = useState<{ x: number; y: number; at: XYPosition } | null>(null)
  // Insert a block in the middle of a wire.
  const [insert, setInsert] = useState<{ x: number; y: number; wireId: string; type: PortType; options: InsertOption[] } | null>(null)
  // The block whose name is being typed on the canvas (F2, or Rename).
  const [renaming, setRenaming] = useState<string | null>(null)
  // What's on a wire, opened from its middle.
  const [peek, setPeek] = useState<{ x: number; y: number; wireId: string } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // The last place the pointer was over the canvas, for Tab's Add Block.
  const pointer = useRef<{ x: number; y: number } | null>(null)

  const say = (message: string, kind: 'info' | 'error' | 'success' = 'info') => addToast(message, kind)

  // A block just added off the edge of the view is brought into it, with
  // whatever it's wired to, at the zoom the member is on — a member who
  // presses "Add Scripts" should see Scripts, not a canvas that looks
  // unchanged.
  const reveal = (id: string) => {
    setTimeout(() => {
      const node = rf.getNode(id)
      const rect = wrapRef.current?.getBoundingClientRect()
      const current = useFlowStore.getState().docs[flowId]
      const kind = current?.blocks.find((b) => b.id === id)?.kind
      if (!node || !rect || !kind) return
      const w = node.measured?.width ?? blockWidth(kind)
      const h = node.measured?.height ?? 180
      const tl = rf.flowToScreenPosition(node.position)
      const br = rf.flowToScreenPosition({ x: node.position.x + w, y: node.position.y + h })
      const inView = tl.x >= rect.left + 16 && tl.y >= rect.top + 16 && br.x <= rect.right - 16 && br.y <= rect.bottom - 110
      if (inView) return
      const near = current.wires.filter((x) => x.from === id || x.to === id).map((x) => (x.from === id ? x.to : x.from))
      void rf.fitView({ nodes: [id, ...near].map((x) => ({ id: x })), padding: 0.3, maxZoom: Math.max(0.5, rf.getZoom()), duration: 350 })
    }, 80)
  }

  // ── The suggested next block ─────────────────────────────────────────────
  const real = doc.blocks.filter((b) => !b.suggested)
  const nextKind = real.length ? suggestNext(real) : null
  const rightmost = real.reduce<FlowBlock | null>((a, b) => (!a || b.x > a.x ? b : a), null)
  const suggestion: FlowBlock | null = nextKind && rightmost
    ? { ...newBlock(nextKind, { x: rightmost.x + blockWidth(rightmost.kind) + 96, y: rightmost.y }), id: SUGGESTION_ID, suggested: true }
    : null

  // ── Nodes and edges, derived ─────────────────────────────────────────────
  const nodes: BlockNodeType[] = [...real, ...(suggestion ? [suggestion] : [])].map((b) => ({
    id: b.id,
    type: 'block',
    position: drag[b.id] ?? { x: b.x, y: b.y },
    data: { blockId: b.id },
    selected: selection.includes(b.id),
    measured: measured[b.id],
    dragHandle: '.flow-drag',
    selectable: !b.suggested,
    draggable: !b.suggested,
    connectable: !b.suggested,
    // React Flow turns pointer events off on a node that can't be selected,
    // dragged or wired — which left the suggested block unclickable. It's a
    // button; it has to take the click.
    style: b.suggested ? { pointerEvents: 'all' as const } : undefined,
  }))

  const liveBlocks = new Set(run?.status === 'running' ? Object.entries(run.blocks).filter(([, s]) => s.status === 'running' || s.status === 'queued').map(([id]) => id) : [])
  const edges: WireEdgeType[] = doc.wires.map((w) => {
    const from = real.find((b) => b.id === w.from)
    const type = from ? outputType(from, w.fromPort) : null
    return {
      id: w.id,
      source: w.from,
      sourceHandle: w.fromPort,
      target: w.to,
      targetHandle: w.toPort,
      type: 'wire',
      selected: selectedWire === w.id,
      reconnectable: 'target',
      data: {
        color: type ? TYPE_META[type].color : '#71717a',
        count: plan?.blocks[w.from]?.values[w.fromPort]?.length ?? 0,
        live: liveBlocks.has(w.to),
        hover: hoverWire === w.id,
      },
    }
  })

  // ── Changes from React Flow ──────────────────────────────────────────────
  const onNodesChange = (changes: NodeChange<BlockNodeType>[]) => {
    const moved: Record<string, XYPosition> = {}
    let nextSel: Set<string> | null = null
    for (const c of changes) {
      if (c.type === 'position' && c.position) {
        if (c.dragging) {
          setDrag((d) => ({ ...d, [c.id]: c.position! }))
          setDragging(true)
        } else {
          moved[c.id] = c.position
        }
      } else if (c.type === 'position' && c.dragging === false) {
        const at = drag[c.id]
        if (at) moved[c.id] = at
      } else if (c.type === 'dimensions' && c.dimensions) {
        const dims = c.dimensions
        setMeasured((m) => (m[c.id]?.width === dims.width && m[c.id]?.height === dims.height ? m : { ...m, [c.id]: dims }))
      } else if (c.type === 'select' && c.id !== SUGGESTION_ID) {
        nextSel ??= new Set(selection)
        if (c.selected) nextSel.add(c.id)
        else nextSel.delete(c.id)
      }
    }
    if (Object.keys(moved).length) {
      moveBlocks(moved)
      setDrag((d) => {
        const next = { ...d }
        for (const id of Object.keys(moved)) delete next[id]
        return next
      })
      setDragging(false)
    }
    if (nextSel) {
      setSelection([...nextSel])
      setSelectedWire(null)
    }
  }

  const onEdgesChange = (changes: EdgeChange<WireEdgeType>[]) => {
    for (const c of changes) {
      if (c.type === 'select') setSelectedWire(c.selected ? c.id : null)
    }
  }

  const isValidConnection = (c: Connection | Edge) =>
    !!c.sourceHandle && !!c.targetHandle && canConnect(doc, { from: c.source, fromPort: c.sourceHandle, to: c.target, toPort: c.targetHandle }).ok

  const onConnect = (c: Connection) => {
    if (!c.sourceHandle || !c.targetHandle) return
    const check = connect({ from: c.source, fromPort: c.sourceHandle, to: c.target, toPort: c.targetHandle })
    if (!check.ok) say(check.reason, 'error')
  }

  // A wire let go over another block's body wires into the one input that
  // plainly takes it, so a member never has to hit an 11px dot. "Plainly"
  // is strict, because a wrong guess spends: an input that already holds
  // something — a wire, or a script typed into the block — is never quietly
  // replaced, and a looser fit (a transcript into a Brief) never wins over
  // the input made for it. Anything less clear-cut asks which input.
  // Dragged out of an input, the same, the other way round.
  const wireInto = (from: { blockId: string; port: string; side: 'out' | 'in' }, type: PortType, target: FlowBlock, clientX: number, clientY: number): boolean => {
    if (from.side === 'out') {
      const fits = insOf(target).filter((p) => accepts(p.type, type))
      if (!fits.length) {
        say(`${titleOf(target)} has no input that takes ${TYPE_META[type].label}.`, 'error')
        return false
      }
      const filled = (p: PortSpec) => wiresInto(doc, target.id, p.key).length > 0 || inlineText(target, p.key) !== null
      const open = (p: PortSpec) => !filled(p) || !!p.many
      const exact = fits.filter((p) => p.type === type)
      const exactOpen = exact.filter(open)
      const looseOpen = fits.filter((p) => p.type !== type && open(p))
      const sure = exactOpen.length === 1 ? exactOpen[0] : !exact.length && looseOpen.length === 1 ? looseOpen[0] : undefined
      if (sure) {
        const check = connect({ from: from.blockId, fromPort: from.port, to: target.id, toPort: sure.key })
        if (check.ok) return true
      }
      askAt(from.blockId, from.port, from.side, type, clientX, clientY, {
        blockId: target.id,
        options: fits.map((p) => ({
          kind: target.kind,
          port: p.key,
          label: p.label,
          detail: wiresInto(doc, target.id, p.key).length ? (p.many ? 'Adds to It' : 'Replaces Its Wire') : inlineText(target, p.key) !== null ? 'Replaces Typed' : '',
        })),
      })
      return true
    }
    const fits = outsOf(target).filter((o) => accepts(type, o.type))
    const ordered = [...fits.filter((o) => o.type === type), ...fits.filter((o) => o.type !== type)]
    let reason = ordered.length ? '' : `${titleOf(target)} makes nothing that goes there.`
    for (const o of ordered) {
      const check = connect({ from: target.id, fromPort: o.key, to: from.blockId, toPort: from.port })
      if (check.ok) return true
      reason ||= check.reason
    }
    say(reason, 'error')
    return false
  }

  // A wire let go over empty canvas — or a dot clicked — asks what comes next.
  const onConnectEnd = (e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode || !state.fromHandle) return
    const block = real.find((b) => b.id === state.fromNode!.id)
    if (!block) return
    const point = 'changedTouches' in e ? e.changedTouches[0] : e
    const side = state.fromHandle.type === 'source' ? 'out' : 'in'
    const port = state.fromHandle.id ?? ''
    const type = side === 'out' ? outputType(block, port) : inputSpec(block, port)?.type
    if (!type) return
    const over = nodeIdAt(point.clientX, point.clientY) ?? state.toNode?.id ?? null
    const target = over && over !== block.id ? real.find((b) => b.id === over) : undefined
    if (target) {
      wireInto({ blockId: block.id, port, side }, type, target, point.clientX, point.clientY)
      return
    }
    askAt(block.id, port, side, type, point.clientX, point.clientY)
  }

  const askAt = (blockId: string, port: string, side: 'in' | 'out', type: PortType, clientX: number, clientY: number, into?: WhatNextState['into']) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    setMenu({
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
      at: rf.screenToFlowPosition({ x: clientX, y: clientY }),
      type,
      from: { blockId, port, side },
      into,
    })
  }

  const askAtPort = (blockId: string, port: string, side: 'in' | 'out', clientX: number, clientY: number) => {
    const block = real.find((b) => b.id === blockId)
    if (!block) return
    const type = side === 'out' ? outputType(block, port) : inputSpec(block, port)?.type
    if (type) askAt(blockId, port, side, type, clientX, clientY)
  }

  const pickWhatNext = (o: WhatNextOption) => {
    if (!menu) return
    if (menu.into) {
      const wire = { from: menu.from.blockId, fromPort: menu.from.port, to: menu.into.blockId, toPort: o.port }
      // "Replaces Its Wire" means it: an input that takes one thing gets the
      // new wire in place of what fed it, never beside it, where the block
      // would run once for each.
      const target = real.find((b) => b.id === wire.to)
      const existing = target && !inputSpec(target, o.port)?.many ? wiresInto(doc, wire.to, o.port) : []
      const check = existing.length ? reconnect(existing[0].id, wire) : connect(wire)
      if (check.ok) for (const w of existing.slice(1)) removeWire(w.id)
      else say(check.reason, 'error')
      setMenu(null)
      return
    }
    // A wire's length clear of the dot it came from, so the new block never
    // lands on top of the one it's wired to.
    const at = menu.from.side === 'out'
      ? { x: menu.at.x + 72, y: menu.at.y - 22 }
      : { x: menu.at.x - blockWidth(o.kind) - 72, y: menu.at.y - 22 }
    const id = addBlock(o.kind, freeSpot({ blocks: real, wires: doc.wires }, at, o.kind, (b) => measured[b.id] ?? estimatedSize(b)), o.bank ? { settings: { bank: o.bank } } : undefined)
    reveal(id)
    const check = menu.from.side === 'out'
      ? connect({ from: menu.from.blockId, fromPort: menu.from.port, to: id, toPort: o.port })
      : connect({ from: id, fromPort: o.port, to: menu.from.blockId, toPort: menu.from.port })
    if (!check.ok) say(check.reason, 'error')
    setMenu(null)
  }

  // Picking a wire up off an input moves it; dropping it on nothing removes it.
  const onReconnect = (old: Edge, c: Connection) => {
    if (!c.sourceHandle || !c.targetHandle) return
    const check = reconnect(old.id, { from: c.source, fromPort: c.sourceHandle, to: c.target, toPort: c.targetHandle })
    if (!check.ok) say(check.reason, 'error')
  }
  const onReconnectEnd = (_e: MouseEvent | TouchEvent, edge: Edge, _handle: unknown, state: FinalConnectionState) => {
    if (!state.isValid) removeWire(edge.id)
  }

  // ── Adding blocks ────────────────────────────────────────────────────────

  // Beside the selection when there is one, else in the middle of the view.
  const placeFor = (kind: BlockKind): XYPosition => {
    const anchor = real.find((b) => b.id === selection[selection.length - 1])
    if (anchor) return { x: anchor.x + blockWidth(anchor.kind) + 80, y: anchor.y }
    const rect = wrapRef.current?.getBoundingClientRect()
    const centre = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 })
    return { x: centre.x - blockWidth(kind) / 2, y: centre.y - 60 }
  }

  const add = (kind: BlockKind, bank?: BankType, at?: XYPosition) => {
    // Dropped: where it was dropped. Clicked: beside the selection, on a spot
    // that covers nothing.
    const place = at ?? freeSpot({ blocks: real, wires: doc.wires }, placeFor(kind), kind, (b) => measured[b.id] ?? estimatedSize(b))
    reveal(addBlock(kind, place, bank ? { settings: { bank } } : undefined))
  }

  // ── Right-click, Add Block, and Insert on a wire ─────────────────────────

  // A point in the canvas's own box, held clear of its right and bottom
  // edges so a menu opened near one never runs off the screen.
  const boxAt = (clientX: number, clientY: number, w: number, h: number) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    const x = clientX - (rect?.left ?? 0)
    const y = clientY - (rect?.top ?? 0)
    return {
      x: Math.max(8, Math.min(x, (rect?.width ?? 1200) - w - 8)),
      y: Math.max(8, Math.min(y, (rect?.height ?? 800) - h - 8)),
    }
  }

  const openAdder = (clientX: number, clientY: number) => {
    setCtx(null)
    setMenu(null)
    setAdder({ ...boxAt(clientX, clientY, 340, 470), at: rf.screenToFlowPosition({ x: clientX, y: clientY }) })
  }

  const pickAdd = (o: AddOption) => {
    if (!adder) return
    const at = { x: adder.at.x - blockWidth(o.kind) / 2, y: adder.at.y - 20 }
    add(o.kind, o.bank, freeSpot({ blocks: real, wires: doc.wires }, at, o.kind, (b) => measured[b.id] ?? estimatedSize(b)))
    setAdder(null)
  }

  const openContext = (e: React.MouseEvent | MouseEvent, on: 'block' | 'pane' | 'wire', id?: string) => {
    e.preventDefault()
    setMenu(null)
    setAdder(null)
    setInsert(null)
    if (on === 'block' && id && !selection.includes(id)) setSelection([id])
    if (on === 'wire' && id) setSelectedWire(id)
    setCtx({ ...boxAt(e.clientX, e.clientY, 240, on === 'block' ? 420 : 330), at: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), on, id })
  }

  // Insert on a wire: the blocks that take what it carries and make what its
  // far end takes. Picking one lays it between the two, wired both ways, and
  // the old wire goes — one undo step each, so Undo walks it back.
  const openInsert = (wireId: string, clientX: number, clientY: number) => {
    const w = doc.wires.find((x) => x.id === wireId)
    const from = w && real.find((b) => b.id === w.from)
    const to = w && real.find((b) => b.id === w.to)
    const carried = w && from ? outputType(from, w.fromPort) : null
    const farEnd = w && to ? inputSpec(to, w.toPort)?.type : undefined
    if (!w || !carried || !farEnd) return
    setCtx(null)
    setInsert({ ...boxAt(clientX, clientY, 240, 360), wireId, type: carried, options: optionsForInsert(carried, farEnd) })
  }

  const pickInsert = (o: InsertOption) => {
    if (!insert) return
    const w = doc.wires.find((x) => x.id === insert.wireId)
    const from = w && real.find((b) => b.id === w.from)
    const to = w && real.find((b) => b.id === w.to)
    setInsert(null)
    if (!w || !from || !to) return
    const mid = { x: (from.x + blockWidth(from.kind) + to.x) / 2 - blockWidth(o.kind) / 2, y: (from.y + to.y) / 2 }
    const id = addBlock(o.kind, freeSpot({ blocks: real, wires: doc.wires }, mid, o.kind, (b) => measured[b.id] ?? estimatedSize(b)))
    reveal(id)
    removeWire(w.id)
    const a = connect({ from: w.from, fromPort: w.fromPort, to: id, toPort: o.port })
    const b = connect({ from: id, fromPort: o.outPort, to: w.to, toPort: w.toPort })
    const failed = !a.ok ? a : !b.ok ? b : null
    if (failed) say(failed.reason, 'error')
  }

  const openPeek = (wireId: string, clientX: number, clientY: number) => {
    setCtx(null)
    setInsert(null)
    setPeek({ ...boxAt(clientX, clientY, 320, 400), wireId })
  }

  const contextRows = (): ContextRow[] => {
    if (!ctx) return []
    if (ctx.on === 'wire') {
      const id = ctx.id!
      const client = { x: ctx.x + (wrapRef.current?.getBoundingClientRect().left ?? 0), y: ctx.y + (wrapRef.current?.getBoundingClientRect().top ?? 0) }
      return [
        { label: "See What's on It", icon: Eye, onClick: () => openPeek(id, client.x, client.y) },
        { label: 'Insert a Block Here…', icon: Plus, onClick: () => openInsert(id, ctx.x + (wrapRef.current?.getBoundingClientRect().left ?? 0), ctx.y + (wrapRef.current?.getBoundingClientRect().top ?? 0)) },
        'separator',
        { label: 'Delete Wire', icon: Unlink, keys: DELETE_KEY, danger: true, onClick: () => { removeWire(id); setSelectedWire(null) } },
      ]
    }
    if (ctx.on === 'pane') {
      const client = { x: ctx.x + (wrapRef.current?.getBoundingClientRect().left ?? 0), y: ctx.y + (wrapRef.current?.getBoundingClientRect().top ?? 0) }
      return [
        { label: 'Add a Block Here…', icon: Plus, keys: 'Tab', onClick: () => openAdder(client.x, client.y) },
        { label: 'Add a Note Here', icon: StickyNote, onClick: () => add('note', undefined, { x: ctx.at.x, y: ctx.at.y }) },
        { label: 'Paste', icon: ClipboardPaste, keys: `${MOD}V`, onClick: () => void paste(ctx.at) },
        'separator',
        { label: 'Select All', icon: SquareDashedMousePointer, keys: `${MOD}A`, onClick: () => setSelection(real.map((b) => b.id)), disabled: !real.length },
        { label: 'Tidy Up', icon: Wand2, onClick: doTidy, disabled: !real.length },
        { label: 'Fit to Screen', icon: Scan, onClick: () => void rf.fitView({ padding: 0.2, duration: 300 }), disabled: !real.length },
        'separator',
        { label: 'Undo', icon: Undo2, keys: `${MOD}Z`, onClick: undo, disabled: !canUndo },
        { label: 'Redo', icon: Redo2, keys: `${SHIFT_MOD}Z`, onClick: redo, disabled: !canRedo },
      ]
    }
    const ids = selection.length ? selection : ctx.id ? [ctx.id] : []
    const b = ids.length === 1 ? real.find((x) => x.id === ids[0]) : undefined
    const allOffNow = ids.every((id) => real.find((x) => x.id === id)?.off)
    const rows: ContextRow[] = []
    if (b) {
      if (opensWindow(b)) rows.push({ label: `Open ${KINDS[b.kind].title}`, icon: Maximize2, keys: 'Enter', onClick: () => openWindow(b.id) })
      if (isRunnable(b)) {
        const credits = plan?.blocks[b.id]?.creditsAll ?? 0
        rows.push({ label: 'Run This Block', icon: Play, detail: credits > 0 ? creditsShort(credits) : undefined, onClick: () => onRunBlock(b.id), disabled: running, title: 'Makes this block again, and whatever it reads from that isn\'t made yet' })
      }
      rows.push({ label: 'Rename', icon: Pencil, keys: 'F2', onClick: () => setRenaming(b.id) })
      rows.push('separator')
      if (KINDS[b.kind]?.reviewable && isRunnable(b)) rows.push({ label: 'Pause for Review', icon: Hand, on: !!b.review, onClick: () => patchBlock(b.id, { review: !b.review || undefined }), title: 'When it finishes, you keep the results worth spending more on before anything after it runs' })
      if (isFieldable(b)) rows.push({ label: 'Run Field', icon: FormInput, on: !!b.field, onClick: () => patchBlock(b.id, { field: !b.field || undefined }), title: 'Show it as a field in Run, so whoever runs the flow picks their own' })
    }
    rows.push({ label: allOffNow ? 'Turn On' : 'Turn Off', icon: Power, onClick: () => toggleOff(ids), title: 'A block turned off is skipped, and nothing after it runs from it' })
    rows.push('separator')
    rows.push({ label: 'Duplicate', icon: CopyPlus, keys: `${MOD}D`, onClick: () => duplicateBlocks(ids) })
    rows.push({ label: 'Copy', icon: Copy, keys: `${MOD}C`, onClick: () => void copySelection(ids) })
    rows.push('separator')
    rows.push({ label: ids.length > 1 ? `Delete ${ids.length} Blocks` : 'Delete', icon: Trash2, keys: DELETE_KEY, danger: true, onClick: () => removeBlocks(ids) })
    return rows
  }

  // The suggested block, wired: each of its inputs takes the latest output
  // on the canvas made for it — a product into Product, a teardown's
  // transcript into Winning Ad — or, for a required one, the latest that fits
  // at all. An input that takes many pictures, or text a member types (a
  // brief, instructions), is left for the member.
  const acceptSuggestion = () => {
    if (!suggestion) return
    const id = addBlock(suggestion.kind, { x: suggestion.x, y: suggestion.y })
    reveal(id)
    const order = topoOrder({ blocks: real, wires: doc.wires }).reverse()
    for (const port of KINDS[suggestion.kind].ins) {
      if (port.many || (port.type === 'text' && !port.required)) continue
      const pick = (fits: (t: PortType) => boolean) => {
        for (const bid of order) {
          const b = real.find((x) => x.id === bid)!
          const out = outsOf(b).find((o) => fits(o.type))
          if (out && connect({ from: b.id, fromPort: out.key, to: id, toPort: port.key }).ok) return true
        }
        return false
      }
      if (!pick((t) => t === port.type) && (port.required || port.key === 'audio')) pick((t) => accepts(port.type, t))
    }
  }

  // ── Drops: palette blocks, and images ────────────────────────────────────

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const kind = e.dataTransfer.getData(PALETTE_DRAG_TYPE) as BlockKind
    if (kind && KINDS[kind]) {
      add(kind, undefined, { x: at.x - blockWidth(kind) / 2, y: at.y - 20 })
      return
    }
    const files = Array.from(e.dataTransfer.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    // Dropped onto a block that takes pictures: each becomes an Image block
    // wired into it. Dropped onto an Image block: it replaces that picture.
    // Anywhere else: Image blocks where they fell.
    const target = nodeIdAt(e.clientX, e.clientY)
    const host = target ? real.find((b) => b.id === target) : undefined
    if (host?.kind === 'image') {
      const ref = await saveAsset(files[0], files[0].type)
      patchBlock(host.id, { settings: { ...host.settings, ref, name: files[0].name.replace(/\.[^.]+$/, '') } })
      return
    }
    const port = host ? insOf(host).find((p) => p.type === 'image') : undefined
    let offset = 0
    for (const file of files.slice(0, 8)) {
      const ref = await saveAsset(file, file.type)
      const place = host && port
        ? { x: host.x - blockWidth('image') - 72, y: host.y + offset }
        : { x: at.x + offset / 2, y: at.y + offset }
      const id = addBlock('image', place, { settings: { ref, name: file.name.replace(/\.[^.]+$/, '') } })
      if (host && port) connect({ from: id, fromPort: 'out', to: host.id, toPort: port.key })
      offset += 150
    }
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────

  const copySelection = async (ids: string[] = selection) => {
    const text = clipFromSelection(doc, ids)
    if (!text) return
    memoryClip = text
    await copyToClipboard(text)
    say(ids.length === 1 ? 'Block copied. Paste it into any flow.' : `${ids.length} blocks copied. Paste them into any flow.`)
  }

  // Pasted beside where it came from, or where the canvas was right-clicked.
  const paste = async (at?: XYPosition) => {
    let text = memoryClip
    try {
      const fromSystem = await navigator.clipboard?.readText?.()
      if (fromSystem?.trim().startsWith('{')) text = fromSystem
    } catch { /* permission denied — the tab's own clip stands */ }
    if (!text) return
    const parsed = parseFlowJson(text)
    if (!parsed.ok) {
      say(parsed.reason, 'error')
      return
    }
    const left = Math.min(...parsed.graph.blocks.map((b) => b.x))
    const top = Math.min(...parsed.graph.blocks.map((b) => b.y))
    insertGraph(parsed.graph, { offset: at && Number.isFinite(left) ? { x: at.x - left, y: at.y - top } : { x: 60, y: 60 } })
    if (parsed.notes.length) say(parsed.notes[0], 'info')
  }

  const one = selection.length === 1 ? real.find((b) => b.id === selection[0]) : undefined

  useEffect(() => {
    if (activeApp !== 'flow' || !keysActive) return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      // A key pressed inside something portaled over the canvas — a picker a
      // block opened, a modal — is that thing's, even when the canvas doesn't
      // know it's open: Backspace there must never delete the block behind it.
      const target = e.target as Node | null
      if (target && target !== document.body && !document.getElementById('root')?.contains(target)) return
      const mod = e.metaKey || e.ctrlKey
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.length) removeBlocks(selection)
        else if (selectedWire) removeWire(selectedWire)
        else return
      } else if (e.key === 'Enter' && !mod) {
        // A focused button's Enter is that button's.
        if (el?.closest('button, a, [role="button"]')) return
        if (!one || !opensWindow(one)) return
        openWindow(one.id)
      } else if (mod && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        redo()
      } else if (mod && e.key.toLowerCase() === 'c') {
        if (!selection.length) return
        void copySelection()
      } else if (mod && e.key.toLowerCase() === 'v') {
        void paste()
      } else if (mod && e.key.toLowerCase() === 'd') {
        if (!selection.length) return
        duplicateBlocks(selection)
      } else if (mod && e.key.toLowerCase() === 'a') {
        setSelection(real.map((b) => b.id))
      } else if (e.key === 'Tab' && !mod) {
        // Tab moves focus through the header, the dock and a focused button
        // as it does anywhere; only on the canvas itself is it Add Block.
        if (el && el !== document.body && (!wrapRef.current?.contains(el) || el.closest('button, a, [role="button"]'))) return
        // Add Block, where the pointer is — or mid-canvas, from the keyboard.
        const rect = wrapRef.current?.getBoundingClientRect()
        const p = pointer.current ?? { x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2 - 170, y: (rect?.top ?? 0) + 120 }
        openAdder(p.x, p.y)
      } else if (e.key === 'F2') {
        if (!one) return
        setRenaming(one.id)
      } else if (e.key === 'Escape') {
        setSelection([])
        setMenu(null)
        setCtx(null)
        setAdder(null)
        setInsert(null)
        setPeek(null)
      } else {
        return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Toolbar actions ──────────────────────────────────────────────────────

  const allOff = selection.length > 0 && selection.every((id) => real.find((b) => b.id === id)?.off)

  const doTidy = () => {
    tidy((id) => measured[id] ?? { width: 280, height: 180 })
    setTimeout(() => void rf.fitView({ padding: 0.2, duration: 300 }), 30)
  }

  const context: CanvasContextValue = {
    flowId,
    doc,
    plan,
    run,
    suggestion,
    openReview: onReview,
    runBlock: onRunBlock,
    acceptSuggestion,
    openBlock: openWindow,
    askAtPort,
    renaming,
    setRenaming,
    openInsert,
    openPeek,
    pointWire,
  }

  return (
    <CanvasContext.Provider value={context}>
      <div
        ref={wrapRef}
        className={`flow-canvas relative min-h-0 flex-1 ${hoverWire || selectedWire ? 'flow-wire-tools' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(e) => void onDrop(e)}
        onMouseMove={(e) => { pointer.current = { x: e.clientX, y: e.clientY } }}
        onMouseLeave={() => { pointer.current = null }}
      >
        <ReactFlow<BlockNodeType, WireEdgeType>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onReconnect={onReconnect}
          onReconnectEnd={onReconnectEnd}
          onNodeDoubleClick={(e, node) => {
            // A field typed into on the canvas keeps its own double-click.
            if ((e.target as HTMLElement).closest('input, textarea, button')) return
            const b = real.find((x) => x.id === node.id)
            if (b && opensWindow(b)) openWindow(b.id)
          }}
          onPaneClick={() => {
            setSelection([])
            setSelectedWire(null)
          }}
          onNodeContextMenu={(e, node) => {
            if (node.id === SUGGESTION_ID) return e.preventDefault()
            openContext(e, 'block', node.id)
          }}
          onSelectionContextMenu={(e) => openContext(e, 'block')}
          onPaneContextMenu={(e) => openContext(e, 'pane')}
          onEdgeContextMenu={(e, edge) => openContext(e, 'wire', edge.id)}
          onEdgeMouseEnter={(_e, edge) => pointWire(edge.id)}
          onEdgeMouseLeave={() => pointWire(null)}
          deleteKeyCode={null}
          selectionKeyCode="Shift"
          multiSelectionKeyCode="Shift"
          // A click on a dot asks what goes there (onConnectEnd); it never arms
          // a click-to-connect that the next click somewhere else completes.
          connectOnClick={false}
          zoomOnDoubleClick={false}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.2}
          maxZoom={1.75}
          proOptions={{ hideAttribution: true }}
          onlyRenderVisibleElements
        >
          {/* The dot grid pans with the canvas and never moves on its own. */}
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />

          <NodeToolbar nodeId={selection} isVisible={selection.length > 0 && !dragging && !ctx && !renaming} position={Position.Top} offset={10}>
            <div className="flex items-center gap-0.5 rounded-xl border border-ink/10 bg-surface-2 p-1 shadow-xl shadow-black/30">
              {one && opensWindow(one) && (
                <ToolButton icon={Maximize2} label={`Open ${KINDS[one.kind].title}`} onClick={() => openWindow(one.id)} />
              )}
              {one && isRunnable(one) && (
                <ToolButton icon={Play} label="Run" accent onClick={() => onRunBlock(one.id)} disabled={running} />
              )}
              {one && isFieldable(one) && (
                <ToolButton
                  icon={FormInput}
                  label={one.field ? 'Run Field · On' : 'Run Field'}
                  active={!!one.field}
                  title="Show as a field in Run: whoever runs this flow picks their own"
                  onClick={() => patchBlock(one.id, { field: !one.field || undefined })}
                />
              )}
              {one && (opensWindow(one) || isRunnable(one) || isFieldable(one)) && <span className="mx-0.5 h-4 w-px bg-ink/10" />}
              <ToolButton icon={CopyPlus} label="Duplicate" onClick={() => duplicateBlocks(selection)} />
              <ToolButton icon={Copy} label="Copy" onClick={() => void copySelection()} />
              <ToolButton icon={Power} label={allOff ? 'Turn On' : 'Turn Off'} onClick={() => toggleOff(selection)} />
              <span className="mx-0.5 h-4 w-px bg-ink/10" />
              <ToolButton icon={Trash2} label="Delete" danger onClick={() => removeBlocks(selection)} />
            </div>
          </NodeToolbar>

          {real.length > 0 && (
            <Panel position="top-left" className="!ml-4 !mt-3.5">
              <AskFlow
                doc={doc}
                sizeOf={(id) => measured[id]}
                onApplied={(touched) => {
                  if (!touched.length) return
                  // After the new blocks have rendered and been measured.
                  setTimeout(() => void rf.fitView({ nodes: touched.map((id) => ({ id })), padding: 0.35, maxZoom: 1, duration: 300 }), 60)
                }}
              />
            </Panel>
          )}

          <Panel position="top-right" className="!z-10 !mr-4 !mt-3.5">
            <div className="flex h-[34px] items-center gap-0.5 rounded-full border border-ink/10 bg-surface-1 px-1 text-[11.5px] text-ink-300 shadow-lg shadow-black/20">
              <ZoomButton title="Zoom Out" onClick={() => void rf.zoomOut({ duration: 150 })}><Minus className="h-3.5 w-3.5" /></ZoomButton>
              <span className="min-w-[40px] text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <ZoomButton title="Zoom In" onClick={() => void rf.zoomIn({ duration: 150 })}><Plus className="h-3.5 w-3.5" /></ZoomButton>
              <ZoomButton title="Fit to Screen" onClick={() => void rf.fitView({ padding: 0.2, duration: 300 })}>Fit</ZoomButton>
              <span className="mx-0.5 h-4 w-px bg-ink/10" />
              <ZoomButton title="Tidy · lays the flow out left to right, in the order it runs" onClick={doTidy}>
                <Wand2 className="h-3.5 w-3.5" />
                <span>Tidy</span>
              </ZoomButton>
              <span className="mx-0.5 h-4 w-px bg-ink/10" />
              <ZoomButton title={`Undo · ${MOD}Z`} onClick={undo} disabled={!canUndo}><Undo2 className="h-3.5 w-3.5" /></ZoomButton>
              <ZoomButton title={`Redo · ${SHIFT_MOD}Z`} onClick={redo} disabled={!canRedo}><Redo2 className="h-3.5 w-3.5" /></ZoomButton>
              <FlowHelp />
            </div>
          </Panel>

          <Panel position="bottom-center" className="!mb-3.5">
            <Palette onAdd={(kind, bank) => add(kind, bank)} />
          </Panel>

          {real.length === 0 && (
            <Panel position="top-center" className="!mt-20">
              <EmptyStart
                onStart={(bank) => {
                  const id = addBlock('bank', placeFor('bank'), { settings: { bank }, field: true })
                  setSelection([id])
                }}
                onBrowse={() => {
                  const rect = wrapRef.current?.getBoundingClientRect()
                  openAdder((rect?.left ?? 0) + (rect?.width ?? 800) / 2 - 170, (rect?.top ?? 0) + 150)
                }}
              />
            </Panel>
          )}
        </ReactFlow>

        {menu && (
          <WhatNextMenu
            x={menu.x}
            y={menu.y}
            type={menu.type}
            side={menu.from.side}
            into={!!menu.into}
            options={menu.into?.options ?? (menu.from.side === 'out' ? optionsForOutput(menu.type) : optionsForInput(menu.type))}
            onPick={pickWhatNext}
            onClose={() => setMenu(null)}
          />
        )}
        {ctx && (
          <ContextMenu
            x={ctx.x}
            y={ctx.y}
            title={ctx.on === 'block' ? (selection.length > 1 ? `${selection.length} Blocks` : titleOf(real.find((b) => b.id === (ctx.id ?? selection[0])) ?? { kind: 'note', settings: {} } as FlowBlock)) : ctx.on === 'wire' ? 'Wire' : undefined}
            rows={contextRows()}
            onClose={() => setCtx(null)}
          />
        )}
        {peek && (() => {
          const w = doc.wires.find((x) => x.id === peek.wireId)
          const from = w && real.find((b) => b.id === w.from)
          const to = w && real.find((b) => b.id === w.to)
          if (!w || !from || !to) return null
          return (
            <WirePeek
              x={peek.x}
              y={peek.y}
              title={`${outputLabel(from, w.fromPort)} → ${titleOf(to)} · ${inputSpec(to, w.toPort)?.label ?? ''}`}
              values={plan?.blocks[w.from]?.values[w.fromPort] ?? []}
              onClose={() => setPeek(null)}
            />
          )
        })()}
        {adder && <AddBlockMenu x={adder.x} y={adder.y} onPick={pickAdd} onClose={() => setAdder(null)} />}
        {insert && (
          <WhatNextMenu
            x={insert.x}
            y={insert.y}
            type={insert.type}
            heading="Insert a Block"
            options={insert.options}
            onPick={(o) => pickInsert(o as InsertOption)}
            onClose={() => setInsert(null)}
          />
        )}
      </div>
    </CanvasContext.Provider>
  )
}

// The empty canvas: what a flow is in one line, and the three places a flow
// on the channel starts — your product, a winning ad, a character — each a
// block on the canvas in one click, with the next step suggested beside it.
function EmptyStart({ onStart, onBrowse }: { onStart: (bank: BankType) => void; onBrowse: () => void }) {
  const starts: Array<{ bank: BankType; label: string; hint: string }> = [
    { bank: 'products', label: 'Your Product', hint: 'Write ads for it' },
    { bank: 'swipes', label: 'A Winning Ad', hint: 'Remix one that works' },
    { bank: 'models', label: 'A Character', hint: 'Cast who stars in it' },
  ]
  return (
    <div className="flex max-w-[520px] flex-col items-center text-center">
      <p className="text-[15px] font-semibold tracking-tight text-ink-100">What does this flow start from?</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
        Every block is one of your apps. Wires carry what one block makes into the next, and Run Flow makes the whole batch.
      </p>
      <div className="mt-5 grid w-full grid-cols-3 gap-2">
        {starts.map((st) => {
          const face = kindFace('bank', st.bank)
          const Icon = face.icon
          return (
            <button
              key={st.bank}
              type="button"
              onClick={() => onStart(st.bank)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-ink/10 bg-surface-1 px-3 py-4 transition-colors hover:border-flow-500/40 hover:bg-flow-500/[0.05]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${face.accent} 18%, transparent)`, color: face.accent }}>
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-[13px] font-semibold text-ink-100">{st.label}</span>
              <span className="text-[11px] text-ink-500">{st.hint}</span>
            </button>
          )
        })}
      </div>
      <button type="button" onClick={onBrowse} className="mt-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-ink-400 transition-colors hover:bg-ink/[0.05] hover:text-ink-100">
        <Plus className="h-3.5 w-3.5" />
        Or Pick Any Block
      </button>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-500">
        Tab adds a block anywhere · Right-click for more · Double-click a block to open its app · Drag from a dot to wire it
      </p>
    </div>
  )
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  accent,
  danger,
  active,
  disabled,
  title,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  accent?: boolean
  danger?: boolean
  active?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'The flow is already running' : title ?? label}
      className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-40 ${
        accent ? 'bg-flow-500 text-white hover:brightness-110'
          : danger ? 'text-ink-300 hover:bg-red-500/15 hover:text-red-300'
          : active ? 'bg-flow-500/15 text-flow-300 hover:bg-flow-500/20'
          : 'text-ink-300 hover:bg-ink/[0.06] hover:text-ink-100'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function ZoomButton({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="flex h-[26px] min-w-[26px] items-center justify-center gap-1 rounded-full px-2 text-ink-300 transition-colors hover:bg-ink/[0.07] hover:text-ink-100 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-300"
    >
      {children}
    </button>
  )
}
