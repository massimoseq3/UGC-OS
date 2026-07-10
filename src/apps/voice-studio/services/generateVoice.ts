import type { VoiceSettings, HistoryItem } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { createTask, pollTask, parseResult } from '../../../utils/kie'
import { saveAsset } from '../../../utils/assetStore'
import { TTS_MODEL_ID } from '../../../utils/models'

// Re-exported so voice-studio components can keep importing it from here.
export { TTS_MODEL_ID }

async function probeAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', () => {
      const dur = isFinite(audio.duration) ? Math.round(audio.duration) : 0
      URL.revokeObjectURL(url)
      resolve(dur)
    })
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url)
      resolve(0)
    })
    audio.src = url
  })
}

// Phase 1: POST createTask, return the kie taskId so the caller can persist
// it before awaiting completion. A mid-flight refresh can resume polling by
// calling finishVoiceTask with the stored taskId.
export async function startVoiceTask(
  settings: VoiceSettings,
  scriptText: string,
): Promise<{ taskId: string }> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  // ElevenLabs Multilingual v2 expects a flat object — the v3 dialogue array
  // shape is gone. `voice` accepts a voice ID directly (preset names also
  // work but IDs are stabler across regions).
  const taskId = await createTask(apiKey, TTS_MODEL_ID, {
    text: scriptText,
    voice: settings.voiceId,
    stability: settings.stability,
    similarity_boost: settings.similarityBoost,
    style: settings.style,
    speed: settings.speed,
  })
  return { taskId }
}

// Phase 2: poll the kie taskId, download the audio, save as an asset, and
// build a HistoryItem from the snapshotted settings + script. Resumable —
// pass the taskId returned by startVoiceTask (possibly from a prior session).
export async function finishVoiceTask(
  taskId: string,
  settings: VoiceSettings,
  scriptText: string,
): Promise<HistoryItem> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const record = await pollTask(apiKey, taskId)
  const urls = parseResult(record).resultUrls
  if (urls.length === 0) {
    throw new Error(
      `TTS returned no audio. taskId=${taskId} record=${JSON.stringify(record).slice(0, 400)}`,
    )
  }

  const res = await fetch(urls[0])
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Failed to download generated audio (${res.status} ${res.statusText}). url=${urls[0]} body=${body.slice(0, 200)}`,
    )
  }
  const blob = await res.blob()
  const duration = await probeAudioDuration(blob)
  const assetId = await saveAsset(blob)

  return {
    id: crypto.randomUUID(),
    voiceId: settings.voiceId,
    voiceName: settings.voiceName,
    gender: settings.gender,
    stability: settings.stability,
    similarityBoost: settings.similarityBoost,
    style: settings.style,
    speed: settings.speed,
    scriptText,
    scriptPreview: scriptText.slice(0, 80) + (scriptText.length > 80 ? '...' : ''),
    audioUrl: assetId,
    duration,
    createdAt: Date.now(),
  }
}

export async function generateVoice(
  settings: VoiceSettings,
  scriptText: string,
): Promise<HistoryItem> {
  const { taskId } = await startVoiceTask(settings, scriptText)
  return finishVoiceTask(taskId, settings, scriptText)
}
