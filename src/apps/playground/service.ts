// Per-modality generation orchestration for Playground.
//
// Each generation is split into a `startX` phase (resolves refs, builds the
// kie body, POSTs createTask, returns the taskId) and a `finishX` phase
// (polls the taskId, downloads the result, persists it as an asset, pushes
// a row into the right bank slice). This shape lets Playground.tsx persist
// the in-flight taskId between phases via usePersistedState so a tab
// refresh / app switch can resume polling.
//
// Errors are propagated raw — the project convention is to surface kie.ai's
// error messages directly, no wrapping.

import { useSettingsStore } from '../../stores/settingsStore'
import { useBankStore } from '../../stores/bankStore'
import {
  createTask,
  kieVeoCreate,
  kieMusicGenerate,
  kieOmniCharacterCreate,
  ensureHostedUrl,
} from '../../utils/kie'
import { finishImageAssetTask, submitImageTask } from '../../utils/imageTask'
import { finishVideoAssetTask } from '../../utils/videoTask'
import { finishAudioAssetTask } from '../../utils/audioTask'
import {
  buildImageInput,
  buildVideoInput,
  buildMusicInput,
  resolveVideoModelSlug,
  getModel,
  type AspectRatio,
  type ImageResolution,
  type VideoMode,
} from '../../utils/models'
import { hostedUrlFor } from '../../utils/hostedUrl'
import { withProvenance } from '../../utils/blockRunner'
import { kieChatCompletions, type ChatMessage } from '../../utils/kie'
import { getChatTarget } from '../../utils/models'
import type { ImageHistoryItem, MusicHistoryItem, Provenance, VideoHistoryItem } from '../../stores/types'
import type { PlaygroundMode } from './types'

// ── Prompt enhance ─────────────────────────────────────────────────
//
// Rewrites the user's freeform draft into a stronger, more specific prompt for
// the active modality, keeping their intent. Mirrors the B-Roll "Enhance
// Prompt" affordance but generic (no scene/variation framework). Returns the
// rewritten prompt text only — the caller owns undo/redo history.

const ENHANCE_SYSTEM = `You are a senior prompt engineer for AI image, video and music models. You rewrite a user's rough prompt into a single, vivid, production-ready prompt that the model can render well. You KEEP the user's intent and subject. You never invent a different concept. You make it concrete and specific, not longer for its own sake.`

// Per-modality guidance — what "good" looks like for each generator.
const ENHANCE_MODE_GUIDE: Record<PlaygroundMode, string> = {
  image: 'Target: a text-to-image model. Add concrete visual specifics: subject, composition/shot size, lighting, lens/mood, setting, materials, color. Photoreal and grounded unless the draft asks otherwise. One flowing paragraph, no lists, no "Style:" headers.',
  video: 'Target: a text-to-video model. Describe the subject, the action/motion over the shot, camera movement and shot size, setting, lighting and mood as one flowing paragraph. Keep it to a single coherent shot unless the draft implies cuts. No lists, no timestamps.',
  music: 'Target: a music model. Specify genre, mood, tempo feel, key instruments, and energy arc in one tight sentence or two. No lyrics unless the draft asks for them.',
}

