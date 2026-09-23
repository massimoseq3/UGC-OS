import { describe, expect, it } from 'vitest'
import type { FlowBlock, FlowGraph, FlowOutputs, FlowValue, InstanceResult } from '../types'
import { KINDS, outsOf } from './catalog'
import { canConnect } from './graph'
import { planFlow, type FlowPlan, type Held, type HeldValue, type PlanDeps } from './plan'

// ── Builders ───────────────────────────────────────────────────────────────

function block(id: string, kind: FlowBlock['kind'], extra: Partial<FlowBlock> = {}): FlowBlock {
  return { id, kind, x: 0, y: 0, settings: { ...KINDS[kind].defaults(), ...(extra.settings ?? {}) }, ...extra }
}

function slots(prefix: string, n: number, off: number[] = []) {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, off: off.includes(i + 1) || undefined }))
}

let wireSeq = 0
function wire(from: string, fromPort: string, to: string, toPort: string) {
  return { id: `w${++wireSeq}`, from, fromPort, to, toPort }
}

// Flat per-run prices, so the sums below are easy to check by eye.
const PRICE: Partial<Record<FlowBlock['kind'], number>> = { scripts: 1, voice: 2, broll: 100, characters: 10, playground: 8 }

const deps: PlanDeps = {
  held(b): Held {
    if (b.kind === 'bank') {
      if (!b.pick) return { missing: 'Pick one from the bank' }
      const type = outsOf(b)[0].type
      return { outputs: { out: [{ type, key: `bank:${b.pick}`, label: b.pick, payload: {} } as HeldValue] } }
    }
    if (b.kind === 'characters') {
      return { outputs: { all: [{ type: 'character', key: `models:${b.pick}`, label: 'Maya', payload: { imageRef: 'asset://x' } }] } }
    }
    if (b.kind === 'list') {
      const entries = (b.settings.entries as string[]) ?? []
      const items: Record<string, HeldValue> = {}
      ;(b.items ?? []).forEach((it, i) => {
        items[it.id] = { type: 'text', key: `list:${entries[i]}`, label: entries[i], payload: { text: entries[i] } }
      })
      return { outputs: {}, items }
    }
    return { missing: 'Nothing to hand on' }
  },
  cost(b, _inputs, n) {
    return (PRICE[b.kind] ?? 0) * (b.kind === 'characters' ? n : 1)
  },
}

// Pretends every planned run happened: each made value gets a key of its
// own, the way a real generation's history row id would.
function runAll(graph: FlowGraph, outputs: FlowOutputs, opts: { test?: boolean; only?: string } = {}): { outputs: FlowOutputs; plan: FlowPlan } {
  let next: FlowOutputs = structuredClone(outputs)
  let plan = planFlow(graph, next, deps, opts)
  const first = plan
  // Run block by block in plan order, re-planning after each so downstream
  // runs see real values, like the scheduler does.
  for (const id of plan.planned) {
    plan = planFlow(graph, next, deps, opts)
    const bp = plan.blocks[id]
    const b = graph.blocks.find((x) => x.id === id)!
    const instances = { ...(next[id]?.instances ?? {}) }
    for (const inst of bp.instances.filter((i) => i.run)) {
      const prior = instances[inst.key]
      const result: InstanceResult = { key: inst.key, trace: inst.trace, outputs: {}, at: 1, test: opts.test }
      if (inst.slots) {
        result.items = { ...(KINDS[b.kind].perSlot ? prior?.items ?? {} : {}) }
        for (const s of inst.slots) {
          result.items[s] = { type: outsOf(b)[0].type, key: `made:${id}:${inst.key}:${s}`, label: s, trace: {}, payload: {} } as FlowValue
        }
      } else {
        for (const p of outsOf(b)) {
          result.outputs[p.key] = [{ type: p.type, key: `made:${id}:${inst.key}:${p.key}`, label: p.key, trace: {}, payload: {} } as FlowValue]
        }
      }
      instances[inst.key] = result
    }
    next = { ...next, [id]: { instances } }
  }
  return { outputs: next, plan: first }
}

// ── The Serum Launch flow from the spec ────────────────────────────────────

function serumLaunch(hookCount = 3): FlowGraph {
  return {
    blocks: [
      block('prod', 'bank', { pick: 'glow-serum', settings: { bank: 'products' } }),
      block('chr', 'characters', { source: 'bank', pick: 'maya' }),
      block('scr', 'scripts', { items: slots('h', hookCount) }),
      block('voc', 'voice'),
      block('brl', 'broll'),
      block('edit', 'edit'),
    ],
    wires: [
      wire('prod', 'out', 'scr', 'product'),
      wire('scr', 'all', 'voc', 'script'),
      wire('scr', 'all', 'brl', 'script'),
      wire('chr', 'all', 'brl', 'character'),
      wire('voc', 'audio', 'edit', 'audio'),
      wire('brl', 'clips', 'edit', 'clips'),
    ],
  }
}

