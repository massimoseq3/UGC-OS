// Save as Flow: a finished result, rebuilt as the blocks that made it, with
// the exact settings each step used. The product and the character become
// fields, so the flow runs again for anything else; the script either stays
// word for word or is written fresh each run — the member's choice.
//
// Each traced row becomes one block, and each parent a wire into the input
// that takes it. A step whose input was typed rather than made (a voiceover
// read from pasted text) gets a Text block holding that text, so the flow
// reproduces it. A parent deleted since is left out and said so, except a
// product or character: those become an empty field to pick.

import type { BlockKind, FlowBlock, FlowGraph, FlowWire } from '../types'
import type { BankType } from '../../../utils/constants'
import type { BrollResult, CardState } from '../../broll-studio/types'
import type { AnalysisResult } from '../../ad-anatomy/types'
import { transcriptText } from '../../ad-anatomy/services/fullPrompt'
import { BANK_TYPE, KINDS, outsOf } from '../engine/catalog'
import { canConnect } from '../engine/graph'
import { laidOut } from '../engine/layout'
import { PICKED_BANKS, type Trace, type TraceNode } from './trace'

export interface SaveOptions {
  // Keep the script word for word (a Text block), or write a new one each
  // run with the same settings (a Scripts block).
  keepScript: boolean
}

export interface SavedFlow {
  name: string
  graph: FlowGraph
  // What didn't make it into the flow, as sentences.
  notes: string[]
  // Whether a script upstream of the result was made in Scripts — the only
  // case the keep-or-rewrite choice changes anything.
  madeScript: boolean
}

// A block's output, and — when more than one input would take it — the one
// it's meant for first (a transcript is a Scripts block's Winning Ad, not
// its Brief).
interface Out {
  block: string
  port: string
  into?: string
}

const NOUN: Record<string, string> = {
  voiceHistory: 'Voiceover',
  brollHistory: 'B-Roll',
  videoHistory: 'Clip',
  imageHistory: 'Image',
  musicHistory: 'Music',
  scriptHistory: 'Scripts',
  characterHistory: 'Character',
  adAnatomyHistory: 'Ad Breakdown',
}

function block(kind: BlockKind, settings: Record<string, unknown>, extra: Partial<FlowBlock> = {}): FlowBlock {
  const spec = KINDS[kind]
  return {
    id: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
    kind,
    x: 0,
    y: 0,
    settings: { ...spec.defaults(), ...settings },
    ...(spec.sources.length ? { source: spec.sources[0] } : {}),
    ...extra,
  }
}

function defined(settings: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}

// A B-Roll session's settings, read back from what it made: how many takes
// each line had, whether any card was animated, and with what.
function brollSettings(row: TraceNode & { bank: 'brollHistory' }): Record<string, unknown> {
  const r = row.row!
  const result = r.result as BrollResult | undefined
  const cards = Object.values(r.cardStates ?? {}) as CardState[]
  const card = cards.find((c) => c?.images?.length || c?.videos?.length)
  const video = cards.flatMap((c) => c?.videos ?? [])[0]
  const takes = Math.max(1, ...((result?.scenes ?? []).map((s) => s.variations?.length ?? 1)))
  return defined({
    delivery: r.lineDelivery === 'dialogue' ? 'dialogue' : 'silent',
    styleId: r.styleId,
    context: r.context,
    takes: Math.min(3, takes),
    aspectRatio: video?.aspectRatio ?? card?.cardImageAspectRatio,
    animate: !!video,
    videoModelId: video?.modelId,
    videoResolution: video?.resolution,
  })
}

