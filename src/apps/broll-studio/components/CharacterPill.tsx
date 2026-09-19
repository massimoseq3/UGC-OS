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
// as one pair of session settings. On B-Roll's header band the pair is `min-w-0`
// rather than `shrink-0`: the two names are the first width that row asks back
// when it runs out, and they give it before anything is hidden.
export default function CharacterPill({
  model,
  onClick,
  // How the NAME renders. It defaults to the pill's own capped-and-truncating
  // span; B-Roll's header band passes a container-query version that gives the
  // name up entirely once the band is too narrow to read one, which leaves the
  // face and the chevron — still a legible "who this storyboard is". The class
  // is the caller's because the query names a container only that caller has.
  nameClassName = 'max-w-[160px] truncate',
  // Whether the pill holds its width or gives it. `shrink-0` is the default
  // (a bar that wraps wants whole pills on each line); B-Roll's header band
  // passes `min-w-0`, which is what lets the name above actually truncate.
  className = 'shrink-0',
}: {
  model: Model | null | undefined
  onClick?: () => void
  nameClassName?: string
  className?: string
}) {
  const { url } = useAssetThumb(model?.characterImage)
  return (
    <button
      type="button"
      onClick={onClick}
      title={model ? 'Change the character every card renders' : 'Choose a character for every card'}
      className={`inline-flex h-[38px] items-center gap-1.5 rounded-full border border-influencers-500/25 bg-influencers-500/10 px-3.5 text-[13px] font-semibold tracking-tight text-influencers-300 transition-colors hover:border-influencers-500/45 hover:bg-influencers-500/[0.18] ${className}`}
    >
      {url ? (
        // Bleeds into the pill's left padding so the face sits where the style
        // pill's glyph does, rather than a small avatar floating in a gap.
        <img src={url} alt="" className="-ml-2 h-6 w-6 shrink-0 rounded-full object-cover" />
      ) : (
        <User className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      )}
      <span className={nameClassName}>{model?.name || 'Consistent Character'}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={2.5} />
    </button>
  )
}
