// Per-modality generation orchestration for Playground.
//
// Each generate* function takes a uniform input shape, talks to kie.ai
// through the appropriate helper, persists the result blob via assetStore,
// and pushes a row into the right bank slice (brolls / videoHistory /
// musicHistory). Errors are propagated raw — the project convention is to
// surface kie.ai's error messages directly, no wrapping.

import { useSettingsStore } from '../../stores/settingsStore'
import { useBankStore } from '../../stores/bankStore'
import {
  kieImageGenerate,
  kieVideoGenerate,
  kieVeoGenerate,
  ensureHostedUrl,
  downloadAsBase64,
  runMusicTask,
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
import type { MusicHistoryItem, VideoHistoryItem } from '../../stores/types'

// ── Image ──────────────────────────────────────────────────────────

export interface PlaygroundImageInput {
  prompt: string
  modelId: string
  aspectRatio: AspectRatio
  resolution?: ImageResolution
  // Already-hosted-or-resolvable refs. data: / http(s) / asset:// all welcome.
  referenceUrls?: string[]
}

export async function generatePlaygroundImage(input: PlaygroundImageInput): Promise<string> {
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
  const urls = await kieImageGenerate(apiKey, input.modelId, body)
  if (urls.length === 0) throw new Error('Image generation returned no result.')

  const { base64, mimeType } = await downloadAsBase64(urls[0])
  const assetId = await saveBase64Asset(base64, mimeType)

  // Pushing to brolls keeps the new image inside the existing cloud-synced
  // R2 + project-tagging infrastructure. Playground entries leave product /
  // model / script linkages empty, which is how PlaygroundHistoryGrid
  // identifies them.
  await useBankStore.getState().addBRoll({
    imageUrl: assetId,
    prompt: input.prompt,
  })

  return assetId
}

// ── Video ──────────────────────────────────────────────────────────

export interface PlaygroundVideoInput {
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

export async function generatePlaygroundVideo(input: PlaygroundVideoInput): Promise<VideoHistoryItem> {
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
  const apiSlug = resolveVideoModelSlug(input.modelId, buildOpts)

  const urls = model.videoEndpoint === 'veo'
    ? await kieVeoGenerate(apiKey, body)
    : await kieVideoGenerate(apiKey, apiSlug, body)

  if (urls.length === 0) throw new Error('Video generation returned no result.')

  const res = await fetch(urls[0])
  if (!res.ok) throw new Error(`Failed to download generated video (${res.status}).`)
  const blob = await res.blob()
  const assetId = await saveAsset(blob)

  const historyEntry: VideoHistoryItem = {
    id: crypto.randomUUID(),
    modelId: input.modelId,
    prompt: input.prompt,
    mode: input.mode,
    aspectRatio: input.aspectRatio,
    durationSeconds: input.durationSeconds,
    resolution: input.resolution,
    audio: input.audio,
    videoUrl: assetId,
    createdAt: Date.now(),
  }
  await useBankStore.getState().addVideoHistory(historyEntry)
  return historyEntry
}

// ── Music ──────────────────────────────────────────────────────────

export interface PlaygroundMusicInput {
  prompt: string
  modelId: string
  instrumental: boolean
}

export async function generatePlaygroundMusic(input: PlaygroundMusicInput): Promise<MusicHistoryItem> {
  const apiKey = useSettingsStore.getState().getKieApiKey()

  const body = buildMusicInput(input.modelId, {
    prompt: input.prompt,
    instrumental: input.instrumental,
  })
  const record = await runMusicTask(apiKey, body)

  // sunoData[] holds up to two tracks. We grab the first track here; future
  // could split into a stereo "pair tile". The streamUrl is preferred when
  // present because the regular audioUrl can lag a few seconds for v5 tracks.
  const track = record.response?.sunoData?.[0]
  if (!track?.audioUrl) throw new Error('Suno returned no audio track.')

  const dlUrl = track.audioUrl
  const res = await fetch(dlUrl)
  if (!res.ok) throw new Error(`Failed to download generated audio (${res.status}).`)
  const blob = await res.blob()
  // Suno's CDN serves mpeg; saveAsset reads blob.type, fall back to mpeg.
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
    modelId: input.modelId,
    prompt: input.prompt,
    instrumental: input.instrumental,
    audioRef,
    coverImageRef,
    title: track.title,
    durationSeconds: track.duration,
    createdAt: Date.now(),
  }
  await useBankStore.getState().addMusicHistory(item)
  return item
}
