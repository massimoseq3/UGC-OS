// The Flows execution engine. Topologically walks the canvas and calls each
// app's existing service functions directly — never the one-slot inter-app
// payload, which is a UI handoff, not a data bus. Every generated output is
// pushed into the matching history bank so (a) it shows up in the source app,
// (b) the Dashboard's usage ledger counts it, and (c) the orphan-cleanup
// sweep sees a bank reference and never deletes the asset.

import { useFlowStore } from '../stores/flowStore'
import { useBankStore } from '../../../stores/bankStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { humanizeError } from '../../../utils/friendlyError'
import { saveAsset } from '../../../utils/assetStore'
import { finishImageAssetTask } from '../../../utils/imageTask'
import {
  estimateCredits,
  getDefaultModel,
  getModel,
  snapVideoDuration,
  TTS_MODEL_ID,
  type VideoMode,
} from '../../../utils/models'

import { generateScript } from '../../script-architect/services/generateScript'
import type { EditableProductContext, ScriptMode } from '../../script-architect/types'
import { startVoiceTask, finishVoiceTask } from '../../voice-studio/services/generateVoice'
import { DEFAULT_VOICE_SETTINGS, getVoiceById, type VoiceSettings } from '../../voice-studio/types'
import { generateBroll, startImageTask } from '../../broll-studio/services/generateBroll'
import type { ReferenceImage } from '../../broll-studio/types'
import {
  startPlaygroundImageTask,
  finishPlaygroundImageTask,
  startPlaygroundVideoTask,
  finishPlaygroundVideoTask,
} from '../../playground/service'
import { analyzeAd } from '../../ad-anatomy/services/analyzeAd'
import { captureFirstFrame } from '../../ad-anatomy/utils/captureFirstFrame'

import type {
  BrollNodeConfig,
  CharacterNodeConfig,
  FlowNode,
  ImageNodeConfig,
  PortValue,
  ProductNodeConfig,
  ScriptNodeConfig,
  VideoNodeConfig,
  VoiceoverNodeConfig,
} from '../types'
import { getNodeFile } from './nodeFiles'

interface ExecCtx {
  node: FlowNode
  // Values grouped by target port id; multi ports may hold several.
  inputs: Record<string, PortValue[]>
  note: (text: string) => void
}

type Executor = (ctx: ExecCtx) => Promise<Record<string, PortValue>>

function first<T extends PortValue['type']>(
  values: PortValue[] | undefined,
  type: T,
): Extract<PortValue, { type: T }> | undefined {
  return values?.find((v): v is Extract<PortValue, { type: T }> => v.type === type)
}

// ── Executors ──────────────────────────────────────────────────────

const runProduct: Executor = async ({ node }) => {
  const cfg = node.data.config as ProductNodeConfig
  const row = cfg.productId
    ? useBankStore.getState().products.find((p) => p.id === cfg.productId)
    : undefined
  if (!row) throw new Error('Pick a product from the Bank in this node first.')
  return { product: { type: 'product', productId: row.id, name: row.productName } }
}

const runCharacter: Executor = async ({ node }) => {
  const cfg = node.data.config as CharacterNodeConfig
  const row = cfg.bankModelId
    ? useBankStore.getState().models.find((m) => m.id === cfg.bankModelId)
    : undefined
  if (!row) throw new Error('Pick a character from the Bank in this node first.')
  return { character: { type: 'character', bankModelId: row.id, imageRef: row.characterImage, name: row.name } }
}

