// Describe It and Ask Flow: a chat model builds and edits flows from plain
// language. It works because the block set is small and typed — the prompt
// hands the model the whole catalog, the names (never the images) of the
// member's bank rows, and for Ask Flow the flow as it stands. It PROPOSES; the
// template validator checks every block and wire, drops what doesn't fit and
// says what it changed, and the member sees the plan before accepting.
// Accepting never runs anything.
//
// One chat call on the default model, well under a credit. A reply cut off
// at the token limit throws TruncatedResponseError and applies nothing.

import type { FlowBlock, FlowDoc, FlowGraph, FlowWire } from '../types'
import { ACCEPTS, BANK_ORDER, BANK_TYPE, KINDS, PRODUCTION_ORDER, TYPE_META, blockWidth, isKnownKind, titleOf } from '../engine/catalog'
import { canConnect } from '../engine/graph'
import { COLUMN_GAP, ROW_GAP, estimatedSize, laidOut } from '../engine/layout'
import { validateTemplate, FORMAT, type FlowTemplateFile } from './io'
import { withSlots, shortId } from '../store/blocks'
import { useBankStore } from '../../../stores/bankStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { kieChatCompletions, type ChatMessage } from '../../../utils/kie'
import { CHAT_MODEL_DEFAULT, getChatTarget } from '../../../utils/models'
import { FriendlyError } from '../../../utils/friendlyError'
import { HOOK_CATEGORY_META, HOOK_COUNTS, VARIATION_COUNTS, WRITE_LENGTHS, WRITE_STYLE_META } from '../../script-architect/types'
import { VOICES, VOICE_ACCENTS, VOICE_PACES, VOICE_STYLES } from '../../voice-studio/types'
import { CONTINUOUS_STYLES } from '../../../utils/visualStyle'

// ── The catalog, as the model reads it ─────────────────────────────────────

function catalogText(): string {
  const types = Object.entries(TYPE_META).map(([t, m]) => `${t} (${m.label})`).join(', ')
  const accepts = Object.entries(ACCEPTS).map(([input, outs]) => `  an input of type ${input} accepts outputs of type ${outs.join(' | ')}`).join('\n')
  const kinds = PRODUCTION_ORDER.map((k) => {
    const spec = KINDS[k]
    const ins = spec.ins.map((p) => `${p.key}:${p.type}${p.required ? ' (required)' : ''}${p.many ? ' (takes many)' : ''}`).join(', ') || 'none'
    const outs = k === 'bank' ? 'out: typed by its bank' : spec.outs.map((p) => `${p.key}:${p.type}`).join(', ') || 'none'
    return `- ${k} — "${spec.title}". Inputs: ${ins}. Outputs: ${outs}.${spec.itemNoun ? ` Makes a batch: each ${spec.itemNoun.toLowerCase()} also has its own output port "item:<slot id>", but prefer the "all" port.` : ''}`
  }).join('\n')
  const banks = BANK_ORDER.map((b) => `${b} → ${BANK_TYPE[b].type}`).join(', ')
  return `PORT TYPES: ${types}

WIRING RULES:
${accepts}

BLOCK KINDS:
${kinds}

BANK BLOCKS: settings.bank is one of ${banks}; "pick" is the id of a row in that bank.

SETTINGS BY KIND (anything omitted takes the app's default):
- scripts: mode "write" | "remix"; writeFormat "hooks" | "script" | "scenes"; writeStyle one of ${Object.keys(WRITE_STYLE_META).join(', ')}; writeLength one of ${WRITE_LENGTHS.join(', ')} (seconds); hookCategory one of ${Object.keys(HOOK_CATEGORY_META).join(', ')}; hookCount one of ${HOOK_COUNTS.join(', ')}; variationCount one of ${VARIATION_COUNTS.join(', ')}; brief (text); additionalContext (text). Remix needs a transcript wired into "source".
- voice: voiceId one of ${VOICES.map((v) => `${v.id} (${v.gender ?? '?'}, ${v.description})`).join('; ')}; style one of ${VOICE_STYLES.join(', ')}; pace one of ${VOICE_PACES.join(', ')}; accent one of ${VOICE_ACCENTS.join(', ')}.
- characters: count 1-4; kind "portrait" | "sheet"; profile: an object of free-text fields among gender, age, ethnicity, bodyType, skinTone, hairColor, hairStyle, clothingStyle, expression, pose, location, lighting.
- broll: delivery "silent" (b-roll under a voiceover) | "dialogue" (the character speaks each line); takes 1-3 stills per script line; animate true | false; styleId one of ${CONTINUOUS_STYLES.map((s) => s.id).join(', ')}; aspectRatio "9:16" | "16:9" | "1:1"; context (text).
- playground: mode "image" | "video" | "music"; prompt (text).
- outliers: platform "tiktok" | "instagram" | "meta"; query (text); count 1-20.
- text: text. list: entries (array of strings, one run downstream per entry). note: text.
- analyzer, edit: no settings.

BLOCK FLAGS: "review": true pauses the flow after that block so the member keeps only the results worth spending more on (scripts, characters, voice, broll, playground). "field": true on a bank block makes it something whoever runs the flow picks ("Your Product").`
}

