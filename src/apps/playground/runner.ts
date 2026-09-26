// The Playground runner: a prompt, its references and the output settings →
// an image, a clip or a track in history. Playground's Generate calls it, and
// Flow's Playground block will call the same functions — see
// utils/blockRunner.ts.
//
// What lives here is every decision a press makes before any credits go: the
// video mode inferred from the filled slots, the model swapped for the one
// the pictures need, and what each model does with a frame and a reference
// attached together. The per-modality transport stays in service.ts.

import type { PromptRef } from './components/PromptPanel'
import type { InFlightGen, PlaygroundMode } from './types'
import {
  startPlaygroundImageTask,
  finishPlaygroundImageTask,
  startPlaygroundVideoTask,
  finishPlaygroundVideoTask,
  startPlaygroundMusicTask,
  finishPlaygroundMusicTask,
  type PlaygroundImageStartInput,
  type PlaygroundVideoStartInput,
  type PlaygroundMusicStartInput,
} from './service'
import type { ImageHistoryItem, MusicHistoryItem, VideoHistoryItem } from '../../stores/types'
import { useSettingsStore } from '../../stores/settingsStore'
import { useBankStore } from '../../stores/bankStore'
import { replayRun } from '../../stores/recordingStore'
import {
  estimateCredits,
  getDefaultModel,
  getModel,
  mixedImageInputPolicy,
  modelApi,
  type AspectRatio,
  type ImageResolution,
  type VideoMode,
} from '../../utils/models'
import { FriendlyError, humanizeError } from '../../utils/friendlyError'
import { lineageOf, refuseWhileRecording, type BlockRunner } from '../../utils/blockRunner'

export interface PlaygroundRunInput {
  mode: PlaygroundMode
  // The model the member picked. The run may swap it for the one the attached
  // pictures need (see planPlaygroundRun), so this is a request, not a promise.
  modelId: string
  // Exactly what the model will read — Playground composes the Voice box
  // onto the member's text before it gets here.
  prompt: string
  refs: PromptRef[]
  aspectRatio: string
  resolution: string
  durationSeconds: number
  audio: boolean
  instrumental: boolean
  characterOrientation?: 'image' | 'video'
  // The project the result is filed under. Undefined files it under All
  // Generations.
  projectId?: string
}

// A submitted generation: the persisted in-flight entry, minus the app's own
// bookkeeping (its tile id and start time), with the taskId it now has.
export type PlaygroundTask = Omit<InFlightGen, 'id' | 'startedAt' | 'taskId'> & { taskId: string }

export type PlaygroundOutput = ImageHistoryItem | VideoHistoryItem | MusicHistoryItem

type PlaygroundRequest =
  | { kind: 'image'; input: PlaygroundImageStartInput }
  | { kind: 'video'; input: PlaygroundVideoStartInput }
  | { kind: 'music'; input: PlaygroundMusicStartInput }

// What one run will actually send, decided once per press.
export interface PlaygroundPlan {
  // The model after the swaps — what the in-flight tile names and prices.
  modelId: string
  imageParams?: InFlightGen['imageParams']
  videoParams?: InFlightGen['videoParams']
  musicParams?: InFlightGen['musicParams']
  // Said out loud before the credits go, once per press: what this model does
  // with a frame and a reference attached together, and anything left behind.
  notices: string[]
  // The attachments this run sends — the ones its lineage can name.
  sent: PromptRef[]
  request: PlaygroundRequest
}

// Infer the video mode from which ref slots the member filled. Only image
// slots participate — audio/video reference clips and the Omni inputs are
// orthogonal extras that don't change the kie request family.
function inferVideoMode(refs: PromptRef[]): VideoMode {
  const startCount = refs.filter((r) => r.slot === 'start').length
  const endCount = refs.filter((r) => r.slot === 'end').length
  const refCount = refs.filter((r) => r.slot === 'ref').length
  if (refCount > 0 && startCount === 0 && endCount === 0) return 'reference-to-video'
  if (startCount > 0 && endCount > 0) return 'frames-to-video'
  if (startCount > 0) return 'image-to-video'
  if (refCount > 0) return 'reference-to-video'
  return 'text-to-video'
}

