import { PROVIDER_MARKS } from './providerMarks'

// Brand marks for the model pickers. The paths themselves live in
// `providerMarks.ts` (so a glyph can be drawn outside a picker row without a
// second copy of it); this file is how one is PAINTED.
//
// EVERY mark renders MONOCHROME, in `currentColor` on a faint disc. The brand
// colours were the marks' own — Google's four-colour G, Kling's and Wan's and
// MiniMax's gradients, ByteDance's four blues — and a picker is a column of a
// dozen of them: eight different palettes down one edge is the loudest thing in
// a panel whose job is the NAMES and the numbers beside them, and the one badge
// that is supposed to carry colour (the amber star, the green "% off" chip) had
// to compete with it. One tone also means a mark can't fight the theme — every
// gradient was picked against a dark page and several of them muddied on white.
// So a new entry is a viewBox plus its paths; there is no per-provider colour
// to choose, and adding one is the thing this file exists to prevent.

interface ProviderLogoProps {
  provider: string
  size?: 'sm' | 'md'
}

const SIZE_CLASS: Record<NonNullable<ProviderLogoProps['size']>, string> = {
  sm: 'h-6 w-6',
  md: 'h-7 w-7',
}

const ICON_PADDING: Record<NonNullable<ProviderLogoProps['size']>, string> = {
  sm: 'p-1',
  md: 'p-1.5',
}

// The disc and the ink every mark is drawn in. One pair for the whole table —
// see the note at the top of the file.
const DISC = 'bg-ink/[0.04]'
const MARK = 'text-ink-100'

function FallbackLetter({ provider, size }: { provider: string; size: NonNullable<ProviderLogoProps['size']> }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-ink-800/60 font-semibold text-ink-300 ${SIZE_CLASS[size]} ${size === 'sm' ? 'text-[10px]' : 'text-[11px]'}`}>
      {provider.charAt(0).toUpperCase()}
    </div>
  )
}

export default function ProviderLogo({ provider, size = 'md' }: ProviderLogoProps) {
  const entry = PROVIDER_MARKS[provider]
  if (!entry) return <FallbackLetter provider={provider} size={size} />

  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full ${DISC} ${SIZE_CLASS[size]} ${ICON_PADDING[size]}`}>
      <svg viewBox={entry.viewBox} className={`h-full w-full ${MARK}`} fill="currentColor" aria-hidden>
        {entry.paths.map((d) => (
          <path key={d} d={d} fillRule={entry.fillRule} />
        ))}
      </svg>
    </div>
  )
}