// Preserve any @mention tokens (e.g. @Product, @Influencer) and [bracketed]
// placeholders verbatim — they resolve to bank refs downstream.
export async function enhancePlaygroundPrompt(draft: string, mode: PlaygroundMode): Promise<string> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatTarget()

  const userMessage = `Rewrite the draft prompt below so it produces a much better result. Keep the user's intent and subject; make it concrete and specific.

${ENHANCE_MODE_GUIDE[mode]}

Rules:
- Preserve any @mention tokens (like @Product or @Influencer) and any [bracketed] placeholders EXACTLY as written, in place.
- Return ONLY the rewritten prompt as plain text. No preamble, no quotes, no markdown, no "Here is".

Draft:
"""
${draft}
"""`

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: ENHANCE_SYSTEM }] },
    { role: 'user', content: [{ type: 'text', text: userMessage }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)
  return responseText
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*["']|["']\s*$/g, '')
    .trim()
}

// ── Image ──────────────────────────────────────────────────────────

export interface PlaygroundImageStartInput {
  prompt: string
  modelId: string
  aspectRatio: AspectRatio
  resolution?: ImageResolution
  // Already-hosted-or-resolvable refs. data: / http(s) / asset:// all welcome.
  referenceUrls?: string[]
}

export async function startPlaygroundImageTask(
  input: PlaygroundImageStartInput,
): Promise<{ taskId: string }> {
  const inputUrls: string[] = []
  for (const ref of input.referenceUrls ?? []) {
    // A reference whose asset has gone is skipped, not fatal. Refs are hosted
    // on kie's file service, so the kie key is only asked for when there are
    // some — a Higgsfield model never has any (planPlaygroundRun refuses them).
    const url = await hostedUrlFor(useSettingsStore.getState().getKieApiKey(), ref)
    if (url) inputUrls.push(url)
  }

  const body = buildImageInput(input.modelId, {
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    inputUrls: inputUrls.length > 0 ? inputUrls : undefined,
  })
  // kie or Higgsfield, by the model — see submitImageTask.
  const taskId = await submitImageTask(input.modelId, body)
  return { taskId }
}

export interface PlaygroundImageFinishInput {
  prompt: string
  aspectRatio: AspectRatio
  resolution?: ImageResolution
  // The project this generation is filed under. Undefined while All
  // Generations is the active view — see `PlaygroundProject`. It rides on the
  // FINISH input rather than the start one because that is the leg that writes
  // the history row, and it is carried on the persisted in-flight entry so a
  // generation resumed after a reload still lands in the project it was
  // started from.
  projectId?: string
  // What the run was made from — see Lineage in stores/types.ts.
  provenance?: Provenance
}

export async function finishPlaygroundImageTask(
  taskId: string,
  modelId: string,
  params: PlaygroundImageFinishInput,
  signal?: AbortSignal,
): Promise<ImageHistoryItem> {
  const assetId = await finishImageAssetTask(taskId, modelId, { signal })

  const item = withProvenance<ImageHistoryItem>({
    id: crypto.randomUUID(),
    modelId,
    prompt: params.prompt,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution,
    imageUrl: assetId,
    projectId: params.projectId,
    createdAt: Date.now(),
  }, params.provenance)
  await useBankStore.getState().addImageHistory(item)
  return item
}

// Marker stamped on every record this service produces so the B-Roll tab's
// Gallery view can filter Playground gens out — see types.ts BRoll/VideoHistoryItem.
const PLAYGROUND_SOURCE = 'playground' as const

// ── Gemini Omni characters ─────────────────────────────────────────

// Returns the bank model's persistent Omni character id, minting one via
// kie's /omni/character/create on first use and stamping it back onto the
// bank row. Idempotent — subsequent generations reuse the stored id.
export async function ensureOmniCharacterId(bankModelId: string): Promise<string> {
  const bank = useBankStore.getState()
  const model = bank.models.find((m) => m.id === bankModelId)
  if (!model) throw new Error('Character not found in bank. It may have been deleted.')
  if (model.omniCharacterId) return model.omniCharacterId

  const apiKey = useSettingsStore.getState().getKieApiKey()

  const imageUrl = await hostedUrlFor(apiKey, model.characterImage)
  if (!imageUrl) throw new Error(`Couldn't load the image for "${model.name}". Its asset is missing.`)

  // Character description: name + notes + the DNA profile JSON, clamped to
  // kie's 20k-char limit. The profile is the richest signal we have.
  const parts = [model.name, model.notes, model.jsonProfile ? JSON.stringify(model.jsonProfile) : '']
  const descriptions = parts.filter(Boolean).join('\n\n').slice(0, 20_000) || model.name

  const created = await kieOmniCharacterCreate(apiKey, {
    imageUrl,
    descriptions,
    characterName: model.name.slice(0, 100) || undefined,
  })
  if (!created.characterId) {
    throw new Error(`Omni character creation returned no characterId for "${model.name}".`)
  }
  await bank.updateModel(bankModelId, { omniCharacterId: created.characterId })
  return created.characterId
}

// Mints a one-off Omni character id from an uploaded image (no bank row). The
// image is hosted, then /omni/character/create returns a reusable id we attach
// straight to the ref — mirrors ensureOmniCharacterId minus the bank stamping.
export async function createOmniCharacterFromImage(dataUri: string, name?: string): Promise<string> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const imageUrl = await ensureHostedUrl(apiKey, dataUri)
  const created = await kieOmniCharacterCreate(apiKey, {
    imageUrl,
    descriptions: name || 'Uploaded character',
    characterName: (name || 'Character').slice(0, 100),
  })
  if (!created.characterId) {
    throw new Error('Omni character creation returned no characterId.')
  }
  return created.characterId
}