function banksText(): string {
  const s = useBankStore.getState()
  const list = (name: string, rows: Array<{ id: string; label: string }>) =>
    rows.length ? `${name}: ${rows.slice(0, 30).map((r) => `${r.id} = "${r.label.slice(0, 60)}"`).join('; ')}` : `${name}: (empty)`
  return [
    list('products', s.products.map((p) => ({ id: p.id, label: p.productName }))),
    list('models (characters)', s.models.map((m) => ({ id: m.id, label: m.name }))),
    list('voices (voice presets)', s.voices.map((v) => ({ id: v.id, label: v.label }))),
    list('styles', s.styles.map((x) => ({ id: x.id, label: x.name }))),
    list('scripts', s.scripts.map((x) => ({ id: x.id, label: x.title }))),
    list('swipes (saved ads)', s.swipes.map((x) => ({ id: x.id, label: x.caption || x.authorHandle }))),
  ].join('\n')
}

function graphText(graph: FlowGraph): string {
  return JSON.stringify({
    blocks: graph.blocks.filter((b) => !b.suggested).map((b) => ({ id: b.id, kind: b.kind, label: b.label, settings: b.settings, source: b.source, pick: b.pick, review: b.review, field: b.field, items: b.items?.map((it) => it.id) })),
    wires: graph.wires.map((w) => ({ from: w.from, fromPort: w.fromPort, to: w.to, toPort: w.toPort })),
  })
}

async function ask(system: string, user: string): Promise<unknown> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  if (!apiKey) throw new FriendlyError('Add your kie.ai API key in Settings to use this.')
  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: system }] },
    { role: 'user', content: [{ type: 'text', text: user }] },
  ]
  const text = await kieChatCompletions(apiKey, getChatTarget(CHAT_MODEL_DEFAULT), messages, { timeoutMs: 180_000 })
  const json = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim()
  const start = json.indexOf('{')
  const end = json.lastIndexOf('}')
  if (start < 0 || end < start) throw new FriendlyError("Flow couldn't read that answer. Try saying it another way.")
  try {
    return JSON.parse(json.slice(start, end + 1))
  } catch {
    throw new FriendlyError("Flow couldn't read that answer. Try saying it another way.")
  }
}

type SizeOf = (id: string) => { width: number; height: number } | undefined


// A block Ask Flow added goes one column right of whatever feeds it, below
// anything already in that column, so it lands beside the work it belongs to
// rather than off past the end of the flow.
function placeBeside(graph: FlowGraph, id: string, sizeOf: SizeOf): FlowBlock[] {
  const size = (b: FlowBlock) => sizeOf(b.id) ?? estimatedSize(b)
  const block = graph.blocks.find((b) => b.id === id)
  const feed = graph.wires.find((w) => w.to === id)
  const upstream = feed && graph.blocks.find((b) => b.id === feed.from)
  if (!block || !upstream) return graph.blocks
  const x = upstream.x + size(upstream).width + COLUMN_GAP
  const own = size(block)
  let y = upstream.y
  const column = graph.blocks
    .filter((b) => b.id !== id && b.x < x + own.width && b.x + size(b).width > x)
    .sort((a, b) => a.y - b.y)
  for (const b of column) {
    if (y < b.y + size(b).height + ROW_GAP && y + own.height + ROW_GAP > b.y) y = b.y + size(b).height + ROW_GAP
  }
  return graph.blocks.map((b) => (b.id === id ? { ...b, x, y } : b))
}

// Bank picks the model made up, or that point at a row that isn't there,
// become fields to fill instead.
function checkPicks(blocks: FlowBlock[], changes: string[]): FlowBlock[] {
  const s = useBankStore.getState()
  return blocks.map((b) => {
    if (b.kind !== 'bank' || !b.pick) return b
    const bank = (b.settings.bank as keyof typeof BANK_TYPE) ?? 'products'
    const rows = (s as unknown as Record<string, Array<{ id: string }>>)[bank] ?? []
    if (rows.some((r) => r.id === b.pick)) return b
    changes.push(`${b.label ?? BANK_TYPE[bank].one} needs picking from your bank.`)
    return { ...b, pick: undefined, field: true }
  })
}