// When the member picks a text-to-image model but attaches reference images,
// kie silently runs a text-only generation and ignores the refs — burning
// credits for nothing. Mirror the B-Roll Studio swap (`startImageTask` in
// `generateBroll.ts`): prefer the picked model's own i2i mode, fall back to
// a same-family `-image-to-image` sibling, then the registry default i2i.
function resolveImageModelForRefs(pickedId: string, hasRefs: boolean): string {
  const targetMode = hasRefs ? 'image-to-image' : 'text-to-image'
  const picked = getModel(pickedId)
  if (picked?.modes?.includes(targetMode)) return picked.id
  if (hasRefs && picked) {
    const family = picked.id.replace(/-(text-to-image|image-to-image|image-edit).*$/, '')
    const sibling = getModel(`${family}-image-to-image`)
    if (sibling) return sibling.id
  }
  return useSettingsStore.getState().getAppModel(`playground:image:${targetMode}`)
    ?? getDefaultModel('playground', 'image', targetMode)?.id
    ?? pickedId
}

// For video, a silent ref-drop is harder to recover from — duration / aspect
// / audio caps differ per model, so substituting a different model family
// risks changing what the member expects. Try only a same-family sibling that
// declares the inferred mode; otherwise return null so the run is refused.
// (No registry-default fallback — too lossy across families.)
function resolveVideoModelForMode(pickedId: string, inferred: VideoMode): string | null {
  const picked = getModel(pickedId)
  if (picked?.modes?.includes(inferred)) return picked.id
  if (picked) {
    const family = picked.id.replace(/-(text-to-video|image-to-video|frames-to-video|reference-to-video).*$/, '')
    const sibling = getModel(`${family}-${inferred}`)
    if (sibling?.modes?.includes(inferred)) return sibling.id
  }
  return null
}

// The rows a Playground tab replays from — what that tab's grid lists. B-Roll's
// clips share the video bank and never belong here.
function playgroundRows(mode: PlaygroundMode): PlaygroundOutput[] {
  const bank = useBankStore.getState()
  if (mode === 'image') return bank.imageHistory
  if (mode === 'music') return bank.musicHistory
  return bank.videoHistory.filter((v) => v.sourceApp !== 'broll-studio')
}

export function isMotionControlRun(mode: PlaygroundMode, modelId: string): boolean {
  return mode === 'video' && !!getModel(modelId)?.motionControl
}

