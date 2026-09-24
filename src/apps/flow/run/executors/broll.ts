// The B-Roll block: a script → a storyboard → a still per shot → a clip per
// kept still. Every step is B-Roll's own: its storyboard writer and parser,
// its card defaults, the references a card attaches (cardStillRefs), and the
// still and clip runners. What the block adds is only the order, and a
// session row in `brollHistory` built as it goes, so the finished run opens
// in B-Roll like a session made there — and so its stills, which write no
// history row of their own, are referenced by something the orphan sweep
// reads.
//
// It runs in two phases around a review: stills first, then clips for only
// the stills the member kept. Without a review the two run back to back.

import type { ExecContext, ExecOutput, Executor } from '../types'
import type { ClipRef, FlowValue } from '../../types'
import type { HeldValue } from '../../engine/plan'
import type { BrollHistoryItem } from '../../../../stores/types'
import type { BrollInput, BrollResult, CardState, GeneratedImage, ReferenceImage } from '../../../broll-studio/types'
import { useBankStore } from '../../../../stores/bankStore'
import { replayRun, replayWait } from '../../../../stores/recordingStore'
import { FriendlyError } from '../../../../utils/friendlyError'
import { lineageOf, withProvenance } from '../../../../utils/blockRunner'
import { getModel } from '../../../../utils/models'
import { writeStoryboardText, resumeStoryboardText, parseStoryboardText } from '../../../broll-studio/services/storyboardRun'
import { buildProductContext, productPhotosOf } from '../../../broll-studio/services/productAngles'
import { createDefaultCardState } from '../../../broll-studio/cardState'
import {
  animateMode,
  brollClipRunner,
  brollStillRunner,
  cardStillRefs,
  planBrollClip,
  stillDataUri,
  type BrollClipTask,
  type BrollStillTask,
} from '../../../broll-studio/runner'
import { brollClipSeconds, brollVideoModel, brollVideoResolution } from '../../engine/cost'
import { brollSessionValues } from '../../engine/held'
import { cardKey, sessionMedia } from '../../engine/brollSession'
import { textOf } from './simple'
import { taskIsDead } from '../errors'

interface BrollResume {
  storyboardTaskId?: string
  sessionId?: string
  stills?: Record<string, BrollStillTask>
  clips?: Record<string, BrollClipTask>
}

interface Wired {
  input: BrollInput
  characterRef?: ReferenceImage
  productPhotos: string[]
}

function one<T extends FlowValue['type']>(values: FlowValue[] | undefined, type: T): Extract<FlowValue, { type: T }> | undefined {
  return values?.find((v): v is Extract<FlowValue, { type: T }> => v.type === type)
}

// The storyboard request, from what's wired in — the same fields B-Roll's
// Generate reads off its panel.
function wiredInput(ctx: ExecContext): Wired {
  const s = ctx.block.settings
  const bank = useBankStore.getState()
  const scriptValue = ctx.inst.inputs.script?.[0]
  const scriptText = textOf(ctx.inst.inputs.script)?.trim() ?? ''
  if (!scriptText) throw new FriendlyError('The script wired into B-Roll is empty. Check the block that makes it.')

  const productId = one(ctx.inst.inputs.product, 'product')?.payload.productId ?? (s.productId as string | undefined)
  const product = productId ? bank.products.find((p) => p.id === productId) : undefined

  const character = one(ctx.inst.inputs.character, 'character')
  const model = character?.payload.modelRowId ? bank.models.find((m) => m.id === character.payload.modelRowId) : undefined
  const characterImage = character?.payload.imageRef
  const name = model?.name ?? character?.payload.name ?? 'Character'
  const modelContext = characterImage
    ? `Model/Character: ${name}.${model?.notes ? ` ${model.notes}.` : ''}${model?.jsonProfile ? ` Profile: ${JSON.stringify(model.jsonProfile)}` : ''}`
    : ''

  const style = one(ctx.inst.inputs.style, 'style')
  // An analyzed ad wired in as the script brings its staging: the beats and
  // shot craft of the ad it came from, never its identity (adBlueprint.ts).
  const staging = scriptValue?.type === 'transcript' ? scriptValue.payload.scenes
    : scriptValue?.type === 'script' ? scriptValue.payload.staging
    : undefined
  const photos = productPhotosOf(product)

  return {
    input: {
      productId: product?.id ?? null,
      modelId: model?.id ?? null,
      scriptId: null,
      scriptText,
      additionalContext: String(s.context ?? ''),
      productContext: buildProductContext(product),
      modelContext,
      referenceImages: [],
      productPhotos: photos.map((dataUrl) => ({ dataUrl, label: 'product' })),
      // Explicit, never empty: an empty style id falls back to a 3D look.
      styleId: typeof s.styleId === 'string' && s.styleId ? s.styleId : 'ugc',
      styleBrief: style?.payload.brief || undefined,
      styleName: style?.payload.name || undefined,
      delivery: s.delivery === 'dialogue' ? 'dialogue' : 'silent',
      sceneStaging: staging || undefined,
    },
    characterRef: characterImage ? { dataUrl: characterImage, label: 'character' } : undefined,
    productPhotos: photos,
  }
}

