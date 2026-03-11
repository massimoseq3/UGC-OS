import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { VoicePreset } from '../../stores/types'

interface VoiceFormProps {
  item?: VoicePreset | null
  onSave: (data: Omit<VoicePreset, 'id' | 'createdAt'>) => void
  onCancel: () => void
}

export default function VoiceForm({ item, onSave, onCancel }: VoiceFormProps) {
  const [label, setLabel] = useState(item?.label ?? '')
  const [voiceName, setVoiceName] = useState(item?.voiceName ?? '')
  const [gender, setGender] = useState<VoicePreset['gender']>(item?.gender ?? 'Female')
  const [styleInstructions, setStyleInstructions] = useState(item?.styleInstructions ?? '')
  const [creativity, setCreativity] = useState(item?.creativity ?? 1.3)
  const [ambience, setAmbience] = useState<VoicePreset['ambience']>(item?.ambience ?? 'Studio')
  const [linkedModelId] = useState(item?.linkedModelId ?? '')

  useEffect(() => {
    if (item) {
      setLabel(item.label)
      setVoiceName(item.voiceName)
      setGender(item.gender)
      setStyleInstructions(item.styleInstructions)
      setCreativity(item.creativity)
      setAmbience(item.ambience)
    }
  }, [item])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim() || !voiceName.trim() || !styleInstructions.trim()) return
    onSave({ label, voiceName, gender, styleInstructions, creativity, ambience, linkedModelId })
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
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Voice Name *</span>
        <input
          value={voiceName}
          onChange={(e) => setVoiceName(e.target.value)}
          placeholder='e.g. "Leda"'
          className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Gender *</span>
        <div className="flex gap-2">
          {(['Female', 'Male'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={`rounded-lg border px-4 py-1.5 text-sm transition-colors ${
                gender === g
                  ? 'border-white/20 bg-white/10 text-zinc-200'
                  : 'border-white/5 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Style Instructions *</span>
        <textarea
          value={styleInstructions}
          onChange={(e) => setStyleInstructions(e.target.value)}
          rows={3}
          placeholder="Conversational, like talking to a friend"
          className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20 resize-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Creativity ({creativity.toFixed(1)})
        </span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={creativity}
          onChange={(e) => setCreativity(parseFloat(e.target.value))}
          className="accent-zinc-400"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Ambience *</span>
        <div className="flex gap-2">
          {(['Studio', 'Small Room'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAmbience(a)}
              className={`rounded-lg border px-4 py-1.5 text-sm transition-colors ${
                ambience === a
                  ? 'border-white/20 bg-white/10 text-zinc-200'
                  : 'border-white/5 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {a}
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
