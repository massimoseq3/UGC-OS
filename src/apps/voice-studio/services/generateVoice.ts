import type { VoiceSettings, HistoryItem } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { runTask, parseResult } from '../../../utils/kie'
import { saveAsset } from '../../../utils/assetStore'

const TTS_MODEL_ID = 'elevenlabs/text-to-speech-multilingual-v2'

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

export async function generateVoice(
  settings: VoiceSettings,
  scriptText: string,
): Promise<HistoryItem> {
  const apiKey = useSettingsStore.getState().getKieApiKey()

  // ElevenLabs Multilingual v2 expects a flat object — the v3 dialogue array
  // shape is gone. `voice` accepts a voice ID directly (preset names also
  // work but IDs are stabler across regions).
  const record = await runTask(apiKey, TTS_MODEL_ID, {
    text: scriptText,
    voice: settings.voiceId,
    stability: settings.stability,
    similarity_boost: settings.similarityBoost,
    style: settings.style,
    speed: settings.speed,
  })

  const urls = parseResult(record).resultUrls
  if (urls.length === 0) throw new Error('TTS returned no audio.')

  const res = await fetch(urls[0])
  if (!res.ok) throw new Error(`Failed to download generated audio (${res.status}).`)
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
