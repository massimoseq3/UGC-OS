import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { VoicePreset } from '../../stores/types'
import { VOICES, DEFAULT_VOICE_SETTINGS } from '../voice-studio/types'
import AddToProjectButton from '../../components/AddToProjectButton'

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
  const [localProjectIds, setLocalProjectIds] = useState<string[]>(item?.projectIds ?? [])
  const [saving, setSaving] = useState(false)

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
        voiceId,
        voiceName: voice.name,
        gender: voice.gender,
        stability,
        similarityBoost: item?.similarityBoost ?? DEFAULT_VOICE_SETTINGS.similarityBoost,
        style: item?.style ?? DEFAULT_VOICE_SETTINGS.style,
        speed: item?.speed ?? DEFAULT_VOICE_SETTINGS.speed,
        linkedModelId,
        projectIds: item ? item.projectIds : localProjectIds,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">
          {item ? 'Edit Voice Preset' : 'New Voice Preset'}
        </h3>
        <div className="flex items-center gap-2">
          <AddToProjectButton
            bank="voices"
            itemId={item?.id}
            projectIds={item?.projectIds ?? localProjectIds}
            onLocalChange={setLocalProjectIds}
          />
          <button type="button" onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Label *</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`e.g. "Punchy hook voice"`}
          className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Voice *</span>
        <select
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0A0A0A] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
        >
          {VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.category} · {v.description}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Stability *</span>
          <span className="text-[11px] tabular-nums text-zinc-400">{stability.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={stability}
          onChange={(e) => setStability(parseFloat(e.target.value))}
          className="mt-1 w-full accent-indigo-500"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-700">
          <span>Variable</span>
          <span>Stable</span>
        </div>
      </label>

      <button
        type="submit"
        disabled={saving}
        className="mt-1 flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? 'Saving…' : (item ? 'Save Changes' : 'Add Voice Preset')}
      </button>
    </form>
  )
}
