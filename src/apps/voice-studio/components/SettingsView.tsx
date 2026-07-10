import { ChevronRight, RotateCcw } from 'lucide-react'
import type { VoiceSettings } from '../types'
import { DEFAULT_VOICE_SETTINGS, STABILITY_OPTIONS, getVoiceById, isV3 } from '../types'
import { getModel } from '../../../utils/models'
import { seedColor } from './seedColor'
import Slider from './Slider'

interface SettingsViewProps {
  settings: VoiceSettings
  onSettingsChange: (next: VoiceSettings) => void
  onOpenVoicePicker: () => void
  onOpenModelPicker: () => void
}

export default function SettingsView({ settings, onSettingsChange, onOpenVoicePicker, onOpenModelPicker }: SettingsViewProps) {
  const voice = getVoiceById(settings.voiceId)
  const v3 = isV3(settings.modelId)
  const model = getModel(settings.modelId)
  const modelBadge = v3 ? 'V3' : 'V2'

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

        {/* Model row — clickable, slides into model picker */}
        <div>
          <span className="text-sm font-medium text-ink-200">Model</span>
          <button
            onClick={onOpenModelPicker}
            className="mt-2 flex w-full items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.03] px-3.5 py-3 text-left transition-colors hover:bg-ink/[0.06]"
          >
            <span className="rounded-full border border-ink/15 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-ink-200">{modelBadge}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-100">{model?.displayName ?? 'ElevenLabs'}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
          </button>
        </div>

        {v3 ? (
          /* ── V3 controls: discrete stability presets ── */
          <div>
            <span className="text-sm font-medium text-ink-200">Stability</span>
            <p className="mt-1 text-xs text-ink-400">
              Lower is more expressive but varies between takes; higher stays consistent. Add
              audio tags like <span className="text-ink-300">[excited]</span> in your script, or hit
              Enhance in the editor to add them for you.
            </p>
            <div className="mt-2.5 flex gap-2">
              {STABILITY_OPTIONS.map((opt) => {
                const active = settings.stability === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => onSettingsChange({ ...settings, stability: opt.value })}
                    className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'border-voice-400/40 bg-voice-400/15 text-voice-200'
                        : 'border-ink/10 bg-ink/[0.03] text-ink-300 hover:bg-ink/[0.06]'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          /* ── V2 controls: the full slider set ── */
          <>
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
          </>
        )}

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
