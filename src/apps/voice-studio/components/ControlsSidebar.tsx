import { FolderOpen, Headphones, DoorOpen } from 'lucide-react'
import type { VoiceSettings, Gender, Ambience, VoiceOption } from '../types'
import { VOICES } from '../types'

interface ControlsSidebarProps {
  settings: VoiceSettings
  onSettingsChange: (settings: VoiceSettings) => void
  onLoadPreset: () => void
}

export default function ControlsSidebar({ settings, onSettingsChange, onLoadPreset }: ControlsSidebarProps) {
  const setField = <K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value })
  }

  const handleGenderSwitch = (gender: Gender) => {
    if (gender === settings.gender) return
    const firstVoice = VOICES.find((v) => v.gender === gender)
    onSettingsChange({ ...settings, gender, voiceName: firstVoice?.name ?? settings.voiceName })
  }

  const filteredVoices = VOICES.filter((v) => v.gender === settings.gender)
  const isMale = settings.gender === 'Male'

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

      {/* Creativity slider */}
      <div className="border-b border-white/5 px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">Creativity</span>
          <span className="text-xs tabular-nums text-indigo-400">{settings.creativity.toFixed(1)}</span>
        </div>
        <div className="relative mt-3 h-2 w-full rounded-full bg-white/[0.06]">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-indigo-500/40"
            style={{ width: `${(settings.creativity / 2) * 100}%` }}
          />
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={settings.creativity}
            onChange={(e) => setField('creativity', parseFloat(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-indigo-400 border-2 border-zinc-900 pointer-events-none"
            style={{ left: `calc(${(settings.creativity / 2) * 100}% - 8px)` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-zinc-700">
          <span>Precise</span>
          <span>Creative</span>
        </div>
      </div>

      {/* Room Ambience */}
      <div className="border-b border-white/5 px-4 py-4">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">Room Ambience</span>
        <div className="mt-3 flex gap-2">
          {([
            { value: 'Studio' as Ambience, icon: Headphones, label: 'Studio' },
            { value: 'Small Room' as Ambience, icon: DoorOpen, label: 'Small Room' },
          ]).map(({ value, icon: Icon, label }) => {
            const isActive = settings.ambience === value
            return (
              <button
                key={value}
                onClick={() => setField('ambience', value)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 transition-colors ${isActive ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/[0.03] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300'
                  }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Voice Selection */}
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">Voice</span>

        {/* Gender sliding toggle */}
        <div className="relative mt-2 flex h-8 rounded-full bg-white/[0.04] p-0.5">
          <div
            className={`absolute top-0.5 h-[calc(100%-4px)] w-[calc(50%-2px)] rounded-full bg-white/[0.08] transition-transform duration-200 ease-out ${isMale ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'
              }`}
          />
          {(['Female', 'Male'] as Gender[]).map((g) => (
            <button
              key={g}
              onClick={() => handleGenderSwitch(g)}
              className={`relative z-10 flex-1 text-xs font-medium transition-colors duration-200 ${settings.gender === g ? 'text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'
                }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Voice list — scrollable within bordered box */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/[0.06]">
          <div className="flex flex-col gap-0.5 p-1">
            {filteredVoices.map((voice: VoiceOption) => {
              const isActive = settings.voiceName === voice.name
              return (
                <button
                  key={voice.name}
                  onClick={() => setField('voiceName', voice.name)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors group ${isActive
                      ? 'bg-indigo-500/20'
                      : 'hover:bg-white/[0.04]'
                    }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${isActive ? 'bg-indigo-400' : 'bg-zinc-700 group-hover:bg-indigo-400/50'
                      }`}
                  />
                  <span className={`text-xs font-medium transition-colors ${isActive ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                    {voice.name}
                  </span>
                  <span className={`ml-auto text-[10px] tracking-wide transition-colors ${isActive ? 'text-indigo-400/70' : 'text-zinc-700 group-hover:text-zinc-400/60'}`}>
                    {voice.style}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
