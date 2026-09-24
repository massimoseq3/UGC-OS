// The block catalog: every kind of block, the typed ports it wires through,
// and the settings a fresh one starts with. One entry per app plus the
// helpers. Pure data — the canvas draws from it, the planner counts from it,
// and the template validator checks imports against it.

import type { BlockKind, BlockSource, FlowBlock, PortSpec, PortType } from '../types'
import type { BankType } from '../../../utils/constants'
import { DEFAULT_HOOK_COUNT, DEFAULT_VARIATION_COUNT, isHookCount, isVariationCount } from '../../script-architect/types'

// ── Port types ─────────────────────────────────────────────────────────────

// Mid-tone hues so a dot reads on both themes' canvases.
export const TYPE_META: Record<PortType, { label: string; color: string }> = {
  product: { label: 'Product', color: '#0EA5E9' },
  character: { label: 'Character', color: '#EC4899' },
  script: { label: 'Script', color: '#6366F1' },
  text: { label: 'Text', color: '#A1A1AA' },
  transcript: { label: 'Transcript', color: '#F43F5E' },
  audio: { label: 'Voiceover', color: '#3B82F6' },
  image: { label: 'Image', color: '#14B8A6' },
  video: { label: 'Clips', color: '#8B5CF6' },
  voice: { label: 'Voice Preset', color: '#60A5FA' },
  style: { label: 'Visual Style', color: '#10B981' },
  ad: { label: 'Ad', color: '#EAB308' },
  music: { label: 'Music', color: '#F97316' },
}

// Which output types each input type takes. A script input reads a transcript
// or plain text as its script; a picture input takes anything that IS a
// picture (a product's photo, a character's portrait, a style's frames).
export const ACCEPTS: Record<PortType, PortType[]> = {
  product: ['product'],
  character: ['character'],
  script: ['script', 'text', 'transcript'],
  text: ['text', 'script', 'transcript'],
  transcript: ['transcript', 'text'],
  audio: ['audio'],
  image: ['image', 'product', 'character', 'style'],
  video: ['video'],
  voice: ['voice'],
  style: ['style'],
  ad: ['ad'],
  music: ['music'],
}

export function accepts(inputType: PortType, outputType: PortType): boolean {
  return ACCEPTS[inputType].includes(outputType)
}

// ── Banks ──────────────────────────────────────────────────────────────────

// What a row of each bank is, once it's on the canvas.
export const BANK_TYPE: Record<BankType, { one: string; type: PortType }> = {
  products: { one: 'Product', type: 'product' },
  models: { one: 'Character', type: 'character' },
  scripts: { one: 'Script', type: 'script' },
  voices: { one: 'Voice Preset', type: 'voice' },
  brolls: { one: 'B-Roll Still', type: 'image' },
  styles: { one: 'Visual Style', type: 'style' },
  swipes: { one: 'Saved Ad', type: 'ad' },
}

export const BANK_ORDER: BankType[] = ['products', 'models', 'scripts', 'voices', 'brolls', 'styles', 'swipes']

// ── Kinds ──────────────────────────────────────────────────────────────────

export interface KindSpec {
  kind: BlockKind
  title: string
  // The app it runs, for Open in App and its accent.
  appId?: string
  accent: string
  ins: PortSpec[]
  outs: PortSpec[]
  // Where a runnable block's result can come from. The first is the default.
  sources: BlockSource[]
  // Makes something when run (as opposed to handing on what it holds).
  runnable: boolean
  // Can Pause for Review.
  reviewable: boolean
  // One output per item. The noun names each ("Hook 3").
  itemNoun?: string
  // Each slot is its own generation (a face), so a run makes only the slots
  // that are on and still empty. The rest are one call that fills every slot.
  perSlot?: boolean
  defaults: () => Record<string, unknown>
}

const port = (key: string, label: string, type: PortType, extra: Partial<PortSpec> = {}): PortSpec => ({ key, label, type, ...extra })

