// The B-Roll runners: one storyboard card's still, and its clip. A card's own
// Generate / Animate / Retry and the storyboard's resume pass all call them,
// and Flow's B-Roll block will call the same functions — see
// utils/blockRunner.ts. The storyboard call itself runs row-free through
// services/storyboardRun.ts (`writeStoryboardText`).
//
// What lives here is everything a press decides at FIRE time, outside the
// prompt the card keeps: the session's look (applyStyleToPrompt), the chained
// previous cut on a dialogue card, the shared voice profile on a talking clip,
// the locked camera on an animation, and which video mode a model can
// actually take. The card's persisted prompt stays exactly what the member
// wrote.
//
// Neither runner writes the session: a still or a clip lands in the card it
// was made for, which the storyboard owns. A clip also writes its
// `videoHistory` row here, like every other generated clip in the app.

import type { GeneratedImage, GeneratedVideo, InFlightVideo, ReferenceImage, VariationTag } from './types'
import { startImageTask, finishImageTask, buildDialogueChainPreamble, resolveImageModelId } from './services/generateBroll'
import { startVideoTask, finishVideoTask } from './services/generateVideo'
import { applyStyleToPrompt } from './services/generateContinuous'
import { withLockedCamera } from './services/realism'
import type { VideoHistoryItem } from '../../stores/types'
import { useBankStore } from '../../stores/bankStore'
import { replayWait } from '../../stores/recordingStore'
import { estimateCredits, getModel, type ImageResolution, type VideoMode } from '../../utils/models'
import { FriendlyError, humanizeError } from '../../utils/friendlyError'
import { refuseWhileRecording, withProvenance, type BlockRunner } from '../../utils/blockRunner'

// ── Still ─────────────────────────────────────────────────────────────────

export interface BrollStillInput {
  // The card's prompt as it keeps it — the look rides outside, added here.
  prompt: string
  aspectRatio: string
  resolution?: ImageResolution
  // The card's references, already clamped to what the model takes.
  refs: ReferenceImage[]
  // A chained dialogue card's previous cut. It leads the references and swaps
  // in the preamble that KEEPS its staging — the opposite of the
  // identity-only scoping every other card gets.
  chainRef?: ReferenceImage | null
  tag: VariationTag
  // The session's look (the result's style stamp).
  style?: string
  realism?: boolean
}

// A submitted still — the persisted in-flight entry's resumable half.
export interface BrollStillTask {
  taskId: string
  modelId: string
  prompt: string
  resolution?: ImageResolution
}

// B-Roll's Recording Mode replay brings back a CARD's hidden cover, which only
// the storyboard knows (ScenesView's handleReplayCard). A runner holding no
// card has nothing of its own to bring back, so its stand-in is the wait.
async function replayWithoutReveal(opts?: { extraMs?: number }): Promise<null> {
  await replayWait(opts?.extraMs)
  return null
}

export const brollStillRunner = {
  estimate(input) {
    const modelId = resolveImageModelId(input.refs.length > 0 || !!input.chainRef)
    return modelId ? estimateCredits(modelId, { resolution: input.resolution, imageCount: 1 }) : null
  },

  async start(input, ctx?) {
    refuseWhileRecording()
    // Restyle at fire time: a stylized pick appends its STYLE block and drops
    // the iPhone-realism stack; UGC / legacy pass through untouched.
    const { prompt: styledPrompt, noRealism } = applyStyleToPrompt(input.prompt, {
      style: input.style,
      realism: input.realism,
    })
    const finalRefs = input.chainRef ? [input.chainRef, ...input.refs] : input.refs
    const started = await startImageTask(styledPrompt, finalRefs, input.aspectRatio, input.resolution, {
      inheritReference: input.tag === 'STATIC',
      noRealism,
      ...(input.chainRef ? { preambleOverride: buildDialogueChainPreamble(finalRefs) } : {}),
      signal: ctx?.signal,
    })
    return { taskId: started.taskId, modelId: started.modelId, prompt: input.prompt, resolution: input.resolution }
  },

  // A still becomes a take on its card; it writes no history row of its own
  // (the session snapshot carries it), only the usage ledger's count.
  async finish(task, ctx?) {
    const imageUrl = await finishImageTask(task.taskId, task.modelId, task.resolution, ctx?.signal)
    const image: GeneratedImage = { imageUrl, prompt: task.prompt, modelId: task.modelId, createdAt: Date.now() }
    return image
  },

  replay(_input, opts?) {
    return replayWithoutReveal(opts)
  },

  describeError(err) {
    return humanizeError(err, 'Image generation failed. Try again.')
  },
} satisfies BlockRunner<BrollStillInput, BrollStillTask, GeneratedImage>

