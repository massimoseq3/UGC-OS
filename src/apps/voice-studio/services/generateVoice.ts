import type { VoiceSettings, HistoryItem } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { kieTTS } from '../../../utils/kie'
import { getDefaultModel } from '../../../utils/models'
import { saveAsset } from '../../../utils/assetStore'

const TTS_MODEL_ID = 'elevenlabs/text-to-speech-turbo-2-5'

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
  const modelId =
    useSettingsStore.getState().getAppModel('voice-studio:tts') ??
    getDefaultModel('voice-studio', 'tts')?.id ??
    TTS_MODEL_ID

  const urls = await kieTTS(apiKey, modelId, {
    text: scriptText,
    voice: settings.voiceName,
    // Map our 0–2 "creativity" slider to ElevenLabs `style` (0–1).
    style: Math.min(1, Math.max(0, settings.creativity / 2)),
  })

  if (urls.length === 0) throw new Error('TTS returned no audio.')

  const res = await fetch(urls[0])
  if (!res.ok) throw new Error(`Failed to download generated audio (${res.status}).`)
  const blob = await res.blob()
  const duration = await probeAudioDuration(blob)
  const assetId = await saveAsset(blob)

  return {
    id: crypto.randomUUID(),
    voiceName: settings.voiceName,
    gender: settings.gender,
    ambience: settings.ambience,
    creativity: settings.creativity,
    styleInstructions: settings.styleInstructions,
    scriptText,
    scriptPreview: scriptText.slice(0, 80) + (scriptText.length > 80 ? '...' : ''),
    audioUrl: assetId,
    duration,
    createdAt: Date.now(),
  }
}
