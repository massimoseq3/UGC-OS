// Templates: a flow minus the author's own stuff. The author's product,
// character and anything else picked from a bank become labelled fields; a
// past result reused From History goes back to Generate with the settings it
// was made with; images ride inside the file. Everything else travels as is.
//
// A template is DATA, never code — no scripts, no expressions, prompts are
// plain text — and every import is validated: unknown kinds are kept but
// can't run ("Update UGC OS to use this block"), incompatible wires are
// dropped, sizes are capped, and a model this build doesn't have falls back to
// the app's default. It never carries an asset ref or a URL into anyone's
// storage — members can't read each other's R2 prefix — only images embedded
// by file name, which the importer saves into their own.
//
// The same JSON is the clipboard: copy blocks out of one flow, paste them
// into another — or paste a template's flow.json straight onto a canvas.

import type { BankType } from '../../../utils/constants'
import type { AdUpload, FlowBlock, FlowDoc, FlowGraph, FlowWire } from '../types'
import { BANK_TYPE, isBatch, isKnownKind, KINDS, sourceOf, titleOf } from '../engine/catalog'
import { adUploadOf, uploadedAdValue } from '../engine/ownAd'
import { canConnect } from '../engine/graph'
import { getBlob, saveAsset } from '../../../utils/assetStore'
import { getModel } from '../../../utils/models'
import { FriendlyError } from '../../../utils/friendlyError'
import { bankRowValue, heldValues } from '../engine/held'
import { planFlow } from '../engine/plan'
import { blockCost } from '../engine/cost'
import { useAppStore } from '../../../stores/appStore'

export const FORMAT = 'ugcflow'
export const FORMAT_VERSION = 1

// Caps: 60 blocks, 8 embedded images of 2 MB each.
export const MAX_BLOCKS = 60
export const MAX_IMAGES = 8
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

export type FieldKind = { bank: BankType } | 'text' | 'image'

export interface TemplateField {
  blockId: string
  title: string
  kind: FieldKind
  required: boolean
  // The author's pick, by name — what "Your Product" looked like when it ran.
  example?: string
}

export interface FlowTemplateFile {
  format: typeof FORMAT
  formatVersion: number
  template: { id: string; version: number; sourceUrl?: string }
  name: string
  description?: string
  author?: string
  blocks: FlowBlock[]
  wires: FlowWire[]
  fields: TemplateField[]
  notes?: string[]
  estimate?: number
}

// A template read off a file or the gallery, with its images still as blobs.
export interface LoadedTemplate {
  file: FlowTemplateFile
  assets: Record<string, Blob>
  // What validation changed, said once on import.
  changes: string[]
}

// ── Export ─────────────────────────────────────────────────────────────────

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'flow'
}

function bankOf(block: FlowBlock): BankType | null {
  if (block.kind === 'bank') return (block.settings.bank as BankType) ?? 'products'
  if (sourceOf(block) === 'bank') return block.kind === 'characters' ? 'models' : block.kind === 'scripts' ? 'scripts' : null
  return null
}

// A JPEG no larger than the cap, for an image riding inside a template.
async function jpegFor(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  for (const quality of [0.85, 0.7, 0.55]) {
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (out && out.size <= MAX_IMAGE_BYTES) return out
  }
  throw new FriendlyError('An image in this flow is too large to share. Swap it for a smaller one.')
}

