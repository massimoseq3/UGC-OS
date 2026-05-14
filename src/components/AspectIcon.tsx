// Tiny outlined rectangle scaled to a given aspect ratio. Used inline next
// to aspect-ratio chip labels so users can see at a glance what shape '9:16'
// means versus '16:9'. Bounded to a 14×14 box so it stays inline with text
// at any chip size.

interface AspectIconProps {
  ratio: string
  max?: number
}

export default function AspectIcon({ ratio, max = 14 }: AspectIconProps) {
  const [w, h] = ratio.split(':').map(Number)
  if (!w || !h) return null
  const longSide = Math.max(w, h)
  const width = (w / longSide) * max
  const height = (h / longSide) * max
  return (
    <span
      className="inline-block shrink-0 rounded-[2px] border border-current"
      style={{ width: `${width}px`, height: `${height}px` }}
      aria-hidden="true"
    />
  )
}
