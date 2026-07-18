import type { Node, Edge } from '@xyflow/react'
import type { WriteStyle, WriteLength } from '../script-architect/types'
import type { AspectRatio } from '../../utils/models'

// ── Ports ──────────────────────────────────────────────────────────
// Every connection is typed: an edge is only valid when the source output
// port and the target input port share a PortType. The runner moves
// PortValues along edges — asset outputs travel as asset:// refs (durable),
// never blob URLs.

export type PortType = 'product' | 'character' | 'script' | 'image' | 'audio' | 'video'

export type PortValue =
  | { type: 'product'; productId: string; name: string }
  | { type: 'character'; bankModelId: string; imageRef: string; name: string }
  | { type: 'script'; text: string }
  | { type: 'image'; refs: string[] }
  | { type: 'audio'; assetRef: string }
  | { type: 'video'; assetRef: string }

// Handle colors per port type — drawn from the owning app's accent so a wire
// visually names the data it carries (script = Scripts navy, audio = Voice
// blue, ...). Literal hexes on purpose: these sit on the canvas like media
// badges, identical in both themes.
export const PORT_COLORS: Record<PortType, string> = {
  product: '#7C3AED',
  character: '#F74F9E',
  script: '#5B7DB8',
  image: '#7165FF',
  audio: '#007AFF',
  video: '#0E8074',
}

export interface PortDef {
  id: string
  type: PortType
  label: string
  required?: boolean
  // Accepts multiple incoming edges (e.g. reference images). Single by
  // default: a new connection replaces the existing one.
  multi?: boolean
}

// ── Nodes ──────────────────────────────────────────────────────────

export type NodeKind =
  | 'product'
  | 'character'
  | 'analyzer'
  | 'script'
  | 'voiceover'
  | 'broll'
  | 'image'
  | 'video'

export type NodeStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped'

// Generator nodes can either produce fresh output ('generate') or hand a
// saved Bank/history asset straight through ('bank' — zero credits, instant).
// This is what makes the canvas feel connected to the rest of UGC OS instead
// of being a generation-only island.
export type NodeSource = 'generate' | 'bank'

export interface ProductNodeConfig { productId: string | null }
export interface CharacterNodeConfig { bankModelId: string | null }
// The ad video File itself is memory-only (see services/nodeFiles.ts) — only
// the name persists so a refreshed canvas can say "re-attach <name>".
export interface AnalyzerNodeConfig { fileName: string | null }
export interface ScriptNodeConfig {
  source: NodeSource
  bankScriptId: string | null
  brief: string
  style: WriteStyle
  length: WriteLength
}
export interface VoiceoverNodeConfig {
  source: NodeSource
  // A voiceHistory row — reusing an already-generated read.
  historyId: string | null
  voiceId: string
  voiceName: string
}
export interface BrollNodeConfig {
  source: NodeSource
  // Stills from the B-Rolls bank (multi-select).
  bankBrollIds: string[]
  aspectRatio: '9:16' | '16:9'
  maxScenes: number
}
export interface ImageNodeConfig {
  source: NodeSource
  // An imageHistory row.
  historyId: string | null
  prompt: string
  modelId: string
  aspectRatio: AspectRatio
}
export interface VideoNodeConfig {
  prompt: string
  modelId: string
  durationSeconds: number
  resolution: string
  aspectRatio: '9:16' | '16:9'
}

export type NodeConfig =
  | ProductNodeConfig
  | CharacterNodeConfig
  | AnalyzerNodeConfig
  | ScriptNodeConfig
  | VoiceoverNodeConfig
  | BrollNodeConfig
  | ImageNodeConfig
  | VideoNodeConfig

// React Flow node payload. `output` survives refresh (asset refs are
// durable); `status`/`error`/`note` are runtime and get normalised back to
// idle on rehydrate.
export type FlowNodeData = {
  kind: NodeKind
  config: NodeConfig
  status: NodeStatus
  output?: Record<string, PortValue>
  error?: string
  // Short live progress line shown on the card while running ("scene 2/4").
  note?: string
  [key: string]: unknown
}

export type FlowNode = Node<FlowNodeData, 'flowNode'>
export type FlowEdge = Edge