// ── Video ──────────────────────────────────────────────────────────

export interface PlaygroundVideoStartInput {
  prompt: string
  modelId: string
  mode: VideoMode
  aspectRatio: string
  durationSeconds: number
  resolution: string
  audio: boolean
  // data: URIs / asset:// refs / http(s) — we resolve them here.
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[]
  // Seedance 2 family — reference audio (≤15s total) and video (≤15s total)
  // clips. Sent regardless of the image mode; they're orthogonal inputs.
  referenceAudioUrls?: string[]
  referenceVideoUrls?: string[]
  // Gemini Omni — bank model ids to attach as persistent characters (the
  // omni id is minted lazily via ensureOmniCharacterId), designed voice ids,
  // and an optional trimmed source clip.
  omniCharacterBankIds?: string[]
  // Pre-minted Omni character ids from uploaded images (no bank row) — merged
  // with the bank-resolved ids above.
  omniCharacterIds?: string[]
  omniAudioIds?: string[]
  videoClip?: { url: string; start: number; ends: number }
  // Kling Motion Control — the reference character image + driving video
  // (data: / asset:// / http(s), resolved + hosted here) and the orientation.
  motionImageUrl?: string
  motionVideoUrl?: string
  characterOrientation?: 'image' | 'video'
}

export async function startPlaygroundVideoTask(
  input: PlaygroundVideoStartInput,
): Promise<{ taskId: string; videoEndpoint?: 'veo' }> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const model = getModel(input.modelId)
  if (!model) throw new Error(`Model not found: ${input.modelId}`)

  async function hosted(ref: string | undefined): Promise<string | undefined> {
    if (!ref) return undefined
    return (await hostedUrlFor(apiKey, ref)) ?? undefined
  }

  let imageUrl: string | undefined
  let firstFrameUrl: string | undefined
  let lastFrameUrl: string | undefined
  let referenceImageUrls: string[] | undefined

  if (input.mode === 'image-to-video') {
    imageUrl = await hosted(input.firstFrameUrl)
  } else if (input.mode === 'frames-to-video') {
    firstFrameUrl = await hosted(input.firstFrameUrl)
    lastFrameUrl = await hosted(input.lastFrameUrl)
  }
  // Reference images are hosted whenever the caller passes them, NOT only in
  // reference mode — the same rule the audio/video strips below already follow.
  // The `else if` this replaced meant a model that takes frames AND references
  // in one request (Gemini Omni, Grok — see mixedImageInputPolicy) had its
  // references dropped here, one layer below the code that decided to send
  // them. Whether the pair is legal at all is the CALLER's call, since only it
  // knows the policy; this function's job is to host what it was handed.
  if (input.referenceImageUrls?.length) {
    referenceImageUrls = []
    for (const r of input.referenceImageUrls) {
      const h = await hosted(r)
      if (h) referenceImageUrls.push(h)
    }
  }

  // Media references are orthogonal to the image mode — host them whenever
  // present (data URIs from uploads get pushed to kie's file host).
  async function hostedList(refs: string[] | undefined): Promise<string[] | undefined> {
    if (!refs?.length) return undefined
    const out: string[] = []
    for (const r of refs) {
      const h = await hosted(r)
      if (h) out.push(h)
    }
    return out.length > 0 ? out : undefined
  }
  const referenceAudioUrls = await hostedList(input.referenceAudioUrls)
  const referenceVideoUrls = await hostedList(input.referenceVideoUrls)

  let videoClip: { url: string; start: number; ends: number } | undefined
  if (input.videoClip) {
    const url = await hosted(input.videoClip.url)
    if (!url) throw new Error('The source video clip could not be loaded. Re-attach it and try again.')
    videoClip = { url, start: input.videoClip.start, ends: input.videoClip.ends }
  }

  // Omni characters: resolve each attached bank influencer to its persistent
  // character id, minting on first use.
  let omniCharacterIds: string[] | undefined
  if (input.omniCharacterBankIds?.length || input.omniCharacterIds?.length) {
    omniCharacterIds = []
    for (const bankId of input.omniCharacterBankIds ?? []) {
      omniCharacterIds.push(await ensureOmniCharacterId(bankId))
    }
    // Uploaded characters were already minted at attach time.
    if (input.omniCharacterIds?.length) omniCharacterIds.push(...input.omniCharacterIds)
  }

  // Motion Control: host the reference image + driving video. The video is
  // typically a large data: URI (an uploaded clip) that ensureHostedUrl pushes
  // to kie's file host.
  let motionImageUrl: string | undefined
  let motionVideoUrl: string | undefined
  if (input.mode === 'motion-control') {
    motionImageUrl = await hosted(input.motionImageUrl)
    motionVideoUrl = await hosted(input.motionVideoUrl)
    if (!motionImageUrl || !motionVideoUrl) {
      throw new Error('Motion Control needs both a character image and a driving video. Re-attach them and try again.')
    }
  }

  const buildOpts = {
    prompt: input.prompt,
    mode: input.mode,
    aspectRatio: input.aspectRatio,
    duration: input.durationSeconds,
    resolution: input.resolution,
    audio: input.audio,
    imageUrl,
    firstFrameUrl,
    lastFrameUrl,
    referenceImageUrls,
    referenceAudioUrls,
    referenceVideoUrls,
    omniCharacterIds,
    omniAudioIds: input.omniAudioIds?.length ? input.omniAudioIds : undefined,
    videoClip,
    motionImageUrl,
    motionVideoUrl,
    characterOrientation: input.characterOrientation,
  }
  const body = buildVideoInput(input.modelId, buildOpts)

  if (model.videoEndpoint === 'veo') {
    const taskId = await kieVeoCreate(apiKey, body)
    return { taskId, videoEndpoint: 'veo' }
  }

  const apiSlug = resolveVideoModelSlug(input.modelId, buildOpts)
  const taskId = await createTask(apiKey, apiSlug, body)
  return { taskId }
}