// ── Describe It ────────────────────────────────────────────────────────────

const DESCRIBE_SYSTEM = () => `You design flows for UGC OS Flow: a canvas where each block is an app that makes part of a UGC ad, wired together so one run makes a batch of ads.

${catalogText()}

Return ONLY a JSON object, no prose, shaped:
{"name": "Short Title Case Name", "blocks": [{"id": "short-id", "kind": "...", "label": "optional title", "settings": {...}, "pick": "bank row id, bank blocks only", "field": true|false, "review": true|false}], "wires": [{"from": "block id", "fromPort": "output key", "to": "block id", "toPort": "input key"}], "notes": ["one or two sentences for the member"]}

Rules:
- Only use the kinds, ports and settings above. Every wire must follow the wiring rules.
- Use a bank block for the member's product and character. If the member names one that's in their bank, set "pick" to its id; otherwise leave "pick" out and set "field": true.
- Put "review": true on Scripts that write several hooks or takes, and on B-Roll, so the member keeps the good ones before paying for more.
- End with an "edit" block (Edit Pack) when the flow makes clips, wired to the clips and the voiceover.
- Keep it as small as the request allows. Never more than 20 blocks.`

export async function describeFlow(request: string): Promise<{ file: FlowTemplateFile; changes: string[] }> {
  const raw = await ask(DESCRIBE_SYSTEM(), `The member's bank:\n${banksText()}\n\nWhat they want:\n${request.trim()}`)
  const parsed = validateTemplate({ ...(raw as object), format: FORMAT, formatVersion: 1, template: { id: 'described', version: 1 }, fields: [] }, { described: true })
  const changes = [...parsed.changes]
  // The validator strips picks (a template never carries one); a described
  // flow is the member's own, so its picks go back on, then get checked.
  const rawBlocks = Array.isArray((raw as { blocks?: unknown }).blocks) ? (raw as { blocks: Array<{ id?: unknown; pick?: unknown }> }).blocks : []
  const picked = new Map(rawBlocks.map((b) => [String(b.id), typeof b.pick === 'string' ? b.pick : undefined]))
  const blocks = checkPicks(parsed.file.blocks.map((b) => ({ ...b, pick: picked.get(b.id) })), changes).map(withSlots)
  if (!blocks.some((b) => isKnownKind(b.kind))) throw new FriendlyError("Flow couldn't build that. Try naming what you want made: scripts, voiceovers, B-Roll.")
  const graph = laidOut({ blocks, wires: parsed.file.wires })
  return { file: { ...parsed.file, blocks: graph.blocks, wires: graph.wires }, changes }
}

// ── Ask Flow ───────────────────────────────────────────────────────────────

type Op =
  | { op: 'add_block'; id: string; kind: string; label?: string; settings?: Record<string, unknown>; pick?: string; review?: boolean; field?: boolean }
  | { op: 'remove_block'; id: string }
  | { op: 'wire'; from: string; fromPort: string; to: string; toPort: string }
  | { op: 'unwire'; from: string; fromPort?: string; to: string; toPort?: string }
  | { op: 'set_setting'; block: string; key: string; value: unknown }
  | { op: 'set_review'; block: string; on: boolean }
  | { op: 'set_label'; block: string; label: string }
  | { op: 'set_off'; block: string; off: boolean }

const ASK_SYSTEM = () => `You edit an existing UGC OS Flow on the member's behalf.

${catalogText()}

Return ONLY a JSON object, no prose, shaped:
{"summary": "one sentence saying what you changed", "ops": [ ... ]}

Operations:
- {"op": "add_block", "id": "new-id", "kind": "...", "label": "optional", "settings": {...}, "pick": "bank row id", "review": true|false, "field": true|false}
- {"op": "remove_block", "id": "..."}
- {"op": "wire", "from": "block id", "fromPort": "output key or item:<slot id>", "to": "block id", "toPort": "input key"}
- {"op": "unwire", "from": "block id", "to": "block id"}
- {"op": "set_setting", "block": "block id", "key": "setting name", "value": ...}
- {"op": "set_review", "block": "block id", "on": true|false}
- {"op": "set_label", "block": "block id", "label": "..."}
- {"op": "set_off", "block": "block id", "off": true|false}

To try something on one item of a batch (one hook), add a block and wire it from that item's port "item:<slot id>" — the slot ids are in the flow's "items". To make more of something, set its count setting (hookCount, variationCount, count).`

