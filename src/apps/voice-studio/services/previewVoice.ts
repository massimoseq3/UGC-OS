import { useSettingsStore } from '../../../stores/settingsStore'
import { createTask, pollTask, parseResult } from '../../../utils/kie'
import { TTS_MODEL_ID } from '../../../utils/models'
import { DEFAULT_VOICE_SETTINGS } from '../types'

// Unlike ElevenLabs, Gemini 3.1 Flash TTS has no pre-hosted per-voice preview
// files. So we synthesize a short sample on first click using the real model,
// then cache the resulting blob URL for the rest of the session — a voice is
// generated at most once, and replays are instant. This costs a tiny amount of
// credits (one short line) and needs the kie.ai key, unlike the old static
// previews; it's the only way to hear the actual voice.

const PREVIEW_LINE =
  "Hey — this is what my voice sounds like. Let's make your next ad sound amazing."

// voiceName → object URL of the generated preview clip.
const cache = new Map<string, string>()
// voiceName → in-flight promise, so a double click doesn't fire two tasks.
const inflight = new Map<string, Promise<string>>()

export async function getVoicePreview(voiceName: string): Promise<string> {
  const cached = cache.get(voiceName)
  if (cached) return cached
  const existing = inflight.get(voiceName)
  if (existing) return existing

  const promise = (async () => {
    const apiKey = useSettingsStore.getState().getKieApiKey()
    if (!apiKey) throw new Error('Add your kie.ai API key in Settings to preview voices.')

    // Native JSON arrays — kie's fastjson backend rejects stringified fields
    // ("expect {, actual string"). Must match buildVoiceInput's shape.
    // Pull style/pace/accent from DEFAULT_VOICE_SETTINGS so the preview can't
    // drift onto an invalid enum — kie 422s "The style parameter is invalid"
    // if e.g. a Pace value ('Natural') is sent in the Style slot.
    const speakers = [
      {
        speaker_id: 'Speaker 1',
        voice_name: voiceName,
        audio_profile: '',
        style: DEFAULT_VOICE_SETTINGS.style,
        pace: DEFAULT_VOICE_SETTINGS.pace,
        accent: DEFAULT_VOICE_SETTINGS.accent,
      },
    ]
    const dialogue_turns = [{ speaker_id: 'Speaker 1', text: PREVIEW_LINE }]

    const taskId = await createTask(apiKey, TTS_MODEL_ID, { speakers, dialogue_turns, temperature: 1 })
    const record = await pollTask(apiKey, taskId)
    const urls = parseResult(record).resultUrls
    if (urls.length === 0) throw new Error('Preview generation returned no audio.')

    const res = await fetch(urls[0])
    if (!res.ok) throw new Error(`Failed to download preview (${res.status}).`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    cache.set(voiceName, objectUrl)
    return objectUrl
  })()

  inflight.set(voiceName, promise)
  try {
    return await promise
  } finally {
    inflight.delete(voiceName)
  }
}