export async function buildTemplate(doc: FlowDoc): Promise<{ file: FlowTemplateFile; assets: Record<string, Blob> }> {
  const fields: TemplateField[] = []
  const assets: Record<string, Blob> = {}
  const blocks: FlowBlock[] = []
  let imageCount = 0

  for (const source of doc.blocks.filter((b) => !b.suggested)) {
    const b: FlowBlock = structuredClone(source)
    delete b.pick
    const bank = bankOf(source)
    if (bank) {
      // An ad the author dropped in is theirs like a pick is: the field asks
      // the importer for their own, and the video never rides along.
      const upload = adUploadOf(source)
      if (upload) b.settings = Object.fromEntries(Object.entries(b.settings).filter(([k]) => k !== 'upload'))
      const example = upload ? uploadedAdValue(upload).label : source.pick ? bankRowValue(bank, source.pick)?.label : undefined
      b.field = true
      // An ad field takes a saved ad or the importer's own, so it isn't "Saved".
      b.label = source.label ?? (bank === 'swipes' ? 'Your Ad' : `Your ${BANK_TYPE[bank].one}`)
      fields.push({ blockId: b.id, title: b.label, kind: { bank }, required: true, example })
    } else if (KINDS[b.kind]?.runnable && sourceOf(b) === 'history') {
      // A past result belongs to the author's account; the importer makes
      // their own with the same settings.
      b.source = 'generate'
    }
    // A product or character picked inside an app block (Scripts' product
    // row, B-Roll's Character and Product cards) is a bank pick like any
    // other: it names a row only the author has. The importer picks their own
    // in the block, or wires one in.
    if (KINDS[b.kind]?.runnable) {
      const settings = { ...b.settings }
      delete settings.productId
      delete settings.characterId
      b.settings = settings
    }
    if (b.kind === 'image') {
      const ref = String(source.settings.ref ?? '')
      const settings = { ...b.settings }
      delete settings.ref
      if (ref && imageCount < MAX_IMAGES) {
        const blob = await getBlob(ref)
        if (blob) {
          imageCount += 1
          const name = `image-${imageCount}.jpg`
          assets[name] = await jpegFor(blob)
          settings.asset = name
        }
      }
      b.settings = settings
      if (source.field) fields.push({ blockId: b.id, title: titleOf(source), kind: 'image', required: !settings.asset })
    }
    if (b.kind === 'text' && source.field) {
      fields.push({ blockId: b.id, title: titleOf(source), kind: 'text', required: !String(source.settings.text ?? '').trim(), example: String(source.settings.text ?? '').slice(0, 80) })
    }
    blocks.push(b)
  }

  const plan = planFlow({ blocks: doc.blocks, wires: doc.wires }, {}, { held: heldValues, cost: blockCost })
  const notes = doc.blocks.filter((b) => b.kind === 'note').map((b) => String(b.settings.text ?? '')).filter(Boolean)
  const file: FlowTemplateFile = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    template: { id: doc.template?.id ?? slug(doc.name), version: doc.template?.version ?? 1, sourceUrl: doc.template?.sourceUrl },
    name: doc.name,
    blocks,
    wires: doc.wires.filter((w) => blocks.some((b) => b.id === w.from) && blocks.some((b) => b.id === w.to)),
    fields,
    notes,
    estimate: Math.round(plan.creditsAll),
  }
  return { file, assets }
}

// The Share button: the flow as a .ugcflow file — a zip of flow.json and its
// images.
export async function exportTemplate(doc: FlowDoc): Promise<void> {
  const addToast = useAppStore.getState().addToast
  try {
    const { file, assets } = await buildTemplate(doc)
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    zip.file('flow.json', JSON.stringify(file, null, 2))
    for (const [name, blob] of Object.entries(assets)) zip.file(`assets/${name}`, blob)
    const first = Object.values(assets)[0]
    if (first) zip.file('cover.jpg', first)
    const archive = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(archive)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug(doc.name)}.ugcflow`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    const fieldCount = file.fields.length
    addToast(
      fieldCount
        ? `Exported ${slug(doc.name)}.ugcflow. ${fieldCount === 1 ? 'Its bank pick becomes a field' : `Its ${fieldCount} bank picks become fields`} for whoever imports it.`
        : `Exported ${slug(doc.name)}.ugcflow.`,
      'success',
    )
  } catch (err) {
    addToast(err instanceof Error ? err.message : 'The flow could not be exported.', 'error')
  }
}

// ── Import ─────────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

// Settings a newer build wrote that this one can't run: unknown model ids
// fall back to the app's default (the pruneUnknownModelIds rule).
function sanitizeSettings(settings: unknown, changes: string[], title: string): Record<string, unknown> {
  const out: Record<string, unknown> = isObject(settings) ? { ...settings } : {}
  for (const key of ['modelId', 'videoModelId']) {
    const id = out[key]
    if (typeof id === 'string' && !getModel(id)) {
      delete out[key]
      changes.push(`${title} used a model this version doesn't have, so it uses the default.`)
    }
  }
  return out
}

