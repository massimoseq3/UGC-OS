import { ArrowLeft } from 'lucide-react'
import { VIDEO_PRESETS, type Preset } from '../presets'
import PresetCard from './PresetCard'

interface PresetPickerViewProps {
  onSelect: (preset: Preset) => void
  onClose: () => void
}

// Full-panel slide-in picker — replaces the previous dropdown popover.
// Mirrors the VoicePickerView pattern in voice-studio so the chrome reads
// consistently across right-panel apps.
export default function PresetPickerView({ onSelect, onClose }: PresetPickerViewProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header — back arrow + title, matches VoicePickerView */}
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-100">UGC ad format presets</div>
          <div className="truncate text-[11px] text-zinc-500">
            Pick a format to prefill the prompt + aspect ratio.
          </div>
        </div>
      </div>

      {/* Grid — single column on narrow panel for breathability */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {VIDEO_PRESETS.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              onClick={() => {
                onSelect(preset)
                onClose()
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
