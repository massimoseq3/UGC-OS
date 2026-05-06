import { useState } from 'react'
import { FolderOpen, Play } from 'lucide-react'
import type { VoiceSettings, Stability, Accent, Gender, VoiceOption } from '../types'
import { VOICES, filterVoices } from '../types'

interface ControlsSidebarProps {
  settings: VoiceSettings
  onSettingsChange: (settings: VoiceSettings) => void
  onLoadPreset: () => void
}

const STABILITY_OPTIONS: Array<{ value: Stability; label: string; hint: string }> = [
  { value: 0,   label: 'Variable',   hint: 'More expressive' },
  { value: 0.5, label: 'Natural',    hint: 'Default' },
  { value: 1,   label: 'Stable',     hint: 'Very consistent' },
]

const GENDER_FILTERS: Array<Gender | 'All'> = ['All', 'Female', 'Male']
const ACCENT_FILTERS: Array<Accent | 'All'> = ['All', 'American', 'British', 'Australian', 'Other']

export default function ControlsSidebar({ settings, onSettingsChange, onLoadPreset }: ControlsSidebarProps) {
  const [genderFilter, setGenderFilter] = useState<Gender | 'All'>('All')
  const [accentFilter, setAccentFilter] = useState<Accent | 'All'>('All')

  const filteredVoices = filterVoices(VOICES, { gender: genderFilter, accent: accentFilter })

  const setVoice = (voice: VoiceOption) => {
    onSettingsChange({
      ...settings,
      voiceId: voice.id,
      voiceName: voice.name,
      gender: voice.gender,
    })
  }

  const setStability = (s: Stability) => onSettingsChange({ ...settings, stability: s })

  const previewVoice = (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `https://static.aiquickdraw.com/elevenlabs/voice/${voiceId}.mp3`
    new Audio(url).play().catch(() => {
      // Preview not available for this voice — silently skip
    })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Load Voice Preset */}
      <div className="border-b border-white/5 p-4">
        <button
          onClick={onLoadPreset}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-6 py-3 text-[13px] font-medium tracking-tight text-indigo-400 transition-colors hover:bg-indigo-500/20"
        >
          <FolderOpen className="h-4 w-4" />
          Load Voice Preset
        </button>
      </div>

      {/* Stability — three discrete values per ElevenLabs v3 */}
      <div className="border-b border-white/5 px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">Stability</span>
          <span className="text-[10px] text-zinc-700">
            {STABILITY_OPTIONS.find((o) => o.value === settings.stability)?.hint}
          </span>
        </div>
        <div className="mt-3 flex gap-1 rounded-lg bg-white/[0.04] p-1">
          {STABILITY_OPTIONS.map((opt) => {
            const active = settings.stability === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setStability(opt.value)}
                className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                  active ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-white/5 px-4 py-4 space-y-3">
        <div>
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Gender</span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {GENDER_FILTERS.map((g) => {
              const active = genderFilter === g
              return (
                <button
                  key={g}
                  onClick={() => setGenderFilter(g)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    active ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/[0.04] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300'
                  }`}
                >
                  {g}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Accent</span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {ACCENT_FILTERS.map((a) => {
              const active = accentFilter === a
              return (
                <button
                  key={a}
                  onClick={() => setAccentFilter(a)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    active ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/[0.04] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300'
                  }`}
                >
                  {a}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Voice Selection */}
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">Voice</span>
          <span className="text-[10px] text-zinc-700">{filteredVoices.length} of {VOICES.length}</span>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/[0.06]">
          {filteredVoices.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <span className="text-[11px] text-zinc-700">No voices match these filters.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 p-1">
              {filteredVoices.map((voice) => {
                const isActive = settings.voiceId === voice.id
                return (
                  <button
                    key={voice.id}
                    onClick={() => setVoice(voice)}
                    className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                      isActive ? 'bg-indigo-500/20' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                        isActive ? 'bg-indigo-400' : 'bg-zinc-700 group-hover:bg-indigo-400/50'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className={`truncate text-xs font-medium ${isActive ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                          {voice.name}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-zinc-700">
                          {voice.accent}
                        </span>
                      </div>
                      <div className={`truncate text-[10px] ${isActive ? 'text-indigo-400/70' : 'text-zinc-700'}`}>
                        {voice.style}
                      </div>
                    </div>
                    <button
                      onClick={(e) => previewVoice(voice.id, e)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
                      title="Preview voice"
                    >
                      <Play className="h-3 w-3" />
                    </button>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
