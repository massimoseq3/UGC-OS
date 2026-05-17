// Two-phase video generation:
//
//   startVideoTask : resolves data URIs to hosted URLs, builds the kie body,
//                    POSTs createTask (or kieVeoCreate), returns the taskId.
//   finishVideoTask: polls the taskId, downloads the result, saves the asset.
//
// This split lets VideoStudio.tsx persist the in-flight taskId between phases
// via usePersistedState so a tab refresh can resume polling. Mirrors the
// pattern in playground/service.ts (startPlaygroundVideoTask / finish...).

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
import { buildVideoInput, getModel, resolveVideoModelSlug } from '../../../utils/models'
import type { VideoGenInput, VideoGenResult } from '../types'

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

  if (urls.length === 0) throw new Error(`${modelId}: kie.ai returned no resultUrls.`)

  const res = await fetch(urls[0])
  if (!res.ok) throw new Error(`Failed to download generated video (${res.status}).`)
  const blob = await res.blob()
  const assetId = await saveAsset(blob)

  return {
    assetId,
    durationSeconds,
    aspectRatio,
  }
}

// Thin one-shot wrapper for callers that don't need refresh-resume.
export async function generateVideo(input: VideoGenInput, signal?: AbortSignal): Promise<VideoGenResult> {
  const { taskId, videoEndpoint } = await startVideoTask(input, signal)
  return finishVideoTask(taskId, input.modelId, videoEndpoint, input.durationSeconds, input.aspectRatio, signal)
}