export interface PlaygroundVideoFinishInput {
  prompt: string
  mode: VideoMode
  aspectRatio: string
  durationSeconds: number
  resolution: string
  audio: boolean
  // See PlaygroundImageFinishInput.
  projectId?: string
  provenance?: Provenance
}

export async function finishPlaygroundVideoTask(
  taskId: string,
  modelId: string,
  videoEndpoint: 'veo' | undefined,
  params: PlaygroundVideoFinishInput,
  signal?: AbortSignal,
): Promise<VideoHistoryItem> {
  const assetId = await finishVideoAssetTask(taskId, modelId, videoEndpoint, { signal })

  const historyEntry = withProvenance<VideoHistoryItem>({
    id: crypto.randomUUID(),
    modelId,
    prompt: params.prompt,
    mode: params.mode,
    aspectRatio: params.aspectRatio,
    durationSeconds: params.durationSeconds,
    resolution: params.resolution,
    audio: params.audio,
    videoUrl: assetId,
    sourceApp: PLAYGROUND_SOURCE,
    projectId: params.projectId,
    createdAt: Date.now(),
  }, params.provenance)
  await useBankStore.getState().addVideoHistory(historyEntry)
  return historyEntry
}

// ── Music ──────────────────────────────────────────────────────────

export interface PlaygroundMusicStartInput {
  prompt: string
  modelId: string
  instrumental: boolean
}

export async function startPlaygroundMusicTask(
  input: PlaygroundMusicStartInput,
): Promise<{ taskId: string }> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const body = buildMusicInput(input.modelId, {
    prompt: input.prompt,
    instrumental: input.instrumental,
  })
  const taskId = await kieMusicGenerate(apiKey, body)
  return { taskId }
}

export interface PlaygroundMusicFinishInput {
  prompt: string
  instrumental: boolean
  // See PlaygroundImageFinishInput.
  projectId?: string
  provenance?: Provenance
}

export async function finishPlaygroundMusicTask(
  taskId: string,
  modelId: string,
  params: PlaygroundMusicFinishInput,
  signal?: AbortSignal,
): Promise<MusicHistoryItem> {
  // Suno hands back a pair of tracks; the shared tail keeps the first.
  const track = await finishAudioAssetTask(taskId, modelId, 'suno', { signal })

  const item = withProvenance<MusicHistoryItem>({
    id: crypto.randomUUID(),
    modelId,
    prompt: params.prompt,
    instrumental: params.instrumental,
    audioRef: track.assetId,
    coverImageRef: track.coverImageRef,
    title: track.title,
    durationSeconds: track.durationSeconds,
    projectId: params.projectId,
    createdAt: Date.now(),
  }, params.provenance)
  await useBankStore.getState().addMusicHistory(item)
  return item
}