// Decides everything a press sends. Throws a FriendlyError when the run can't
// go at all — the sentence is the member's toast.
export function planPlaygroundRun(input: PlaygroundRunInput): PlaygroundPlan {
  const { mode, refs, prompt } = input
  const hasRefs = refs.length > 0
  // Motion Control fixes the video mode (it doesn't infer from frame slots)
  // and makes the prompt optional but the character image + driving video
  // required. Everything else infers the mode from the attached frames.
  const isMotionControl = isMotionControlRun(mode, input.modelId)
  let inferredVideoMode: VideoMode = isMotionControl ? 'motion-control' : inferVideoMode(refs)
  // Reconcile the inferred mode with what the picked model actually declares,
  // in BOTH directions, because the pictures reach the model either way:
  //
  //   ref → image: an image-to-video-only model (Kling 3.0 Turbo) can't take
  //     a reference image but CAN animate it as a start frame.
  //   frame → ref: a frame-less model (Seedance 2.5 and Gemini Omni 1.0 as
  //     first registered — both have frame fields now) has no
  //     first_frame_url/last_frame_url at all and folds every attached image
  //     into its reference array — see the per-model branches in
  //     buildVideoInput, which do exactly that with a stray frame.
  //
  // The second direction is why this exists. Attaching a start frame AND a
  // reference image made inferVideoMode return 'image-to-video', which
  // Seedance 2.5 doesn't declare, so the run was refused with a toast naming
  // a limitation the model doesn't have — on a generation it would have run
  // fine. Downgrade instead, and send the frames as references below.
  if (!isMotionControl && mode === 'video') {
    const picked = getModel(input.modelId)
    const modes = picked?.modes ?? []
    if (picked && !modes.includes(inferredVideoMode)) {
      if (inferredVideoMode === 'reference-to-video' && modes.includes('image-to-video')) {
        inferredVideoMode = 'image-to-video'
      } else if (modes.includes('reference-to-video')) {
        inferredVideoMode = 'reference-to-video'
      } else if (inferredVideoMode === 'frames-to-video' && modes.includes('image-to-video')) {
        // Start frame only — the end frame has nowhere to go on this model.
        inferredVideoMode = 'image-to-video'
      }
    }
    // A frame and a reference attached together, on a model that re-routes
    // for references (MiniMax H3, Kling 3.0 Omni): take the reference route,
    // which carries BOTH — the frame rides as a reference image. Dropping the
    // character to keep frame-one is the worse half of that trade, and it's
    // the one the request builders already make for themselves further down
    // (minimaxH3Route / klingOmniRoute pick 'reference' the moment a
    // reference is present, so this only makes the mode agree with the body).
    if (
      mixedImageInputPolicy(picked?.id) === 'reference' &&
      inferredVideoMode !== 'reference-to-video' &&
      refs.some((r) => r.slot === 'ref')
    ) {
      inferredVideoMode = 'reference-to-video'
    }
    // An end frame on its own infers text-to-video — there is no frame one for
    // it to close on — and nothing downstream sends it, so the clip rendered
    // from the prompt alone and the frame was never mentioned. Refuse before
    // the credits go. Checked after the reconciliation, so a run that lands on
    // reference-to-video (where the end frame rides as a reference) is untouched.
    if (inferredVideoMode === 'text-to-video' && refs.some((r) => r.slot === 'end')) {
      throw new FriendlyError('An end frame needs a start frame to close on. Add a start frame, or clear the end frame to generate from the prompt alone.')
    }
  }
  if (isMotionControl) {
    const hasImg = refs.some((r) => r.slot === 'motion-image')
    const hasVid = refs.some((r) => r.slot === 'motion-video')
    if (!hasImg || !hasVid) throw new FriendlyError('Motion Control needs a character image and a driving video.')
  }
  const motionOrientation = input.characterOrientation ?? 'video'
  const motionDuration = Math.min(
    refs.find((r) => r.slot === 'motion-video')?.durationSeconds ?? 5,
    motionOrientation === 'image' ? 10 : 30,
  )

  // Auto-swap the model to match what the member actually attached.
  // Image: text-to-image → image-to-image sibling when refs are present.
  // Video: refuse if the picked model can't run the inferred mode (refs
  // would be silently dropped by the body builder otherwise).
  let modelId = input.modelId
  if (mode === 'image') {
    // A Higgsfield model takes no image at all, and the kie swap below would
    // quietly move the run to another provider and bill another balance than
    // the one its Generate button quoted. Refuse instead — the same sentence
    // the video branch below gives a model that takes no images.
    if (hasRefs && modelApi(input.modelId) === 'higgsfield') {
      const pickedLabel = getModel(input.modelId)?.displayName ?? input.modelId
      throw new FriendlyError(
        `${pickedLabel} generates from the prompt only. It takes no images. Remove the attached images, or pick a model that accepts them.`,
      )
    }
    modelId = resolveImageModelForRefs(input.modelId, hasRefs)
  } else if (mode === 'video' && !isMotionControl) {
    const resolved = resolveVideoModelForMode(input.modelId, inferredVideoMode)
    if (!resolved) {
      // Everything the model COULD do with the attached pictures has already
      // been tried above, so reaching here means it takes no images at all.
      // Say that, rather than naming an internal mode ("image to video") the
      // member never picked and can't see.
      const pickedLabel = getModel(input.modelId)?.displayName ?? input.modelId
      throw new FriendlyError(
        `${pickedLabel} generates from the prompt only. It takes no images. Remove the attached images, or pick a model that accepts them.`,
      )
    }
    modelId = resolved
  }

  // What this run does with a frame and a reference attached together, and
  // whether anything is left behind — decided per model, and said out loud
  // before the credits go. Every branch here used to be one silent drop: the
  // tile generated, the clip came back without the character in it, and
  // nothing on screen had mentioned it.
  const notices: string[] = []
  const mixedPolicy = mixedImageInputPolicy(modelId)
  const hasPlainRefs = refs.some((r) => r.slot === 'ref')
  const hasFrames = refs.some((r) => r.slot === 'start' || r.slot === 'end')
  const label = getModel(modelId)?.displayName ?? modelId
  // 'merged' models take both in one flat array and nothing is dropped, so
  // they deliberately say nothing. 'reference' models were re-routed above and
  // carry both too — but the start frame is a reference there, not frame one,
  // which changes what the member gets and has to be named.
  if (mode === 'video' && !isMotionControl && hasPlainRefs && hasFrames && mixedPolicy === 'reference') {
    notices.push(
      `${label} can't hold a start frame and reference images apart. Everything attached is sent as a reference, so the frame guides this clip rather than opening it.`,
    )
  }
  // 'exclusive' is the provider forbidding the combination outright (the whole
  // Seedance family documents frames and multimodal references as mutually
  // exclusive scenarios). Sending both is a 400, so the frames win — they're
  // the more specific instruction, and the frame slot is a deliberate act
  // rather than somewhere pictures land by default — and the references are
  // dropped and named, with the way to get them honoured instead.
  if (mode === 'video' && !isMotionControl && hasPlainRefs && mixedPolicy === 'exclusive'
    && inferredVideoMode !== 'reference-to-video') {
    notices.push(
      `${label} takes either frames or reference images, not both. Rendering from the frames. Clear the start frame to use your references instead.`,
    )
  }
  // No reference input on this model at all, and an end frame with nowhere to
  // go on an image-to-video-only one.
  if (mode === 'video' && !isMotionControl && inferredVideoMode !== 'reference-to-video') {
    const dropped: string[] = []
    if (hasPlainRefs && mixedPolicy === 'frames-only') dropped.push('reference images')
    if (inferredVideoMode === 'image-to-video' && refs.some((r) => r.slot === 'end')) {
      dropped.push('the end frame')
    }
    if (dropped.length > 0) {
      notices.push(`${label} takes only a start frame here, so ${dropped.join(' and ')} won't be sent with this clip.`)
    }
  }

  const imageParams = mode === 'image'
    ? { aspectRatio: input.aspectRatio as AspectRatio, resolution: input.resolution as ImageResolution }
    : undefined
  const videoParams = mode === 'video'
    ? {
        mode: inferredVideoMode,
        aspectRatio: input.aspectRatio,
        durationSeconds: isMotionControl ? motionDuration : input.durationSeconds,
        resolution: input.resolution,
        audio: isMotionControl ? false : input.audio,
        videoEndpoint: getModel(modelId)?.videoEndpoint === 'veo' ? ('veo' as const) : undefined,
      }
    : undefined
  const musicParams = mode === 'music' ? { instrumental: input.instrumental } : undefined
  const base = { modelId, imageParams, videoParams, musicParams, notices }

  if (mode === 'image') {
    return {
      ...base,
      sent: refs,
      request: {
        kind: 'image',
        input: {
          prompt,
          modelId,
          aspectRatio: imageParams!.aspectRatio,
          resolution: imageParams!.resolution,
          referenceUrls: refs.map((r) => r.url),
        },
      },
    }
  }

  if (mode === 'music') {
    return { ...base, sent: [], request: { kind: 'music', input: { prompt, modelId, instrumental: input.instrumental } } }
  }

  if (isMotionControl) {
    const motionImage = refs.find((r) => r.slot === 'motion-image')
    const motionVideo = refs.find((r) => r.slot === 'motion-video')
    return {
      ...base,
      sent: [motionImage, motionVideo].filter((r): r is PromptRef => !!r),
      request: {
        kind: 'video',
        input: {
          prompt,
          modelId,
          mode: 'motion-control',
          aspectRatio: videoParams!.aspectRatio,
          durationSeconds: videoParams!.durationSeconds,
          resolution: videoParams!.resolution,
          audio: false,
          motionImageUrl: motionImage?.url,
          motionVideoUrl: motionVideo?.url,
          characterOrientation: motionOrientation,
        },
      },
    }
  }

  const startRef = refs.find((r) => r.slot === 'start')
  const endRef = refs.find((r) => r.slot === 'end')
  const plainRefs = refs.filter((r) => r.slot === 'ref')
  const first = startRef ?? (inferredVideoMode === 'reference-to-video' ? undefined : plainRefs[0])
  // In reference mode the frame slots have nowhere else to go — the model
  // either has no frame fields at all, or the mode was downgraded to this
  // one above precisely because it hasn't. Send them AS references, in
  // shot order ahead of the explicit ones, which is what every ref-capable
  // model's body builder does with a stray frame.
  const frameRefs = inferredVideoMode === 'reference-to-video'
    ? [startRef, endRef].filter((r): r is PromptRef => !!r?.url)
    : []
  const references = [...frameRefs, ...plainRefs]
  // Reference mode carries everything. A frame mode carries the references
  // too on a 'merged' model, whose body is one flat image array with no
  // frame/reference distinction to violate; the other two policies must not
  // send both (see the notices above) — 'exclusive' because the provider
  // rejects the pair outright, 'frames-only' because there is no field to put
  // them in.
  const sendReferences = inferredVideoMode === 'reference-to-video' || mixedPolicy === 'merged'
  const framesSent = inferredVideoMode === 'image-to-video' ? [first]
    : inferredVideoMode === 'frames-to-video' ? [first, endRef]
    : []
  const audioRefs = refs.filter((r) => r.slot === 'audio')
  const videoRefs = refs.filter((r) => r.slot === 'video')
  // Omni characters from the Bank are minted into kie character ids at
  // submit; uploaded ones carry a pre-minted id in `omniId`.
  const omniBankCharacters = refs.filter((r) => r.slot === 'omni-character' && r.bankModelId)
  const omniUploadedCharacters = refs.filter((r) => r.slot === 'omni-character' && !r.bankModelId && r.omniId)
  const omniVoices = refs.filter((r) => r.slot === 'omni-voice' && r.omniId)
  const clip = refs.find((r) => r.slot === 'omni-clip')
  return {
    ...base,
    sent: [
      ...framesSent,
      ...(sendReferences ? references : []),
      ...audioRefs,
      ...videoRefs,
      ...omniBankCharacters,
      ...omniUploadedCharacters,
      ...omniVoices,
      clip,
    ].filter((r): r is PromptRef => !!r),
    request: {
      kind: 'video',
      input: {
        prompt,
        modelId,
        mode: inferredVideoMode,
        aspectRatio: videoParams!.aspectRatio,
        durationSeconds: videoParams!.durationSeconds,
        resolution: videoParams!.resolution,
        audio: videoParams!.audio,
        firstFrameUrl: inferredVideoMode === 'image-to-video' || inferredVideoMode === 'frames-to-video' ? first?.url : undefined,
        lastFrameUrl: endRef?.url,
        referenceImageUrls: sendReferences && references.length > 0 ? references.map((r) => r.url) : undefined,
        referenceAudioUrls: audioRefs.length > 0 ? audioRefs.map((r) => r.url) : undefined,
        referenceVideoUrls: videoRefs.length > 0 ? videoRefs.map((r) => r.url) : undefined,
        omniCharacterBankIds: omniBankCharacters.length > 0 ? omniBankCharacters.map((r) => r.bankModelId!) : undefined,
        omniCharacterIds: omniUploadedCharacters.length > 0 ? omniUploadedCharacters.map((r) => r.omniId!) : undefined,
        omniAudioIds: omniVoices.length > 0 ? omniVoices.map((r) => r.omniId!) : undefined,
        videoClip: clip
          ? { url: clip.url, start: clip.clipStart ?? 0, ends: clip.clipEnds ?? Math.min(10, clip.durationSeconds ?? 10) }
          : undefined,
      },
    },
  }
}

