import { useEffect, useState, type ReactNode } from 'react'
import useCloseOnEscape from '../hooks/useCloseOnEscape'
import { useBackdropClose } from '../hooks/useBackdropClose'

// How long the rail takes to travel, in ms. It is handed to the CSS as
// `--rail-ms` rather than written down twice, because the same number also
// decides how long the panel stays mounted after it is dismissed — and a
// keyframe that outlives its unmount timer is a rail that vanishes mid-slide.
const SLIDE_MS = 220

/**
 * The house history rail: a panel that slides in over the pane from its right
 * edge, and slides back out when you click away from it (Massimo's call,
 * September 2026).
 *
 * It used to be a laid-out COLUMN: opening it narrowed the output beside it,
 * and the only way back out was a control you had to go and press — a lip on
 * the seam above 980px, a Close in the rail's own band below it. That is the
 * wrong shape for what a history rail is actually for. You open it to find one
 * thing, and the gesture that follows is always either picking a row or going
 * back to what you were doing; making the second of those a button to aim at,
 * on a panel that is also holding your work hostage 280px narrower, is chrome
 * charging rent. Every other anchored surface in this app — `Menu`,
 * `Dropdown`, `AnchoredPopover` — already answers this with a click-catcher,
 * and a rail is the same promise: show me the list, and get out of the way when
 * I look elsewhere.
 *
 * So: an `absolute` panel over the right of the pane with a dimming catcher
 * behind it, Escape as the keyboard half, and **no close control of its own** —
 * the lip and `RailCloseButton` went with the column shape and
 * `components/HistoryRailHandle.tsx` was deleted. The opener
 * (`HistoryRailToggle` / `HistoryRailClosed`) stays where each app put it;
 * pressing it while the rail is open lands on the catcher, which shuts it, so
 * the one control reads as a toggle either way.
 *
 * **It animates in BOTH directions**, which is why this holds its own mount
 * state instead of a bare `open &&`. The panel travels from the edge on the way
 * in and back to it on the way out, so the rail always says where it came from
 * and where it went; a shut that simply unmounted read as the panel being
 * deleted rather than dismissed. The exit is why `phase` exists: `open` going
 * false starts the slide out, and the panel is unmounted a beat later. The
 * scrim fades out on the same clock, but both it and the panel go
 * `pointer-events-none` the moment the dismissal starts, so nothing on the pane
 * is blocked by an animation the member has already finished with.
 *
 * `phase` is adjusted during render against `prevOpen` rather than in an
 * effect: a setState in an effect body is a cascading render, and the lint rule
 * that says so is one the React Compiler reads too.
 *
 * **The catcher is `fixed`, and it dims the window at `bg-black/50`** — the
 * same backdrop `Modal` and `BankPicker` put behind a picker (Massimo's call,
 * September 2026). A rail opening over one pane while the input column beside
 * it stayed at full brightness read as half a dim rather than as a panel coming
 * forward, and a click on that bright column had nothing to land on, so the one
 * gesture the rail is dismissed by didn't work where a member's eye already
 * was. Viewport-wide fixes both: the whole window steps back and clicking
 * anywhere outside the rail shuts it. A lighter, rail-only dim was tried for an
 * hour and read as a third class of overlay. `fixed` inside the pane rather than a body portal, because the panel it
 * has to paint UNDER is positioned in the pane — portalling the scrim would put
 * it after the panel in the body and over the top of it, and portalling both
 * would cost the rail the geometry it is pinned to. Nothing in the chain from
 * an app pane up to `<body>` carries a `transform`, `filter` or `backdrop-filter`,
 * which are what would turn `fixed` back into pane-relative; if one ever does,
 * this dims one pane again and that is the symptom to look for.
 *
 * Two consequences a host has to honour:
 *
 * - **The host must be `relative`.** This is positioned against the nearest
 *   positioned ancestor, and a rail that escapes its pane lands over the dock.
 * - **Picking a row always hands the pane back**, at every width, because the
 *   rail always covers now. The `useMinWidth(980)` reads that used to decide
 *   that per app are gone; so is every `hidden min-[980px]:flex` the output
 *   column wore to step aside for a rail that no longer displaces it.
 *
 * The panel is opaque and carries a shadow on purpose: it is over the output
 * rather than beside it, and a transparent rail on top of a wall of cards is
 * unreadable. `useBackdropClose` rather than a bare `onClick` — a text drag
 * that starts inside the rail and releases over the catcher fires its `click`
 * on the common ancestor, which would otherwise dismiss the panel mid-select.
 */
export default function RailOverlay({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  useCloseOnEscape(open, onClose)
  const backdrop = useBackdropClose(onClose)

  // null = not mounted. 'in' = sliding in or settled. 'out' = sliding back.
  const [phase, setPhase] = useState<'in' | 'out' | null>(open ? 'in' : null)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setPhase(open ? 'in' : 'out')
  }

  // Unmount once the exit has run. A timer rather than `onAnimationEnd`,
  // because reduced motion collapses the animation to 1ms and a listener on an
  // animation that may not fire is a panel that never leaves.
  useEffect(() => {
    if (phase !== 'out') return
    const t = setTimeout(() => setPhase(null), SLIDE_MS)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === null) return null

  const railMs = { ['--rail-ms' as string]: `${SLIDE_MS}ms` }

  return (
    <>
      {/* `bg-black/50` — the SAME backdrop `Modal` and `BankPicker` put behind
          a picker, and deliberately not a lighter one (Massimo's call,
          September 2026, on seeing a quarter-black: "when the character-from-
          bank modal pops up, it darkens it — that's how I want it"). A rail is
          the same kind of thing as a picker, so it steps the window back by the
          same amount; a dim of its own invented weight just reads as a third
          class of overlay. It fades out WITH the panel rather than vanishing on
          the click (which snapped the window back to full brightness a fifth of
          a second before the rail had finished leaving), and it stops catching
          clicks the moment the dismissal starts — nothing should be blocked by
          an animation the member has already finished with. */}
      <div
        style={railMs}
        className={`fixed inset-0 z-30 bg-black/50 ${
          phase === 'out' ? 'rail-scrim-out pointer-events-none' : 'rail-scrim-in'
        }`}
        {...(open ? backdrop : {})}
      />
      {/* `w-full` below 980px — the rail covers the pane there, the same as the
          column shape did — and **320px** above it (Massimo's call, September
          2026: "that sliding bar can be a bit bigger"). It was 280, the width
          it inherited from being a laid-out column that the output had to pay
          for; over the top it costs the output nothing while it is open, so the
          cards and rows inside it can have the 40px. `stopPropagation` so a
          click inside the rail never reaches the catcher. */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={railMs}
        className={`absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-ink/5 bg-surface-1 shadow-2xl shadow-black/30 min-[980px]:w-[320px] ${
          phase === 'out' ? 'rail-slide-out pointer-events-none' : 'rail-slide-in'
        }`}
      >
        {children}
      </div>
    </>
  )
}
