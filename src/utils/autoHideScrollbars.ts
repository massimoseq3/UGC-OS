// Smoothly fading overlay scrollbars.
//
// Native webkit scrollbars are kept invisible (see index.css) because Chromium
// won't animate transitions on the scrollbar pseudo-elements — so a CSS-only
// fade just snaps. Instead we draw ONE shared overlay element and reposition it
// over whichever element is being scrolled, fading it in on scroll and out
// after a short idle. Opacity on a real DOM element animates reliably.
//
// The native scrollbar still exists (transparent) so dragging it keeps working;
// this overlay is purely the visible, fading indicator (pointer-events: none).

const IDLE_MS = 1100

export function initAutoHideScrollbars(): void {
  let thumb: HTMLElement | null = null
  let hideTimer = 0
  let frame = 0
  let pending: HTMLElement | null = null

  function getThumb(): HTMLElement {
    if (!thumb) {
      thumb = document.createElement('div')
      thumb.className = 'auto-scrollbar-thumb'
      document.body.appendChild(thumb)
    }
    return thumb
  }

  function paint(el: HTMLElement): void {
    // Opt-out: popover menus (`.scrollbar-hide`) don't want the floating
    // overlay. The overlay is a single fixed element that fades out over ~1.6s
    // (IDLE_MS + transition); if the scroller unmounts first — as a dropdown
    // does on click-off — the thumb is left floating over the page beneath it.
    // These short menus scroll fine with no indicator at all.
    if (el.classList.contains('scrollbar-hide')) return

    const scrollH = el.scrollHeight
    const clientH = el.clientHeight
    if (scrollH <= clientH + 1) return // nothing to scroll

    // Skip elements that don't actually own a scrollbar (e.g. the prompt's
    // overflow-hidden highlight backdrop, which we scroll programmatically).
    const overflowY = getComputedStyle(el).overflowY
    if (overflowY !== 'auto' && overflowY !== 'scroll') return

    const rect = el.getBoundingClientRect()
    const trackH = rect.height
    const thumbH = Math.max(28, (clientH / scrollH) * trackH)
    const maxScroll = scrollH - clientH
    const top = rect.top + (el.scrollTop / maxScroll) * (trackH - thumbH)

    const t = getThumb()
    t.style.height = `${thumbH}px`
    t.style.top = `${top}px`
    t.style.left = `${rect.right - 9}px`
    t.classList.add('is-visible')

    if (hideTimer) window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => t.classList.remove('is-visible'), IDLE_MS)
  }

  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target
      if (!(el instanceof HTMLElement)) return // window/document — skip
      pending = el
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (pending) paint(pending)
      })
    },
    true, // capture — scroll doesn't bubble
  )
}
