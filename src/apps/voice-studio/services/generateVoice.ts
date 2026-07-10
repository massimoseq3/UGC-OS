import type { VoiceSettings, HistoryItem } from '../types'
import { isV3 } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { createTask, pollTask, parseResult, kieChatCompletions, type ChatMessage } from '../../../utils/kie'
import { getChatEndpointPath } from '../../../utils/models'
import { saveAsset } from '../../../utils/assetStore'

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
  // The two ElevenLabs models take different request bodies:
  //  • V3 (Text to Dialogue) — a `dialogue: [{ text, voice }]` array (single
  //    entry here; Voiceovers is one speaker) + discrete `stability`. Audio
  //    tags like [excited] in the text drive delivery; language auto-detects.
  //  • V2 (Multilingual) — a flat body with the full similarity/style/speed set.
  const input = isV3(settings.modelId)
    ? {
        dialogue: [{ text: scriptText, voice: settings.voiceId }],
        stability: settings.stability,
      }
    : {
        text: scriptText,
        voice: settings.voiceId,
        stability: settings.stability,
        similarity_boost: settings.similarityBoost,
        style: settings.style,
        speed: settings.speed,
      }
  const taskId = await createTask(apiKey, settings.modelId, input)
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
    modelId: settings.modelId,
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

// ── Enhance for v3 ──────────────────────────────────────────────
//
// V3's expressiveness comes from ElevenLabs "audio tags" — bracketed cues like
// [excited] or [whispers] inline in the script. Writing them by hand is the
// prompt-engineering V2 doesn't need, so this runs a single LLM pass that
// weaves tasteful tags into the user's existing words and returns the enhanced
// script (words unchanged, only tags added). Only offered when V3 is selected.

const ENHANCE_SYSTEM = `You add ElevenLabs v3 "audio tags" to a voiceover script so a text-to-speech engine reads it more expressively.

Audio tags are single cues in square brackets placed inline, e.g. [excited], [laughs], [whispers], [sighs], [sarcastic], [curious], [warmly], [nervously], [pauses], [emphatic], [cheerful], [serious]. They tell the voice HOW to deliver the next words.

RULES:
- Keep every original word exactly as written, in the same order. You may ONLY insert bracketed tags — never rewrite, add, or remove words.
- Place a tag right before the phrase it affects. Use them where a real voice actor would shift tone (a hook, a punchline, a reveal, an emotional beat, a call-to-action).
- Be tasteful: roughly one tag every 1–2 sentences. Over-tagging sounds robotic. Short scripts might get 2–4 tags total.
- Match the tag to the copy's intent — an energetic UGC ad leans [excited]/[cheerful]; a testimonial leans [warmly]/[sincere].
- Return ONLY the enhanced script text. No preamble, no explanation, no code fences, no quotes around it.`

export async function enhanceForV3(scriptText: string): Promise<string> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()
  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: ENHANCE_SYSTEM }] },
    { role: 'user', content: [{ type: 'text', text: scriptText }] },
  ]
  const raw = await kieChatCompletions(apiKey, endpoint, messages)
  // Strip any stray code fences / surrounding quotes the model may add.
  return raw
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/i, '')
    .replace(/^"([\s\S]*)"$/, '$1')
    .trim()
}