function takesOf(ctx: ExecContext): number {
  return ctx.test ? 1 : Math.min(3, Math.max(1, Number(ctx.block.settings.takes) || 1))
}

// The cards a run renders: the first N takes of every scene.
function cardsToRender(result: BrollResult, takes: number): Array<{ key: string; scene: BrollResult['scenes'][number]; index: number }> {
  const out: Array<{ key: string; scene: BrollResult['scenes'][number]; index: number }> = []
  for (const scene of result.scenes) {
    scene.variations.slice(0, takes).forEach((_, index) => out.push({ key: cardKey(scene.number, index), scene, index }))
  }
  return out
}

function session(id: string): BrollHistoryItem | undefined {
  return useBankStore.getState().getBrollHistoryById(id)
}

// Read-modify-write one card of the session. Synchronous up to the store
// write, so cards finishing together can't overwrite each other.
function patchCard(sessionId: string, key: string, fn: (card: CardState) => CardState): void {
  const row = session(sessionId)
  if (!row) return
  const card = row.cardStates[key] as CardState | undefined
  if (!card) return
  void useBankStore.getState().upsertBrollHistory({ ...row, cardStates: { ...row.cardStates, [key]: fn(card) } })
}

async function storyboard(ctx: ExecContext, wired: Wired, resume: BrollResume): Promise<{ sessionId: string; result: BrollResult }> {
  const held = resume.sessionId ? session(resume.sessionId) : undefined
  if (held?.result && (held.result as BrollResult).scenes?.length) {
    return { sessionId: held.id, result: held.result as BrollResult }
  }
  const { input } = wired
  ctx.progress('Storyboard')
  const written = resume.storyboardTaskId
    ? await resumeStoryboardText(resume.storyboardTaskId, input.scriptText)
    : await writeStoryboardText({ mode: 'line', input }, {
        onTaskId: (taskId) => ctx.save({ ...resume, storyboardTaskId: taskId }),
      })
  const parsed = parseStoryboardText(written.text, {
    mode: 'line',
    scriptText: input.scriptText,
    delivery: input.delivery,
    styleId: input.styleId,
    styleBrief: input.styleBrief,
    styleName: input.styleName,
  })
  if (parsed.mode !== 'line') throw new FriendlyError('The storyboard came back in the wrong shape. Try again.')
  const result = parsed.result
  const cardStates: Record<string, unknown> = {}
  for (const c of cardsToRender(result, takesOf(ctx))) {
    cardStates[c.key] = createDefaultCardState(c.scene.variations[c.index], c.scene.scriptLine)
  }
  // Written only once the storyboard exists: B-Roll turns a row it finds
  // still 'writing' into an error on its next open.
  const row = withProvenance<BrollHistoryItem>({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    inputSummary: input.scriptText.slice(0, 120),
    productId: input.productId ?? undefined,
    modelId: input.modelId ?? undefined,
    scriptText: input.scriptText,
    context: input.additionalContext,
    styleId: input.styleId,
    styleBrief: input.styleBrief,
    styleName: input.styleName,
    mode: 'line',
    lineDelivery: input.delivery,
    result,
    cardStates,
  }, ctx.provenance)
  await useBankStore.getState().upsertBrollHistory(row)
  resume.sessionId = row.id
  resume.storyboardTaskId = undefined
  ctx.save({ ...resume })
  return { sessionId: row.id, result }
}

