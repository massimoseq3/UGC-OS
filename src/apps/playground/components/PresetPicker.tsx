import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { VIDEO_PRESETS, type Preset } from '../presets'
import PresetCard from './PresetCard'

interface PresetPickerProps {
  // Whether presets are applicable to the current Playground mode. Today only
  // Video mode surfaces the full card picker — Image / Music modes hide it.
  onSelect: (preset: Preset) => void
}

// "Presets" button + popover with a 3×2 grid of UGC ad format cards. Anchored
// to the button so the panel renders above the prompt bar.
export default function PresetPicker({ onSelect }: PresetPickerProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function pick(preset: Preset) {
    onSelect(preset)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.06]"
      >
        <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
        <span>Presets</span>
        <ChevronDown className={`h-3 w-3 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        // Outer panel clamps to viewport height so the grid never spills off
        // the top edge no matter where the prompt bar sits. Inner grid
        // scrolls within the panel if it overflows.
        <div className="absolute bottom-full right-0 z-40 mb-2 flex w-[min(560px,calc(100vw-2rem))] max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B0D]/95 shadow-2xl backdrop-blur-xl">
          <div className="shrink-0 border-b border-white/5 px-4 py-3">
            <p className="text-[12px] font-medium text-zinc-200">UGC ad format presets</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Pick a format to prefill the prompt + aspect ratio.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3">
            {VIDEO_PRESETS.map((preset) => (
              <PresetCard key={preset.id} preset={preset} onClick={() => pick(preset)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