// A file from a newer build keeps the blocks this one can't run and skips
// them. A flow Describe It drafted is different: a block kind that doesn't
// exist is one the model made up, so it's left out, and each dropped wire
// says why.
export function validateTemplate(raw: unknown, opts: { described?: boolean } = {}): { file: FlowTemplateFile; changes: string[] } {
  if (!isObject(raw) || raw.format !== FORMAT) throw new FriendlyError("That isn't a UGC OS flow file.")
  if (typeof raw.formatVersion === 'number' && raw.formatVersion > FORMAT_VERSION) {
    throw new FriendlyError('This flow was made with a newer UGC OS. Reload the app to update, then import it again.')
  }
  const changes: string[] = []
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : []
  if (rawBlocks.length > MAX_BLOCKS) throw new FriendlyError(`That flow has ${rawBlocks.length} blocks. Flows can have up to ${MAX_BLOCKS}.`)
  const blocks: FlowBlock[] = []
  const seen = new Set<string>()
  for (const rb of rawBlocks) {
    if (!isObject(rb) || typeof rb.id !== 'string' || seen.has(rb.id)) continue
    seen.add(rb.id)
    const kind = rb.kind as FlowBlock['kind']
    if (!isKnownKind(kind)) {
      if (opts.described) {
        changes.push(`Left out a block Flow doesn't have (${String(rb.kind).slice(0, 40)}).`)
        continue
      }
      changes.push('A block needs a newer UGC OS. It stays on the canvas and is skipped when the flow runs.')
    }
    const title = typeof rb.label === 'string' ? rb.label : isKnownKind(kind) ? KINDS[kind].title : 'A block'
    const block: FlowBlock = {
      id: rb.id,
      kind,
      label: typeof rb.label === 'string' ? rb.label.slice(0, 80) : undefined,
      x: Number(rb.x) || 0,
      y: Number(rb.y) || 0,
      settings: sanitizeSettings(rb.settings, changes, title),
      source: rb.source === 'generate' || rb.source === 'bank' || rb.source === 'history' ? rb.source : undefined,
      items: Array.isArray(rb.items)
        ? rb.items.filter(isObject).filter((it) => typeof it.id === 'string').slice(0, 50).map((it) => ({ id: String(it.id), off: it.off === true || undefined, deleted: it.deleted === true || undefined }))
        : undefined,
      review: rb.review === true || undefined,
      off: rb.off === true || undefined,
      field: rb.field === true || undefined,
    }
    // A template never carries a pick, a stored image ref or a dropped-in ad.
    delete block.settings.ref
    delete block.settings.upload
    blocks.push(block)
  }
  const graph: FlowGraph = { blocks, wires: [] }
  let dropped = 0
  for (const rw of Array.isArray(raw.wires) ? raw.wires : []) {
    if (!isObject(rw)) continue
    const wire = { from: String(rw.from), fromPort: String(rw.fromPort), to: String(rw.to), toPort: String(rw.toPort) }
    const known = blocks.find((b) => b.id === wire.from && isKnownKind(b.kind)) && blocks.find((b) => b.id === wire.to && isKnownKind(b.kind))
    if (!known) continue
    const check = canConnect(graph, wire)
    if (check.ok) graph.wires.push({ ...wire, id: typeof rw.id === 'string' ? rw.id : crypto.randomUUID() })
    else if (opts.described) {
      const to = blocks.find((b) => b.id === wire.to)
      changes.push(`Left out a wire into ${to ? titleOf(to) : 'a block'}: ${check.reason}`)
    }
    else dropped += 1
  }
  if (dropped) changes.push(`${dropped} ${dropped === 1 ? 'wire that no longer fits was' : 'wires that no longer fit were'} left out.`)

  const fields: TemplateField[] = (Array.isArray(raw.fields) ? raw.fields : []).filter(isObject).flatMap((f) => {
    const block = blocks.find((b) => b.id === f.blockId)
    if (!block) return []
    const kind = f.kind === 'text' || f.kind === 'image' ? f.kind
      : isObject(f.kind) && typeof f.kind.bank === 'string' && f.kind.bank in BANK_TYPE ? { bank: f.kind.bank as BankType }
      : null
    if (!kind) return []
    return [{ blockId: block.id, title: String(f.title ?? titleOf(block)).slice(0, 80), kind, required: f.required !== false, example: typeof f.example === 'string' ? f.example.slice(0, 120) : undefined }]
  })
  const tpl = isObject(raw.template) ? raw.template : {}
  return {
    file: {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      template: {
        id: String(tpl.id ?? 'imported').slice(0, 80),
        version: Number(tpl.version) || 1,
        sourceUrl: typeof tpl.sourceUrl === 'string' && /^https:\/\//.test(tpl.sourceUrl) ? tpl.sourceUrl : undefined,
      },
      name: String(raw.name ?? 'Imported Flow').slice(0, 80),
      description: typeof raw.description === 'string' ? raw.description.slice(0, 600) : undefined,
      author: typeof raw.author === 'string' ? raw.author.slice(0, 80) : undefined,
      blocks,
      wires: graph.wires,
      fields,
      notes: Array.isArray(raw.notes) ? raw.notes.filter((n): n is string => typeof n === 'string').slice(0, 10) : undefined,
      estimate: typeof raw.estimate === 'number' ? raw.estimate : undefined,
    },
    changes,
  }
}

