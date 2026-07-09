// Two-phase video generation for B-Roll cards.
//
//   startVideoTask : resolves data URIs to hosted URLs, builds the kie body,
//                    POSTs createTask (or kieVeoCreate), returns the taskId.
//   finishVideoTask: polls the taskId, downloads the result, saves the asset.
//
// Moved verbatim from the deleted video-studio app. OutputPanel persists the
// in-flight taskId between phases via usePersistedState so a tab refresh can
// resume polling. Mirrors playground/service.ts.

import { useSettingsStore } from '../../../stores/settingsStore'
import {
  createTask,
  pollTask,
  parseResult,
  kieVeoCreate,
  kieVeoPoll,
  ensureHostedUrl,
  VIDEO_POLL_ATTEMPTS,
} from '../../../utils/kie'
import { saveAsset } from '../../../utils/assetStore'
import { buildVideoInput, getModel, resolveVideoModelSlug, type VideoMode } from '../../../utils/models'
import { withIphoneRealism } from './realism'

export interface VideoGenInput {
  prompt: string
  mode: VideoMode
  aspectRatio: string
  durationSeconds: number
  resolution: string
  audio?: boolean
  modelId: string
  firstFrameDataUri?: string
  lastFrameDataUri?: string
  referenceDataUris?: string[]
}

export interface VideoGenResult {
  assetId: string
  durationSeconds: number
  aspectRatio: string
}

export async function startVideoTask(
  input: VideoGenInput,
  signal?: AbortSignal,
): Promise<{ taskId: string; videoEndpoint?: 'veo' }> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const model = getModel(input.modelId)
  if (!model) throw new Error(`Model not found: ${input.modelId}`)

  let imageUrl: string | undefined
  let firstFrameUrl: string | undefined
  let lastFrameUrl: string | undefined
  let referenceImageUrls: string[] | undefined

  if (input.firstFrameDataUri && input.mode === 'image-to-video') {
    imageUrl = await ensureHostedUrl(apiKey, input.firstFrameDataUri)
  }
  if (input.firstFrameDataUri && input.mode === 'frames-to-video') {
    firstFrameUrl = await ensureHostedUrl(apiKey, input.firstFrameDataUri)
  }
  if (input.lastFrameDataUri && input.mode === 'frames-to-video') {
    lastFrameUrl = await ensureHostedUrl(apiKey, input.lastFrameDataUri)
  }
  if (input.referenceDataUris?.length && input.mode === 'reference-to-video') {
    referenceImageUrls = []
    for (const uri of input.referenceDataUris) {
      referenceImageUrls.push(await ensureHostedUrl(apiKey, uri))
    }
  }

  const buildOpts = {
    prompt: withIphoneRealism(input.prompt),
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
    const taskId = await kieVeoCreate(apiKey, body, signal)
    return { taskId, videoEndpoint: 'veo' }
  }

  const apiSlug = resolveVideoModelSlug(input.modelId, buildOpts)
  const taskId = await createTask(apiKey, apiSlug, body, signal)
  return { taskId }
}

export async function finishVideoTask(
  taskId: string,
  modelId: string,
  videoEndpoint: 'veo' | undefined,
  durationSeconds: number,
  aspectRatio: string,
  signal?: AbortSignal,
): Promise<VideoGenResult> {
  const apiKey = useSettingsStore.getState().getKieApiKey()

  const urls = videoEndpoint === 'veo'
    ? await kieVeoPoll(apiKey, taskId, { signal, maxPollAttempts: VIDEO_POLL_ATTEMPTS })
    : parseResult(await pollTask(apiKey, taskId, { signal, maxPollAttempts: VIDEO_POLL_ATTEMPTS })).resultUrls

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
  const contentType = res.headers.get('content-type') ?? ''
  const blob = await res.blob()
  if (blob.size === 0) {
    throw new Error(
      `kie.ai returned an empty video (0 bytes). url=${urls[0]} — likely filtered by content policy or the result expired.`,
    )
  }
  const effectiveType = contentType || blob.type
  if (effectiveType && !effectiveType.startsWith('video/')) {
    const sample = await blob.text().catch(() => '')
    throw new Error(
      `kie.ai returned non-video content-type=${effectiveType}. url=${urls[0]} body=${sample.slice(0, 200)}`,
    )
  }
  // Final check: ask the browser if it can decode the blob. Catches the case
  // where kie returns 200 + video/mp4 but the bytes are an HTML error page,
  // a CORS-opaque stub, or a content-filtered 0-duration placeholder — all
  // of which produce a silent black tile in the UI.
  await probeVideoBlob(blob, urls[0])
  const assetId = await saveAsset(blob)

  return {
    assetId,
    durationSeconds,
    aspectRatio,
  }
}

// Verify the downloaded blob is actually a playable video before we persist
// it. The previous size + content-type guards catch obvious failures (0
// bytes, application/json), but not the trickier cases where kie's CDN
// hands back a 200 with the right Content-Type yet the bytes are a
// CORS-opaque stub, an HTML error page tagged as video/mp4, or a
// content-filtered MP4 with no decodable frames. Those all render as a
// silent black tile with `0:00` in the controls, which is what the user
// saw. We hand the blob to a hidden <video> element, wait for
// `loadedmetadata`, and treat anything with a non-finite or near-zero
// duration as broken.
async function probeVideoBlob(blob: Blob, sourceUrl: string): Promise<void> {
  const objectUrl = URL.createObjectURL(blob)
  try {
    await new Promise<void>((resolve, reject) => {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      const cleanup = () => {
        v.removeAttribute('src')
        v.load()
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(
          `Video metadata probe timed out after 8s. url=${sourceUrl} size=${blob.size}B type=${blob.type || '(none)'}`,
        ))
      }, 8000)
      v.onloadedmetadata = () => {
        clearTimeout(timer)
        const d = v.duration
        cleanup()
        if (!isFinite(d) || d < 0.1) {
          reject(new Error(
            `kie.ai returned an undecodable video (duration=${d}s, size=${blob.size}B, type=${blob.type || '(none)'}). Likely a content-filtered placeholder or a CORS-opaque response. url=${sourceUrl}`,
          ))
          return
        }
        resolve()
      }
      v.onerror = () => {
        clearTimeout(timer)
        cleanup()
        reject(new Error(
          `Browser rejected the downloaded video blob (size=${blob.size}B, type=${blob.type || '(none)'}). url=${sourceUrl}`,
        ))
      }
      v.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