async function stillsPhase(ctx: ExecContext, wired: Wired, resume: BrollResume, sessionId: string, result: BrollResult): Promise<void> {
  const cards = cardsToRender(result, takesOf(ctx))
  const todo = cards.filter((c) => !((session(sessionId)?.cardStates[c.key] as CardState | undefined)?.images?.length))
  let done = cards.length - todo.length
  const errors: unknown[] = []
  resume.stills ??= {}
  ctx.progress(`Stills · ${done} of ${cards.length}`)
  await Promise.all(todo.map(async (c) => {
    try {
      const variation = c.scene.variations[c.index]
      const card = (session(sessionId)?.cardStates[c.key] as CardState | undefined)
        ?? createDefaultCardState(variation, c.scene.scriptLine)
      let task = resume.stills![c.key]
      if (!task) {
        task = await brollStillRunner.start({
          prompt: card.editablePrompt,
          aspectRatio: String(ctx.block.settings.aspectRatio ?? card.cardImageAspectRatio),
          resolution: card.cardImageResolution,
          refs: cardStillRefs({ characterRef: wired.characterRef, productPhotos: wired.productPhotos, card }),
          chainRef: null,
          tag: variation.tag,
          style: result.style,
          realism: result.realism,
        }, { signal: ctx.signal })
        resume.stills![c.key] = task
        ctx.save({ ...resume })
      }
      const image: GeneratedImage = await brollStillRunner.finish(task, { signal: ctx.signal })
      patchCard(sessionId, c.key, (prev) => ({ ...prev, images: [...prev.images, image], currentImageIndex: prev.images.length, selected: { kind: 'image', index: prev.images.length } }))
      delete resume.stills![c.key]
      ctx.save({ ...resume })
      done += 1
      ctx.progress(`Stills · ${done} of ${cards.length}`)
    } catch (err) {
      if (taskIsDead(err) && resume.stills?.[c.key]) {
        delete resume.stills[c.key]
        ctx.save({ ...resume })
      }
      errors.push(err)
    }
  }))
  if (done === 0 && errors.length) throw errors[0]
}

async function clipsPhase(ctx: ExecContext, resume: BrollResume, sessionId: string, result: BrollResult, keep: string[] | undefined): Promise<void> {
  if (ctx.block.settings.animate === false) return
  const modelId = brollVideoModel(ctx.block)
  const mode = animateMode(modelId)
  if (!mode) throw new FriendlyError("B-Roll's video model can't animate a still. Pick one that takes a start frame in the block's panel.")
  const cards = cardsToRender(result, takesOf(ctx)).filter((c) => !keep || keep.includes(c.key))
  const withStill = cards.filter((c) => (session(sessionId)?.cardStates[c.key] as CardState | undefined)?.images?.length)
  const todo = withStill.filter((c) => !((session(sessionId)?.cardStates[c.key] as CardState | undefined)?.videos?.length))
  let done = withStill.length - todo.length
  const errors: unknown[] = []
  resume.clips ??= {}
  const supportsAudio = !!getModel(modelId ?? '')?.videoConstraints?.supportsAudio
  ctx.progress(`Clips · ${done} of ${withStill.length}`)
  await Promise.all(todo.map(async (c) => {
    try {
      const card = session(sessionId)?.cardStates[c.key] as CardState
      const variation = c.scene.variations[c.index]
      let task = resume.clips![c.key]
      if (!task) {
        const still = card.images[card.images.length - 1].imageUrl
        const dataUri = await stillDataUri(still)
        if (!dataUri) throw new FriendlyError('A still could not be loaded to animate. Run the block again.')
        const input = {
          mode,
          modelId,
          prompt: card.animateMotion.trim() || card.editablePrompt,
          animating: true,
          firstFrameDataUri: mode === 'image-to-video' ? dataUri : undefined,
          referenceDataUris: mode === 'reference-to-video' ? [dataUri] : undefined,
          startFrameRef: still,
          aspectRatio: String(ctx.block.settings.aspectRatio ?? card.cardVideoAspectRatio),
          durationSeconds: brollClipSeconds(ctx.block, c.scene.scriptLine, modelId),
          resolution: brollVideoResolution(ctx.block, modelId),
          audio: supportsAudio && ctx.block.settings.audio !== false,
          tag: variation.tag,
          voiceProfile: result.voiceProfile,
          style: result.style,
          realism: result.realism,
        }
        const plan = planBrollClip(input)
        if (plan.warning) ctx.progress(plan.warning)
        task = await brollClipRunner.start(input, {
          signal: ctx.signal,
          provenance: { ...ctx.provenance, parents: lineageOf(ctx.provenance.parents, { bank: 'brollHistory', id: sessionId }) },
        })
        resume.clips![c.key] = task
        ctx.save({ ...resume })
      }
      const { video } = await brollClipRunner.finish(task, { signal: ctx.signal })
      patchCard(sessionId, c.key, (prev) => ({ ...prev, videos: [...prev.videos, video], currentVideoIndex: prev.videos.length, selected: { kind: 'video', index: prev.videos.length } }))
      delete resume.clips![c.key]
      ctx.save({ ...resume })
      done += 1
      ctx.progress(`Clips · ${done} of ${withStill.length}`)
    } catch (err) {
      if (taskIsDead(err) && resume.clips?.[c.key]) {
        delete resume.clips[c.key]
        ctx.save({ ...resume })
      }
      errors.push(err)
    }
  }))
  if (done === 0 && errors.length) throw errors[0]
}