export async function readTemplateFile(file: File): Promise<LoadedTemplate> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
  const zipped = head[0] === 0x50 && head[1] === 0x4b
  if (!zipped) {
    const parsed = validateTemplate(JSON.parse(await file.text()))
    return { file: parsed.file, assets: {}, changes: parsed.changes }
  }
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file)
  const json = zip.file('flow.json')
  if (!json) throw new FriendlyError("That file isn't a UGC OS flow. It has no flow.json inside.")
  const parsed = validateTemplate(JSON.parse(await json.async('string')))
  const assets: Record<string, Blob> = {}
  let count = 0
  for (const b of parsed.file.blocks) {
    const name = typeof b.settings.asset === 'string' ? b.settings.asset : null
    if (!name || !/^[\w.-]+\.(jpe?g|png|webp)$/i.test(name) || count >= MAX_IMAGES) continue
    const entry = zip.file(`assets/${name}`)
    if (!entry) continue
    const blob = await entry.async('blob')
    if (blob.size > MAX_IMAGE_BYTES) continue
    assets[name] = new Blob([blob], { type: 'image/jpeg' })
    count += 1
  }
  return { file: parsed.file, assets, changes: parsed.changes }
}

// A template's graph, ready for this account: embedded images saved into the
// importer's own storage, and each field's pick filled in.
export async function instantiate(
  loaded: LoadedTemplate,
  picks: Record<string, { pick?: string; text?: string; ref?: string; upload?: AdUpload }>,
): Promise<FlowGraph> {
  const blocks: FlowBlock[] = []
  for (const source of loaded.file.blocks) {
    const b: FlowBlock = structuredClone(source)
    const asset = typeof b.settings.asset === 'string' ? loaded.assets[b.settings.asset] : undefined
    if (b.kind === 'image' && asset) {
      b.settings = { ...b.settings, ref: await saveAsset(asset, 'image/jpeg') }
      delete b.settings.asset
    }
    const pick = picks[b.id]
    if (pick?.pick) b.pick = pick.pick
    if (pick?.upload && b.kind === 'bank') b.settings = { ...b.settings, upload: pick.upload }
    if (pick?.text !== undefined && b.kind === 'text') b.settings = { ...b.settings, text: pick.text }
    if (pick?.ref && b.kind === 'image') b.settings = { ...b.settings, ref: pick.ref }
    blocks.push(b)
  }
  return { blocks, wires: loaded.file.wires }
}

// ── Clipboard ──────────────────────────────────────────────────────────────

interface ClipFile {
  format: 'ugcflow-blocks'
  formatVersion: number
  blocks: FlowBlock[]
  wires: FlowWire[]
}

export function clipFromSelection(graph: FlowGraph, ids: string[]): string | null {
  const blocks = graph.blocks.filter((b) => ids.includes(b.id) && !b.suggested)
  if (!blocks.length) return null
  const inside = new Set(blocks.map((b) => b.id))
  const clip: ClipFile = {
    format: 'ugcflow-blocks',
    formatVersion: FORMAT_VERSION,
    blocks: blocks.map((b) => structuredClone(b)),
    wires: graph.wires.filter((w) => inside.has(w.from) && inside.has(w.to)),
  }
  return JSON.stringify(clip)
}

export type ParsedPaste = { ok: true; graph: FlowGraph; notes: string[] } | { ok: false; reason: string }

// Pasted text → blocks. Our own clipboard keeps its picks (it's the member's
// own account); a template's flow.json goes through the validator.
export function parseFlowJson(text: string): ParsedPaste {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: "The clipboard doesn't hold blocks from a flow." }
  }
  if (isObject(raw) && raw.format === 'ugcflow-blocks' && Array.isArray(raw.blocks)) {
    const asTemplate = validateTemplate({ ...raw, format: FORMAT, fields: [] })
    const picks = new Map((raw.blocks as FlowBlock[]).map((b) => [b.id, b]))
    const blocks = asTemplate.file.blocks.map((b) => {
      const original = picks.get(b.id)
      const upload = original ? adUploadOf(original) : null
      return {
        ...b,
        pick: original?.pick,
        settings: {
          ...b.settings,
          ...(original?.kind === 'image' && original.settings.ref ? { ref: original.settings.ref } : {}),
          ...(upload ? { upload } : {}),
        },
      }
    })
    return { ok: true, graph: { blocks, wires: asTemplate.file.wires }, notes: [] }
  }
  try {
    const parsed = validateTemplate(raw)
    return { ok: true, graph: { blocks: parsed.file.blocks, wires: parsed.file.wires }, notes: parsed.changes }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "The clipboard doesn't hold blocks from a flow." }
  }
}

// How many runs a template's batch blocks would make — for the gallery card.
export function templateBlockCount(file: FlowTemplateFile): number {
  return file.blocks.filter((b) => isKnownKind(b.kind) && (KINDS[b.kind].runnable || isBatch(b))).length
}
