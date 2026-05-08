import { useState } from 'react'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  leftHint: string
  rightHint: string
  onChange: (v: number) => void
  format?: (v: number) => string
  /**
   * Optional descriptive tooltip shown on hover over the label.
   * Multi-line copy explaining what the parameter controls.
   */
  tooltip?: string
}

const defaultFormat = (v: number) => v.toFixed(2)

export default function Slider({
  label,
  value,
  min,
  max,
  step,
  leftHint,
  rightHint,
  onChange,
  format = defaultFormat,
  tooltip,
}: SliderProps) {
  const [active, setActive] = useState(false)
  const [labelHover, setLabelHover] = useState(false)
  const pct = ((value - min) / (max - min)) * 100

  const trackStyle = {
    ['--slider-pct' as string]: `${pct}%`,
  } as React.CSSProperties

  return (
    <div>
      {/* Title row — label (with hover tooltip) and current value */}
      <div className="flex items-baseline justify-between">
        <span
          className="relative cursor-help text-sm font-medium text-zinc-200"
          onMouseEnter={() => setLabelHover(true)}
          onMouseLeave={() => setLabelHover(false)}
          onFocus={() => setLabelHover(true)}
          onBlur={() => setLabelHover(false)}
          tabIndex={tooltip ? 0 : -1}
        >
          {/* Underlined label so users notice it's interactive */}
          <span className={tooltip ? 'underline decoration-dotted decoration-zinc-600 underline-offset-4' : ''}>
            {label}
          </span>

          {tooltip && labelHover && (
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-72 rounded-xl bg-black px-3.5 py-2.5 text-[12px] font-normal leading-snug text-zinc-100 shadow-xl ring-1 ring-white/10"
            >
              {tooltip}
            </span>
          )}
        </span>
        <span className="text-xs tabular-nums text-zinc-500">{format(value)}</span>
      </div>

      {/* Hint row — sits tight above the slider track */}
      <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-400">
        <span>{leftHint}</span>
        <span>{rightHint}</span>
      </div>

      {/* Slider — wrapped so we can position the floating value bubble */}
      <div className="relative">
        {active && (
          <div
            className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-900 shadow-lg"
            style={{ left: `calc(${pct}% + ${(0.5 - pct / 100) * 12}px)` }}
          >
            {format(value)}
          </div>
        )}

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onPointerDown={() => setActive(true)}
          onPointerUp={() => setActive(false)}
          onPointerLeave={() => setActive(false)}
          onFocus={() => setActive(true)}
          onBlur={() => setActive(false)}
          className="slider-thin"
          style={trackStyle}
        />
      </div>
    </div>
  )
}
