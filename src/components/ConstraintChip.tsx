import { useEffect, useRef, useState } from 'react'

// Compact chip-styled dropdown used for video/image constraint pickers
// (aspect ratio, duration, resolution). Shared by Playground's PromptPanel
// and B-Roll's InputPanel so the two surfaces feel like one app.
export default function ConstraintChip({
  options,
  value,
  onChange,
  render,
  openDirection = 'up',
}: {
  options: string[]
  value: string
  onChange: (next: string) => void
  render?: (v: string) => React.ReactNode
  // 'up' matches Playground's footer position; 'down' is for top-of-page bars.
  openDirection?: 'up' | 'down'
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
        className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3.5 text-[12px] text-zinc-300 transition-colors hover:bg-white/[0.05]"
      >
        {render ? render(value) : <span>{value}</span>}
      </button>
      {open && (
        <div
          className={`absolute left-0 z-40 min-w-[100px] overflow-hidden rounded-md border border-white/10 bg-[#0B0B0D]/95 shadow-xl backdrop-blur-xl ${
            openDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`block w-full px-3 py-1.5 text-left text-[11px] transition-colors ${
                opt === value ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-300 hover:bg-white/[0.05]'
              }`}
            >
              {render ? render(opt) : opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