export const KINDS: Record<BlockKind, KindSpec> = {
  characters: {
    kind: 'characters',
    title: 'Characters',
    appId: 'character-studio',
    accent: '#F74F9E',
    ins: [port('photo', 'Reference Photo', 'image')],
    outs: [port('all', 'All Characters', 'character')],
    sources: ['generate', 'bank', 'history'],
    runnable: true,
    reviewable: true,
    itemNoun: 'Face',
    perSlot: true,
    defaults: () => ({ profile: {}, kind: 'portrait', aspect: '9:16', resolution: '1K', count: 1 }),
  },
  scripts: {
    kind: 'scripts',
    title: 'Scripts',
    appId: 'script-architect',
    accent: '#4C6FBF',
    ins: [port('product', 'Product', 'product'), port('brief', 'Brief', 'text'), port('source', 'Winning Ad', 'transcript')],
    outs: [port('all', 'All Hooks', 'script')],
    sources: ['generate', 'bank', 'history'],
    runnable: true,
    reviewable: true,
    itemNoun: 'Hook',
    defaults: () => ({
      mode: 'write',
      writeFormat: 'hooks',
      writeStyle: 'pas',
      writeLength: 30,
      remixLength: 'default',
      hookCategory: 'auto',
      hookCount: 10,
      variationCount: 3,
      brief: '',
      source: '',
      additionalContext: '',
    }),
  },
  voice: {
    kind: 'voice',
    title: 'Voiceovers',
    appId: 'voice-studio',
    accent: '#007AFF',
    ins: [port('script', 'Script', 'script', { required: true }), port('preset', 'Voice Preset', 'voice')],
    outs: [port('audio', 'Voiceover', 'audio')],
    sources: ['generate', 'history'],
    runnable: true,
    reviewable: true,
    // Filled from voice-studio's own defaults when the block is created
    // (store/blocks.ts), so a new block reads like a fresh Voiceovers.
    defaults: () => ({}),
  },
  broll: {
    kind: 'broll',
    title: 'B-Roll',
    appId: 'broll-studio',
    accent: '#7165FF',
    ins: [
      port('script', 'Script', 'script', { required: true }),
      port('character', 'Character', 'character'),
      port('product', 'Product', 'product'),
      port('style', 'Visual Style', 'style'),
    ],
    outs: [port('clips', 'Clips', 'video'), port('stills', 'Stills', 'image')],
    sources: ['generate', 'history'],
    runnable: true,
    reviewable: true,
    defaults: () => ({ delivery: 'silent', aspectRatio: '9:16', animate: true, context: '' }),
  },
  playground: {
    kind: 'playground',
    title: 'Playground',
    appId: 'playground',
    accent: '#12A594',
    ins: [port('refs', 'References', 'image', { many: true }), port('prompt', 'Prompt', 'text')],
    outs: [port('out', 'Image', 'image')],
    sources: ['generate', 'history'],
    runnable: true,
    reviewable: true,
    defaults: () => ({ mode: 'image', prompt: '', aspectRatio: '9:16', resolution: '1K', durationSeconds: 6, audio: false, instrumental: false }),
  },
  analyzer: {
    kind: 'analyzer',
    title: 'Ad Analyzer',
    appId: 'ad-anatomy',
    accent: '#FF5257',
    ins: [port('ad', 'Ad', 'ad', { required: true })],
    outs: [port('transcript', 'Transcript', 'transcript'), port('scenes', 'Scene Prompts', 'text')],
    sources: ['generate', 'history'],
    runnable: true,
    reviewable: false,
    defaults: () => ({}),
  },
  outliers: {
    kind: 'outliers',
    title: 'Outliers',
    appId: 'discover',
    accent: '#D9A404',
    ins: [],
    outs: [port('all', 'All Ads', 'ad')],
    sources: ['generate'],
    runnable: true,
    reviewable: false,
    itemNoun: 'Ad',
    defaults: () => ({ platform: 'tiktok', query: '', count: 5 }),
  },
  edit: {
    kind: 'edit',
    title: 'Edit Pack',
    appId: 'edit-studio',
    accent: '#F77646',
    ins: [
      port('audio', 'Voiceover', 'audio'),
      port('clips', 'Clips', 'video', { required: true }),
      port('script', 'Script', 'script'),
      port('music', 'Music', 'music'),
    ],
    outs: [],
    sources: ['generate'],
    runnable: true,
    reviewable: false,
    defaults: () => ({}),
  },
  bank: {
    kind: 'bank',
    title: 'Bank',
    appId: 'finder',
    accent: '#A1A1AA',
    ins: [],
    outs: [port('out', 'Product', 'product')],
    sources: ['bank'],
    runnable: false,
    reviewable: false,
    defaults: () => ({ bank: 'products' }),
  },
  image: {
    kind: 'image',
    title: 'Image',
    accent: '#14B8A6',
    ins: [],
    outs: [port('out', 'Image', 'image')],
    sources: [],
    runnable: false,
    reviewable: false,
    defaults: () => ({ ref: '', name: '' }),
  },
  text: {
    kind: 'text',
    title: 'Text',
    accent: '#A1A1AA',
    ins: [],
    outs: [port('out', 'Text', 'text')],
    sources: [],
    runnable: false,
    reviewable: false,
    defaults: () => ({ text: '' }),
  },
  list: {
    kind: 'list',
    title: 'List',
    accent: '#A1A1AA',
    ins: [],
    outs: [port('all', 'All Items', 'text')],
    sources: [],
    runnable: false,
    reviewable: false,
    itemNoun: 'Item',
    perSlot: true,
    defaults: () => ({ entries: [] }),
  },
  note: {
    kind: 'note',
    title: 'Note',
    accent: '#E8C872',
    ins: [],
    outs: [],
    sources: [],
    runnable: false,
    reviewable: false,
    defaults: () => ({ text: '' }),
  },
}

