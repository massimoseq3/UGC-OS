// Tiled SVG noise (desaturated fractal turbulence). Safari doesn't dither CSS
// gradients, so a near-black radial gradient shows hard 8-bit banding there —
// a faint grain layer on top breaks the bands up in every browser.
const GRAIN_URL = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

/** Shared full-screen workspace background: radial gradient + grain overlay. */
export default function AppBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,#1f1f22_0%,#09090b_45%,#000000_100%)]" />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{ backgroundImage: GRAIN_URL, backgroundRepeat: 'repeat', backgroundSize: '128px 128px' }}
      />
    </div>
  )
}