// What the run hands on: one set of clips (this ad's), and every still.
function outputsOf(sessionId: string, keep?: string[]): ExecOutput {
  const row = session(sessionId)
  if (!row) throw new FriendlyError('The B-Roll session this run was building was deleted.')
  const values = brollSessionValues(row)
  if (keep) {
    // Only the kept stills' clips belong to this ad.
    const result = row.result as BrollResult
    const kept: ClipRef[] = []
    for (const scene of result.scenes) {
      scene.variations.forEach((_, i) => {
        const key = cardKey(scene.number, i)
        if (!keep.includes(key)) return
        const card = row.cardStates[key] as CardState | undefined
        const video = card?.videos?.[card.videos.length - 1]
        if (video?.url) kept.push({ ref: video.url, durationSeconds: video.durationSeconds, prompt: video.prompt })
      })
    }
    const clip = values.clips[0]
    if (clip?.type === 'video') values.clips = [{ ...clip, payload: { ...clip.payload, clips: kept } }]
  }
  return { outputs: values as Record<string, HeldValue[]>, rows: [{ bank: 'brollHistory', id: sessionId }] }
}

export const brollExecutor: Executor = {
  async run(ctx) {
    const resume: BrollResume = { ...((ctx.resume as BrollResume | undefined) ?? {}) }
    // A run picking up after its review carries on in the session its stills
    // phase wrote — the task state is cleared once a phase lands, so the
    // session is found through the rows that phase recorded.
    resume.sessionId ??= ctx.prior?.rows?.find((r) => r.bank === 'brollHistory')?.id
    const wired = wiredInput(ctx)
    const { sessionId, result } = await storyboard(ctx, wired, resume)
    if (ctx.phase !== 'clips') await stillsPhase(ctx, wired, resume, sessionId, result)
    if (ctx.phase === 'stills') return outputsOf(sessionId)
    const keep = ctx.prior?.keep
    await clipsPhase(ctx, resume, sessionId, result, keep)
    return outputsOf(sessionId, keep)
  },

  // Recording Mode brings back a hidden session whole — its storyboard,
  // stills and clips — after the replay wait. It names the session, so a
  // review stop shows that session's stills, and the clips phase after the
  // review carries on in it rather than revealing another one.
  async replay(ctx) {
    const revealed = ctx.prior?.rows?.find((r) => r.bank === 'brollHistory')?.id
    if (ctx.phase === 'clips' && revealed && session(revealed)) {
      await replayWait()
      return outputsOf(revealed, ctx.prior?.keep)
    }
    const row = await replayRun({ rows: () => useBankStore.getState().brollHistory, prefix: 'broll' })
    if (!row) return null
    return outputsOf(row.id)
  },
}

// The stills of a finished stills phase, card by card, for the review.
// `rows` lets a component hand in the bank it subscribed to, so it re-reads
// when a still lands.
export function reviewStills(sessionId: string, rows?: BrollHistoryItem[]): Array<{ key: string; ref: string; line: string }> {
  const row = rows ? rows.find((r) => r.id === sessionId) : session(sessionId)
  const result = row?.result as BrollResult | undefined
  if (!row || !result) return []
  const out: Array<{ key: string; ref: string; line: string }> = []
  for (const scene of result.scenes) {
    scene.variations.forEach((_, i) => {
      const key = cardKey(scene.number, i)
      const card = row.cardStates[key] as CardState | undefined
      const image = card?.images?.[card.images.length - 1]
      if (image?.imageUrl) out.push({ key, ref: image.imageUrl, line: scene.scriptLine })
    })
  }
  return out
}

export { sessionMedia }
