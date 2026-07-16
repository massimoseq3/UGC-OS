import type { RefObject } from 'react'
import { X, type LucideIcon } from 'lucide-react'

// Attachment-bar primitives shared by every Playground input slot. An empty
// slot is a dashed pill; whatever is attached to it renders beside it as a chip
// or a thumbnail. Everything here is h-9, so a model's whole input set reads as
// one wrapping 36px bar rather than a stack of tall cards.

interface RefSlotPillProps {
  icon: LucideIcon
  label: string
  // Rendered as a `count/max` badge. Both or neither.
  count?: number
  max?: number
  // Short muted suffix, e.g. a cap ("≤ 10s") or a why-it's-off note.
  helper?: string
  disabled?: boolean
  onClick: () => void
  triggerRef?: RefObject<HTMLButtonElement | null>
}

export function RefSlotPill({
  icon: Icon,
  label,
  count,
  max,
  helper,
  disabled = false,
  onClick,
  triggerRef,
}: RefSlotPillProps) {
  return (
    <button
      ref={triggerRef}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-ink/15 bg-ink/[0.02] pl-3 pr-2.5 text-[12px] text-ink-400 transition-colors ${
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:border-ink/25 hover:bg-ink/[0.05] hover:text-ink-200'
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
      {helper && <span className="whitespace-nowrap text-[10px] text-ink-600">{helper}</span>}
      {count != null && max != null && (
        <span className="rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[10px] font-medium tabular-nums tracking-tight text-ink-500">
          {count}/{max}
        </span>
      )}
    </button>
  )
}

interface RefChipProps {
  label: string
  // Leading visual — a thumbnail wins over the icon when both are given.
  icon?: LucideIcon
  thumbnail?: string
  // Trailing detail, e.g. a clip's length.
  meta?: string
  // Accent fill, used for bank-backed items (Omni characters).
  accent?: boolean
  onRemove: () => void
}

export function RefChip({ label, icon: Icon, thumbnail, meta, accent = false, onRemove }: RefChipProps) {
  return (
    <div
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border pr-1 text-[12px] ${
        thumbnail ? 'pl-1' : 'pl-3'
      } ${accent ? 'border-playground-500/25 bg-playground-500/10 text-playground-200' : 'border-ink/10 bg-ink/[0.03] text-ink-300'}`}
    >
      {thumbnail ? (
        <img src={thumbnail} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-500" />
      ) : null}
      <span className="max-w-[110px] truncate">{label}</span>
      {meta && <span className="shrink-0 text-[10px] text-ink-600">{meta}</span>}
      <button
        type="button"
        onClick={onRemove}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-ink/10 ${
          accent ? 'text-playground-300' : 'text-ink-500 hover:text-ink-200'
        }`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// Attached reference image. Square tile matching the pill height; hovering
// scrims it and clicking removes it (there's no room for a corner button).
export function RefThumbnail({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      title="Remove reference"
      className="group relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-ink/10"
    >
      <img src={src} alt="" className="h-full w-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
        <X className="h-3.5 w-3.5 text-white" />
      </span>
    </button>
  )
}
