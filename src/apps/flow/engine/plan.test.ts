import { describe, expect, it } from 'vitest'
import type { FlowBlock, FlowGraph, FlowOutputs, FlowValue, InstanceResult } from '../types'
import { KINDS, desiredSlots, generationSettings, outsOf, rebuildsScenes, scriptsMode, titleOf } from './catalog'
import { adUploadOf, uploadedAdValue } from './ownAd'
import { canConnect, settleScripts } from './graph'
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
    // An ad block holding the member's own ad hands it on, as held.ts does.
    const upload = adUploadOf(b)
    if (upload) return { outputs: { out: [uploadedAdValue(upload)] } }
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

  it('does not rewrite hooks when the model wrote fewer than asked', () => {
    const g: FlowGraph = { blocks: [block('scr', 'scripts', { items: slots('h', 10) })], wires: [] }
    const { outputs } = runAll(g, {})
    const inst = Object.values(outputs.scr.instances)[0]
    // The call was asked for all ten and wrote nine.
    inst.slots = slots('h', 10).map((x) => x.id)
    delete inst.items!.h10
    expect(planFlow(g, outputs, deps).planned).toEqual([])
  })

  it('prices a script not written yet at its likely size', () => {
    const g = serumLaunch(3)
    const seen: string[] = []
    const sized: PlanDeps = { ...deps, cost: (b, inputs, n) => { if (b.kind === 'voice') seen.push((inputs.script?.[0]?.payload as { text?: string }).text ?? ''); return deps.cost(b, inputs, n) } }
    planFlow(g, {}, sized)
    // A hook is one line, not an empty string.
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((t) => t.length > 10 && t.length < 80)).toBe(true)
  })

  it('Run Block remakes just that block', () => {
    const g = serumLaunch(3)
    const { outputs } = runAll(g, {})
    const plan = planFlow(g, outputs, deps, { only: 'voc' })
    expect(plan.planned).toEqual(['voc'])
    expect(plan.blocks.voc.runs).toBe(3)
  })

  it('Run Block on a block whose inputs are not made yet makes them first, and nothing beside it', () => {
    const g = serumLaunch(3)
    const plan = planFlow(g, {}, deps, { only: 'voc' })
    expect(plan.planned).toEqual(['scr', 'voc'])
    // B-Roll reads the same hooks but isn't what was asked for.
    expect(plan.blocks.brl.runs).toBe(0)
    expect(plan.credits).toBe(1 + 3 * 2)
  })

  it('Run Again remakes everything, even with nothing changed', () => {
    const g = serumLaunch(3)
    const { outputs } = runAll(g, {})
    expect(planFlow(g, outputs, deps).planned).toEqual([])
    const again = planFlow(g, outputs, deps, { fresh: true })
    expect(again.planned).toEqual(['scr', 'voc', 'brl', 'edit'])
    expect(again.credits).toBe(1 + 3 * 2 + 3 * 100)
  })

  it('Run Again remakes a run once: what this run already made is not made again when its block comes round twice', () => {
    const g = serumLaunch(3)
    const { outputs } = runAll(g, {})
    // Scripts was made this run; Voiceovers made two of its three before a
    // reload put it back in the queue.
    const made = new Set(planFlow(g, outputs, deps, { fresh: true }).blocks.scr.instances.map((i) => `scr:${i.key}`))
    const voc = planFlow(g, outputs, deps, { fresh: true, made }).blocks.voc
    expect(voc.runs).toBe(3)
    for (const i of voc.instances.slice(0, 2)) made.add(`voc:${i.key}`)
    const resumed = planFlow(g, outputs, deps, { fresh: true, made })
    expect(resumed.blocks.voc.runs).toBe(1)
    expect(resumed.blocks.voc.credits).toBe(2)
  })

  it('Run Again prices what a rewritten script feeds on the script it replaces', () => {
    const g = serumLaunch(1)
    const { outputs } = runAll(g, {})
    const inst = Object.values(outputs.scr.instances)[0]
    for (const v of Object.values(inst.items ?? {})) if (v.type === 'script') v.payload = { text: 'The line it wrote last time.' }
    const again = planFlow(g, outputs, deps, { fresh: true })
    const said = again.blocks.voc.instances[0].inputs.script?.[0]
    expect(said?.pending).toBe(true)
    expect(said?.type === 'script' && said.payload.text).toBe('The line it wrote last time.')
  })

  it('Run Block remakes only what is missing upstream, and the block itself whole', () => {
    const g = serumLaunch(3)
    const { outputs } = runAll(g, {})
    // A fourth hook asked for: Scripts writes again, Voiceovers remakes all four.
    const scr = g.blocks.find((b) => b.id === 'scr')!
    scr.items = slots('h', 4)
    const plan = planFlow(g, outputs, deps, { only: 'voc' })
    expect(plan.planned).toEqual(['scr', 'voc'])
    expect(plan.blocks.voc.runs).toBe(4)
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
    const g: FlowGraph = { blocks: [block('an', 'analyzer')], wires: [] }
    expect(planFlow(g, {}, deps).blocks.an.blocked).toBe('Needs an ad. Drop your own on it, or wire one in')
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

describe('slots', () => {
  it('follow the counts Scripts accepts, so the plan matches what a run makes', () => {
    expect(desiredSlots(block('s', 'scripts', { settings: { mode: 'write', writeFormat: 'hooks', hookCount: 5 } }))).toBe(10)
    expect(desiredSlots(block('s', 'scripts', { settings: { mode: 'write', writeFormat: 'hooks', hookCount: 20 } }))).toBe(20)
    // Variations are any whole number 1–10; anything else falls back to 3.
    expect(desiredSlots(block('s', 'scripts', { settings: { mode: 'write', writeFormat: 'script', variationCount: 4 } }))).toBe(4)
    expect(desiredSlots(block('s', 'scripts', { settings: { mode: 'write', writeFormat: 'script', variationCount: 11 } }))).toBe(3)
    expect(desiredSlots(block('s', 'scripts', { settings: { mode: 'write', writeFormat: 'script', variationCount: 2.5 } }))).toBe(3)
  })
})

describe('typed-in inputs', () => {
  it('runs a Voiceovers block off a script typed into it', () => {
    const g: FlowGraph = { blocks: [block('voc', 'voice', { settings: { scriptText: 'Three weeks in and my skin is calmer.' } })], wires: [] }
    const plan = planFlow(g, {}, deps)
    expect(plan.blocks.voc.blocked).toBeUndefined()
    expect(plan.blocks.voc.runs).toBe(1)
    expect(plan.blocks.voc.instances[0].inputs.script[0].payload).toEqual({ text: 'Three weeks in and my skin is calmer.' })
  })

  it('says a script can be typed in when there is none', () => {
    const g: FlowGraph = { blocks: [block('voc', 'voice')], wires: [] }
    expect(planFlow(g, {}, deps).blocks.voc.blocked).toBe('Needs a script. Wire one in, or type one into it')
  })

  it('lets a wired script win over the typed one', () => {
    const g = serumLaunch(3)
    const voc = g.blocks.find((b) => b.id === 'voc')!
    voc.settings = { ...voc.settings, scriptText: 'A typed script nobody reads.' }
    const plan = planFlow(g, {}, deps)
    expect(plan.blocks.voc.runs).toBe(3)
    expect(plan.blocks.voc.instances.every((i) => i.inputs.script.length === 1 && i.inputs.script[0].pending)).toBe(true)
  })

  it("puts a script typed into Edit Pack into every pack, until one is wired", () => {
    const g: FlowGraph = {
      blocks: [block('chr', 'characters', { items: slots('f', 2), settings: { count: 2 } }), block('brl', 'broll', { settings: { scriptText: 'Shoot this.' } }), block('edt', 'edit', { settings: { scriptText: 'Caption this.' } })],
      wires: [wire('chr', 'all', 'brl', 'character'), wire('brl', 'clips', 'edt', 'clips')],
    }
    const plan = planFlow(g, {}, deps)
    expect(plan.blocks.edt.runs).toBe(2)
    expect(plan.blocks.edt.instances.every((i) => (i.inputs.script[0].payload as { text: string }).text === 'Caption this.')).toBe(true)
    // A typed script isn't a setting: the packs keep their identity when it's cleared.
    expect(generationSettings(g.blocks[2])).toEqual({})
  })

  it('re-runs when the typed script changes, and only then', () => {
    const g: FlowGraph = { blocks: [block('voc', 'voice', { settings: { scriptText: 'First take.' } })], wires: [] }
    const { outputs } = runAll(g, {})
    expect(planFlow(g, outputs, deps).planned).toEqual([])
    g.blocks[0].settings = { ...g.blocks[0].settings, scriptText: 'Second take.' }
    expect(planFlow(g, outputs, deps).planned).toEqual(['voc'])
  })
})

describe("the member's own ad", () => {
  const ad = (ref: string) => block('ad', 'bank', { settings: { bank: 'swipes', upload: { ref, name: 'my-winner.mp4', seconds: 21 } } })
  const analyze = (ref: string): FlowGraph => ({ blocks: [ad(ref), block('an', 'analyzer')], wires: [wire('ad', 'out', 'an', 'ad')] })

  it('reads an ad dropped into an ad block, and only there', () => {
    expect(adUploadOf(ad('asset-1'))).toEqual({ ref: 'asset-1', name: 'my-winner.mp4', seconds: 21, size: undefined, thumb: undefined })
    expect(adUploadOf(block('p', 'bank', { settings: { bank: 'products', upload: { ref: 'asset-1' } } }))).toBeNull()
    expect(adUploadOf(block('s', 'bank', { settings: { bank: 'swipes', upload: { name: 'no file' } } }))).toBeNull()
    expect(titleOf(ad('asset-1'))).toBe('Your Ad')
    expect(titleOf({ ...ad('asset-1'), label: 'The Winning Ad' })).toBe('The Winning Ad')
    expect(outsOf(ad('asset-1'))[0]).toMatchObject({ label: 'Your Ad', type: 'ad' })
  })

  it('analyzes it, priced on its length, with nothing from Outliers or the Swipe File', () => {
    const plan = planFlow(analyze('asset-1'), {}, deps)
    expect(plan.blocks.an.blocked).toBeUndefined()
    expect(plan.blocks.an.runs).toBe(1)
    expect(plan.blocks.an.instances[0].inputs.ad[0].payload).toMatchObject({ uploadRef: 'asset-1', fileName: 'my-winner.mp4', durationSeconds: 21 })
  })

  it('analyzes it once, and again only when another ad is dropped in', () => {
    const g = analyze('asset-1')
    const { outputs } = runAll(g, {})
    expect(planFlow(g, outputs, deps).planned).toEqual([])
    expect(planFlow(analyze('asset-2'), outputs, deps).planned).toEqual(['an'])
  })

  it('stands in for a saved pick: the dropped ad is what the block hands on', () => {
    const g = analyze('asset-1')
    g.blocks[0].pick = 'swipe-9'
    expect(planFlow(g, {}, deps).blocks.an.instances[0].inputs.ad[0].key).toBe(uploadedAdValue({ ref: 'asset-1', name: 'x' }).key)
  })
})

describe('new inputs', () => {
  it('runs Outliers once per search a List wires in', () => {
    const g: FlowGraph = {
      blocks: [
        block('list', 'list', { items: slots('l', 2), settings: { entries: ['vitamin c serum', 'retinol cream'] } }),
        block('out', 'outliers', { items: slots('a', 5) }),
      ],
      wires: [wire('list', 'all', 'out', 'query')],
    }
    const plan = planFlow(g, {}, deps)
    expect(plan.blocks.out.runs).toBe(2)
  })

  it("gives Playground's video tab a start and an end frame, and takes them away with it", () => {
    const g: FlowGraph = {
      blocks: [
        block('chr', 'characters', { source: 'bank', pick: 'maya' }),
        block('pg', 'playground', { settings: { mode: 'video' } }),
      ],
      wires: [],
    }
    expect(canConnect(g, { from: 'chr', fromPort: 'all', to: 'pg', toPort: 'start' }).ok).toBe(true)
    g.blocks[1].settings = { ...g.blocks[1].settings, mode: 'image' }
    expect(canConnect(g, { from: 'chr', fromPort: 'all', to: 'pg', toPort: 'start' }).ok).toBe(false)
  })
  it("keeps a Music block's References wire, so switching to Music never re-keys a made track", () => {
    const g: FlowGraph = {
      blocks: [
        block('chr', 'characters', { source: 'bank', pick: 'maya' }),
        block('pg', 'playground', { settings: { mode: 'music' } }),
      ],
      wires: [],
    }
    expect(canConnect(g, { from: 'chr', fromPort: 'all', to: 'pg', toPort: 'refs' }).ok).toBe(true)
  })
})

describe('generations', () => {
  const g = (): FlowGraph => ({
    blocks: [
      block('sc', 'scripts', { items: slots('h', 3) }),
      block('br', 'broll'),
    ],
    wires: [wire('sc', 'all', 'br', 'script')],
  })

  it('counts one per run, or one per slot of a batch, by default', () => {
    expect(planFlow(g(), {}, deps).generations).toBe(3 + 3)
  })

  it('counts what a run really starts when the deps say so', () => {
    const counted: PlanDeps = { ...deps, generations: (b, _inputs, n) => (b.kind === 'broll' ? 9 : Math.max(1, n)) }
    expect(planFlow(g(), {}, counted).generations).toBe(3 + 3 * 9)
  })
})

describe('what a Scripts block\'s wiring decides', () => {
  const analyzer = block('an', 'analyzer')
  const scripts = block('scr', 'scripts', { settings: { mode: 'write', writeFormat: 'hooks' } })

  it('a winning ad wired in makes it a remix of three takes', () => {
    const [, settled] = settleScripts({ blocks: [analyzer, scripts], wires: [wire('an', 'transcript', 'scr', 'source')] })
    expect(scriptsMode(settled)).toBe('remix')
    expect(desiredSlots(settled)).toBe(3)
  })

  it("the ad's scenes wired in rebuild it scene by scene, as one take", () => {
    const [, settled] = settleScripts({ blocks: [analyzer, scripts], wires: [wire('an', 'scenes', 'scr', 'source')] })
    expect(rebuildsScenes(settled)).toBe(true)
    expect(desiredSlots(settled)).toBe(1)
  })

  it('unwired, the panel decides again', () => {
    const [, wired] = settleScripts({ blocks: [analyzer, scripts], wires: [wire('an', 'scenes', 'scr', 'source')] })
    const [, settled] = settleScripts({ blocks: [analyzer, wired], wires: [] })
    expect(scriptsMode(settled)).toBe('write')
    expect(desiredSlots(settled)).toBe(10)
  })

  it("re-keys nothing already made: the wiring isn't part of the block's identity", () => {
    const [, settled] = settleScripts({ blocks: [analyzer, scripts], wires: [wire('an', 'transcript', 'scr', 'source')] })
    expect(generationSettings(settled)).toEqual(generationSettings(scripts))
  })
})

describe('Scene Clips', () => {
  const script = '--- Scene 1: HOOK (00:00-00:04) ---\n[CHARACTER] says: "One."\n\n--- Scene 2: BODY (00:04-00:10) ---\n[CHARACTER] says: "Two, three."'
  const sceneDeps: PlanDeps = {
    ...deps,
    held: (b) => (b.kind === 'text' ? { outputs: { out: [{ type: 'text', key: 'text:1', label: 'script', payload: { text: script } }] } } : deps.held(b)),
    cost: () => 10,
  }
  const graph = (settings: Record<string, unknown> = {}): FlowGraph => ({
    blocks: [block('txt', 'text'), block('sc', 'scenes', { settings: { takes: 2, ...settings } }), block('edit', 'edit')],
    wires: [wire('txt', 'out', 'sc', 'script'), wire('sc', 'clips', 'edit', 'clips')],
  })
  const clip = (scene: number, take: number) => ({ ref: `r${scene}${take}`, scene, take })
  const made = (key: string, clips: Array<{ ref: string; scene: number; take: number }>, extra: Partial<InstanceResult> = {}): FlowOutputs => ({
    sc: { instances: { [key]: { key, trace: {}, at: 1, outputs: { clips: [{ type: 'video', key: 'scenes:v', label: 'ad', trace: {}, payload: { clips } }] }, ...extra } } },
  })

  it('films what a test left, and only that share is priced', () => {
    const key = planFlow(graph(), {}, sceneDeps).blocks.sc.instances[0].key
    const plan = planFlow(graph(), made(key, [clip(1, 0)], { test: true }), sceneDeps)
    expect(plan.blocks.sc.runs).toBe(1)
    // One of four clips (2 scenes × 2 takes) made: three quarters of the price.
    expect(plan.blocks.sc.credits).toBe(7.5)
  })

  it('is done once every scene has every take', () => {
    const key = planFlow(graph(), {}, sceneDeps).blocks.sc.instances[0].key
    const plan = planFlow(graph(), made(key, [clip(1, 0), clip(1, 1), clip(2, 0), clip(2, 1)]), sceneDeps)
    expect(plan.blocks.sc.runs).toBe(0)
  })

  it('hands on only the takes kept at review, under a key that says so', () => {
    const key = planFlow(graph(), {}, sceneDeps).blocks.sc.instances[0].key
    const all = [clip(1, 0), clip(1, 1), clip(2, 0), clip(2, 1)]
    const plan = planFlow(graph(), made(key, all, { keep: ['1:1', '2:0'] }), sceneDeps)
    const v = plan.blocks.sc.values.clips[0]
    expect(v.type === 'video' && v.payload.clips.map((c) => c.ref)).toEqual(['r11', 'r20'])
    expect(v.key).not.toBe('scenes:v')
  })
})

describe('settling a Scripts chain', () => {
  it('settles a chain of Scripts blocks in one pass, and forgets a deleted source', () => {
    const g: FlowGraph = {
      blocks: [
        block('an', 'analyzer'),
        block('s1', 'scripts'),
        block('s2', 'scripts'),
        block('s3', 'scripts'),
      ],
      wires: [wire('an', 'scenes', 's1', 'source'), wire('s1', 'all', 's2', 'source'), wire('s2', 'all', 's3', 'source')],
    }
    const settled = settleScripts(g)
    expect(settled.map((b) => b.settings.sourceWired)).toEqual([undefined, 'scenes', 'scenes', 'scenes'])
    const gone = settleScripts({ blocks: settled.filter((b) => b.id !== 'an'), wires: g.wires })
    expect(gone.find((b) => b.id === 's1')?.settings.sourceWired).toBeUndefined()
  })
})

describe('character variants', () => {
  function variants(withBase: boolean): FlowGraph {
    return {
      blocks: [
        block('base', 'bank', { pick: 'maya', settings: { bank: 'models' } }),
        block('aud', 'list', { settings: { entries: ['Asian-American', 'African-American', 'Latina'] }, items: slots('a', 3) }),
        block('chr', 'characters'),
      ],
      wires: [
        ...(withBase ? [wire('base', 'out', 'chr', 'photo')] : []),
        wire('aud', 'all', 'chr', 'change'),
      ],
    }
  }

  it('makes one run per change off the one character', () => {
    const plan = planFlow(variants(true), {}, deps)
    expect(plan.blocks.chr.runs).toBe(3)
    expect(plan.blocks.chr.instances.map((i) => i.inputs.change?.[0]?.label)).toEqual(['Asian-American', 'African-American', 'Latina'])
  })

  it('says a change needs a picture to edit', () => {
    const plan = planFlow(variants(false), {}, deps)
    expect(plan.blocks.chr.runs).toBe(0)
    expect(plan.blocks.chr.blocked).toMatch(/Reference Photo/)
  })
})