// ── Clip ──────────────────────────────────────────────────────────────────

export interface BrollClipInput {
  // What was asked for. A model that can't take it falls back — see
  // planBrollClip.
  mode: VideoMode
  modelId: string | undefined
  // The still prompt for a clip made from scratch, or the card's MOTION when
  // animating a still: a model already holding the frame reads the still's
  // paragraph as "draw this picture" and barely moves.
  prompt: string
  // Animating a still. Arms the locked-camera clause — there is only a frame
  // to hold still when there is a start frame.
  animating: boolean
  firstFrameDataUri?: string
  referenceDataUris?: string[]
  // The still an animation starts from (an asset ref), kept on the in-flight
  // entry so Retry replays the SAME generation.
  startFrameRef?: string
  aspectRatio: string
  durationSeconds: number
  resolution: string
  audio: boolean
  // A dialogue card's clip is read by the ad's one shared voice.
  tag: VariationTag
  voiceProfile?: string
  style?: string
  realism?: boolean
  sourceBRollId?: string
}

// What a clip will actually send once the model has had its say.
export interface BrollClipPlan {
  modelId: string
  mode: VideoMode
  firstFrameDataUri?: string
  referenceDataUris?: string[]
  // Said before the run, which still goes ahead: the references are dropped.
  warning?: string
}

// A submitted clip: the persisted in-flight entry, minus the card's own
// bookkeeping, with the taskId it now has.
export type BrollClipTask = Omit<InFlightVideo, 'id' | 'startedAt' | 'taskId' | 'error'> & { taskId: string }

export interface BrollClipOutput {
  // The take the card appends.
  video: GeneratedVideo
  // The row every generated clip in the app gets.
  row: VideoHistoryItem
}

const VIDEO_MODES: VideoMode[] = ['text-to-video', 'image-to-video', 'frames-to-video', 'reference-to-video']

// Which mode the picked model can run this clip in. Throws a FriendlyError
// when it can't run at all — the sentence is the member's toast.
export function planBrollClip(input: BrollClipInput): BrollClipPlan {
  if (!input.modelId) throw new FriendlyError('No video model configured.')
  const model = getModel(input.modelId)
  if (!model) throw new FriendlyError(`Unknown video model: ${input.modelId}`)
  if (model.modes?.includes(input.mode)) {
    return {
      modelId: input.modelId,
      mode: input.mode,
      firstFrameDataUri: input.firstFrameDataUri,
      referenceDataUris: input.referenceDataUris,
    }
  }
  // The model can't honour the requested mode. We deliberately do NOT promote
  // the reference image into a first-frame seed (that hijack produced
  // distorted clips) and we don't silently swap models. When the chosen model
  // can't take refs as refs, drop them and run text-to-video — the picker
  // greys these models out and the Reference Images note tells the member
  // this will be text-to-video only.
  const videoModes = (model.modes ?? []).filter((m): m is VideoMode => (VIDEO_MODES as string[]).includes(m))
  const fallback: VideoMode | undefined = videoModes.includes('text-to-video') ? 'text-to-video' : videoModes[0]
  if (!fallback) throw new FriendlyError('Video model has no supported modes.')
  let warning: string | undefined
  if (input.mode === 'reference-to-video' && input.referenceDataUris?.length) {
    warning = `${model.displayName} doesn't support reference images. Generating text-to-video only.`
  }
  if (input.mode === 'image-to-video' && input.firstFrameDataUri) {
    // Animate on a model with no image-to-video mode. Without this the still
    // is dropped and the clip renders from the prompt alone — a text-to-video
    // that silently ignores the frame the member picked to animate. No model
    // is named: the picker greys the ones that can't, which is a list that
    // stays true as models come and go.
    throw new FriendlyError(
      `${model.displayName} can't animate a still. Open the model picker. The ones that can't take a still are greyed out.`,
    )
  }
  return { modelId: input.modelId, mode: fallback, warning }
}

