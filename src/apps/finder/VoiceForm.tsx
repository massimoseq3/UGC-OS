import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { VoicePreset } from '../../stores/types'
import { VOICES } from '../voice-studio/types'

interface VoiceFormProps {
  item?: VoicePreset | null
  onSave: (data: Omit<VoicePreset, 'id' | 'createdAt'>) => void
  onCancel: () => void
}

const STABILITY_OPTIONS: Array<{ value: 0 | 0.5 | 1; label: string }> = [
  { value: 0, label: 'Variable' },
  { value: 0.5, label: 'Natural' },
  { value: 1, label: 'Stable' },
]

export default function VoiceForm({ item, onSave, onCancel }: VoiceFormProps) {
  const [label, setLabel] = useState(item?.label ?? '')
  const [voiceId, setVoiceId] = useState(item?.voiceId ?? VOICES[0].id)
  const [stability, setStability] = useState<0 | 0.5 | 1>(item?.stability ?? 0.5)
  const [linkedModelId] = useState(item?.linkedModelId ?? '')

  useEffect(() => {
    if (item) {
      setLabel(item.label)
      setVoiceId(item.voiceId)
      setStability(item.stability)
    }
  }, [item])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const voice = VOICES.find((v) => v.id === voiceId)
    if (!label.trim() || !voice) return
    onSave({
      label,
      voiceId,
      voiceName: voice.name,
      gender: voice.gender,
      stability,
      linkedModelId,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">
          {item ? 'Edit Voice Preset' : 'New Voice Preset'}
        </h3>
        <button type="button" onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Label *</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`e.g. "Sarah's chill voice"`}
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
              {v.name} · {v.gender} · {v.accent} · {v.style}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Stability *</span>
        <div className="flex gap-2">
          {STABILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStability(opt.value)}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                stability === opt.value
                  ? 'border-white/20 bg-white/10 text-zinc-200'
                  : 'border-white/5 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </label>

      <button
        type="submit"
        className="mt-1 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/15"
      >
        {item ? 'Save Changes' : 'Add Voice Preset'}
      </button>
    </form>
  )
}
