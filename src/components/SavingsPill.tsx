// The green "N% off" chip: how much cheaper kie is than the provider's own
// official API at the model's representative params (see officialSavingsPercent
// — null for models with no verified official rate, which render no pill).
//
// Shared by every surface that names a model — ModelPicker's trigger and rows,
// ModelPickerModal's rows, and the hand-rolled side-panel triggers in B-Roll and
// Playground. It lived as two identical copies before, and the side-panel
// triggers had none at all, so a video model quoted its discount in the open
// panel and dropped it the moment the panel closed.
//
// `size` is a PROP and not a className override: both sizes are arbitrary-value
// Tailwind utilities of equal specificity, so which one won would come down to
// their order in the generated stylesheet rather than the order they are passed
// in — a caller passing `text-[9px]` would sometimes get 10px.
export default function SavingsPill({
  pct,
  size = 'md',
  className = '',
}: {
  pct: number
  // 'sm' for a row that already carries a rating, a cost meter and a rate: the
  // discount is the least of four things on it, and at the same size as the
  // rest it read as the loudest (Massimo's call, September 2026).
  size?: 'md' | 'sm'
  className?: string
}) {
  return (
    <span
      title="vs the provider's official API price"
      className={`shrink-0 rounded-full border border-dashboard-500/25 bg-dashboard-500/15 font-medium text-dashboard-300 ${
        size === 'sm' ? 'px-1 py-0 text-[9px]' : 'px-1.5 py-px text-[10px]'
      } ${className}`}
    >
      {pct}% off
    </span>
  )
}