// The prompt a clip fires with: the look, then the shared voice on a talking
// card, then the locked camera on an animation. None of it is written back.
function clipPrompt(input: BrollClipInput): { prompt: string; noRealism: boolean } {
  const { prompt: styledPrompt, noRealism } = applyStyleToPrompt(input.prompt, {
    style: input.style,
    realism: input.realism,
  })
  const withVoice = input.tag === 'DIALOGUE' && input.voiceProfile?.trim()
    ? `${styledPrompt}\n\n=== VOICE PROFILE (same voice in every dialogue clip) ===\n${input.voiceProfile.trim()}`
    : styledPrompt
  return { prompt: input.animating ? withLockedCamera(withVoice) : withVoice, noRealism }
}

export const brollClipRunner = {
  estimate(input) {
    if (!input.modelId) return null
    return estimateCredits(input.modelId, {
      durationSeconds: input.durationSeconds,
      resolution: input.resolution,
      audio: input.audio,
    })
  },

  async start(input, ctx?) {
    refuseWhileRecording()
    const plan = planBrollClip(input)
    const { prompt, noRealism } = clipPrompt(input)
    const { taskId, videoEndpoint } = await startVideoTask({
      prompt,
      mode: plan.mode,
      firstFrameDataUri: plan.firstFrameDataUri,
      referenceDataUris: plan.referenceDataUris,
      aspectRatio: input.aspectRatio,
      durationSeconds: input.durationSeconds,
      resolution: input.resolution,
      audio: input.audio,
      modelId: plan.modelId,
      noRealism,
    }, ctx?.signal)
    return {
      taskId,
      endpoint: videoEndpoint,
      modelId: plan.modelId,
      prompt: input.prompt,
      mode: plan.mode,
      aspectRatio: input.aspectRatio,
      durationSeconds: input.durationSeconds,
      resolution: input.resolution,
      audio: input.audio,
      sourceBRollId: input.sourceBRollId,
      startFrameRef: input.startFrameRef,
      provenance: ctx?.provenance,
    }
  },

  async finish(task, ctx?) {
    const res = await finishVideoTask(task.taskId, task.modelId, task.endpoint, task.durationSeconds, task.aspectRatio, ctx?.signal)
    const url = `asset://${res.assetId}`
    const video: GeneratedVideo = {
      url,
      modelId: task.modelId,
      prompt: task.prompt,
      aspectRatio: res.aspectRatio,
      durationSeconds: res.durationSeconds,
      resolution: task.resolution,
      audio: task.audio,
      mode: task.mode,
      sourceBRollId: task.sourceBRollId,
      createdAt: Date.now(),
    }
    const row = withProvenance<VideoHistoryItem>({
      id: crypto.randomUUID(),
      modelId: task.modelId,
      prompt: task.prompt,
      mode: task.mode,
      aspectRatio: res.aspectRatio,
      durationSeconds: res.durationSeconds,
      resolution: task.resolution,
      audio: task.audio,
      videoUrl: url,
      sourceBRollId: task.sourceBRollId,
      sourceApp: 'broll-studio',
      createdAt: Date.now(),
    }, task.provenance)
    await useBankStore.getState().addVideoHistory(row)
    return { video, row }
  },

  replay(_input, opts?) {
    return replayWithoutReveal(opts)
  },

  describeError(err) {
    return humanizeError(err, 'Video generation failed.')
  },
} satisfies BlockRunner<BrollClipInput, BrollClipTask, BrollClipOutput>
