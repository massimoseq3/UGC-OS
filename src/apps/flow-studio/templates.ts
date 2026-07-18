import { Eye, Film, Package, type LucideIcon } from 'lucide-react'
import type { FlowEdge, FlowNode, NodeConfig, NodeKind } from './types'
import { PORT_COLORS } from './types'
import { NODE_DEFS } from './nodeDefs'

// Recipe templates — the beginner on-ramp. An empty canvas shows these as big
// cards instead of a blank grid + palette; picking one lays out a pre-wired
// pipeline so the first Run happens before the node-graph mental model has to.

export function makeNode(kind: NodeKind, x: number, y: number, config?: Partial<NodeConfig>): FlowNode {
  return {
    id: crypto.randomUUID(),
    type: 'flowNode',
    position: { x, y },
    data: {
      kind,
      config: { ...NODE_DEFS[kind].defaultConfig(), ...config } as NodeConfig,
      status: 'idle',
    },
  }
}

export function makeEdge(source: FlowNode, sourceHandle: string, target: FlowNode, targetHandle: string): FlowEdge {
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

export interface FlowTemplate {
  id: string
  title: string
  description: string
  icon: LucideIcon
  // Plain-language pipeline preview, rendered as chips with arrows.
  steps: string[]
  build: () => { nodes: FlowNode[]; edges: FlowEdge[] }
}

export const TEMPLATES: FlowTemplate[] = [
  {
    id: 'full-ad',
    title: 'Full ad from a product',
    description: 'Pick a product and a character — get a script, a voiceover, and B-Roll stills in one run.',
    icon: Package,
    steps: ['Product', 'Script', 'Voiceover + B-Roll'],
    build: () => {
      const product = makeNode('product', 40, 80)
      const character = makeNode('character', 40, 300)
      const script = makeNode('script', 380, 140)
      const voice = makeNode('voiceover', 720, 40)
      const broll = makeNode('broll', 720, 250)
      return {
        nodes: [product, character, script, voice, broll],
        edges: [
          makeEdge(product, 'product', script, 'product'),
          makeEdge(script, 'script', voice, 'script'),
          makeEdge(script, 'script', broll, 'script'),
          makeEdge(product, 'product', broll, 'product'),
          makeEdge(character, 'character', broll, 'character'),
        ],
      }
    },
  },
  {
    id: 'steal-ad',
    title: 'Steal a winning ad',
    description: "Drop a competitor's ad — its transcript gets remixed into your script, read aloud, and shot.",
    icon: Eye,
    steps: ['Ad Analyzer', 'Script remix', 'Voiceover + B-Roll'],
    build: () => {
      const analyzer = makeNode('analyzer', 40, 160)
      const script = makeNode('script', 380, 150)
      const voice = makeNode('voiceover', 720, 50)
      const broll = makeNode('broll', 720, 260)
      return {
        nodes: [analyzer, script, voice, broll],
        edges: [
          makeEdge(analyzer, 'script', script, 'script'),
          makeEdge(script, 'script', voice, 'script'),
          makeEdge(script, 'script', broll, 'script'),
        ],
      }
    },
  },
  {
    id: 'animate-still',
    title: 'Animate a saved still',
    description: 'Take a still from your B-Rolls bank and turn it into a moving clip.',
    icon: Film,
    steps: ['Still from Bank', 'Video'],
    build: () => {
      const image = makeNode('image', 120, 160, { source: 'bank' })
      const video = makeNode('video', 480, 160)
      return {
        nodes: [image, video],
        edges: [makeEdge(image, 'image', video, 'image')],
      }
    },
  },
]

export function buildTemplate(id: string): { nodes: FlowNode[]; edges: FlowEdge[] } | null {
  return TEMPLATES.find((t) => t.id === id)?.build() ?? null
}
