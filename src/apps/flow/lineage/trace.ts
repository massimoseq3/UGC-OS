// What made a result: its parents, and theirs, walked back from one finished
// row. Save as Flow turns the walk into blocks; How Was This Made shows it.
//
// Every runner stamps `parents` on the history row it writes (utils/
// blockRunner.ts). Rows made before the stamps existed still carry the ids
// their app kept for itself — a script's product, a B-Roll session's product,
// character and script, a clip's B-Roll still — so those count as parents too,
// but only when they still resolve: an old id that points nowhere can't be
// told apart from one that never meant "made from".
//
// Pure: the banks come in as an argument, so this reads the same in a test.

import type {
  AdAnatomyHistoryItem,
  BRoll,
  BrollHistoryItem,
  CharacterHistoryItem,
  ImageHistoryItem,
  Lineage,
  LineageBank,
  Model,
  MusicHistoryItem,
  Product,
  Provenance,
  Script,
  ScriptHistoryItem,
  StylePreset,
  SwipeItem,
  VideoHistoryItem,
  VoiceHistoryItem,
  VoicePreset,
} from '../../../stores/types'

export interface RowMap {
  products: Product
  models: Model
  scripts: Script
  voices: VoicePreset
  brolls: BRoll
  styles: StylePreset
  swipes: SwipeItem
  voiceHistory: VoiceHistoryItem
  videoHistory: VideoHistoryItem
  imageHistory: ImageHistoryItem
  musicHistory: MusicHistoryItem
  scriptHistory: ScriptHistoryItem
  brollHistory: BrollHistoryItem
  characterHistory: CharacterHistoryItem
  adAnatomyHistory: AdAnatomyHistoryItem
}

// The bank store satisfies this as it stands.
export type LineageBanks = { [K in LineageBank]: ReadonlyArray<RowMap[K]> }

// One row of the walk, typed by its bank. `row` is undefined when the row
// was deleted since: it still shows, as made from something no longer kept.
export type TracedRow = { [K in LineageBank]: { bank: K; id: string; row: RowMap[K] | undefined } }[LineageBank]

export type TraceNode = TracedRow & {
  key: string
  // Keys of the rows this one was made from, in the order recorded.
  parents: string[]
}

export interface Trace {
  root: string
  nodes: Record<string, TraceNode>
}

// The banks a member's own picks live in, as opposed to what an app made.
export const PICKED_BANKS: ReadonlySet<LineageBank> = new Set(['products', 'models', 'scripts', 'voices', 'brolls', 'styles', 'swipes'])

// The history banks Save as Flow can start from.
export const MADE_BANKS = ['voiceHistory', 'brollHistory', 'videoHistory', 'imageHistory', 'musicHistory', 'scriptHistory', 'characterHistory', 'adAnatomyHistory'] as const satisfies readonly LineageBank[]
export type MadeBank = (typeof MADE_BANKS)[number]

export function lineageKey(ref: Lineage): string {
  return `${ref.bank}:${ref.id}`
}

export function findRow<K extends LineageBank>(banks: LineageBanks, bank: K, id: string): RowMap[K] | undefined {
  const rows = banks[bank] as ReadonlyArray<RowMap[K] & { id: string }>
  return rows.find((r) => r.id === id)
}

function traced(banks: LineageBanks, ref: Lineage): TracedRow {
  return { bank: ref.bank, id: ref.id, row: findRow(banks, ref.bank, ref.id) } as TracedRow
}

// The parents a row records, then the ones its app kept before stamps
// existed, where those still resolve.
export function parentsOf(banks: LineageBanks, node: TracedRow): Lineage[] {
  if (!node.row) return []
  const stamped = PICKED_BANKS.has(node.bank) ? [] : ((node.row as Provenance).parents ?? [])
  const implied: Lineage[] = []
  const imply = (bank: LineageBank, id: string | undefined) => {
    if (id && findRow(banks, bank, id)) implied.push({ bank, id })
  }
  switch (node.bank) {
    case 'scriptHistory':
      imply('products', node.row.linkedProductId)
      break
    case 'brollHistory':
      imply('products', node.row.productId)
      imply('models', node.row.modelId)
      imply('scripts', node.row.scriptId)
      break
    case 'videoHistory':
      imply('brolls', node.row.sourceBRollId)
      break
  }
  const out: Lineage[] = []
  const seen = new Set<string>()
  for (const p of [...stamped, ...implied]) {
    const key = lineageKey(p)
    if (!p?.id || seen.has(key) || key === lineageKey(node)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

// Breadth-first from the start, each row once, up to `limit` rows — a
// lineage is a handful deep in practice; the cap only guards a bad row.
export function traceLineage(start: Lineage, banks: LineageBanks, limit = 40): Trace {
  const root = lineageKey(start)
  const nodes: Record<string, TraceNode> = {}
  const queue: Lineage[] = [start]
  while (queue.length && Object.keys(nodes).length < limit) {
    const ref = queue.shift()!
    const key = lineageKey(ref)
    if (nodes[key]) continue
    const node = traced(banks, ref)
    const parents = parentsOf(banks, node)
    nodes[key] = { ...node, key, parents: parents.map(lineageKey) } as TraceNode
    for (const p of parents) if (!nodes[lineageKey(p)]) queue.push(p)
  }
  return { root, nodes }
}

// A B-Roll clip is one card of a session: the session is what was made, so
// Save as Flow starts there.
export function startOf(ref: Lineage, banks: LineageBanks): Lineage {
  if (ref.bank !== 'videoHistory') return ref
  const clip = findRow(banks, 'videoHistory', ref.id)
  if (clip?.sourceApp !== 'broll-studio') return ref
  const session = clip.parents?.find((p) => p.bank === 'brollHistory')
  return session && findRow(banks, 'brollHistory', session.id) ? session : ref
}
