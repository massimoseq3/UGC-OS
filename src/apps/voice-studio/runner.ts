// The Voiceovers runner: script + delivery settings → a voiceover in
// `voiceHistory`. The app's Generate calls it, and Flow's Voiceovers block
// will call the same functions — see utils/blockRunner.ts.

import type { VoiceSettings } from './types'
import type { Provenance, VoiceHistoryItem } from '../../stores/types'
import { useSettingsStore, resolveTtsModel } from '../../stores/settingsStore'
import { useBankStore } from '../../stores/bankStore'
import { replayRun } from '../../stores/recordingStore'
import { createTask } from '../../utils/kie'
import { finishAudioAssetTask } from '../../utils/audioTask'
import { estimateCredits, TTS_MODEL_FLASH } from '../../utils/models'
import { humanizeError } from '../../utils/friendlyError'
import { refuseWhileRecording, withProvenance, type BlockRunner } from '../../utils/blockRunner'

export interface VoiceRunInput {
  settings: VoiceSettings
  scriptText: string
  // The TTS model to read it with. Absent means the app's own pick, which is
  // what Voiceovers' Generate always wants; a Flow block will carry its own.
  modelId?: string
}

// A submitted read, persisted between `start` and `finish`. Voiceovers stores
// these under its `:in-flight` key, so the shape is load-bearing: every field
// a pre-runner entry carried keeps its name.
export interface VoiceTask {
  taskId: string
  // Snapshotted at submit rather than re-resolved on resume, so a task that
  // outlives a model swap still finishes (and is priced) as the model that
  // actually ran it. Optional: entries persisted before the picker shipped
  // carry none, and every one of those was fired against Flash.
  modelId?: string
  settings: VoiceSettings
  scriptText: string
  provenance?: Provenance
}

// Gemini TTS bills by tokens, estimated from the script's length (see
// geminiTtsCredits in models.ts). One price for one read — the Generate button
// multiplies by the batch count.
export function estimateVoiceCredits(scriptText: string, modelId: string): number | null {
  return estimateCredits(modelId, { charCount: scriptText.length })
}

// The Gemini TTS `input` body. Both TTS models in the registry take this exact
// body (same speaker fields, same style/pace/accent enums, same 30-voice
// catalog) — only the model id passed to createTask differs. `speakers` and
// `dialogue_turns` go as native JSON arrays — one speaker, one turn for a
// single-voice ad read — plus top-level temperature / scene / sample_context.
// (kie's fastjson backend rejects these fields as strings with "expect {,
// actual string", so they must NOT be JSON.stringify'd.)
export function buildVoiceInput(settings: VoiceSettings, scriptText: string): Record<string, unknown> {
  const speakers = [
    {
      speaker_id: 'Speaker 1',
      voice_name: settings.voiceId, // voiceId === Gemini voice_name
      audio_profile: '',
      style: settings.style,
      pace: settings.pace,
      accent: settings.accent,
    },
  ]
  const dialogue_turns = [{ speaker_id: 'Speaker 1', text: scriptText }]

  const input: Record<string, unknown> = { speakers, dialogue_turns, temperature: settings.temperature }
  // scene / sample_context are optional direction — only send when filled.
  if (settings.scene.trim()) input.scene = settings.scene.trim()
  if (settings.sampleContext.trim()) input.sample_context = settings.sampleContext.trim()
  return input
}

export const voiceRunner = {
  estimate({ scriptText, modelId }) {
    return estimateVoiceCredits(scriptText, modelId ?? resolveTtsModel())
  },

  async start({ settings, scriptText, modelId }, ctx?) {
    refuseWhileRecording()
    const apiKey = useSettingsStore.getState().getKieApiKey()
    const model = modelId ?? resolveTtsModel()
    const taskId = await createTask(apiKey, model, buildVoiceInput(settings, scriptText), ctx?.signal)
    return { taskId, modelId: model, settings, scriptText, provenance: ctx?.provenance }
  },

  async finish(task, ctx?) {
    const modelId = task.modelId ?? TTS_MODEL_FLASH
    const audio = await finishAudioAssetTask(task.taskId, modelId, undefined, { signal: ctx?.signal })
    const { settings, scriptText } = task
    const item = withProvenance<VoiceHistoryItem>(
      {
        id: crypto.randomUUID(),
        modelId,
        voiceId: settings.voiceId,
        voiceName: settings.voiceName,
        gender: settings.gender,
        style: settings.style,
        pace: settings.pace,
        accent: settings.accent,
        temperature: settings.temperature,
        scene: settings.scene || undefined,
        sampleContext: settings.sampleContext || undefined,
        scriptText,
        scriptPreview: scriptText.slice(0, 80) + (scriptText.length > 80 ? '...' : ''),
        audioUrl: audio.assetId,
        duration: audio.durationSeconds ?? 0,
        createdAt: Date.now(),
      },
      task.provenance,
    )
    await useBankStore.getState().addVoiceHistory(item)
    return item
  },

  replay(opts?) {
    return replayRun({ rows: () => useBankStore.getState().voiceHistory, prefix: 'voice', extraMs: opts?.extraMs })
  },

  describeError(err) {
    return humanizeError(err, 'Audio generation failed. Check your API key and try again.')
  },
} satisfies BlockRunner<VoiceRunInput, VoiceTask, VoiceHistoryItem>