describe('counting runs', () => {
  it('runs each block once per hook, and pairs Edit Pack instead of multiplying', () => {
    const plan = planFlow(serumLaunch(3), {}, deps)
    expect(plan.blocks.scr.runs).toBe(1)
    expect(plan.blocks.voc.runs).toBe(3)
    expect(plan.blocks.brl.runs).toBe(3)
    // 3 voiceovers × 3 clip sets would be 9; each hook's pair is 3.
    expect(plan.blocks.edit.runs).toBe(3)
    expect(plan.credits).toBe(1 + 3 * 2 + 3 * 100)
  })

  it('multiplies independent batches: 3 hooks × 2 faces is 6 B-Roll runs', () => {
    const g = serumLaunch(3)
    const chr = g.blocks.find((b) => b.id === 'chr')!
    chr.source = 'generate'
    chr.items = slots('f', 2)
    chr.settings.count = 2
    const plan = planFlow(g, {}, deps)
    expect(plan.blocks.chr.runs).toBe(1)
    expect(plan.blocks.chr.credits).toBe(2 * 10)
    expect(plan.blocks.brl.runs).toBe(6)
    expect(plan.blocks.voc.runs).toBe(3)
    // Each clip set pairs with its own hook's voiceover: 6 packs, not 18.
    expect(plan.blocks.edit.runs).toBe(6)
  })

  it('runs once per wire when single items are wired into one input', () => {
    const g = serumLaunch(5)
    g.wires = g.wires.filter((w) => !(w.to === 'voc' && w.toPort === 'script'))
    g.wires.push(wire('scr', 'item:h1', 'voc', 'script'), wire('scr', 'item:h3', 'voc', 'script'))
    const plan = planFlow(g, {}, deps)
    expect(plan.blocks.voc.runs).toBe(2)
  })

  it('leaves out items that are off, so they cost nothing downstream', () => {
    const g = serumLaunch(5)
    g.blocks.find((b) => b.id === 'scr')!.items = slots('h', 5, [2, 4])
    const plan = planFlow(g, {}, deps)
    expect(plan.blocks.voc.runs).toBe(3)
    expect(plan.blocks.brl.runs).toBe(3)
  })

  it('keeps clips whose hook has no voiceover, with no voiceover', () => {
    const g = serumLaunch(4)
    g.wires = g.wires.filter((w) => !(w.to === 'voc' && w.toPort === 'script'))
    g.wires.push(wire('scr', 'item:h1', 'voc', 'script'))
    const plan = planFlow(g, {}, deps)
    expect(plan.blocks.edit.runs).toBe(4)
    const withAudio = plan.blocks.edit.instances.filter((i) => (i.inputs.audio?.length ?? 0) > 0)
    expect(withAudio).toHaveLength(1)
  })

  it('never multiplies an input that takes many at once', () => {
    const g: FlowGraph = {
      blocks: [
        block('chr', 'characters', { items: slots('f', 3), settings: { count: 3 } }),
        block('pg', 'playground'),
      ],
      wires: [wire('chr', 'all', 'pg', 'refs')],
    }
    const plan = planFlow(g, {}, deps)
    expect(plan.blocks.pg.runs).toBe(1)
    expect(plan.blocks.pg.instances[0].inputs.refs).toHaveLength(3)
  })

  it('runs a List once per entry downstream', () => {
    const g: FlowGraph = {
      blocks: [
        block('list', 'list', { items: slots('l', 3), settings: { entries: ['Oily Skin', 'Dry Skin', 'Mature Skin'] } }),
        block('scr', 'scripts', { items: slots('h', 10) }),
      ],
      wires: [wire('list', 'all', 'scr', 'brief')],
    }
    const plan = planFlow(g, {}, deps)
    expect(plan.blocks.scr.runs).toBe(3)
  })
})

