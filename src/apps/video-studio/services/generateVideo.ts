import { useSettingsStore } from '../../../stores/settingsStore'
import { kieVideoGenerate, kieVeoGenerate, ensureHostedUrl } from '../../../utils/kie'
import { saveAsset } from '../../../utils/assetStore'
import { buildVideoInput, getModel, resolveVideoModelSlug } from '../../../utils/models'
import type { VideoGenInput, VideoGenResult } from '../types'

export async function generateVideo(input: VideoGenInput, signal?: AbortSignal): Promise<VideoGenResult> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const model = getModel(input.modelId)
  if (!model) throw new Error(`Model not found: ${input.modelId}`)

  // Resolve any data URIs to public URLs (kie hosting, 3-day TTL).
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
  const apiSlug = resolveVideoModelSlug(input.modelId, buildOpts)

  // Route to the right endpoint.
  const urls = model.videoEndpoint === 'veo'
    ? await kieVeoGenerate(apiKey, body, { signal })
    : await kieVideoGenerate(apiKey, apiSlug, body, { signal })

  if (urls.length === 0) throw new Error('Video generation returned no result.')

  const res = await fetch(urls[0])
  if (!res.ok) throw new Error(`Failed to download generated video (${res.status}).`)
  const blob = await res.blob()
  const assetId = await saveAsset(blob)

  return {
    assetId,
    durationSeconds: input.durationSeconds,
    aspectRatio: input.aspectRatio,
  }
}
