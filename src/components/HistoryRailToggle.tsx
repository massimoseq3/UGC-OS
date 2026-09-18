import { Layers } from 'lucide-react'

// The control that OPENS a history rail — a 38px circle in the app's own
// icon-button material, laid out rather than overlaid, and WHERE it sits is the
// caller's business, and in every app it now LEADS a `h-[57px]` header band on
// the output pane — B-Roll's storyboard bar, Playground's history header, and a
// band of their own in Scripts and Voiceovers. It was a stub COLUMN on the
// right in those two (a `HistoryRailClosed` wrapper, now deleted), which
// narrowed the output by ~135px to hold one button and put the way into the
// list at the far end of the pane; it floated over the output for an hour after
// that and stood on the first card it was above (Massimo's call, September
// 2026: "extend that horizontal separator line across the panel and have it in
// its own little panel, like the Playground tab").
//
// It no longer has a shutting counterpart. The rail became an overlay that
// dismisses when you click away from it (September 2026, Massimo's call —
// `components/RailOverlay`), which took the lip on the seam and the Close in
// the rail's band with it: pressing this while the rail is open lands on the
// catcher, so the one control reads as a toggle either way.
//
// A pull tab tried to do both jobs for a day and failed: costing no layout is
// worth nothing if the thing it overlaps is chrome, and every one of these
// output columns puts a full-width bar across its own top — B-Roll's batch
// strip, Voiceovers' script picker row — which a shut-state tab pinned to the
// corner landed on. The version before that was a 40px bordered strip, which
// read as a second panel.
export default function HistoryRailToggle({
  open,
  onToggle,
  label = 'history',
  showLabel = false,
  count,
  labelClassName = 'text-[13px]',
}: {
  open: boolean
  onToggle: () => void
  // The noun for the tooltip — "history" reads right in all three apps today.
  label?: string
  // Shut, the button is the only thing left standing where the rail was, so it
  // says the word as well as drawing the glyph (September 2026, Massimo's
  // call). Open, it is behind the rail's catcher and nothing reads it.
  //
  // It gives way below 980px — the width at which the rail stops being a column
  // at all — because there the shut column is a stub against a full-width pane,
  // and ~135px of label is a third of a phone's screen taken from the output.
  showLabel?: boolean
  // How many rows are waiting behind it. Omitted (or 0) draws no pill: an empty
  // history is not a number worth a badge.
  count?: number
  // The label's type size. Every host now runs the app's own 13px control size
  // (B-Roll's bar was 12px and came up to meet it in September 2026 — one panel
  // shouldn't set its buttons a point under everything else in the app), so
  // this survives only for a bar that genuinely needs a different one.
  labelClassName?: string
}) {
  const title = open ? `Hide ${label}` : `Show ${label}`
  // The STACK, the same mark Playground's project rail heads All Generations
  // with (Massimo's call, September 2026). It was a panel-open/panel-close pair
  // first, which described the chrome — a drawer coming out of the right edge —
  // and a clock-rewind after that, which described the time. What every one of
  // these rails actually holds is a pile of work you made, and a stack is what
  // says that; using the same glyph in both places means the button and the row
  // it opens onto are recognisably one thing.
  const Icon = Layers
  // The tooltip's noun is lowercase mid-sentence; the label is a heading.
  const word = label.charAt(0).toUpperCase() + label.slice(1)
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      aria-label={title}
      aria-expanded={open}
      // The app's own icon-button material — the ring and faint wash the `+`
      // every output panel heads its bar with (`ClearAllButton iconOnly`). It
      // was a bare glyph on the panel's background, which put the one control
      // in that band with no surface of its own beside a solid CTA. Carrying a
      // label it is the same ring stretched to a pill.
      //
      // `38px`, not that button's own 36: the height is stated on
      // `RailNewButton` so the rail's band reads level with B-Roll's storyboard
      // bar across the seam, and this sits in that same row. The material is
      // what was borrowed, not the size.
      className={`flex h-[38px] shrink-0 items-center rounded-full border border-ink/10 bg-ink/[0.03] text-ink-300 transition-colors hover:bg-ink/[0.08] hover:text-ink-100 ${
        showLabel ? 'justify-center gap-2 px-2.5' : 'w-[38px] justify-center'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
      {showLabel && (
        <>
          <span className={`hidden font-medium tracking-tight min-[980px]:inline ${labelClassName}`}>{word}</span>
          {count ? (
            // The house count pill — same chip B-Roll's Download Clips wears.
            <span className="hidden rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-ink-200 min-[980px]:inline-block">
              {count}
            </span>
          ) : null}
        </>
      )}
    </button>
  )
}
