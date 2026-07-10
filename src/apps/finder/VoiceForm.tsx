import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { VoicePreset } from '../../stores/types'
import { VOICES, DEFAULT_VOICE_SETTINGS, STABILITY_OPTIONS, TTS_V2_MODEL_ID, isV3 } from '../voice-studio/types'
import { getModel } from '../../utils/models'

interface VoiceFormProps {
  item?: VoicePreset | null
  onSave: (data: Omit<VoicePreset, 'id' | 'createdAt'>) => Promise<void> | void
  onCancel: () => void
}

export default function VoiceForm({ item, onSave, onCancel }: VoiceFormProps) {
  const [label, setLabel] = useState(item?.label ?? '')
  const [voiceId, setVoiceId] = useState(item?.voiceId ?? VOICES[0].id)
  const [stability, setStability] = useState<number>(item?.stability ?? DEFAULT_VOICE_SETTINGS.stability)
  const [linkedModelId] = useState(item?.linkedModelId ?? '')
  // Model isn't editable here — a new preset is V2 (the default); presets saved
  // from V3 history keep their model. Stability rendering follows the model.
  const [modelId] = useState(item?.modelId ?? TTS_V2_MODEL_ID)
  const [saving, setSaving] = useState(false)

  const v3 = isV3(modelId)
  const modelName = getModel(modelId)?.displayName ?? 'ElevenLabs'

  useEffect(() => {
    if (item) {
      setLabel(item.label)
      setVoiceId(item.voiceId)
      setStability(item.stability)
    }
  }, [item])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const voice = VOICES.find((v) => v.id === voiceId)
    if (!label.trim() || !voice) return
    setSaving(true)
    try {
      await onSave({
        label,
        modelId,
        voiceId,
        voiceName: voice.name,
        gender: voice.gender,
        stability,
        // V2-only knobs — preserved from the edited preset, else defaults.
        similarityBoost: item?.similarityBoost ?? DEFAULT_VOICE_SETTINGS.similarityBoost,
        style: item?.style ?? DEFAULT_VOICE_SETTINGS.style,
        speed: item?.speed ?? DEFAULT_VOICE_SETTINGS.speed,
        linkedModelId,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-ink-200">
          {item ? 'Edit Voice Preset' : 'New Voice Preset'}
        </h3>
        <button type="button" onClick={onCancel} className="text-ink-500 hover:text-ink-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-ink-500">Label *</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`e.g. "Punchy hook voice"`}
          className="rounded-lg border border-ink/10 bg-transparent px-3 py-2 text-sm text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-ink/20"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-ink-500">Voice *</span>
        <select
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          className="rounded-lg border border-ink/10 bg-surface-1 px-3 py-2 text-sm text-ink-200 outline-none focus:border-ink/20"
        >
          {VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.category} · {v.description}
            </option>
          ))}
        </select>
      </label>

      {/* Model — read-only; shows which ElevenLabs engine this preset targets. */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-ink-500">Model</span>
        <div className="flex items-center gap-2 rounded-lg border border-ink/10 bg-ink/[0.02] px-3 py-2">
          <span className="rounded-full border border-ink/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-ink-300">
            {v3 ? 'V3' : 'V2'}
          </span>
          <span className="text-sm text-ink-200">{modelName}</span>
        </div>
      </div>

      {v3 ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-widest text-ink-500">Stability *</span>
          <div className="mt-1 flex gap-2">
            {STABILITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStability(opt.value)}
                className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                  stability === opt.value
                    ? 'border-voice-400/40 bg-voice-400/15 text-voice-200'
                    : 'border-ink/10 bg-ink/[0.03] text-ink-300 hover:bg-ink/[0.06]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <label className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-widest text-ink-500">Stability *</span>
            <span className="text-[11px] tabular-nums text-ink-400">{stability.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={stability}
            onChange={(e) => setStability(parseFloat(e.target.value))}
            className="mt-1 w-full accent-voice-500"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-ink-700">
            <span>Variable</span>
            <span>Stable</span>
          </div>
        </label>
      )}

      <button
        type="submit"
        disabled={saving}
        className="mt-1 flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? 'Saving…' : (item ? 'Save Changes' : 'Add Voice Preset')}
      </button>
    </form>
  )
}
