// What one run of a block is expected to cost, in credits. Every figure comes
// from the app's own pricing — its runner's estimate, or the same registry
// call its Generate button prints — so a block and the app it runs can never
// quote two prices for one generation. A value not made yet (a script still
// to be written) is priced at a typical size and the figure says "about".

import type { FlowBlock, FlowValue } from '../types'
import { estimateCredits, getDefaultModel, getModel, imageResolutionsFor, snapVideoDuration } from '../../../utils/models'
import { resolveScriptModel, resolveTtsModel, useSettingsStore } from '../../../stores/settingsStore'
import { useBankStore } from '../../../stores/bankStore'
import { estimateVoiceCredits } from '../../voice-studio/runner'
import { characterRunner } from '../../character-studio/runner'
import { createEmptyProfile } from '../../character-studio/types'
import { playgroundRunner, type PlaygroundRunInput } from '../../playground/runner'
import { estimatePromptCredits } from '../../broll-studio/services/promptCost'
import { resolveImageModelId } from '../../broll-studio/services/generateBroll'
import { autoClipSeconds, DEFAULT_CLIP_SECONDS } from '../../broll-studio/services/clipDuration'
import { estimateAnalysisCredits } from '../../ad-anatomy/services/analysisCost'
import type { ImageResolution } from '../../../utils/models'

// A 30-second read: what an unwritten script is priced as.
const TYPICAL_SCRIPT = 'x'.repeat(450)
const TYPICAL_SCENES = 4

// The text a script input will read. A value not made yet carries a stand-in
// of its likely size (plan.ts sizeHint), which is all a price needs.
function textOf(values: FlowValue[] | undefined): string | null {
  const v = values?.[0]
  if (!v) return null
  const p = v.payload as { text?: string }
  return typeof p.text === 'string' && p.text ? p.text : null
}

// Scripts writes on tokens; the run's size is its format's typical answer.
// Rounded up, like B-Roll's storyboard estimate.
function scriptsCost(block: FlowBlock, slots: number): number | null {
  const s = block.settings
  const model = resolveScriptModel('script-architect')
  const hooks = s.mode === 'write' && s.writeFormat === 'hooks'
  const tokens = hooks ? 7_000 + slots * 60 : slots * 6_000
  return estimateCredits(model, { tokenCount: tokens })
}

// B-Roll's storyboard walks the script sentence by sentence, one scene each.
export function sceneCount(scriptText: string | null): number {
  if (!scriptText) return TYPICAL_SCENES
  return Math.max(1, scriptText.trim().split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length)
}

export function brollVideoModel(block: FlowBlock): string | undefined {
  return (block.settings.videoModelId as string | undefined)
    ?? useSettingsStore.getState().getAppModel('broll-studio:video')
    ?? getDefaultModel('broll-studio', 'video')?.id
}

export function brollClipSeconds(block: FlowBlock, line: string | null, modelId: string | undefined): number {
  if (block.settings.delivery === 'dialogue' && line) return autoClipSeconds(line, modelId)
  const durations = modelId ? getModel(modelId)?.videoConstraints?.durations : undefined
  return durations?.length ? snapVideoDuration(DEFAULT_CLIP_SECONDS, durations) : DEFAULT_CLIP_SECONDS
}

export function brollVideoResolution(block: FlowBlock, modelId: string | undefined): string {
  const picked = block.settings.videoResolution as string | undefined
  const allowed = modelId ? getModel(modelId)?.videoConstraints?.resolutions : undefined
  if (picked && (!allowed || allowed.includes(picked))) return picked
  return getModel(modelId ?? '')?.videoConstraints?.default ?? allowed?.[0] ?? '720p'
}

function brollCost(block: FlowBlock, inputs: Record<string, FlowValue[]>): number | null {
  const script = textOf(inputs.script)
  const delivery = block.settings.delivery === 'dialogue' ? 'dialogue' : 'silent'
  const scenes = sceneCount(script)
  const takes = Math.min(3, Math.max(1, Number(block.settings.takes) || 1))
  const storyboard = estimatePromptCredits('line', script ?? TYPICAL_SCRIPT, delivery) ?? 0
  const stillModel = resolveImageModelId(true)
  const still = stillModel ? estimateCredits(stillModel, { resolution: '1K', imageCount: 1 }) : null
  if (still === null) return null
  let total = storyboard + scenes * takes * still
  if (block.settings.animate !== false) {
    const videoModel = brollVideoModel(block)
    if (!videoModel) return null
    const seconds = brollClipSeconds(block, script ? script.slice(0, script.length / scenes) : null, videoModel)
    const clip = estimateCredits(videoModel, {
      durationSeconds: seconds,
      resolution: brollVideoResolution(block, videoModel),
      audio: getModel(videoModel)?.videoConstraints?.supportsAudio ?? false,
    })
    if (clip === null) return null
    // Animated takes are what a review keeps; ahead of one, every take.
    total += scenes * takes * clip
  }
  return total
}

// Generations one run starts, for the big-run confirmation. Most runs are
// one, or one per slot of a batch. A B-Roll run is its storyboard, a still
// for every take of every scene and, animated, a clip for each — counted
// the same way brollCost prices it.
export function generationsOf(block: FlowBlock, inputs: Record<string, FlowValue[]>, slots: number): number {
  if (block.kind !== 'broll') return Math.max(1, slots)
  const scenes = sceneCount(textOf(inputs.script))
  const takes = Math.min(3, Math.max(1, Number(block.settings.takes) || 1))
  return 1 + scenes * takes * (block.settings.animate !== false ? 2 : 1)
}