function planOrNull(input: PlaygroundRunInput): PlaygroundPlan | null {
  try {
    return planPlaygroundRun(input)
  } catch {
    return null
  }
}

export const playgroundRunner = {
  // One generation of the model the run will actually use, after the swaps.
  estimate(input) {
    const plan = planOrNull(input)
    if (!plan) return null
    return estimateCredits(plan.modelId, {
      durationSeconds: plan.videoParams?.durationSeconds,
      imageCount: input.mode === 'image' ? 1 : undefined,
      resolution: input.mode !== 'music' ? input.resolution : undefined,
      audio: plan.videoParams?.audio,
      videoInput: input.mode === 'video' ? input.refs.some((r) => r.slot === 'omni-clip' || r.slot === 'video') : undefined,
    })
  },

  async start(input, ctx?) {
    refuseWhileRecording()
    const plan = planPlaygroundRun(input)
    const { request } = plan
    let taskId: string
    let videoEndpoint: 'veo' | undefined
    if (request.kind === 'image') {
      taskId = (await startPlaygroundImageTask(request.input)).taskId
    } else if (request.kind === 'video') {
      const started = await startPlaygroundVideoTask(request.input)
      taskId = started.taskId
      videoEndpoint = started.videoEndpoint
    } else {
      taskId = (await startPlaygroundMusicTask(request.input)).taskId
    }
    return {
      taskId,
      mode: input.mode,
      modelId: plan.modelId,
      prompt: input.prompt,
      projectId: input.projectId,
      imageParams: plan.imageParams,
      // The endpoint kie actually took the task on wins over the registry's,
      // in case the registry changes before a resume.
      videoParams: plan.videoParams && videoEndpoint !== undefined
        ? { ...plan.videoParams, videoEndpoint }
        : plan.videoParams,
      musicParams: plan.musicParams,
      provenance: { ...ctx?.provenance, parents: lineageOf(ctx?.provenance?.parents, plan.sent.map((r) => r.parent)) },
    }
  },

  // `task.projectId` is the project that was active when Generate was
  // pressed, not the one active now — a clip that took twenty minutes still
  // belongs to the piece of work it was started for.
  async finish(task, ctx?) {
    const { taskId, modelId, prompt, projectId, provenance } = task
    if (task.mode === 'image' && task.imageParams) {
      return finishPlaygroundImageTask(taskId, modelId, {
        prompt,
        aspectRatio: task.imageParams.aspectRatio,
        resolution: task.imageParams.resolution,
        projectId,
        provenance,
      }, ctx?.signal)
    }
    if (task.mode === 'video' && task.videoParams) {
      return finishPlaygroundVideoTask(taskId, modelId, task.videoParams.videoEndpoint, {
        prompt,
        mode: task.videoParams.mode,
        aspectRatio: task.videoParams.aspectRatio,
        durationSeconds: task.videoParams.durationSeconds,
        resolution: task.videoParams.resolution,
        audio: task.videoParams.audio,
        projectId,
        provenance,
      }, ctx?.signal)
    }
    if (task.mode === 'music' && task.musicParams) {
      return finishPlaygroundMusicTask(taskId, modelId, {
        prompt,
        instrumental: task.musicParams.instrumental,
        projectId,
        provenance,
      }, ctx?.signal)
    }
    throw new Error(`Playground ${task.mode} task is missing its settings. taskId=${taskId}`)
  },

  replay(input, opts?) {
    return replayRun({ rows: () => playgroundRows(input.mode), prefix: input.mode, extraMs: opts?.extraMs })
  },

  describeError(err) {
    return humanizeError(err, 'Generation failed.')
  },
} satisfies BlockRunner<PlaygroundRunInput, PlaygroundTask, PlaygroundOutput>
