// A trackpad pinch does not zoom the page.
//
// On a desktop browser a pinch is a MAGNIFIER, not a zoom: the layout stays at
// its own size and the browser blows a crop of it up, so the menu bar, the dock
// and every pinned band scale off the edges of the window and the member pans
// around a picture of the workspace. That picture is re-rastered at the new
// scale on every step of the gesture, and a screen of glass chrome, generating
// tiles and a full-window canvas can't keep up — tiles go blank and blocky
// mid-pinch and snap back after. Reported as the whole app "going funny" on a
// pinch. A native window doesn't magnify its own chrome, and this one is
// dressed as one, so the gesture is simply not handed to the page.
//
// What is NOT taken away:
// - Browser zoom (Cmd/Ctrl + and −). It is a real re-layout at a bigger CSS
//   size, members use it to make the UI readable on camera, and the app is
//   built for it (docs/performance.md).
// - Pinch on a TOUCH screen. It is the accessibility escape hatch index.html
//   deliberately keeps; a finger pinch never arrives as a wheel event, and the
//   Safari gesture half below stands down wherever there is a touch screen.
// - The Flow canvas's own pinch-to-zoom. React Flow reads the same events on
//   its pane and zooms the canvas; cancelling the browser's default here
//   doesn't stop them reaching it.
export function initPinchZoomGuard(): void {
  // Chrome, Edge and Firefox deliver a trackpad pinch as `wheel` with `ctrlKey`
  // set (a held Ctrl plus a mouse wheel looks the same, and is the same zoom).
  // It has to be a non-passive listener or preventDefault is ignored.
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault()
    },
    { passive: false },
  )

  // Safari on a Mac sends its own gesture events for the pinch instead. iOS and
  // iPadOS fire the same events for a two-finger pinch on the glass, which must
  // keep working, and they're the platforms that report touch points — a Mac
  // reports none.
  if (navigator.maxTouchPoints > 0) return
  const cancel = (e: Event) => e.preventDefault()
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, cancel, { passive: false })
  }
}
