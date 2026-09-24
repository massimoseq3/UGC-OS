import { describe, expect, it } from 'vitest'
import type { FlowGraph } from '../types'
import { flowFromLineage } from './saveAsFlow'
import { startOf, traceLineage, type LineageBanks } from './trace'

// ── Fixtures ───────────────────────────────────────────────────────────────

function banks(rows: Partial<Record<keyof LineageBanks, unknown[]>>): LineageBanks {
  const empty = {
    products: [], models: [], scripts: [], voices: [], brolls: [], styles: [], swipes: [],
    voiceHistory: [], videoHistory: [], imageHistory: [], musicHistory: [],
    scriptHistory: [], brollHistory: [], characterHistory: [], adAnatomyHistory: [],
  }
  return { ...empty, ...rows } as unknown as LineageBanks
}

const product = { id: 'p1', productName: 'Glow Serum', productImage: 'asset://p' }
const maya = { id: 'm1', name: 'Maya', characterImage: 'asset://m' }
const hooks = {
  id: 's1', mode: 'write', writeFormat: 'hooks', hookCount: 10, hookCategory: 'auto', variations: ['Hook one.', 'Hook two.'],
  inputSummary: '', createdAt: 1, parents: [{ bank: 'products', id: 'p1' }],
}
const voiceover = {
  id: 'v1', modelId: 'tts-model', voiceId: 'Kore', voiceName: 'Kore', style: 'Natural', pace: 'Normal', accent: 'Neutral', temperature: 1,
  scriptText: 'Hook two.', scriptPreview: 'Hook two.', audioUrl: 'asset://a', duration: 3, createdAt: 2,
  parents: [{ bank: 'scriptHistory', id: 's1' }],
}
const session = {
  id: 'b1', createdAt: 3, inputSummary: '', scriptText: 'Hook two.', lineDelivery: 'silent', styleId: 'ugc',
  result: { scenes: [{ number: 1, scriptLine: 'Hook two.', variations: [{}, {}] }] },
  cardStates: { '1-0': { images: [{ imageUrl: 'asset://i' }], videos: [{ url: 'asset://c', modelId: 'grok-video', resolution: '720p', aspectRatio: '9:16' }], cardImageAspectRatio: '9:16' } },
  parents: [{ bank: 'scriptHistory', id: 's1' }, { bank: 'models', id: 'm1' }, { bank: 'products', id: 'p1' }],
}
const clip = { id: 'c1', sourceApp: 'broll-studio', videoUrl: 'asset://c', prompt: '', modelId: 'grok-video', mode: 'image-to-video', aspectRatio: '9:16', createdAt: 4, parents: [{ bank: 'brollHistory', id: 'b1' }] }

function kinds(graph: FlowGraph): string[] {
  return graph.blocks.map((b) => b.kind).sort()
}

function wiresOf(graph: FlowGraph): string[] {
  const kindOf = (id: string) => {
    const b = graph.blocks.find((x) => x.id === id)!
    return b.kind === 'bank' ? `bank:${b.settings.bank}` : b.kind
  }
  return graph.wires.map((w) => `${kindOf(w.from)}.${w.fromPort} → ${kindOf(w.to)}.${w.toPort}`).sort()
}

// ── Tracing ────────────────────────────────────────────────────────────────

describe('traceLineage', () => {
  it('walks every parent back once', () => {
    const b = banks({ products: [product], scriptHistory: [hooks], voiceHistory: [voiceover] })
    const trace = traceLineage({ bank: 'voiceHistory', id: 'v1' }, b)
    expect(Object.keys(trace.nodes).sort()).toEqual(['products:p1', 'scriptHistory:s1', 'voiceHistory:v1'])
    expect(trace.nodes['voiceHistory:v1'].parents).toEqual(['scriptHistory:s1'])
  })

  it('reads the ids an old row kept as parents, when they still resolve', () => {
    const old = { id: 'b0', createdAt: 1, inputSummary: '', productId: 'p1', modelId: 'gone', scriptText: 'Hi.', result: { scenes: [] }, cardStates: {} }
    const trace = traceLineage({ bank: 'brollHistory', id: 'b0' }, banks({ products: [product], brollHistory: [old] }))
    expect(trace.nodes['brollHistory:b0'].parents).toEqual(['products:p1'])
  })

  it('starts a B-Roll clip at its session', () => {
    const b = banks({ brollHistory: [session], videoHistory: [clip] })
    expect(startOf({ bank: 'videoHistory', id: 'c1' }, b)).toEqual({ bank: 'brollHistory', id: 'b1' })
  })
})

// ── Save as Flow ───────────────────────────────────────────────────────────

