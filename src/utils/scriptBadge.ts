// The one palette for a "what kind of script is this" pill, and the one shape
// it is drawn in.
//
// Three surfaces show the same badge and they must not drift: Scripts' history
// rail, the Bank's Scripts tab, and the Select Script picker. They were three
// hand-written class strings, so the same run read as two different things
// depending on where you met it (Massimo's call, September 2026).
//
// It is the house chip (September 2026, Massimo's call — "how we have them in
// the rest of the app"): a tinted wash with a matching hairline and tinted
// text in Title Case, the shape `SavingsPill` and every other status chip
// wears. It was a SOLID fill with a white, bold, all-caps label for a stint,
// on the reasoning that a 9px label over a 15%-alpha wash takes its colour
// from what's behind it; at 11px with the border to hold its edge, the wash
// reads the same on a plain, hovered or selected row, and the all-caps slab
// was the one pill in the app that shouted.
//
// The hues are the app's own. Fuchsia Scenes also tints the Ad Analyzer's
// spoken-line boxes, so a scene blueprint still carries the same colour in the
// app that reverse-engineers one; its section heading icon went monochrome in
// September 2026 (Massimo's call).
// The raw Tailwind hues carry a `light:` text shade; Remix uses `scripts-text`,
// the brand ramp's own readable shade (its 300 is a grey at this size), which
// flips itself.
export const SCRIPT_BADGE = {
  hooks: 'border-amber-500/25 bg-amber-500/15 text-amber-300 light:text-amber-700',
  remix: 'border-scripts-500/25 bg-scripts-500/15 text-scripts-text',
  scenes: 'border-fuchsia-500/25 bg-fuchsia-500/15 text-fuchsia-300 light:text-fuchsia-700',
  cinematic: 'border-sky-500/25 bg-sky-500/15 text-sky-300 light:text-sky-700',
  style: 'border-sky-500/25 bg-sky-500/15 text-sky-300 light:text-sky-700',
  script: 'border-emerald-500/25 bg-emerald-500/15 text-emerald-300 light:text-emerald-700',
} as const

export type ScriptBadgeKind = keyof typeof SCRIPT_BADGE

// The pill itself. Labels are passed in Title Case and rendered as given —
// never `uppercase`.
export const SCRIPT_BADGE_SHAPE =
  'w-fit max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight'