export interface AskResult {
  graph: FlowGraph
  summary: string
  changes: string[]
  // The blocks the edit added or changed, for the canvas to bring into view.
  touched: string[]
}

export async function askFlow(doc: FlowDoc, request: string, sizeOf: SizeOf = () => undefined): Promise<AskResult> {
  const raw = await ask(ASK_SYSTEM(), `The member's bank:\n${banksText()}\n\nThe flow:\n${graphText(doc)}\n\nWhat they want:\n${request.trim()}`) as { summary?: unknown; ops?: unknown }
  const ops = Array.isArray(raw.ops) ? (raw.ops as Op[]) : []
  const changes: string[] = []
  let blocks = doc.blocks.filter((b) => !b.suggested).map((b) => ({ ...b, settings: { ...b.settings } }))
  let wires: FlowWire[] = [...doc.wires]
  const ids = new Map<string, string>()
  const idOf = (id: string) => ids.get(id) ?? id
  const rightmost = blocks.reduce((m, b) => Math.max(m, b.x + blockWidth(b.kind)), 0)
  const added: string[] = []
  const touched = new Set<string>()

  for (const op of ops) {
    if (!op || typeof op !== 'object') continue
    switch (op.op) {
      case 'add_block': {
        if (!isKnownKind(op.kind)) {
          changes.push(`Skipped a block of a kind Flow doesn't have (${String(op.kind)}).`)
          break
        }
        const id = shortId(op.kind)
        ids.set(op.id, id)
        touched.add(id)
        const spec = KINDS[op.kind]
        blocks.push(withSlots({
          id,
          kind: op.kind,
          label: typeof op.label === 'string' ? op.label.slice(0, 80) : undefined,
          x: rightmost + COLUMN_GAP,
          y: added.length * 240,
          settings: { ...spec.defaults(), ...(op.settings && typeof op.settings === 'object' ? op.settings : {}) },
          source: spec.sources[0],
          pick: typeof op.pick === 'string' ? op.pick : undefined,
          review: op.review === true || undefined,
          field: op.field === true || undefined,
        }))
        added.push(id)
        break
      }
      case 'remove_block': {
        const id = idOf(op.id)
        blocks = blocks.filter((b) => b.id !== id)
        wires = wires.filter((w) => w.from !== id && w.to !== id)
        break
      }
      case 'wire': {
        const wire = { from: idOf(op.from), fromPort: String(op.fromPort), to: idOf(op.to), toPort: String(op.toPort) }
        const check = canConnect({ blocks, wires }, wire)
        if (check.ok) {
          wires.push({ ...wire, id: shortId('w') })
          touched.add(wire.from).add(wire.to)
        } else {
          const target = blocks.find((b) => b.id === wire.to)
          changes.push(`Left out a wire into ${target ? titleOf(target) : 'a block'}: ${check.reason}`)
        }
        break
      }
      case 'unwire': {
        const from = idOf(op.from)
        const to = idOf(op.to)
        wires = wires.filter((w) => !(w.from === from && w.to === to && (!op.fromPort || w.fromPort === op.fromPort) && (!op.toPort || w.toPort === op.toPort)))
        break
      }
      case 'set_setting': {
        const id = idOf(op.block)
        touched.add(id)
        blocks = blocks.map((b) => (b.id === id && typeof op.key === 'string' ? withSlots({ ...b, settings: { ...b.settings, [op.key]: op.value } }) : b))
        break
      }
      case 'set_review': {
        const id = idOf(op.block)
        touched.add(id)
        blocks = blocks.map((b) => (b.id === id ? { ...b, review: op.on === true || undefined } : b))
        break
      }
      case 'set_label': {
        const id = idOf(op.block)
        touched.add(id)
        blocks = blocks.map((b) => (b.id === id ? { ...b, label: String(op.label).slice(0, 80) } : b))
        break
      }
      case 'set_off': {
        const id = idOf(op.block)
        touched.add(id)
        blocks = blocks.map((b) => (b.id === id ? { ...b, off: op.off === true || undefined } : b))
        break
      }
    }
  }
  blocks = checkPicks(blocks, changes)
  for (const id of added) blocks = placeBeside({ blocks, wires }, id, sizeOf)
  const summary = typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : ops.length ? 'Done.' : 'Nothing to change.'
  const live = new Set(blocks.map((b) => b.id))
  return { graph: { blocks, wires }, summary, changes, touched: [...touched].filter((id) => live.has(id)) }
}
