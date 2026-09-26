// Frosted glass comes off while the page is pinch-zoomed.
//
// A trackpad pinch on a desktop browser is a magnifier: the layout stays put
// and the compositor re-rasters everything at the new scale. Every
// `backdrop-filter` on screen has to be re-sampled and re-blurred at that scale
// too, and a full-window one (a lightbox or modal backdrop) over an editor full
// of 4K pictures is more than Chrome's GPU budget holds: the pinch stalls for a
// second, the whole window flashes black, and tiles come back in blocks.
// Reported as "the app goes black when I pinch in" (September 2026).
//
// Measured in Chrome on the Characters editor with the full-screen viewer open,
// three pinches to 3× and back: 7 all-black frames with the blur on, 0 with
// every `backdrop-filter` set to `none`. Only the two full-window backdrops off
// still left 5 — the menu bar, dock, panels and frosted bars add up — and
// `blur(0px)` is WORSE than the blur (11): it keeps the filter layer and blurs
// by nothing. So the rule in index.css is `none`, on everything.
//
// Pinch-zoom itself stays. A guard that cancelled it (#688) was rolled back
// (#690): members pinch to look closely at a picture. What goes is only the
// blur, only while zoomed — at 80% black the lightbox backdrop reads the same
// without it, and a magnified menu bar has nothing behind it worth frosting.
// Scale 1 puts it all back.
export function initPinchZoomBlur(): void {
  const viewport = window.visualViewport
  if (!viewport) return
  const root = document.documentElement

  function sync(): void {
    // Chrome and Safari both settle on exactly 1 when zoomed back out; the
    // margin only absorbs float noise mid-gesture.
    const zoomed = viewport!.scale > 1.001
    if (zoomed !== root.hasAttribute('data-pinch-zoomed')) {
      root.toggleAttribute('data-pinch-zoomed', zoomed)
    }
  }

  // `resize` fires on every scale step of the gesture, so the attribute lands
  // on the first step — long before the scale is high enough to hurt.
  viewport.addEventListener('resize', sync)
  // A reload keeps the zoom it had.
  sync()
}