const runAnalyzer: Executor = async ({ node, note }) => {
  const file = getNodeFile(node.id)
  const cfg = node.data.config as { fileName: string | null }
  if (!file) {
    throw new Error(
      cfg.fileName
        ? `Re-attach "${cfg.fileName}" — uploaded videos don't survive a refresh.`
        : 'Attach an ad video to this node first.',
    )
  }

  const bank = useBankStore.getState()
  const rowId = crypto.randomUUID()
  let thumbnailRef: string | undefined
  try {
    thumbnailRef = await saveAsset(await captureFirstFrame(file))
  } catch { /* thumbnail is cosmetic */ }
  await bank.addAdAnatomyHistory({
    id: rowId,
    createdAt: Date.now(),
    status: 'analyzing',
    adTitle: '',
    fileName: file.name,
    mediaKind: file.type.startsWith('image/') ? 'image' : 'video',
    thumbnailRef,
  })

  note('Watching the ad…')
  try {
    const result = await analyzeAd(file)
    await useBankStore.getState().updateAdAnatomyHistory(rowId, {
      status: 'complete',
      adTitle: result.adTitle || file.name,
      result,
    })
    const text = (result.transcript ?? []).map((t) => t.text).join('\n').trim()
    if (!text) throw new Error('The analysis came back without a transcript — try a different ad.')
    return { script: { type: 'script', text } }
  } catch (err) {
    await useBankStore.getState().updateAdAnatomyHistory(rowId, {
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

const runScript: Executor = async ({ node, inputs, note }) => {
  const cfg = node.data.config as ScriptNodeConfig
  const product = first(inputs.product, 'product')
  const transcript = first(inputs.script, 'script')
  const bank = useBankStore.getState()
  const row = product ? bank.products.find((p) => p.id === product.productId) : undefined

  const mode: ScriptMode = transcript?.text.trim() ? 'remix' : 'write'
  if (mode === 'write' && !cfg.brief.trim() && !row) {
    throw new Error('Write a brief in this node, or connect a Product or a transcript.')
  }
  const brief = cfg.brief.trim() || (row ? `Write a direct-response UGC ad for ${row.productName}.` : '')

  const productContext: EditableProductContext | null = row
    ? {
        productName: row.productName,
        productDescription: row.productDescription,
        targetMarket: row.targetMarket,
        painPoints: row.painPoints,
        usps: row.usps,
        benefits: row.benefits,
        keySpecs: row.keySpecs ?? '',
        customerLanguage: row.customerLanguage ?? '',
        objections: row.objections ?? '',
        offer: row.offer,
        cta: row.cta,
      }
    : null

  note(mode === 'remix' ? 'Remixing the transcript…' : 'Writing the script…')
  const result = await generateScript({
    mode,
    winningTranscript: transcript?.text ?? '',
    reversePrompt: '',
    brief,
    writeStyle: cfg.style,
    writeFormat: 'script',
    writeLength: cfg.length,
    productId: product?.productId ?? null,
    productName: row?.productName,
    productContext,
    additionalContext: '',
  })
  const text = result.variations[0]?.trim()
  if (!text) throw new Error('The script model returned nothing. Try again.')

  await bank.addScriptHistory({
    id: crypto.randomUUID(),
    mode,
    variations: result.variations,
    inputSummary: mode === 'remix' ? 'Flows: remix of connected transcript' : `Flows: ${brief.slice(0, 80)}`,
    linkedProductId: product?.productId,
    productName: row?.productName,
    winningTranscript: transcript?.text,
    brief: cfg.brief,
    writeStyle: cfg.style,
    writeFormat: 'script',
    writeLength: cfg.length,
    createdAt: Date.now(),
  })
  return { script: { type: 'script', text } }
}

const runVoiceover: Executor = async ({ node, inputs, note }) => {
  const cfg = node.data.config as VoiceoverNodeConfig
  const script = first(inputs.script, 'script')
  if (!script?.text.trim()) throw new Error('Connect a Script to this node first.')

  const catalogVoice = getVoiceById(cfg.voiceId)
  const settings: VoiceSettings = {
    voiceId: cfg.voiceId,
    voiceName: cfg.voiceName,
    gender: catalogVoice?.gender,
    ...DEFAULT_VOICE_SETTINGS,
  }
  note(`Recording with ${cfg.voiceName}…`)
  const { taskId } = await startVoiceTask(settings, script.text)
  const item = await finishVoiceTask(taskId, settings, script.text)
  await useBankStore.getState().addVoiceHistory(item)
  return { audio: { type: 'audio', assetRef: item.audioUrl } }
}

const runBroll: Executor = async ({ node, inputs, note }) => {
  const cfg = node.data.config as BrollNodeConfig
  const script = first(inputs.script, 'script')
  if (!script?.text.trim()) throw new Error('Connect a Script to this node first.')

  const bank = useBankStore.getState()
  const product = first(inputs.product, 'product')
  const character = first(inputs.character, 'character')
  const productRow = product ? bank.products.find((p) => p.id === product.productId) : undefined
  const modelRow = character ? bank.models.find((m) => m.id === character.bankModelId) : undefined

  const productContext = productRow
    ? `Product context:\nName: ${productRow.productName}\nDescription: ${productRow.productDescription}\nKey specs: ${productRow.keySpecs ?? ''}\nBenefits: ${productRow.benefits}`
    : ''
  const modelContext = modelRow
    ? `Character context:\nName: ${modelRow.name}. A visual reference image of the character is attached.`
    : ''

  const characterRef: ReferenceImage | undefined = modelRow
    ? { dataUrl: modelRow.characterImage, label: 'character' }
    : undefined
  const productRef: ReferenceImage | undefined = productRow?.productImage
    ? { dataUrl: productRow.productImage, label: 'product' }
    : undefined

  note('Breaking the script into scenes…')
  const { scenes } = await generateBroll({
    productId: product?.productId ?? null,
    modelId: character?.bankModelId ?? null,
    scriptId: null,
    scriptText: script.text,
    additionalContext: '',
    productContext,
    modelContext,
    referenceImages: [characterRef, productRef].filter(Boolean) as ReferenceImage[],
  })

  const chosen = scenes.slice(0, Math.max(1, cfg.maxScenes))
  if (chosen.length === 0) throw new Error('No scenes came back for this script.')
  note(`Shooting ${chosen.length} still${chosen.length === 1 ? '' : 's'}…`)

  const refs = await Promise.all(
    chosen.map(async (scene) => {
      // Prefer a visual (non-dialogue) take for the still — it makes a better
      // B-roll frame than another face-to-camera shot.
      const variation = scene.variations.find((v) => v.tag !== 'DIALOGUE') ?? scene.variations[0]
      if (!variation) return null
      const attach: ReferenceImage[] = []
      const wantsChar = variation.refs === 'character' || variation.refs === 'both'
      const wantsProd = (variation.refs === 'product' || variation.refs === 'both') && scene.productVisible !== false
      if (wantsChar && characterRef) attach.push(characterRef)
      if (wantsProd && productRef) attach.push(productRef)

      const { taskId, modelId } = await startImageTask(
        variation.prompt,
        attach.length > 0 ? attach : undefined,
        cfg.aspectRatio,
      )
      const assetRef = await finishImageAssetTask(taskId, modelId)
      // finishImageAssetTask (unlike B-Roll's finishImageTask) records no
      // usage — addImageHistory does, exactly once, and the history row is
      // what shields the asset from the orphan sweep.
      await useBankStore.getState().addImageHistory({
        id: crypto.randomUUID(),
        modelId,
        prompt: variation.prompt,
        aspectRatio: cfg.aspectRatio,
        imageUrl: assetRef,
        createdAt: Date.now(),
      })
      return assetRef
    }),
  )

  const done = refs.filter((r): r is string => !!r)
  if (done.length === 0) throw new Error('No scene stills were generated.')
  return { images: { type: 'image', refs: done } }
}

// If refs are attached but the picked model is text-to-image-only, hop to its
// image-to-image sibling (same trick startImageTask uses in B-Roll).
function resolveImageModel(modelId: string, hasRefs: boolean): string {
  const picked = getModel(modelId)
  if (!picked) return modelId
  const mode = hasRefs ? 'image-to-image' : 'text-to-image'
  if (picked.modes?.includes(mode)) return modelId
  if (hasRefs) {
    const family = picked.id.replace(/-(text-to-image|image-to-image|image-edit).*$/, '')
    const sibling = getModel(`${family}-image-to-image`)
    if (sibling) return sibling.id
    return getDefaultModel('playground', 'image', 'image-to-image')?.id ?? modelId
  }
  return modelId
}

const runImage: Executor = async ({ node, inputs, note }) => {
  const cfg = node.data.config as ImageNodeConfig
  if (!cfg.prompt.trim()) throw new Error('Write a prompt in this node first.')

  const bank = useBankStore.getState()
  const refs: string[] = []
  const character = first(inputs.character, 'character')
  if (character) refs.push(character.imageRef)
  const product = first(inputs.product, 'product')
  if (product) {
    const row = bank.products.find((p) => p.id === product.productId)
    if (row?.productImage) refs.push(row.productImage)
  }
  for (const v of inputs.image ?? []) {
    if (v.type === 'image') refs.push(...v.refs)
  }

  const modelId = resolveImageModel(cfg.modelId, refs.length > 0)
  note('Generating image…')
  const { taskId } = await startPlaygroundImageTask({
    prompt: cfg.prompt,
    modelId,
    aspectRatio: cfg.aspectRatio,
    referenceUrls: refs.length > 0 ? refs : undefined,
  })
  const item = await finishPlaygroundImageTask(taskId, modelId, {
    prompt: cfg.prompt,
    aspectRatio: cfg.aspectRatio,
  })
  return { image: { type: 'image', refs: [item.imageUrl] } }
}

const runVideo: Executor = async ({ node, inputs, note }) => {
  const cfg = node.data.config as VideoNodeConfig
  const model = getModel(cfg.modelId)
  if (!model) throw new Error('Pick a video model in this node first.')

  const startFrame = first(inputs.image, 'image')?.refs[0]
  if (!cfg.prompt.trim() && !startFrame) {
    throw new Error('Write a prompt or connect a start frame first.')
  }

  let mode: VideoMode = 'text-to-video'
  if (startFrame) {
    if (model.modes?.includes('image-to-video')) mode = 'image-to-video'
    else if (model.modes?.includes('reference-to-video')) mode = 'reference-to-video'
    else throw new Error(`${model.displayName} can't take an image input — pick another model.`)
  } else if (!model.modes?.includes('text-to-video')) {
    throw new Error(`${model.displayName} needs a start frame — connect an Image or B-Roll node.`)
  }

  const durations = model.videoConstraints?.durations ?? []
  const durationSeconds = durations.length > 0 ? snapVideoDuration(cfg.durationSeconds, durations) : cfg.durationSeconds
  const prompt = cfg.prompt.trim() || 'Animate this shot naturally: subtle handheld motion, lifelike movement, keep the framing.'

  note('Rendering video…')
  const { taskId, videoEndpoint } = await startPlaygroundVideoTask({
    prompt,
    modelId: cfg.modelId,
    mode,
    aspectRatio: cfg.aspectRatio,
    durationSeconds,
    resolution: cfg.resolution,
    audio: true,
    firstFrameUrl: mode === 'image-to-video' ? startFrame : undefined,
    referenceImageUrls: mode === 'reference-to-video' && startFrame ? [startFrame] : undefined,
  })
  const item = await finishPlaygroundVideoTask(taskId, cfg.modelId, videoEndpoint, {
    prompt,
    mode,
    aspectRatio: cfg.aspectRatio,
    durationSeconds,
    resolution: cfg.resolution,
    audio: true,
  })
  return { video: { type: 'video', assetRef: item.videoUrl } }
}

const EXECUTORS: Record<FlowNode['data']['kind'], Executor> = {
  product: runProduct,
  character: runCharacter,
  analyzer: runAnalyzer,
  script: runScript,
  voiceover: runVoiceover,
  broll: runBroll,
  image: runImage,
  video: runVideo,
}

// ── The run loop ───────────────────────────────────────────────────

export class MissingApiKeyError extends Error {
  constructor() { super('Add your kie.ai API key in Settings first.') }
}

export async function runFlow(): Promise<{ ok: boolean; failed: number }> {
  // getKieApiKey throws when unset — translate to the friendly Flows message
  // before any node starts.
  try {
    useSettingsStore.getState().getKieApiKey()
  } catch {
    throw new MissingApiKeyError()
  }

  const store = useFlowStore.getState()
  const { nodes, edges } = store
  for (const n of nodes) {
    store.setNodeRuntime(n.id, { status: 'idle', error: undefined, output: undefined, note: undefined })
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const outputs = new Map<string, Record<string, PortValue>>()
  const unrunnable = new Set<string>()
  const pending = new Set(nodes.map((n) => n.id))
  let failed = 0

  while (pending.size > 0) {
    const batch: string[] = []
    let progressed = false

    for (const id of [...pending]) {
      const incoming = edges.filter((e) => e.target === id)
      if (incoming.some((e) => unrunnable.has(e.source))) {
        pending.delete(id)
        unrunnable.add(id)
        useFlowStore.getState().setNodeRuntime(id, { status: 'skipped' })
        progressed = true
      } else if (incoming.every((e) => outputs.has(e.source))) {
        batch.push(id)
      }
    }

    if (batch.length > 0) {
      progressed = true
      await Promise.all(
        batch.map(async (id) => {
          pending.delete(id)
          const node = byId.get(id)!
          const setRuntime = useFlowStore.getState().setNodeRuntime
          setRuntime(id, { status: 'running' })
          try {
            const inputs: Record<string, PortValue[]> = {}
            for (const e of edges.filter((e) => e.target === id)) {
              const value = e.sourceHandle ? outputs.get(e.source)?.[e.sourceHandle] : undefined
              if (!value || !e.targetHandle) continue
              ;(inputs[e.targetHandle] ??= []).push(value)
            }
            const out = await EXECUTORS[node.data.kind]({
              node,
              inputs,
              note: (text) => useFlowStore.getState().setNodeRuntime(id, { note: text }),
            })
            outputs.set(id, out)
            useFlowStore.getState().setNodeRuntime(id, { status: 'done', output: out, note: undefined })
          } catch (err) {
            failed += 1
            unrunnable.add(id)
            useFlowStore.getState().setNodeRuntime(id, {
              status: 'error',
              error: humanizeError(err, 'This step failed. Tweak the node and run again.'),
              note: undefined,
            })
          }
        }),
      )
    }

    if (!progressed) {
      // Only a cycle can stall the walk — everything left can never be ready.
      for (const id of pending) {
        useFlowStore.getState().setNodeRuntime(id, {
          status: 'error',
          error: 'This node is part of a loop — flows must run in one direction.',
        })
        failed += 1
      }
      pending.clear()
    }
  }

  return { ok: failed === 0, failed }
}

// Rough pre-run cost, credits-only (chat-backed steps are ~free and excluded).
export function estimateFlowCredits(nodes: FlowNode[]): number {
  let total = 0
  for (const n of nodes) {
    const d = n.data
    if (d.kind === 'image') {
      total += estimateCredits((d.config as ImageNodeConfig).modelId, { imageCount: 1 }) ?? 0
    } else if (d.kind === 'video') {
      const c = d.config as VideoNodeConfig
      total += estimateCredits(c.modelId, { durationSeconds: c.durationSeconds, resolution: c.resolution, audio: true }) ?? 0
    } else if (d.kind === 'voiceover') {
      total += estimateCredits(TTS_MODEL_ID, { charCount: 400 }) ?? 0
    } else if (d.kind === 'broll') {
      const c = d.config as BrollNodeConfig
      const m = getDefaultModel('broll-studio', 'image', 'text-to-image')
      total += (estimateCredits(m?.id ?? 'nano-banana-2', { imageCount: 1 }) ?? 0) * c.maxScenes
    }
  }
  return Math.round(total)
}
