// Shared tail of every audio generation (Voiceovers' TTS, Playground's Suno
// music): poll the task to completion, download the result and save it as a
// local asset. The audio counterpart of `finishImageAssetTask` and
// `finishVideoAssetTask` — callers keep their own history rows.
//
// The two transports differ only in how the task is polled and where the file
// is in the answer. Everything after that is one path, so a fix to the
// download (its deadline, its error copy) reaches both.

import { pollTask, pollMusicTask, parseResult, fetchGeneratedAsset } from './kie'
import { saveAsset } from './assetStore'
import { useSettingsStore } from '../stores/settingsStore'

export interface FinishedAudio {
  assetId: string
  // Seconds. TTS measures the saved file (whole seconds, 0 when it never says);
  // Suno reports its own figure, which a track can arrive without.
  durationSeconds: number | undefined
  // Suno's own title and cover art for the track. TTS has neither.
  title?: string
  coverImageRef?: string
}

export async function finishAudioAssetTask(
  taskId: string,
  modelId: string,
  audioEndpoint: 'suno' | undefined,
  opts: { signal?: AbortSignal } = {},
): Promise<FinishedAudio> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const { signal } = opts

  if (audioEndpoint === 'suno') {
    const record = await pollMusicTask(apiKey, taskId, { signal })
    // sunoData[] holds up to two tracks; v1 keeps the first.
    const track = record.response?.sunoData?.[0]
    if (!track?.audioUrl) {
      throw new Error(
        `${modelId}: Suno returned SUCCESS but no audioUrl. record=${JSON.stringify(record).slice(0, 400)}`,
      )
    }
    const blob = await downloadAudio(track.audioUrl, signal)
    const assetId = await saveAsset(blob, blob.type || 'audio/mpeg')
    return {
      assetId,
      durationSeconds: track.duration,
      title: track.title,
      coverImageRef: track.imageUrl ? await saveCover(track.imageUrl, signal) : undefined,
    }
  }

  const record = await pollTask(apiKey, taskId, { signal })
  const urls = parseResult(record).resultUrls
  if (urls.length === 0) {
    throw new Error(`TTS returned no audio. taskId=${taskId} record=${JSON.stringify(record).slice(0, 400)}`)
  }
  const blob = await downloadAudio(urls[0], signal)
  const durationSeconds = await probeAudioDuration(blob)
  const assetId = await saveAsset(blob)
  return { assetId, durationSeconds }
}

async function downloadAudio(url: string, signal: AbortSignal | undefined): Promise<Blob> {
  const res = await fetchGeneratedAsset(url, { signal })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Failed to download generated audio (${res.status} ${res.statusText}). url=${url} body=${body.slice(0, 200)}`,
    )
  }
  return res.blob()
}

// A cover is decoration — never block the track on it.
async function saveCover(url: string, signal: AbortSignal | undefined): Promise<string | undefined> {
  try {
    const res = await fetchGeneratedAsset(url, { signal })
    if (!res.ok) return undefined
    const blob = await res.blob()
    return await saveAsset(blob, blob.type || 'image/jpeg')
  } catch {
    return undefined
  }
}

// The duration is a label on the history card, never a gate — so every failure
// path resolves 0 rather than rejecting, and a clip that simply never reports
// metadata resolves too. This runs AFTER kie has generated and billed for the
// audio: hanging here would lose a paid result to a decode that never settles,
// for the sake of a timestamp.
const AUDIO_PROBE_TIMEOUT_MS = 10_000

function probeAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    let settled = false
    const done = (dur: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(dur)
    }
    const timer = setTimeout(() => done(0), AUDIO_PROBE_TIMEOUT_MS)
    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', () => {
      done(isFinite(audio.duration) ? Math.round(audio.duration) : 0)
    })
    audio.addEventListener('error', () => done(0))
    audio.src = url
  })
}