describe('what re-runs', () => {
  it('runs nothing the second time', () => {
    const g = serumLaunch(3)
    const { outputs } = runAll(g, {})
    const again = planFlow(g, outputs, deps)
    expect(again.planned).toEqual([])
    expect(again.credits).toBe(0)
  })

  it('re-runs only the changed block and what reads from it', () => {
    const g = serumLaunch(3)
    const { outputs } = runAll(g, {})
    g.blocks.find((b) => b.id === 'voc')!.settings = { ...g.blocks.find((b) => b.id === 'voc')!.settings, voiceId: 'Kore' }
    const plan = planFlow(g, outputs, deps)
    expect(plan.planned).toEqual(['voc', 'edit'])
    expect(plan.blocks.voc.runs).toBe(3)
    expect(plan.blocks.edit.runs).toBe(3)
    expect(plan.credits).toBe(3 * 2)
  })

  it('turning an item off and back on runs nothing', () => {
    const g = serumLaunch(3)
    const { outputs } = runAll(g, {})
    const scr = g.blocks.find((b) => b.id === 'scr')!
    scr.items = slots('h', 3, [2])
    expect(planFlow(g, outputs, deps).planned).toEqual([])
    scr.items = slots('h', 3)
    expect(planFlow(g, outputs, deps).planned).toEqual([])
  })

  it('makes only the missing faces when the count goes up', () => {
    const g: FlowGraph = { blocks: [block('chr', 'characters', { items: slots('f', 2), settings: { count: 2 } })], wires: [] }
    const { outputs } = runAll(g, {})
    const chr = g.blocks[0]
    chr.items = slots('f', 4)
    chr.settings.count = 4
    const plan = planFlow(g, outputs, deps)
    expect(plan.blocks.chr.runs).toBe(1)
    expect(plan.blocks.chr.instances[0].slots).toEqual(['f3', 'f4'])
    expect(plan.blocks.chr.credits).toBe(20)
  })

  it('remakes every hook when a block that fills them in one call gets more', () => {
    const g: FlowGraph = { blocks: [block('scr', 'scripts', { items: slots('h', 10) })], wires: [] }
    const { outputs } = runAll(g, {})
    g.blocks[0].items = slots('h', 20)
    const plan = planFlow(g, outputs, deps)
    expect(plan.blocks.scr.instances[0].slots).toHaveLength(20)
  })

  it('Run Block remakes just that block', () => {
    const g = serumLaunch(3)
    const { outputs } = runAll(g, {})
    const plan = planFlow(g, outputs, deps, { only: 'voc' })
    expect(plan.planned).toEqual(['voc'])
    expect(plan.blocks.voc.runs).toBe(3)
  })
})

describe('Test With 1', () => {
  it('runs every block at most once, with batches cut to one item', () => {
    const g = serumLaunch(5)
    const chr = g.blocks.find((b) => b.id === 'chr')!
    chr.source = 'generate'
    chr.items = slots('f', 4)
    chr.settings.count = 4
    const plan = planFlow(g, {}, deps, { test: true })
    for (const id of ['scr', 'voc', 'brl', 'edit', 'chr']) expect(plan.blocks[id].runs).toBe(1)
    expect(plan.blocks.chr.instances[0].slots).toEqual(['f1'])
    expect(plan.credits).toBe(1 + 2 + 100 + 10)
  })

  it("feeds a wire from any item the test's one item", () => {
    const g: FlowGraph = {
      blocks: [block('chr', 'characters', { items: slots('f', 3), settings: { count: 3 } }), block('brl', 'broll'), block('txt', 'text')],
      wires: [wire('chr', 'item:f3', 'brl', 'character')],
    }
    // B-Roll needs a script; hand it one from a Text block.
    const withText: PlanDeps = {
      ...deps,
      held: (b) => (b.kind === 'text' ? { outputs: { out: [{ type: 'text', key: 't', label: 't', payload: { text: 'hi' } }] } } : deps.held(b)),
    }
    g.wires.push(wire('txt', 'out', 'brl', 'script'))
    const plan = planFlow(g, {}, withText, { test: true })
    expect(plan.blocks.brl.runs).toBe(1)
    expect(plan.blocks.brl.instances[0].inputs.character).toHaveLength(1)
  })
})

describe('blocked blocks', () => {
  it('names the missing required input', () => {
    const g: FlowGraph = { blocks: [block('voc', 'voice')], wires: [] }
    expect(planFlow(g, {}, deps).blocks.voc.blocked).toBe('Needs a script wired in')
  })

  it('names a Bank block with nothing picked', () => {
    const g: FlowGraph = { blocks: [block('prod', 'bank')], wires: [] }
    expect(planFlow(g, {}, deps).blocks.prod.blocked).toBe('Pick one from the bank')
  })

  it('stops at a turned-off block', () => {
    const g = serumLaunch(3)
    g.blocks.find((b) => b.id === 'scr')!.off = true
    const plan = planFlow(g, {}, deps)
    expect(plan.blocks.scr.blocked).toBe('Turned off')
    expect(plan.blocks.voc.blocked).toBe('Nothing came in to Script')
    expect(plan.planned).toEqual([])
  })
})

describe('wiring', () => {
  it('refuses a wire that would loop back', () => {
    const g = serumLaunch(3)
    const check = canConnect(g, { from: 'voc', fromPort: 'audio', to: 'voc', toPort: 'script' })
    expect(check.ok).toBe(false)
  })

  it('refuses a type the input does not take, and says what it does take', () => {
    const g = serumLaunch(3)
    const check = canConnect(g, { from: 'voc', fromPort: 'audio', to: 'brl', toPort: 'script' })
    expect(check).toEqual({ ok: false, reason: 'Script takes Script, Text or Transcript, not Voiceover.' })
  })

  it('takes a transcript where a script goes', () => {
    const g: FlowGraph = { blocks: [block('an', 'analyzer'), block('voc', 'voice')], wires: [] }
    expect(canConnect(g, { from: 'an', fromPort: 'transcript', to: 'voc', toPort: 'script' }).ok).toBe(true)
  })
})
