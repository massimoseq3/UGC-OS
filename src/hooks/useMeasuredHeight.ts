import { useEffect, useRef, useState } from 'react'

/**
 * The live height of an element, for chrome that is PINNED over a scroller and
 * can change height — B-Roll's storyboard bar, which wraps onto a second line
 * when the pane gets narrow.
 *
 * A pinned bar and the padding its scroller reserves for it are one number
 * written in two places, and every such bar in this app hard-codes both
 * (`h-[57px]` against `pt-[69px]`, and so on) with a comment telling the next
 * person to change them together. That works while the height is fixed. The
 * moment a bar can wrap it doesn't: the reserved padding is right on one line
 * and a row short on two, so the first card lands under the bar exactly when
 * the pane is narrowest and can least afford it.
 *
 * So: measure it. `fallback` is what the caller renders with before the
 * observer has fired — the bar's own one-line height, so the first paint is
 * correct at the width it is usually at.
 *
 * The setState is inside the observer's callback, not the effect body, which is
 * what keeps this clear of the cascading-render rule the React Compiler reads.
 */
export function useMeasuredHeight<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T | null>(null)
  const [height, setHeight] = useState(fallback)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // `getBoundingClientRect` rather than the entry's `borderBoxSize`, which
    // Safari reports as the CONTENT box on an element with `box-sizing:
    // border-box` — a bar's padding and border are exactly the part the
    // scroller has to clear.
    const measure = () => setHeight(el.getBoundingClientRect().height)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, height] as const
}

export default useMeasuredHeight
