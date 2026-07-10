import { ChevronRight, RotateCcw } from 'lucide-react'
import type { VoiceSettings } from '../types'
import { DEFAULT_VOICE_SETTINGS, getVoiceById } from '../types'
import { seedColor } from './seedColor'
import Slider from './Slider'

interface SettingsViewProps {
  settings: VoiceSettings
  onSettingsChange: (next: VoiceSettings) => void
  onOpenVoicePicker: () => void
}

export default function SettingsView({ settings, onSettingsChange, onOpenVoicePicker }: SettingsViewProps) {
  const voice = getVoiceById(settings.voiceId)

  const handleReset = () => {
    onSettingsChange({ ...settings, ...DEFAULT_VOICE_SETTINGS })
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col gap-6 px-5 py-6">
        {/* Voice row — clickable, slides into picker */}
        <div>
          <span className="text-sm font-medium text-ink-200">Voice</span>
          <button
            onClick={onOpenVoicePicker}
            className="mt-2 flex w-full items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.03] px-3.5 py-3 text-left transition-colors hover:bg-ink/[0.06]"
          >
            <span
              className="h-8 w-8 shrink-0 rounded-full"
              style={{ background: voice ? seedColor(voice.id) : 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink-100">{settings.voiceName}</div>
              {voice?.description && (
                <div className="truncate text-xs text-ink-400">{voice.description}</div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
          </button>
        </div>

        {/* Model — static row, only one model in use */}
        <div>
          <span className="text-sm font-medium text-ink-200">Model</span>
          <div className="mt-2 flex w-full items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.03] px-3.5 py-3">
            <span className="rounded-full border border-ink/15 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-ink-200">V2</span>
            <span className="text-sm font-medium text-ink-100">Eleven Multilingual v2</span>
          </div>
        </div>

        {/* Sliders */}
        <Slider
          label="Speed"
          tooltip="Controls the speed of the generated speech. Values below 1.0 will slow down the speech, while values above 1.0 will speed it up. Extreme values may affect the quality of the generated speech."
          value={settings.speed}
          min={0.7}
          max={1.2}
          step={0.01}
          leftHint="Slower"
          rightHint="Faster"
          onChange={(speed) => onSettingsChange({ ...settings, speed })}
          format={(v) => `${v.toFixed(2)}×`}
        />

        <Slider
          label="Stability"
          tooltip="Increasing stability will make the voice more consistent between re-generations, but it can also make it sound a bit monotone. On longer text fragments we recommend lowering this value."
          value={settings.stability}
          min={0}
          max={1}
          step={0.01}
          leftHint="More variable"
          rightHint="More stable"
          onChange={(stability) => onSettingsChange({ ...settings, stability })}
        />

        <Slider
          label="Similarity"
          tooltip="High similarity boosts overall voice clarity and resemblance to the chosen voice. Very high values can introduce artifacts, so adjust to find the optimal value for your script."
          value={settings.similarityBoost}
          min={0}
          max={1}
          step={0.01}
          leftHint="Low"
          rightHint="High"
          onChange={(similarityBoost) => onSettingsChange({ ...settings, similarityBoost })}
        />

        <Slider
          label="Style Exaggeration"
          tooltip="Pushes the voice toward the speaking style of the original sample. Higher values amplify expressiveness but may reduce stability — keep low for consistent ad reads."
          value={settings.style}
          min={0}
          max={1}
          step={0.01}
          leftHint="None"
          rightHint="Exaggerated"
          onChange={(style) => onSettingsChange({ ...settings, style })}
        />

        {/* Reset */}
        <div className="mt-1">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-ink-400 transition-colors hover:text-ink-200"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset values
          </button>
        </div>
      </div>
    </div>
  )
}
