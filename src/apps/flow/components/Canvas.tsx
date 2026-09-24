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
import { Copy, CopyPlus, FormInput, Maximize2, Minus, Play, Plus, Power, Trash2, Wand2 } from 'lucide-react'
import type { BlockKind, FlowBlock, FlowDoc, PortType } from '../types'
import type { FlowPlan } from '../engine/plan'
import { accepts, insOf, isRunnable, outsOf, suggestNext, TYPE_META, KINDS, titleOf } from '../engine/catalog'
import { canConnect, inputSpec, outputType, topoOrder, wiresInto } from '../engine/graph'
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
import { optionsForInput, optionsForOutput, type WhatNextOption } from './whatNext'
import { CanvasContext, type CanvasContextValue } from './canvasContext'
import { blockWidth, isFieldable, opensWindow } from './blockMeta'
import { clipFromSelection, parseFlowJson } from '../templates/io'
import AskFlow from './AskFlow'
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

  const [drag, setDrag] = useState<Record<string, XYPosition>>({})
  const [measured, setMeasured] = useState<Record<string, Dimensions>>({})
  const [selectedWire, setSelectedWire] = useState<string | null>(null)
  const [menu, setMenu] = useState<WhatNextState | null>(null)
  const [dragging, setDragging] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const say = (message: string, kind: 'info' | 'error' | 'success' = 'info') => addToast(message, kind)

  // ── The suggested next block ─────────────────────────────────────────────
  const real = doc.blocks.filter((b) => !b.suggested)
  const nextKind = real.length ? suggestNext(real.map((b) => b.kind)) : null
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

  // A wire let go over another block's body wires into the first of its
  // inputs that takes it — an empty one first, then one that takes several —
  // so a member never has to hit a 11px dot. Dragged out of an input, the
  // same, the other way round.
  const wireInto = (from: { blockId: string; port: string; side: 'out' | 'in' }, type: PortType, target: FlowBlock): boolean => {
    if (from.side === 'out') {
      const fits = insOf(target).filter((p) => accepts(p.type, type))
      const ordered = [
        ...fits.filter((p) => !wiresInto(doc, target.id, p.key).length),
        ...fits.filter((p) => p.many && wiresInto(doc, target.id, p.key).length),
        ...fits.filter((p) => !p.many && wiresInto(doc, target.id, p.key).length),
      ]
      let reason = ordered.length ? '' : `${titleOf(target)} has no input that takes ${TYPE_META[type].label}.`
      for (const p of ordered) {
        const check = connect({ from: from.blockId, fromPort: from.port, to: target.id, toPort: p.key })
        if (check.ok) return true
        reason ||= check.reason
      }
      say(reason, 'error')
      return false
    }
    const fits = outsOf(target).filter((o) => accepts(type, o.type))
    let reason = fits.length ? '' : `${titleOf(target)} makes nothing that goes there.`
    for (const o of fits) {
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
      wireInto({ blockId: block.id, port, side }, type, target)
      return
    }
    askAt(block.id, port, side, type, point.clientX, point.clientY)
  }

  const askAt = (blockId: string, port: string, side: 'in' | 'out', type: PortType, clientX: number, clientY: number) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    setMenu({
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
      at: rf.screenToFlowPosition({ x: clientX, y: clientY }),
      type,
      from: { blockId, port, side },
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
    // A wire's length clear of the dot it came from, so the new block never
    // lands on top of the one it's wired to.
    const at = menu.from.side === 'out'
      ? { x: menu.at.x + 72, y: menu.at.y - 22 }
      : { x: menu.at.x - blockWidth(o.kind) - 72, y: menu.at.y - 22 }
    const id = addBlock(o.kind, freeSpot({ blocks: real, wires: doc.wires }, at, o.kind, (b) => measured[b.id] ?? estimatedSize(b)), o.bank ? { settings: { bank: o.bank } } : undefined)
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
    addBlock(kind, place, bank ? { settings: { bank } } : undefined)
  }

  // The suggested block, wired: each of its inputs takes the latest output
  // on the canvas that fits it.
  const acceptSuggestion = () => {
    if (!suggestion) return
    const id = addBlock(suggestion.kind, { x: suggestion.x, y: suggestion.y })
    const order = topoOrder({ blocks: real, wires: doc.wires }).reverse()
    for (const port of KINDS[suggestion.kind].ins) {
      if (!port.required && port.key !== 'audio') continue
      for (const bid of order) {
        const b = real.find((x) => x.id === bid)!
        const out = outsOf(b).find((o) => accepts(port.type, o.type))
        if (out && connect({ from: b.id, fromPort: out.key, to: id, toPort: port.key }).ok) break
      }
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

  const copySelection = async () => {
    const text = clipFromSelection(doc, selection)
    if (!text) return
    memoryClip = text
    await copyToClipboard(text)
    say(selection.length === 1 ? 'Block copied. Paste it into any flow.' : `${selection.length} blocks copied. Paste them into any flow.`)
  }

  const paste = async () => {
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
    insertGraph(parsed.graph, { offset: { x: 60, y: 60 } })
    if (parsed.notes.length) say(parsed.notes[0], 'info')
  }

  const one = selection.length === 1 ? real.find((b) => b.id === selection[0]) : undefined

  useEffect(() => {
    if (activeApp !== 'flow' || !keysActive) return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
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
      } else if (e.key === 'Escape') {
        setSelection([])
        setMenu(null)
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
  }

  return (
    <CanvasContext.Provider value={context}>
      <div
        ref={wrapRef}
        className="flow-canvas relative min-h-0 flex-1"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(e) => void onDrop(e)}
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

          <NodeToolbar nodeId={selection} isVisible={selection.length > 0 && !dragging} position={Position.Top} offset={10}>
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

          <Panel position="top-right" className="!mr-4 !mt-3.5">
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
            </div>
          </Panel>

          <Panel position="bottom-center" className="!mb-3.5">
            <Palette onAdd={(kind, bank) => add(kind, bank)} />
          </Panel>

          {real.length === 0 && (
            <Panel position="top-center" className="!mt-24">
              <div className="max-w-sm text-center">
                <p className="text-sm font-medium text-ink-200">An empty flow</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">
                  Add blocks from the bar below, or drag them onto the canvas. Double-click a block to open it in its app. Wire an output dot into an input dot, or drop the wire on the block. Drop images anywhere.
                </p>
              </div>
            </Panel>
          )}
        </ReactFlow>

        {menu && (
          <WhatNextMenu
            x={menu.x}
            y={menu.y}
            type={menu.type}
            side={menu.from.side}
            options={menu.from.side === 'out' ? optionsForOutput(menu.type) : optionsForInput(menu.type)}
            onPick={pickWhatNext}
            onClose={() => setMenu(null)}
          />
        )}
      </div>
    </CanvasContext.Provider>
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

function ZoomButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-[26px] min-w-[26px] items-center justify-center gap-1 rounded-full px-2 text-ink-300 transition-colors hover:bg-ink/[0.07] hover:text-ink-100"
    >
      {children}
    </button>
  )
}
