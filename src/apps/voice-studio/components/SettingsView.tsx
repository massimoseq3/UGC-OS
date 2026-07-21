import { ChevronRight, RotateCcw } from 'lucide-react'
import type { VoiceSettings } from '../types'
import { DEFAULT_VOICE_SETTINGS, getVoiceById, VOICE_STYLES, VOICE_PACES, VOICE_ACCENTS } from '../types'
import { seedColor } from './seedColor'
import Slider from './Slider'
import Dropdown from './Dropdown'

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
      <div className="flex flex-col gap-4 px-5 pb-6 pt-2">
        {/* Voice — clickable, slides into picker */}
        <div>
          <span className="text-sm font-medium text-ink-200">Voice</span>
          <button
            onClick={onOpenVoicePicker}
            className="mt-1.5 flex w-full items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.03] px-3.5 py-2.5 text-left transition-colors hover:bg-ink/[0.06]"
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

        {/* Style — full width */}
        <Field label="Style">
          <Dropdown value={settings.style} options={VOICE_STYLES} onChange={(style) => onSettingsChange({ ...settings, style })} />
        </Field>

        {/* Pace + Accent — side by side to save vertical space */}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Pace">
            <Dropdown compact value={settings.pace} options={VOICE_PACES} onChange={(pace) => onSettingsChange({ ...settings, pace })} />
          </Field>
          <Field label="Accent">
            <Dropdown compact value={settings.accent} options={VOICE_ACCENTS} onChange={(accent) => onSettingsChange({ ...settings, accent })} />
          </Field>
        </div>

        {/* Expressiveness (temperature) — extra top space so it doesn't crowd
            the dropdowns above. */}
        <div className="pt-2">
          <Slider
            label="Expressiveness"
            tooltip="Controls how much the delivery varies. Lower values are more predictable and consistent between re-generations; higher values are more creative and expressive but less repeatable."
            value={settings.temperature}
            min={0}
            max={2}
            step={0.05}
            leftHint="Focused"
            rightHint="Creative"
            onChange={(temperature) => onSettingsChange({ ...settings, temperature })}
            format={(v) => v.toFixed(2)}
          />
        </div>

        {/* Optional direction — scene + overall tone (always visible) */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-200">Scene <span className="text-ink-500">· optional</span></span>
          <textarea
            value={settings.scene}
            onChange={(e) => onSettingsChange({ ...settings, scene: e.target.value })}
            rows={2}
            maxLength={1000}
            placeholder="e.g. A bright, upbeat product demo in a sunny kitchen."
            className="resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-3.5 py-2.5 text-sm text-ink-100 placeholder-ink-600 outline-none transition-colors focus:border-voice-500/40"
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-200">Tone / context <span className="text-ink-500">· optional</span></span>
          <textarea
            value={settings.sampleContext}
            onChange={(e) => onSettingsChange({ ...settings, sampleContext: e.target.value })}
            rows={2}
            maxLength={1000}
            placeholder="e.g. An excited creator sharing a product they love with a friend."
            className="resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-3.5 py-2.5 text-sm text-ink-100 placeholder-ink-600 outline-none transition-colors focus:border-voice-500/40"
          />
        </div>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-sm font-medium text-ink-200">{label}</span>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}
