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
import { buildTemplate, makeEdge, makeNode } from '../templates'
import { dropNodeFile } from '../services/nodeFiles'

// Per-browser canvas state (same idiom as themeStore/omniVoiceStore: own
// localStorage key, no cloud sync). Outputs persist as asset:// refs; the
// assets themselves are protected from the orphan sweep because every
// generated output is also pushed into a history bank by the runner.
const STORAGE_KEY = 'ai-ugc-lab-flows'

interface FlowState {
  nodes: FlowNode[]
  edges: FlowEdge[]
  // Node whose edit sheet is open (click a card to open, backdrop/X to close).
  sheetNodeId: string | null
  // "Start from scratch" was chosen — suppresses the template chooser that an
  // empty canvas otherwise shows. Not persisted: an empty canvas after a
  // reload gets the chooser again, which is the friendly default.
  scratch: boolean
  running: boolean

  onNodesChange: (changes: NodeChange<FlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void
  onConnect: (connection: Connection) => void
  isValidConnection: (connection: Connection | FlowEdge) => boolean

  addNode: (kind: NodeKind, position?: { x: number; y: number }) => string
  // The "+ Next step" path: create `kind` to the right of `sourceId`, already
  // wired from sourceHandle → targetHandle.
  addNodeAfter: (sourceId: string, sourceHandle: string, kind: NodeKind, targetHandle: string) => void
  removeNode: (id: string) => void
  updateNodeConfig: (id: string, patch: Partial<NodeConfig>) => void
  setNodeRuntime: (id: string, patch: Partial<Pick<FlowNodeData, 'status' | 'error' | 'output' | 'note'>>) => void
  setSheetNode: (id: string | null) => void
  setScratch: (scratch: boolean) => void
  setRunning: (running: boolean) => void
  applyTemplate: (templateId: string) => void
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
    data: {
      ...node.data,
      // Merge over defaults so configs saved before a field existed (e.g. the
      // Bank/Generate `source` toggle) pick up sane values instead of undefined.
      config: { ...NODE_DEFS[node.data.kind].defaultConfig(), ...node.data.config } as NodeConfig,
      status,
      note: undefined,
    },
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

// ── Store ──────────────────────────────────────────────────────────

const initial = loadStored() ?? { nodes: [], edges: [] }

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
  sheetNodeId: null,
  scratch: false,
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
    set((s) => ({ nodes: [...s.nodes, node] }))
    persistSoon(get)
    return node.id
  },

  addNodeAfter: (sourceId, sourceHandle, kind, targetHandle) => {
    const { nodes, edges } = get()
    const source = nodes.find((n) => n.id === sourceId)
    if (!source) return
    // Place to the right of the source; each additional branch off the same
    // node steps down so siblings (voiceover + b-roll) don't stack.
    const branchCount = edges.filter((e) => e.source === sourceId).length
    const node = makeNode(kind, source.position.x + 330, source.position.y + branchCount * 190)
    const edge = makeEdge(source, sourceHandle, node, targetHandle)
    set((s) => ({ nodes: [...s.nodes, node], edges: [...s.edges, edge] }))
    persistSoon(get)
  },

  removeNode: (id) => {
    dropNodeFile(id)
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      sheetNodeId: s.sheetNodeId === id ? null : s.sheetNodeId,
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

  setSheetNode: (id) => set({ sheetNodeId: id }),
  setScratch: (scratch) => set({ scratch }),
  setRunning: (running) => set({ running }),

  applyTemplate: (templateId) => {
    const built = buildTemplate(templateId)
    if (!built) return
    get().nodes.forEach((n) => dropNodeFile(n.id))
    set({ nodes: built.nodes, edges: built.edges, sheetNodeId: null, scratch: false })
    persistSoon(get)
  },

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
    set({ nodes: [], edges: [], sheetNodeId: null, scratch: false })
    persistSoon(get)
  },
}))