export function playgroundInput(block: FlowBlock, inputs: Record<string, FlowValue[]>): PlaygroundRunInput {
  const s = block.settings
  const mode = s.mode === 'video' || s.mode === 'music' ? s.mode : 'image'
  const modelId = (s.modelId as string | undefined)
    ?? useSettingsStore.getState().getAppModel(mode === 'image' ? 'playground:image:text-to-image' : mode === 'video' ? 'playground:video' : 'playground:music:text-to-music')
    ?? getDefaultModel('playground', mode)?.id
    ?? ''
  const prompt = textOf(inputs.prompt) ?? String(s.prompt ?? '')
  const refs = (inputs.refs ?? []).map((v) => ({
    url: refOfPicture(v),
    label: v.label,
    source: 'upload' as const,
    slot: 'ref' as const,
    parent: v.lineage?.[0],
  })).filter((r) => r.url)
  // The video tab's frame slots: one picture each, which is what makes the
  // run image-to-video (a start frame) or frames-to-video (both) — the same
  // inference Playground's own Video tab makes from its filled slots.
  const frame = (slot: 'start' | 'end') => (inputs[slot] ?? []).slice(0, 1).map((v) => ({
    url: refOfPicture(v),
    label: v.label,
    source: 'upload' as const,
    slot,
    parent: v.lineage?.[0],
  })).filter((r) => r.url)
  // What the block asked for, fitted to what its model takes — a quality or
  // length left over from another mode or model is the model's own default
  // here, exactly as the block's window shows it, so the run never sends a
  // value its model would refuse.
  const model = modelId ? getModel(modelId) : undefined
  const video = mode === 'video' ? model?.videoConstraints : undefined
  const resolution = mode === 'video'
    ? fitTo(String(s.resolution ?? video?.default ?? '720p'), video?.resolutions, video?.default)
    : mode === 'image' && modelId ? fitTo(String(s.resolution ?? '1K'), imageResolutionsFor(modelId), '1K') : String(s.resolution ?? '1K')
  const aspectRatio = mode === 'video'
    ? fitTo(String(s.aspectRatio ?? '9:16'), video?.aspectRatios, '9:16')
    : mode === 'image' ? fitTo(String(s.aspectRatio ?? '9:16'), model?.imageConstraints?.aspectRatios, '9:16') : String(s.aspectRatio ?? '9:16')
  const durationSeconds = video?.durations?.length ? snapVideoDuration(Number(s.durationSeconds) || 6, video.durations) : Number(s.durationSeconds) || 6
  return {
    mode,
    modelId,
    prompt,
    refs: mode === 'video' ? [...refs, ...frame('start'), ...frame('end')] : refs,
    aspectRatio,
    resolution,
    durationSeconds,
    audio: !!s.audio && (mode !== 'video' || !!video?.supportsAudio),
    instrumental: !!s.instrumental,
  }
}

// `value` when the model takes it; else the fallback it names, else its first.
// A model that declares no list takes whatever it's given.
function fitTo(value: string, allowed: readonly string[] | undefined, fallback?: string): string {
  if (!allowed?.length) return value
  if (allowed.includes(value)) return value
  return fallback && allowed.includes(fallback) ? fallback : allowed[0]
}

// The picture a value IS, for an input that takes pictures: an image, a
// product's hero photo, a character's portrait, a style's first frame.
export function refOfPicture(v: FlowValue): string {
  switch (v.type) {
    case 'image': return v.payload.ref
    case 'character': return v.payload.imageRef
    case 'style': return v.payload.thumbRefs?.[0] ?? ''
    case 'product': return v.pending ? 'pending' : productPhoto(v.payload.productId)
    default: return ''
  }
}

function productPhoto(productId: string): string {
  return useBankStore.getState().products.find((p) => p.id === productId)?.productImage ?? ''
}

export function blockCost(block: FlowBlock, inputs: Record<string, FlowValue[]>, slots: number): number | null {
  switch (block.kind) {
    case 'scripts':
      return scriptsCost(block, slots)
    case 'voice': {
      const model = (block.settings.modelId as string | undefined) ?? resolveTtsModel()
      return estimateVoiceCredits(textOf(inputs.script) ?? TYPICAL_SCRIPT, model)
    }
    case 'characters': {
      const one = characterRunner.estimate({
        profile: createEmptyProfile(),
        resolution: (block.settings.resolution as ImageResolution) ?? '1K',
        kind: block.settings.kind === 'sheet' ? 'sheet' : 'portrait',
        aspect: String(block.settings.aspect ?? '9:16'),
        modelId: block.settings.modelId as string | undefined,
        referenceUrl: (inputs.photo?.length ?? 0) > 0 ? 'ref' : undefined,
      })
      return one === null ? null : one * slots
    }
    case 'broll':
      return brollCost(block, inputs)
    case 'playground':
      return playgroundRunner.estimate(playgroundInput(block, inputs))
    case 'analyzer':
      return estimateAnalysisCredits(Number.NaN)
    default:
      // Outliers bills ScrapeCreators, not kie; Edit Pack and the helpers
      // make nothing.
      return 0
  }
}
