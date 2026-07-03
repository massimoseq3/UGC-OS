import { useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Upload, Bookmark } from 'lucide-react'
import { useCloseOnAppSwitch } from '../../hooks/useCloseOnAppSwitch'

interface SlotActionMenuProps {
  // Anchor element — usually the "+" / upload tile that triggers the menu.
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  onUpload: () => void
  onPickFromBank: () => void
  // Hover mode: the menu opens on hover of the trigger. The click-catching
  // backdrop is dropped (it would sit over the trigger and break hover), and
  // the parent keeps it open by passing mouse handlers that the menu forwards.
  hover?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

// Action menu that pops out of the slot's upload/+ button. Rendered via
// portal so it escapes containers with `overflow-hidden` (the Playground's
// grid-rows height-animation wrapper clips inline-absolute dropdowns).
//
// Auto-flips above the button when there's not enough room below, which
// matters in the Playground because the prompt bar floats near the
// viewport's bottom edge.
export default function SlotActionMenu({ anchorRef, open, onClose, onUpload, onPickFromBank, hover, onMouseEnter, onMouseLeave }: SlotActionMenuProps) {
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'below' | 'above' } | null>(null)

  useCloseOnAppSwitch(open, onClose)

  useLayoutEffect(() => {
    // When closed the component renders null regardless of `pos`, so there's
    // no need to reset position here — reopening re-measures before paint.
    if (!open) return
    function measure() {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const menuHeight = 80 // approx — two 36px rows
      const spaceBelow = window.innerHeight - rect.bottom
      const placement: 'below' | 'above' = spaceBelow >= menuHeight + 8 ? 'below' : 'above'
      setPos({
        top: placement === 'below' ? rect.bottom + 4 : rect.top - menuHeight - 4,
        left: rect.left,
        placement,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, anchorRef])

  if (!open || !pos) return null

  return createPortal(
    <>
      {!hover && <div className="fixed inset-0 z-[55]" onClick={onClose} />}
      <div
        className="fixed z-[60] w-40 overflow-hidden rounded-lg border border-ink/10 bg-surface-2/95 shadow-xl backdrop-blur-xl"
        style={{ top: pos.top, left: pos.left }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <button
          onClick={() => { onClose(); onUpload() }}
          className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-[12px] text-ink-300 transition-colors hover:bg-ink/[0.06]"
        >
          <Upload className="h-3.5 w-3.5 shrink-0" />
          Upload image
        </button>
        <button
          onClick={() => { onClose(); onPickFromBank() }}
          className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-[12px] text-ink-300 transition-colors hover:bg-ink/[0.06]"
        >
          <Bookmark className="h-3.5 w-3.5 shrink-0" />
          Pick from Bank
        </button>
      </div>
    </>,
    document.body,
  )
}
