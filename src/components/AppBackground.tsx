import { useEffect, useRef } from 'react'

// Safari doesn't dither CSS gradients, so a near-black radial gradient shows
// hard 8-bit banding there no matter what's layered on top. Instead of a CSS
// gradient we paint the same gradient once into a canvas and add ±2-level
// random noise per pixel — true dithering, so there are no bands left to see
// in any browser. Repainted (debounced) on resize; cost is a one-time pass.
function paint(canvas: HTMLCanvasElement) {
  const w = window.innerWidth
  const h = window.innerHeight
  if (w === 0 || h === 0) return
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Same stops as the old CSS gradient: circle at 0% 0%, farthest-corner.
  const radius = Math.hypot(w, h)
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
  gradient.addColorStop(0, '#1f1f22')
  gradient.addColorStop(0.45, '#09090b')
  gradient.addColorStop(1, '#000000')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  const image = ctx.getImageData(0, 0, w, h)
  const px = image.data
  for (let i = 0; i < px.length; i += 4) {
    const noise = (Math.random() - 0.5) * 4.5
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
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => paint(canvas), 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
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
