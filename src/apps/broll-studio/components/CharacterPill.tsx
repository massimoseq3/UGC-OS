import { ChevronRight, User } from 'lucide-react'
import type { Model } from '../../../stores/types'
import { useAssetThumb } from '../../../hooks/useAssetUrl'

// The character every card renders, beside the style pill on the storyboard
// strip. Swapping it re-casts the whole storyboard at no cost: the prompts only
// ever say "the character" (generateBroll / generateContinuous forbid describing
// them), and each card attaches the CURRENTLY selected character's photo when it
// fires — so this is the same bank pick as the left panel's row, reachable from
// where the cards are. Media already generated keeps the old face until it's
// regenerated, exactly like a style swap.
//
// Cut to the style pill's size (38px, 11px padding, 12px label) so the two read
// as one pair of session settings. `shrink-0` with the NAME capped, same reason.
export default function CharacterPill({ model, onClick }: { model: Model | null | undefined; onClick?: () => void }) {
  const { url } = useAssetThumb(model?.characterImage)
  return (
    <button
      type="button"
      onClick={onClick}
      title={model ? 'Change the character every card renders' : 'Choose a character for every card'}
      className="inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-full border border-influencers-500/25 bg-influencers-500/10 px-3.5 text-[12px] font-semibold tracking-tight text-influencers-300 transition-colors hover:border-influencers-500/45 hover:bg-influencers-500/[0.18]"
    >
      {url ? (
        // Bleeds into the pill's left padding so the face sits where the style
        // pill's glyph does, rather than a small avatar floating in a gap.
        <img src={url} alt="" className="-ml-2 h-6 w-6 shrink-0 rounded-full object-cover" />
      ) : (
        <User className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      )}
      <span className="max-w-[160px] truncate">{model?.name || 'Add Character'}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={2.5} />
    </button>
  )
}
