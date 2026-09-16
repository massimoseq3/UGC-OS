// The house on/off switch: a pill track with a wide knob. `accent` names the
// app family the ON track takes, so a switch inside B-Roll reads as B-Roll's.
// Settings' `ToggleRow` keeps its own emerald track — a preference pane has no
// app accent to wear.
const TRACK_ON = {
  broll: 'bg-broll-500',
  rose: 'bg-rose-500',
} as const

export default function Switch({
  checked,
  onChange,
  label,
  accent = 'broll',
  size = 'md',
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name — the switch carries no visible text of its own. */
  label: string
  accent?: keyof typeof TRACK_ON
  size?: 'sm' | 'md'
}) {
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11'
  const knob = size === 'sm' ? 'h-3.5 w-5' : 'h-[18px] w-6'
  const travel = size === 'sm' ? 'translate-x-[10px]' : 'translate-x-[14px]'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full p-[3px] transition-colors ${track} ${
        checked ? TRACK_ON[accent] : 'bg-ink/20'
      }`}
    >
      <span
        className={`inline-block rounded-full bg-white shadow-sm transition-transform duration-200 ${knob} ${
          checked ? travel : 'translate-x-0'
        }`}
      />
    </button>
  )
}