export function isKnownKind(kind: unknown): kind is BlockKind {
  return typeof kind === 'string' && kind in KINDS
}

// Dock order, which is also Tidy's left-to-right order and the palette's.
export const PRODUCTION_ORDER: BlockKind[] = [
  'bank', 'image', 'text', 'list', 'outliers', 'analyzer', 'characters', 'scripts', 'voice', 'broll', 'playground', 'edit', 'note',
]

// ── Per-block shape ────────────────────────────────────────────────────────

// Every per-block reader tolerates a kind this build doesn't know — a block a
// newer build wrote stays on the canvas, inert, rather than taking the editor
// down with it.
export function sourceOf(block: FlowBlock): BlockSource | undefined {
  const spec = KINDS[block.kind]
  if (!spec?.sources.length) return undefined
  return block.source && spec.sources.includes(block.source) ? block.source : spec.sources[0]
}

// Whether the block makes several items, each with its own output.
export function isBatch(block: FlowBlock): boolean {
  if (block.kind === 'scripts') return sourceOf(block) !== 'bank'
  if (block.kind === 'characters') return sourceOf(block) === 'generate'
  return block.kind === 'outliers' || block.kind === 'list'
}

// Whether pressing Run makes something. From Bank and From History blocks
// are done the moment they're picked.
export function isRunnable(block: FlowBlock): boolean {
  const spec = KINDS[block.kind]
  if (!spec?.runnable || block.suggested) return false
  return sourceOf(block) === 'generate'
}

export function insOf(block: FlowBlock): PortSpec[] {
  if (!KINDS[block.kind]) return []
  // A block reusing a past result has nothing to wire in: it was made already.
  if (KINDS[block.kind].runnable && sourceOf(block) !== 'generate') return []
  return KINDS[block.kind].ins
}

