import {
  Package,
  UserRound,
  Eye,
  PenLine,
  Mic,
  Film,
  Image as ImageIcon,
  Clapperboard,
  type LucideIcon,
} from 'lucide-react'
import type { NodeConfig, NodeKind, PortDef } from './types'
import { createDefaultSettings } from '../voice-studio/types'
import { getDefaultModel } from '../../utils/models'

export interface NodeDefEntry {
  kind: NodeKind
  label: string
  // One-line job description shown in the palette and on empty node cards.
  tagline: string
  icon: LucideIcon
  accent: string
  group: 'Sources' | 'Generate'
  inputs: PortDef[]
  outputs: PortDef[]
  defaultConfig: () => NodeConfig
}

export const NODE_DEFS: Record<NodeKind, NodeDefEntry> = {
  product: {
    kind: 'product',
    label: 'Product',
    tagline: 'Pick a product from the Bank',
    icon: Package,
    accent: '#7C3AED',
    group: 'Sources',
    inputs: [],
    outputs: [{ id: 'product', type: 'product', label: 'Product' }],
    defaultConfig: () => ({ productId: null }),
  },
  character: {
    kind: 'character',
    label: 'Character',
    tagline: 'Pick a UGC character from the Bank',
    icon: UserRound,
    accent: '#F74F9E',
    group: 'Sources',
    inputs: [],
    outputs: [{ id: 'character', type: 'character', label: 'Character' }],
    defaultConfig: () => ({ bankModelId: null }),
  },
  analyzer: {
    kind: 'analyzer',
    label: 'Ad Analyzer',
    tagline: 'Drop a winning ad, get its transcript',
    icon: Eye,
    accent: '#FF5257',
    group: 'Sources',
    inputs: [],
    outputs: [{ id: 'script', type: 'script', label: 'Transcript' }],
    defaultConfig: () => ({ fileName: null }),
  },
  script: {
    kind: 'script',
    label: 'Script',
    tagline: 'Write new, or remix a connected transcript',
    icon: PenLine,
    accent: '#5B7DB8',
    group: 'Generate',
    inputs: [
      { id: 'product', type: 'product', label: 'Product' },
      { id: 'script', type: 'script', label: 'Transcript' },
    ],
    outputs: [{ id: 'script', type: 'script', label: 'Script' }],
    defaultConfig: () => ({ source: 'generate', bankScriptId: null, brief: '', style: 'pas', length: 30 }),
  },
  voiceover: {
    kind: 'voiceover',
    label: 'Voiceover',
    tagline: 'Read the script in an ElevenLabs voice',
    icon: Mic,
    accent: '#007AFF',
    group: 'Generate',
    inputs: [{ id: 'script', type: 'script', label: 'Script', required: true }],
    outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
    defaultConfig: () => {
      const v = createDefaultSettings()
      return { source: 'generate', historyId: null, voiceId: v.voiceId, voiceName: v.voiceName }
    },
  },
  broll: {
    kind: 'broll',
    label: 'B-Roll',
    tagline: 'Script → scenes → one still per scene',
    icon: Film,
    accent: '#7165FF',
    group: 'Generate',
    inputs: [
      { id: 'script', type: 'script', label: 'Script', required: true },
      { id: 'product', type: 'product', label: 'Product' },
      { id: 'character', type: 'character', label: 'Character' },
    ],
    outputs: [{ id: 'images', type: 'image', label: 'Stills' }],
    defaultConfig: () => ({ source: 'generate', bankBrollIds: [], aspectRatio: '9:16', maxScenes: 4 }),
  },
  image: {
    kind: 'image',
    label: 'Image',
    tagline: 'Freeform image, refs welcome',
    icon: ImageIcon,
    accent: '#8B5CF6',
    group: 'Generate',
    inputs: [
      { id: 'character', type: 'character', label: 'Character' },
      { id: 'product', type: 'product', label: 'Product' },
      { id: 'image', type: 'image', label: 'Refs', multi: true },
    ],
    outputs: [{ id: 'image', type: 'image', label: 'Image' }],
    defaultConfig: () => ({
      source: 'generate',
      historyId: null,
      prompt: '',
      modelId: getDefaultModel('flow-studio', 'image', 'text-to-image')?.id ?? 'nano-banana-2',
      aspectRatio: '9:16',
    }),
  },
  video: {
    kind: 'video',
    label: 'Video',
    tagline: 'Animate a still or generate from text',
    icon: Clapperboard,
    accent: '#0E8074',
    group: 'Generate',
    inputs: [{ id: 'image', type: 'image', label: 'Start frame' }],
    outputs: [{ id: 'video', type: 'video', label: 'Video' }],
    defaultConfig: () => {
      const model = getDefaultModel('flow-studio', 'video') ?? getDefaultModel('playground', 'video')
      return {
        prompt: '',
        modelId: model?.id ?? 'gemini-omni-video',
        durationSeconds: model?.videoConstraints?.durations?.[0] ?? 5,
        resolution: model?.videoConstraints?.default ?? '720p',
        aspectRatio: '9:16',
      }
    },
  },
}

export const PALETTE_GROUPS: Array<{ label: string; kinds: NodeKind[] }> = [
  { label: 'Sources', kinds: ['product', 'character', 'analyzer'] },
  { label: 'Generate', kinds: ['script', 'voiceover', 'broll', 'image', 'video'] },
]

// Which node kinds a source's output can feed, and through which ports. This
// powers the "+ Next step" menu — the beginner path that replaces dragging
// wires between 10px handles. Derived from the port declarations so it can
// never drift from what connections are actually valid. Same-kind chains
// (script → script, image → image) are technically valid but confusing in a
// menu, so they're excluded — power users can still wire them by hand.
export interface NextStep {
  kind: NodeKind
  sourcePort: string
  targetPort: string
}

const STEP_ORDER: NodeKind[] = ['script', 'voiceover', 'broll', 'image', 'video']

export function nextStepsFor(kind: NodeKind): NextStep[] {
  const steps: NextStep[] = []
  for (const out of NODE_DEFS[kind].outputs) {
    for (const targetKind of STEP_ORDER) {
      if (targetKind === kind) continue
      const port = NODE_DEFS[targetKind].inputs.find((p) => p.type === out.type)
      if (port) steps.push({ kind: targetKind, sourcePort: out.id, targetPort: port.id })
    }
  }
  return steps
}
