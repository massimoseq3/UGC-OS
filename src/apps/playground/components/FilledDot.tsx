// The mark a toggle segment wears when what it switches to holds something —
// the prompt box's Voice Profile segment. What it holds is off screen whenever
// the other segment is open, and this is what says it's still there (and still
// going into the run).
//
// A flex child, not an inline-block: `align-middle` centres on the lowercase
// x-height, which sat the dot visibly below the middle of a Title Case label.
// The caller wraps the label and this in an `inline-flex items-center` row, so
// it centres on the line box instead.
export default function FilledDot() {
  return <span aria-label="Filled" className="ml-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-playground-400" />
}
