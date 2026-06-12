import { useLayoutEffect, useRef, useState } from 'react'
import type { ElementType, ReactNode } from 'react'

export interface SegmentedToggleOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ElementType
  // Small count chip rendered after the label (e.g. history length).
  badge?: ReactNode
}

interface SegmentedToggleProps<T extends string> {
  options: Array<SegmentedToggleOption<T>>
  value: T
  onChange: (value: T) => void
  className?: string
  // Default: fills its column with equal-width segments. When true, the
  // control shrinks to its content (segments sized to their labels) so it
  // doesn't stretch across the full width.
  fitContent?: boolean
}

// Rounded pill segmented control — the house replacement for the old
// underline tab strips. Fills its column, segments share the width equally,
// and the active pill slides between segments (measured indicator, 200 ms).
export default function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  className = '',
  fitContent = false,
}: SegmentedToggleProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Map<T, HTMLButtonElement | null>>(new Map())
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  // Re-measured every render (badge counts change segment widths) and on
  // container resize; setState is guarded so it only commits real moves.
  useLayoutEffect(() => {
    const measure = () => {
      const btn = buttonRefs.current.get(value)
      if (!btn) return
      setIndicator((prev) =>
        prev && prev.left === btn.offsetLeft && prev.width === btn.offsetWidth
          ? prev
          : { left: btn.offsetLeft, width: btn.offsetWidth },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  })

  return (
    <div
      ref={containerRef}
      className={`relative ${fitContent ? 'inline-flex w-auto' : 'flex w-full'} items-center gap-0.5 rounded-full border border-ink/10 bg-ink/[0.03] p-1 ${className}`}
    >
      {indicator && (
        <div
          aria-hidden
          className="absolute bottom-1 top-1 rounded-full bg-ink/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] light:shadow-none transition-[left,width] duration-200 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {options.map((opt) => {
        const active = opt.value === value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            ref={(el) => { buttonRefs.current.set(opt.value, el) }}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`relative z-[1] flex min-w-0 ${fitContent ? '' : 'flex-1'} items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-medium tracking-tight transition-colors duration-200 ${
              active ? 'text-ink-100' : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{opt.label}</span>
            {opt.badge != null && (
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums transition-colors duration-200 ${
                  active ? 'bg-ink/10 text-ink-300' : 'bg-ink/[0.04] text-ink-500'
                }`}
              >
                {opt.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
