import { useLayoutEffect, useRef } from 'react'

// A menu opened at a point in the canvas's box, moved left and up just enough
// to stay inside it: the canvas clips whatever runs past its edge, and a menu
// opened from a block's right-hand + or near the bottom lost its last rows.
// Measured after it lays out, so each menu is held in by its own size, and on
// every render, so a list that grows as it's filtered stays in too. The
// position is written straight onto the element before paint — a state round
// trip would draw it once in the wrong place first.
export function useKeepInside<T extends HTMLElement>(x: number, y: number) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.offsetParent
    if (!el || !(box instanceof HTMLElement)) return
    el.style.left = `${Math.max(8, Math.min(x, box.clientWidth - el.offsetWidth - 8))}px`
    el.style.top = `${Math.max(8, Math.min(y, box.clientHeight - el.offsetHeight - 8))}px`
  })
  return ref
}