export function flowFromLineage(trace: Trace, opts: SaveOptions): SavedFlow {
  const blocks: FlowBlock[] = []
  const wires: FlowWire[] = []
  const notes: string[] = []
  const made = new Map<string, Out | null>()
  let madeScript = false
  let productName: string | undefined

  const add = (b: FlowBlock) => {
    blocks.push(b)
    return b
  }

  // Wires `out` into the first input of `to` that takes it and is still
  // free (an input that takes many is never full).
  const wireInto = (to: FlowBlock, out: Out | null) => {
    if (!out) return
    const from = blocks.find((b) => b.id === out.block)
    const type = from ? outsOf(from).find((p) => p.key === out.port)?.type : undefined
    if (!type) return
    const ins = KINDS[to.kind].ins.map((p) => p.key)
    const candidates = out.into ? [out.into, ...ins.filter((k) => k !== out.into)] : ins
    for (const port of candidates) {
      const taken = wires.some((w) => w.to === to.id && w.toPort === port)
      const spec = KINDS[to.kind].ins.find((p) => p.key === port)
      if (taken && !spec?.many) continue
      const wire = { from: out.block, fromPort: out.port, to: to.id, toPort: port }
      if (canConnect({ blocks, wires }, wire).ok) {
        wires.push({ ...wire, id: `w-${crypto.randomUUID().slice(0, 8)}` })
        return
      }
    }
  }

  const text = (value: string, label: string): Out => {
    const b = add(block('text', { text: value }, { label }))
    return { block: b.id, port: 'out' }
  }

  // The script a consumer read: its Scripts row (kept as text, or written
  // afresh), whatever else it was made from, or the text it was given.
  const scriptFor = (node: TraceNode, typed: string | undefined): Out | null => {
    const source = node.parents.find((k) => {
      const p = trace.nodes[k]
      return p && (p.bank === 'scriptHistory' || p.bank === 'scripts' || p.bank === 'adAnatomyHistory')
    })
    if (source) {
      const p = trace.nodes[source]
      if (p.bank === 'scriptHistory' && p.row) {
        madeScript = true
        if (opts.keepScript) return made.get(`${source}:text`) ?? remember(`${source}:text`, text(typed || p.row.variations[0] || '', 'Script'))
      }
      const out = visit(source)
      if (out) return out
    }
    return typed?.trim() ? text(typed, 'Script') : null
  }

  const remember = (key: string, out: Out | null) => {
    made.set(key, out)
    return out
  }

  // The rest of a row's parents, wired in: the script is handled on its own.
  const wireParents = (node: TraceNode, into: FlowBlock, skip: (bank: string) => boolean = () => false) => {
    for (const key of node.parents) {
      const p = trace.nodes[key]
      if (!p || skip(p.bank)) continue
      wireInto(into, visit(key))
    }
  }

  const isScript = (bank: string) => bank === 'scriptHistory' || bank === 'scripts' || bank === 'adAnatomyHistory'

  function visit(key: string): Out | null {
    if (made.has(key)) return made.get(key)!
    // Reserved first, so a loop in bad data ends here.
    made.set(key, null)
    const node = trace.nodes[key]
    if (!node) return null

    if (PICKED_BANKS.has(node.bank)) {
      const bank = node.bank as BankType
      const person = bank === 'products' || bank === 'models'
      if (!node.row && !person) {
        notes.push(`A ${BANK_TYPE[bank].one.toLowerCase()} it was made from isn't in your bank any more, so it was left out.`)
        return null
      }
      if (bank === 'products' && node.row) productName = (node.row as { productName?: string }).productName
      const b = add(block('bank', { bank }, {
        pick: node.row ? node.id : undefined,
        field: person || undefined,
        label: bank === 'products' ? 'Your Product' : bank === 'models' ? 'Your Character' : undefined,
      }))
      return remember(key, { block: b.id, port: 'out' })
    }

    if (!node.row) {
      notes.push(`Something it was made from was deleted since, so the flow starts after it.`)
      return null
    }

    switch (node.bank) {
      case 'scriptHistory': {
        const r = node.row
        const several = (r.writeFormat === 'hooks' && (r.hookCount ?? r.variations.length) > 1) || r.variations.length > 1
        const b = add(block('scripts', defined({
          mode: r.mode === 'remix' ? 'remix' : 'write',
          writeFormat: r.writeFormat === 'prompt' ? 'script' : r.writeFormat,
          writeStyle: r.writeStyle,
          writeLength: r.writeLength,
          remixLength: r.remixLength,
          hookCategory: r.hookCategory,
          hookCount: r.hookCount,
          variationCount: r.variationCount,
          brief: r.brief,
          additionalContext: r.additionalContext,
          source: r.mode === 'remix' ? r.winningTranscript : undefined,
        }), { review: key !== trace.root && several ? true : undefined }))
        wireParents(node, b)
        return remember(key, { block: b.id, port: 'all' })
      }

      case 'voiceHistory': {
        const r = node.row
        const b = add(block('voice', defined({
          modelId: r.modelId,
          voiceId: r.voiceId,
          voiceName: r.voiceName,
          gender: r.gender,
          style: r.style,
          pace: r.pace,
          accent: r.accent,
          temperature: r.temperature,
          scene: r.scene,
          sampleContext: r.sampleContext,
        })))
        wireInto(b, scriptFor(node, r.scriptText))
        wireParents(node, b, isScript)
        return remember(key, { block: b.id, port: 'audio' })
      }

      case 'brollHistory': {
        const b = add(block('broll', brollSettings(node as TraceNode & { bank: 'brollHistory' })))
        wireInto(b, scriptFor(node, node.row.scriptText))
        wireParents(node, b, isScript)
        return remember(key, { block: b.id, port: 'clips' })
      }

      case 'videoHistory': {
        const r = node.row
        const session = node.parents.find((k) => trace.nodes[k]?.bank === 'brollHistory')
        if (r.sourceApp === 'broll-studio' && session) return remember(key, visit(session))
        const b = add(block('playground', defined({
          mode: 'video',
          modelId: r.modelId,
          prompt: r.prompt,
          aspectRatio: r.aspectRatio,
          durationSeconds: r.durationSeconds,
          resolution: r.resolution,
          audio: r.audio,
        })))
        wireParents(node, b)
        return remember(key, { block: b.id, port: 'out' })
      }

      case 'imageHistory': {
        const r = node.row
        const b = add(block('playground', defined({ mode: 'image', modelId: r.modelId, prompt: r.prompt, aspectRatio: r.aspectRatio, resolution: r.resolution })))
        wireParents(node, b)
        return remember(key, { block: b.id, port: 'out' })
      }

      case 'musicHistory': {
        const r = node.row
        const b = add(block('playground', defined({ mode: 'music', modelId: r.modelId, prompt: r.prompt, instrumental: r.instrumental })))
        wireParents(node, b)
        return remember(key, { block: b.id, port: 'out' })
      }

      case 'characterHistory': {
        const r = node.row
        const b = add(block('characters', defined({
          profile: r.profile,
          kind: r.kind ?? 'portrait',
          aspect: r.aspectRatio,
          resolution: r.resolution,
          modelId: r.modelId,
          count: 1,
        })))
        wireParents(node, b)
        return remember(key, { block: b.id, port: 'all' })
      }

      case 'adAnatomyHistory': {
        const r = node.row
        const ad = node.parents.find((k) => trace.nodes[k]?.bank === 'swipes' && trace.nodes[k]?.row)
        if (ad) {
          const b = add(block('analyzer', {}))
          wireInto(b, visit(ad))
          return remember(key, { block: b.id, port: 'transcript', into: 'source' })
        }
        // An uploaded ad isn't something a flow can fetch again, so its
        // transcript stands in for it.
        const result = r.result as AnalysisResult | undefined
        const transcript = result?.transcript?.length ? transcriptText(result) : ''
        if (!transcript) {
          notes.push(`The ad "${r.adTitle || r.fileName}" was uploaded, and its breakdown has no transcript to carry, so it was left out.`)
          return null
        }
        const out = text(transcript, 'Winning Ad Transcript')
        return remember(key, { ...out, into: 'source' })
      }
    }
    return null
  }

  const top = visit(trace.root)

  // A parent no input could take (a saved ad under a Scripts block that
  // remixed its transcript from a setting) would sit on the canvas wired to
  // nothing, so it goes — and so does whatever only fed it.
  let kept = blocks
  for (;;) {
    const next = kept.filter((b) => b.id === top?.block || wires.some((w) => w.from === b.id && kept.some((k) => k.id === w.to)))
    if (next.length === kept.length) break
    kept = next
  }
  const keptWires = wires.filter((w) => kept.some((b) => b.id === w.from) && kept.some((b) => b.id === w.to))
  const root = trace.nodes[trace.root]
  const noun = (root && NOUN[root.bank]) ?? 'Result'
  return {
    name: productName ? `${productName} ${noun}` : `${noun} Flow`,
    graph: laidOut({ blocks: kept, wires: keptWires }),
    notes: [...new Set(notes)],
    madeScript,
  }
}
