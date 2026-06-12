import { useEffect, useRef, useState } from 'react'

// Compact chip-styled dropdown used for video/image constraint pickers
// (aspect ratio, duration, resolution). Shared by Playground's PromptPanel
// and B-Roll's InputPanel so the two surfaces feel like one app.
export default function ConstraintChip({
  options,
  value,
  onChange,
  render,
  renderOption,
  openDirection = 'up',
  align = 'left',
  size = 'md',
}: {
  options: string[]
  value: string
  onChange: (next: string) => void
  render?: (v: string) => React.ReactNode
  // Optional richer rendering for the dropdown options only (e.g. show the
  // per-option credit cost) while the trigger stays compact via `render`.
  renderOption?: (v: string) => React.ReactNode
  // 'up' matches Playground's footer position; 'down' is for top-of-page bars.
  openDirection?: 'up' | 'down'
  // Horizontal anchor of the menu. 'right' keeps a wide menu from overflowing
  // (and being clipped) when the chip sits near the right edge of its panel.
  align?: 'left' | 'right'
  // 'lg' matches the large ModelPicker trigger height in footer rows.
  size?: 'md' | 'lg'
}) {
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
  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.02] text-ink-300 transition-colors hover:bg-ink/[0.05] ${
          size === 'lg' ? 'h-12 px-4 text-[13px]' : 'h-9 px-3.5 text-[12px]'
        }`}
      >
        {render ? render(value) : <span>{value}</span>}
      </button>
      {open && (
        <div
          className={`absolute z-40 min-w-[140px] overflow-hidden rounded-2xl border border-ink/10 bg-surface-2/95 p-1 shadow-xl backdrop-blur-xl ${
            openDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          } ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`flex w-full items-center whitespace-nowrap rounded-full px-3 py-1.5 text-left text-[11px] transition-colors ${
                opt === value ? 'bg-ink/[0.08] text-ink-100' : 'text-ink-300 hover:bg-ink/[0.05]'
              }`}
            >
              {renderOption ? renderOption(opt) : render ? render(opt) : opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
