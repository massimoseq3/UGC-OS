import { Plus } from 'lucide-react'

// The primary button a history rail leads with — the Ad Analyzer's "New
// Analysis" shape, in the host app's accent.
//
// `h-[38px]` is STATED rather than left to fall out of `text-[13px]`'s line
// box, because a second surface now matches it: B-Roll's storyboard bar sits
// directly across the seam from this button and its pills are pinned to the
// same number, so the two bands read level (Massimo's call, September 2026).
// Left to the font metric it measured 37.5px here — half a pixel, and a
// different fallback face would have moved it without anything else changing.
//
// **ONE CLICK, in every app** (Massimo's call, September 2026). Scripts' and
// B-Roll's carried a two-click arm for a while, on the reasoning that clearing
// the INPUT column alongside the canvas throws away setup no history row holds
// a copy of. That reasoning was wrong about what the press costs: the member
// pressing New has already decided to start something else, so the second click
// lands on every single press and taxes the common case to guard a stray one
// that — since every output stays in History — costs a re-pick, not data. The
// `confirm` prop and its monochrome armed state went with it, so there is no
// switch left for a fourth rail to turn back on by accident.
export default function RailNewButton({
  label,
  onClick,
  accentClass,
  title,
  className = '',
}: {
  label: string
  onClick: () => void
  // The fill, as a literal class — Tailwind can't build one from a prop.
  accentClass: string
  title?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-[38px] min-w-0 items-center justify-center gap-2 rounded-full border border-white/15 px-4 text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(255,255,255,0.08)] transition-all btn-soft-shadow glass-fill glass-fill-soft hover:brightness-110 ${accentClass} ${className}`}
    >
      <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
      <span className="truncate">{label}</span>
    </button>
  )
}
