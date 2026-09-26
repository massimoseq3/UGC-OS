import type { ReactNode } from 'react'
import { Eye, PenLine } from 'lucide-react'
import Spinner from '../../../components/Spinner'

// The two actions on a research card that matter — Analyze and Remix — as
// LABELLED pills, not two more circles in the hover stack.
//
// They were unlabelled circles among five (Download · Save · Analyze · Remix ·
// Open), one past the four the shared stack allows before it needs a doorway,
// and the two that leave for another app were the two a member had to hover to
// identify. The utility actions stay circles; these take the Bank's "Animate
// in Playground" idiom instead: a solid pill in the DESTINATION app's colour —
// the Ad Analyzer's red, Scripts' blue — revealed with the hover and always
// shown on touch, where the circles sit behind the stack's ⋯.
//
// A right-aligned column at the foot of the frame, not a centred row: a card
// on a two-up phone grid is ~165px wide and its bottom-left corner already
// carries ER and the always-on play / mute pair, so two pills side by side
// would run into them. Anything the card pins to the bottom-right (the
// runtime) goes in as `children`, under the pills, so it keeps its corner and
// the pills stack above it rather than over it.

interface HandoffPillsProps {
  analyze?: HandoffPillSpec
  remix?: HandoffPillSpec
  /** Always-visible chrome that shares the corner, rendered under the pills. */
  children?: ReactNode
}

export interface HandoffPillSpec {
  onClick: () => void
  /** Names the destination and, where there is one, the credit. */
  title: string
  busy?: boolean
  disabled?: boolean
}

export default function HandoffPills({ analyze, remix, children }: HandoffPillsProps) {
  return (
    <div className="absolute bottom-2 right-2 z-10 flex flex-col items-end gap-1.5">
      {(analyze || remix) && (
        // Hidden AND unclickable until the hover: an invisible pill would still
        // take the click, and Remix spends a credit. On touch there is no
        // hover to wait for, so they're simply there — same as the Bank's pill.
        <div
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-none flex flex-col items-end gap-1.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 touch:pointer-events-auto touch:opacity-100"
        >
          {analyze && (
            <Pill spec={analyze} icon={<Eye className="h-3.5 w-3.5" />} tone="border-white/15 bg-[#FF5257]">
              Analyze
            </Pill>
          )}
          {remix && (
            <Pill spec={remix} icon={<PenLine className="h-3.5 w-3.5" />} tone="border-white/15 bg-scripts-500">
              Remix
            </Pill>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

function Pill({ spec, icon, tone, children }: { spec: HandoffPillSpec; icon: ReactNode; tone: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={spec.onClick}
      title={spec.title}
      disabled={spec.disabled || spec.busy}
      // Literal white on a solid accent fill, over user media — both of the
      // documented exceptions to the token rule. A solid CTA lifts on hover
      // (`brightness-110`), never a tint step.
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 ${tone}`}
    >
      {spec.busy ? <Spinner className="h-3.5 w-3.5" /> : icon}
      {children}
    </button>
  )
}
