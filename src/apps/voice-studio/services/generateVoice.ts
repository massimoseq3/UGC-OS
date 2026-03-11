import type { VoiceSettings, HistoryItem } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { geminiTTS } from '../../../utils/gemini'
import { saveAsset } from '../../../utils/assetStore'

/**
 * Wraps raw PCM audio data (16-bit, 24kHz, mono) in a WAV header
 * and saves the result to IndexedDB. Returns an asset ID.
 */
async function pcmToWavAsset(base64Pcm: string, sampleRate = 24000): Promise<{ assetId: string; duration: number }> {
  const res = await fetch(`data:application/octet-stream;base64,${base64Pcm}`)
  const pcmBuffer = await res.arrayBuffer()
  const pcmBytes = new Uint8Array(pcmBuffer)

  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcmBytes.length
  const duration = dataSize / byteRate

  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)          // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  const wavBlob = new Blob([header, pcmBytes], { type: 'audio/wav' })
  const assetId = await saveAsset(wavBlob)
  return { assetId, duration: Math.round(duration) }
}

export async function generateVoice(
  settings: VoiceSettings,
  scriptText: string,
): Promise<HistoryItem> {
  const apiKey = useSettingsStore.getState().getApiKey()

  // Build the text prompt with style cues for the TTS model
  let ttsText = scriptText
  if (settings.styleInstructions) {
    ttsText = `Say in a ${settings.styleInstructions} style: ${scriptText}`
  }

  const result = await geminiTTS(apiKey, ttsText, settings.voiceName)

  // The TTS API returns raw PCM audio — wrap it in a WAV container and persist
  const { assetId, duration } = await pcmToWavAsset(result.audioBase64)

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
