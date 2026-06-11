import { useEffect, useRef } from 'react'

// Safari doesn't dither CSS gradients, so a near-black radial gradient shows
// hard 8-bit banding there no matter what's layered on top. We paint the
// gradient into a canvas and add per-pixel random noise — true dithering.
//
// The catch that made earlier attempts fail in Safari: on a Retina display the
// canvas backing store was sized in CSS pixels (1×) while the element is shown
// at 2×, so the browser bilinearly upscaled it — averaging every 2×2 block and
// smoothing the dither right back out, which let the bands return. The fix is
// to paint at the device pixel ratio so the canvas maps 1:1 to physical pixels
// and the noise survives to the screen. Repainted (debounced) on resize / DPR
// change; cost is a one-time pass.
function paint(canvas: HTMLCanvasElement) {
  const cssW = window.innerWidth
  const cssH = window.innerHeight
  if (cssW === 0 || cssH === 0) return
  // Cap DPR at 2 — beyond that the dither is invisibly fine and the pixel
  // buffer (and the noise loop) gets needlessly large.
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.round(cssW * dpr)
  const h = Math.round(cssH * dpr)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Same stops as the old CSS gradient: circle at 0% 0%, farthest-corner.
  // Coordinates are in device pixels now, so the gradient scales naturally.
  const radius = Math.hypot(w, h)
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
  gradient.addColorStop(0, '#1f1f22')
  gradient.addColorStop(0.45, '#09090b')
  gradient.addColorStop(1, '#000000')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  // ±3 levels of independent per-pixel noise. At native resolution this is
  // enough to break every band without reading as visible grain.
  const image = ctx.getImageData(0, 0, w, h)
  const px = image.data
  for (let i = 0; i < px.length; i += 4) {
    const noise = (Math.random() - 0.5) * 6
    px[i] += noise
    px[i + 1] += noise
    px[i + 2] += noise
  }
  ctx.putImageData(image, 0, 0)
}

/** Shared full-screen workspace background: dithered radial gradient. */
export default function AppBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    paint(canvas)

    let timer: number | undefined
    const repaint = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => paint(canvas), 150)
    }
    window.addEventListener('resize', repaint)
    // Dragging the window between a Retina and non-Retina monitor changes the
    // DPR without firing resize — listen for that too so we re-dither at the
    // new density.
    const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    dprQuery.addEventListener?.('change', repaint)
    return () => {
      window.removeEventListener('resize', repaint)
      dprQuery.removeEventListener?.('change', repaint)
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full bg-[#09090b]"
    />
  )
}
