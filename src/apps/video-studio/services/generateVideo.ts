import { useSettingsStore } from '../../../stores/settingsStore'
import { kieVideoGenerate, ensureHostedUrl } from '../../../utils/kie'
import { saveAsset } from '../../../utils/assetStore'
import type { VideoGenInput, VideoGenResult } from '../types'

export async function generateVideo(input: VideoGenInput, signal?: AbortSignal): Promise<VideoGenResult> {
  const apiKey = useSettingsStore.getState().getKieApiKey()

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio,
    duration: input.durationSeconds,
    resolution: input.resolution,
  }

  if (input.mode === 'image-to-video') {
    if (!input.firstFrameDataUri) throw new Error('First-frame image is required for image-to-video.')
    body.first_frame_url = await ensureHostedUrl(apiKey, input.firstFrameDataUri)
  }

  const urls = await kieVideoGenerate(apiKey, input.modelId, body, { signal })
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