export function scriptsFormat(block: FlowBlock): 'hooks' | 'takes' {
  const s = block.settings
  return s.mode === 'write' && s.writeFormat === 'hooks' ? 'hooks' : 'takes'
}

export function outsOf(block: FlowBlock): PortSpec[] {
  const source = sourceOf(block)
  switch (block.kind) {
    case 'bank': {
      const bank = (block.settings.bank as BankType) ?? 'products'
      const meta = BANK_TYPE[bank] ?? BANK_TYPE.products
      return [port('out', meta.one, meta.type)]
    }
    case 'characters':
      return [port('all', source === 'generate' ? 'All Characters' : 'Character', 'character')]
    case 'scripts':
      if (source === 'bank') return [port('all', 'Script', 'script')]
      return [port('all', scriptsFormat(block) === 'hooks' ? 'All Hooks' : 'All Scripts', 'script')]
    case 'playground': {
      const mode = block.settings.mode
      if (mode === 'video') return [port('out', 'Clip', 'video')]
      if (mode === 'music') return [port('out', 'Music', 'music')]
      return [port('out', 'Image', 'image')]
    }
    default:
      return KINDS[block.kind]?.outs ?? []
  }
}

export function itemNoun(block: FlowBlock): string {
  if (block.kind === 'scripts') return scriptsFormat(block) === 'hooks' ? 'Hook' : 'Script'
  return KINDS[block.kind]?.itemNoun ?? 'Item'
}

export function titleOf(block: FlowBlock): string {
  if (block.label?.trim()) return block.label.trim()
  if (block.kind === 'bank') {
    const bank = (block.settings.bank as BankType) ?? 'products'
    return (BANK_TYPE[bank] ?? BANK_TYPE.products).one
  }
  return KINDS[block.kind]?.title ?? 'Block'
}

// How many slots a batch block should have for its settings.
export function desiredSlots(block: FlowBlock): number {
  const s = block.settings
  switch (block.kind) {
    // The counts Scripts itself accepts: anything else (an old flow, a
    // described one) runs at the default, so the slots have to agree.
    case 'scripts':
      return scriptsFormat(block) === 'hooks'
        ? (isHookCount(s.hookCount) ? s.hookCount : DEFAULT_HOOK_COUNT)
        : (isVariationCount(s.variationCount) ? s.variationCount : DEFAULT_VARIATION_COUNT)
    case 'characters':
      return Math.min(4, Math.max(1, Number(s.count) || 1))
    case 'outliers':
      return Math.min(20, Math.max(1, Number(s.count) || 5))
    case 'list':
      return Array.isArray(s.entries) ? s.entries.length : 0
    default:
      return 0
  }
}

// Settings a run doesn't read: how many slots there are (a slot is filled or
// not; changing the count never invalidates the slots already made) and
// what's only on screen.
const NOT_GENERATION: Partial<Record<BlockKind, string[]>> = {
  characters: ['count', 'tab'],
  outliers: ['count'],
  list: ['entries'],
}

export function generationSettings(block: FlowBlock): Record<string, unknown> {
  const skip = NOT_GENERATION[block.kind] ?? []
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(block.settings)) {
    if (!skip.includes(k) && !k.startsWith('ui')) out[k] = v
  }
  return out
}

// Production-order suggestion: the kind a finished flow most often lacks
// next, given what's on the canvas. Edit Pack closes a flow that makes clips.
export function suggestNext(kinds: BlockKind[]): BlockKind | null {
  const has = (k: BlockKind) => kinds.includes(k)
  if ((has('broll') || has('playground')) && !has('edit')) return 'edit'
  if (has('scripts') && !has('voice')) return 'voice'
  if (has('voice') && !has('broll')) return 'broll'
  return null
}

// A block's width on the canvas. App blocks are the wide ones: they carry
// ports, items and results. Layout reads it too, so it lives with the kinds.
export function blockWidth(kind: BlockKind): number {
  return KINDS[kind]?.runnable ? 264 : kind === 'note' ? 232 : 220
}
