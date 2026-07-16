import { type RefObject } from 'react'
import { Upload, Bookmark } from 'lucide-react'
import AnchoredPopover from './AnchoredPopover'

interface SlotActionMenuProps {
  // Anchor element — usually the pill / tile that triggers the menu.
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  onUpload: () => void
  onPickFromBank: () => void
}

// Upload / Pick-from-Bank menu that pops out of an image slot.
export default function SlotActionMenu({ anchorRef, open, onClose, onUpload, onPickFromBank }: SlotActionMenuProps) {
  return (
    <AnchoredPopover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      width={160}
      className="overflow-hidden rounded-lg border border-ink/10 bg-surface-2/95 shadow-xl backdrop-blur-xl"
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
    </AnchoredPopover>
  )
}