describe('flowFromLineage', () => {
  const b = banks({ products: [product], models: [maya], scriptHistory: [hooks], voiceHistory: [voiceover], brollHistory: [session], videoHistory: [clip] })

  it('rebuilds a voiceover with its script written fresh each run', () => {
    const saved = flowFromLineage(traceLineage({ bank: 'voiceHistory', id: 'v1' }, b), { keepScript: false })
    expect(saved.name).toBe('Glow Serum Voiceover')
    expect(saved.madeScript).toBe(true)
    expect(kinds(saved.graph)).toEqual(['bank', 'scripts', 'voice'])
    expect(wiresOf(saved.graph)).toEqual(['bank:products.out → scripts.product', 'scripts.all → voice.script'])
    const scripts = saved.graph.blocks.find((x) => x.kind === 'scripts')!
    expect(scripts.settings).toMatchObject({ writeFormat: 'hooks', hookCount: 10 })
    // Ten hooks into one voice: the member picks which run on.
    expect(scripts.review).toBe(true)
    const voice = saved.graph.blocks.find((x) => x.kind === 'voice')!
    expect(voice.settings).toMatchObject({ voiceId: 'Kore', modelId: 'tts-model', pace: 'Normal' })
    const bank = saved.graph.blocks.find((x) => x.kind === 'bank')!
    expect(bank).toMatchObject({ pick: 'p1', field: true, label: 'Your Product' })
  })

  it('keeps the script word for word when asked', () => {
    const saved = flowFromLineage(traceLineage({ bank: 'voiceHistory', id: 'v1' }, b), { keepScript: true })
    expect(kinds(saved.graph)).toEqual(['text', 'voice'])
    expect(saved.graph.blocks.find((x) => x.kind === 'text')!.settings.text).toBe('Hook two.')
  })

  it('rebuilds a B-Roll clip from its session, sharing the product', () => {
    const start = startOf({ bank: 'videoHistory', id: 'c1' }, b)
    const saved = flowFromLineage(traceLineage(start, b), { keepScript: false })
    expect(kinds(saved.graph)).toEqual(['bank', 'bank', 'broll', 'scripts'])
    expect(wiresOf(saved.graph)).toEqual([
      'bank:models.out → broll.character',
      'bank:products.out → broll.product',
      'bank:products.out → scripts.product',
      'scripts.all → broll.script',
    ])
    const broll = saved.graph.blocks.find((x) => x.kind === 'broll')!
    expect(broll.settings).toMatchObject({ takes: 2, animate: true, videoModelId: 'grok-video', delivery: 'silent', aspectRatio: '9:16' })
  })

  it('carries typed text as a Text block', () => {
    const typed = { ...voiceover, id: 'v2', parents: undefined, scriptText: 'Typed by hand.' }
    const saved = flowFromLineage(traceLineage({ bank: 'voiceHistory', id: 'v2' }, banks({ voiceHistory: [typed] })), { keepScript: false })
    expect(saved.name).toBe('Voiceover Flow')
    expect(saved.madeScript).toBe(false)
    expect(wiresOf(saved.graph)).toEqual(['text.out → voice.script'])
  })

  it('turns a deleted product into a field to pick, and falls back to the text a deleted script left', () => {
    const b2 = banks({ voiceHistory: [voiceover], brollHistory: [session] })
    const saved = flowFromLineage(traceLineage({ bank: 'brollHistory', id: 'b1' }, b2), { keepScript: false })
    const product = saved.graph.blocks.find((x) => x.kind === 'bank' && x.settings.bank === 'products')!
    expect(product.pick).toBeUndefined()
    expect(product.field).toBe(true)
    expect(wiresOf(saved.graph)).toContain('text.out → broll.script')
    expect(saved.notes.length).toBe(1)
  })

  it("routes an uploaded ad's transcript into a remix's Winning Ad", () => {
    const analysis = { id: 'a1', status: 'complete', adTitle: 'Serum Ad', fileName: 'ad.mp4', mediaKind: 'video', createdAt: 1, result: { transcript: [{ text: 'Line one.' }, { text: 'Line two.' }] } }
    const remix = { ...hooks, id: 's2', mode: 'remix', writeFormat: undefined, variations: ['Take.'], winningTranscript: 'Line one.\nLine two.', parents: [{ bank: 'adAnatomyHistory', id: 'a1' }] }
    const saved = flowFromLineage(traceLineage({ bank: 'scriptHistory', id: 's2' }, banks({ adAnatomyHistory: [analysis], scriptHistory: [remix] })), { keepScript: false })
    expect(wiresOf(saved.graph)).toEqual(['text.out → scripts.source'])
    expect(saved.graph.blocks.find((x) => x.kind === 'text')!.settings.text).toBe('Line one.\nLine two.')
  })

  it('leaves out a parent no input takes, with nothing dangling', () => {
    const swipe = { id: 'sw1', platform: 'tiktok', caption: 'An ad', authorHandle: 'a' }
    const remix = { ...hooks, id: 's3', mode: 'remix', parents: [{ bank: 'swipes', id: 'sw1' }] }
    const saved = flowFromLineage(traceLineage({ bank: 'scriptHistory', id: 's3' }, banks({ swipes: [swipe], scriptHistory: [remix] })), { keepScript: false })
    expect(kinds(saved.graph)).toEqual(['scripts'])
    expect(saved.graph.wires).toEqual([])
  })
})
