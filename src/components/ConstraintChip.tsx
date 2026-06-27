import { useState } from 'react'

// Compact chip-styled picker used for video/image constraint pickers
// (aspect ratio, duration, resolution, audio). The options reveal on HOVER —
// and on keyboard focus — matching the reference-image hover overlays used
// elsewhere in the app, so there's no extra click just to open the menu.
// Shared by Playground, B-Roll and Influencers so the surfaces feel like one
// app.
export default function ConstraintChip({
  options,
  value,
  onChange,
  render,
  renderOption,
  openDirection = 'up',
  align = 'left',
  size = 'md',
  grow = false,
  triggerClassName,
}: {
  options: string[]
  value: string
  onChange: (next: string) => void
  render?: (v: string) => React.ReactNode
  // Optional richer rendering for the dropdown options only (e.g. show the
  // per-option credit cost) while the trigger stays compact via `render`.
  renderOption?: (v: string) => React.ReactNode
  // 'up' matches Playground's footer position; 'down' is for top-of-page bars.
  openDirection?: 'up' | 'down'
  // Horizontal anchor of the menu. 'right' keeps a wide menu from overflowing
  // (and being clipped) when the chip sits near the right edge of its panel.
  align?: 'left' | 'right'
  // 'lg' matches the large ModelPicker trigger height in footer rows.
  size?: 'md' | 'lg'
  // When true, the chip flexes to fill its share of the row (used to spread the
  // constraint chips across the full width under the model picker).
  grow?: boolean
  // Overrides the trigger's border/background/text classes (the default is a
  // neutral chip). Used by the audio pill to keep its tinted accent when on.
  triggerClassName?: string
}) {
  // The menu reveals purely on hover/focus. Once a choice is clicked the cursor
  // is usually still over the chip (and the option keeps focus), so without this
  // the menu would stay open. `dismissed` force-hides it after a selection and
  // resets the moment the pointer leaves, so the next hover opens it again.
  const [dismissed, setDismissed] = useState(false)
  return (
    <div
      className={`group relative ${grow ? 'flex-1' : ''}`}
      onMouseLeave={() => setDismissed(false)}
    >
      <button
        type="button"
        className={`flex items-center gap-1.5 rounded-full border transition-colors ${
          triggerClassName ?? 'border-ink/10 bg-ink/[0.02] text-ink-300 group-hover:bg-ink/[0.05]'
        } ${grow ? 'w-full justify-center' : ''} ${
          size === 'lg' ? 'h-12 px-4 text-[13px]' : 'h-9 px-3.5 text-[12px]'
        }`}
      >
        {render ? render(value) : <span>{value}</span>}
      </button>
      {/* Hover/focus reveal. The outer wrapper has no margin (it uses padding
          instead) so there's no dead gap between the trigger and the menu —
          the cursor can travel onto the options without the menu closing. */}
      <div
        className={`pointer-events-none absolute z-40 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${
          openDirection === 'up' ? 'bottom-full pb-1' : 'top-full pt-1'
        } ${align === 'right' ? 'right-0' : 'left-0'} ${
          dismissed ? '!pointer-events-none !opacity-0' : ''
        }`}
      >
        <div className="min-w-[140px] overflow-hidden rounded-2xl border border-ink/10 bg-surface-2/95 p-1 shadow-xl backdrop-blur-xl">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={(e) => { onChange(opt); setDismissed(true); e.currentTarget.blur() }}
              className={`flex w-full items-center whitespace-nowrap rounded-full px-3 py-1.5 text-left text-[11px] transition-colors ${
                opt === value ? 'bg-ink/[0.08] text-ink-100' : 'text-ink-300 hover:bg-ink/[0.05]'
              }`}
            >
              {renderOption ? renderOption(opt) : render ? render(opt) : opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
