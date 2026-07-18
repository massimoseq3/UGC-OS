import { create } from 'zustand'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import type { FlowEdge, FlowNode, FlowNodeData, NodeConfig, NodeKind, PortType } from '../types'
import { PORT_COLORS } from '../types'
import { NODE_DEFS } from '../nodeDefs'
import { dropNodeFile } from '../services/nodeFiles'

// Per-browser canvas state (same idiom as themeStore/omniVoiceStore: own
// localStorage key, no cloud sync). Outputs persist as asset:// refs; the
// assets themselves are protected from the orphan sweep because every
// generated output is also pushed into a history bank by the runner.
const STORAGE_KEY = 'ai-ugc-lab-flows'

interface FlowState {
  nodes: FlowNode[]
  edges: FlowEdge[]
  selectedNodeId: string | null
  running: boolean

  onNodesChange: (changes: NodeChange<FlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void
  onConnect: (connection: Connection) => void
  isValidConnection: (connection: Connection | FlowEdge) => boolean

  addNode: (kind: NodeKind, position?: { x: number; y: number }) => string
  removeNode: (id: string) => void
  updateNodeConfig: (id: string, patch: Partial<NodeConfig>) => void
  setNodeRuntime: (id: string, patch: Partial<Pick<FlowNodeData, 'status' | 'error' | 'output' | 'note'>>) => void
  setSelected: (id: string | null) => void
  setRunning: (running: boolean) => void
  clearOutputs: () => void
  resetFlow: () => void
}

// ── Persistence ────────────────────────────────────────────────────

interface StoredFlow {
  v: number
  nodes: FlowNode[]
  edges: FlowEdge[]
}

function normalizeNode(node: FlowNode): FlowNode {
  const status = node.data.status === 'done' || node.data.status === 'error' ? node.data.status : 'idle'
  return {
    ...node,
    type: 'flowNode',
    data: { ...node.data, status, note: undefined },
  }
}

function loadStored(): { nodes: FlowNode[]; edges: FlowEdge[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredFlow
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null
    const nodes = parsed.nodes
      .filter((n) => n?.data?.kind && NODE_DEFS[n.data.kind])
      .map(normalizeNode)
    const ids = new Set(nodes.map((n) => n.id))
    const edges = parsed.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
    return { nodes, edges }
  } catch {
    return null
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function persistSoon(get: () => FlowState) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { nodes, edges } = get()
    const stored: StoredFlow = { v: 1, nodes, edges }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)) } catch { /* quota — canvas is reconstructable */ }
  }, 300)
}

// ── Starter flow ───────────────────────────────────────────────────
// Seeded on the very first open so the canvas explains itself: the classic
// Product → Script → Voiceover + B-Roll pipeline, unconfigured.

function makeNode(kind: NodeKind, x: number, y: number): FlowNode {
  return {
    id: crypto.randomUUID(),
    type: 'flowNode',
    position: { x, y },
    data: { kind, config: NODE_DEFS[kind].defaultConfig(), status: 'idle' },
  }
}

function edgeBetween(source: FlowNode, sourceHandle: string, target: FlowNode, targetHandle: string): FlowEdge {
  const type = NODE_DEFS[source.data.kind].outputs.find((p) => p.id === sourceHandle)?.type
  return {
    id: `e-${source.id}-${sourceHandle}-${target.id}-${targetHandle}`,
    source: source.id,
    sourceHandle,
    target: target.id,
    targetHandle,
    style: { stroke: type ? PORT_COLORS[type] : undefined, strokeWidth: 1.5 },
  }
}

function starterFlow(): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const product = makeNode('product', 40, 200)
  const script = makeNode('script', 360, 170)
  const voice = makeNode('voiceover', 700, 60)
  const broll = makeNode('broll', 700, 300)
  return {
    nodes: [product, script, voice, broll],
    edges: [
      edgeBetween(product, 'product', script, 'product'),
      edgeBetween(script, 'script', voice, 'script'),
      edgeBetween(script, 'script', broll, 'script'),
    ],
  }
}

// ── Store ──────────────────────────────────────────────────────────

const initial = loadStored() ?? starterFlow()

function portType(nodes: FlowNode[], nodeId: string | null, handleId: string | null | undefined, dir: 'source' | 'target'): PortType | undefined {
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return undefined
  const def = NODE_DEFS[node.data.kind]
  const ports = dir === 'source' ? def.outputs : def.inputs
  return ports.find((p) => p.id === handleId)?.type
}

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: initial.nodes,
  edges: initial.edges,
  selectedNodeId: null,
  running: false,

  onNodesChange: (changes) => {
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }))
    persistSoon(get)
  },

  onEdgesChange: (changes) => {
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }))
    persistSoon(get)
  },

  isValidConnection: (connection) => {
    const { nodes } = get()
    if (!connection.source || !connection.target || connection.source === connection.target) return false
    const from = portType(nodes, connection.source, connection.sourceHandle, 'source')
    const to = portType(nodes, connection.target, connection.targetHandle, 'target')
    return !!from && !!to && from === to
  },

  onConnect: (connection) => {
    const { nodes, edges, isValidConnection } = get()
    if (!isValidConnection(connection)) return
    const targetNode = nodes.find((n) => n.id === connection.target)
    const targetPort = targetNode
      ? NODE_DEFS[targetNode.data.kind].inputs.find((p) => p.id === connection.targetHandle)
      : undefined
    // Single-value inputs: a new wire replaces the old one instead of stacking.
    const kept = targetPort?.multi
      ? edges
      : edges.filter((e) => !(e.target === connection.target && e.targetHandle === connection.targetHandle))
    const type = portType(nodes, connection.source, connection.sourceHandle, 'source')
    set({
      edges: addEdge(
        { ...connection, style: { stroke: type ? PORT_COLORS[type] : undefined, strokeWidth: 1.5 } },
        kept,
      ),
    })
    persistSoon(get)
  },

  addNode: (kind, position) => {
    const node = makeNode(kind, position?.x ?? 120, position?.y ?? 120)
    set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: node.id }))
    persistSoon(get)
    return node.id
  },

  removeNode: (id) => {
    dropNodeFile(id)
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }))
    persistSoon(get)
  },

  updateNodeConfig: (id, patch) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } as NodeConfig } } : n,
      ),
    }))
    persistSoon(get)
  },

  setNodeRuntime: (id, patch) => {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    }))
    persistSoon(get)
  },

  setSelected: (id) => set({ selectedNodeId: id }),
  setRunning: (running) => set({ running }),

  clearOutputs: () => {
    set((s) => ({
      nodes: s.nodes.map((n) => ({
        ...n,
        data: { ...n.data, status: 'idle' as const, output: undefined, error: undefined, note: undefined },
      })),
    }))
    persistSoon(get)
  },

  resetFlow: () => {
    get().nodes.forEach((n) => dropNodeFile(n.id))
    const fresh = starterFlow()
    set({ nodes: fresh.nodes, edges: fresh.edges, selectedNodeId: null })
    persistSoon(get)
  },
}))
