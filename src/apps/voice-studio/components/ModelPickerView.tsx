import { ArrowLeft, Check } from 'lucide-react'
import { TTS_V2_MODEL_ID, TTS_V3_MODEL_ID } from '../types'

interface ModelPickerViewProps {
  selectedId: string
  onSelect: (modelId: string) => void
  onClose: () => void
}

// Presentation data for the two ElevenLabs TTS models. Kept here (not in the
// model registry) because it's copy specific to this picker — the registry
// stays the source of truth for ids/pricing.
interface ModelCard {
  id: string
  name: string
  tag?: { label: string; tone: 'recommended' | 'new' }
  description: string
  languages: string[]
  moreLanguages: number
}

const MODELS: ModelCard[] = [
  {
    id: TTS_V2_MODEL_ID,
    name: 'Eleven Multilingual V2',
    tag: { label: 'Recommended', tone: 'recommended' },
    description:
      'Life-like, emotionally rich reads in 29 languages. No prompt engineering needed, just paste your script.',
    languages: ['English', 'Japanese', 'Chinese'],
    moreLanguages: 26,
  },
  {
    id: TTS_V3_MODEL_ID,
    name: 'Eleven V3',
    tag: { label: 'New', tone: 'new' },
    description:
      'Reads audio tags like [excited] or [whispers] for more expressive delivery, in 70+ languages. Hit Enhance to add them for you.',
    languages: ['English', 'Afrikaans', 'Arabic'],
    moreLanguages: 71,
  },
]

const TAG_TONE: Record<'recommended' | 'new', string> = {
  recommended: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300 light:text-emerald-700',
  new: 'border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-300 light:text-fuchsia-700',
}

export default function ModelPickerView({ selectedId, onSelect, onClose }: ModelPickerViewProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-ink/5 px-5 py-4">
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-ink/5 hover:text-ink-100"
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold tracking-tight text-ink-100">Select a model</div>
          <div className="text-xs text-ink-400">Same voices, different engine</div>
        </div>
      </div>

      {/* Model cards */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {MODELS.map((m) => {
            const selected = m.id === selectedId
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                className={`group flex flex-col gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  selected
                    ? 'border-voice-500/40 bg-voice-500/[0.07]'
                    : 'border-ink/10 bg-ink/[0.02] hover:bg-ink/[0.04]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold tracking-tight text-ink-100">{m.name}</span>
                      {m.tag && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TAG_TONE[m.tag.tone]}`}>
                          {m.tag.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      selected ? 'border-voice-500 bg-voice-500 text-white' : 'border-ink/20 text-transparent'
                    }`}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                </div>

                <p className="text-[13px] leading-relaxed text-ink-400">{m.description}</p>

                <div className="flex flex-wrap gap-1.5">
                  {m.languages.map((lang) => (
                    <span key={lang} className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] text-ink-300">
                      {lang}
                    </span>
                  ))}
                  <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] text-ink-400">
                    +{m.moreLanguages} more…
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
