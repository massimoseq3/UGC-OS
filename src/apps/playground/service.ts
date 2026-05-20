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
  pollTask,
  parseResult,
  kieVeoCreate,
  kieVeoPoll,
  kieMusicGenerate,
  pollMusicTask,
  ensureHostedUrl,
  downloadAsBase64,
  IMAGE_POLL_ATTEMPTS,
  VIDEO_POLL_ATTEMPTS,
} from '../../utils/kie'
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
import { saveAsset, saveBase64Asset, isAssetRef, getAsBase64 } from '../../utils/assetStore'
import type { ImageHistoryItem, MusicHistoryItem, VideoHistoryItem } from '../../stores/types'

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
  const apiKey = useSettingsStore.getState().getKieApiKey()

  const inputUrls: string[] = []
  for (const ref of input.referenceUrls ?? []) {
    let source = ref
    if (isAssetRef(ref)) {
      const asset = await getAsBase64(ref)
      if (!asset) continue
      source = `data:${asset.mimeType};base64,${asset.base64}`
    }
    inputUrls.push(await ensureHostedUrl(apiKey, source))
  }

  const body = buildImageInput(input.modelId, {
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    inputUrls: inputUrls.length > 0 ? inputUrls : undefined,
  })
  const taskId = await createTask(apiKey, input.modelId, body)
  return { taskId }
}

export interface PlaygroundImageFinishInput {
  prompt: string
  aspectRatio: AspectRatio
  resolution?: ImageResolution
}

export async function finishPlaygroundImageTask(
  taskId: string,
  modelId: string,
  params: PlaygroundImageFinishInput,
): Promise<ImageHistoryItem> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const record = await pollTask(apiKey, taskId, { maxPollAttempts: IMAGE_POLL_ATTEMPTS })
  const urls = parseResult(record).resultUrls
  if (urls.length === 0) {
    throw new Error(
      `${modelId}: kie.ai returned no resultUrls. record=${JSON.stringify(record).slice(0, 400)}`,
    )
  }
  const { base64, mimeType } = await downloadAsBase64(urls[0])
  const assetId = await saveBase64Asset(base64, mimeType)

  const item: ImageHistoryItem = {
    id: crypto.randomUUID(),
    modelId,
    prompt: params.prompt,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution,
    imageUrl: assetId,
    createdAt: Date.now(),
  }
  await useBankStore.getState().addImageHistory(item)
  return item
}

// Marker stamped on every record this service produces so the B-Roll tab's
// Gallery view can filter Playground gens out — see types.ts BRoll/VideoHistoryItem.
const PLAYGROUND_SOURCE: 'playground' = 'playground'

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
}

export async function startPlaygroundVideoTask(
  input: PlaygroundVideoStartInput,
): Promise<{ taskId: string; videoEndpoint?: 'veo' }> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const model = getModel(input.modelId)
  if (!model) throw new Error(`Model not found: ${input.modelId}`)

  async function hosted(ref: string | undefined): Promise<string | undefined> {
    if (!ref) return undefined
    let source = ref
    if (isAssetRef(ref)) {
      const asset = await getAsBase64(ref)
      if (!asset) return undefined
      source = `data:${asset.mimeType};base64,${asset.base64}`
    }
    return ensureHostedUrl(apiKey, source)
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
  } else if (input.mode === 'reference-to-video' && input.referenceImageUrls?.length) {
    referenceImageUrls = []
    for (const r of input.referenceImageUrls) {
      const h = await hosted(r)
      if (h) referenceImageUrls.push(h)
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
}

export async function finishPlaygroundVideoTask(
  taskId: string,
  modelId: string,
  videoEndpoint: 'veo' | undefined,
  params: PlaygroundVideoFinishInput,
): Promise<VideoHistoryItem> {
  const apiKey = useSettingsStore.getState().getKieApiKey()

  const urls = videoEndpoint === 'veo'
    ? await kieVeoPoll(apiKey, taskId, { maxPollAttempts: VIDEO_POLL_ATTEMPTS })
    : parseResult(await pollTask(apiKey, taskId, { maxPollAttempts: VIDEO_POLL_ATTEMPTS })).resultUrls

  if (urls.length === 0) {
    throw new Error(
      `${modelId}: kie.ai returned no resultUrls. taskId=${taskId} endpoint=${videoEndpoint ?? 'jobs'}`,
    )
  }

  const res = await fetch(urls[0])
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Failed to download generated video (${res.status} ${res.statusText}). url=${urls[0]} body=${body.slice(0, 200)}`,
    )
  }
  const blob = await res.blob()
  const assetId = await saveAsset(blob)

  const historyEntry: VideoHistoryItem = {
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
    createdAt: Date.now(),
  }
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
}

export async function finishPlaygroundMusicTask(
  taskId: string,
  modelId: string,
  params: PlaygroundMusicFinishInput,
): Promise<MusicHistoryItem> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const record = await pollMusicTask(apiKey, taskId)

  // sunoData[] holds up to two tracks. We grab the first track here; future
  // could split into a stereo "pair tile". The streamUrl is preferred when
  // present because the regular audioUrl can lag a few seconds for v5 tracks.
  const track = record.response?.sunoData?.[0]
  if (!track?.audioUrl) {
    throw new Error(
      `${modelId}: Suno returned SUCCESS but no audioUrl. record=${JSON.stringify(record).slice(0, 400)}`,
    )
  }

  const dlUrl = track.audioUrl
  const res = await fetch(dlUrl)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Failed to download generated audio (${res.status} ${res.statusText}). url=${dlUrl} body=${body.slice(0, 200)}`,
    )
  }
  const blob = await res.blob()
  const audioRef = await saveAsset(blob, blob.type || 'audio/mpeg')

  let coverImageRef: string | undefined
  if (track.imageUrl) {
    try {
      const coverRes = await fetch(track.imageUrl)
      if (coverRes.ok) {
        const coverBlob = await coverRes.blob()
        coverImageRef = await saveAsset(coverBlob, coverBlob.type || 'image/jpeg')
      }
    } catch {
      // Cover is optional — never block the track on it.
    }
  }

  const item: MusicHistoryItem = {
    id: crypto.randomUUID(),
    modelId,
    prompt: params.prompt,
    instrumental: params.instrumental,
    audioRef,
    coverImageRef,
    title: track.title,
    durationSeconds: track.duration,
    createdAt: Date.now(),
  }
  await useBankStore.getState().addMusicHistory(item)
  return item
}
