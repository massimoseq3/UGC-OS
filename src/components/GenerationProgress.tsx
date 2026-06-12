import { useState, useEffect } from 'react'

interface GenerationProgressProps {
  isActive: boolean
  color?: string
  messages?: string[]
  className?: string
  // Show the static "You can keep working — we'll save this when it's done."
  // helper line. Defaults to true (matches B-Roll Images' framing). Tight
  // surfaces like the Playground in-flight tile pass false to reduce clutter.
  showHelper?: boolean
}

const DEFAULT_MESSAGES = ['Preparing...', 'Sending request...', 'Processing...', 'Almost done...']
const ROTATE_MS = 4000

// Indeterminate generation indicator. No percentage, no elapsed counter —
// both produce anxiety. A shimmer band conveys "alive", a rotating status
// line suggests "real work is happening", and the static expectation line
// keeps users from refreshing the tab mid-job (which cancels the kie task).
export default function GenerationProgress({
  isActive,
  color = 'bg-sky-500',
  messages,
  className = '',
  showHelper = true,
}: GenerationProgressProps) {
  const msgs = messages && messages.length > 0 ? messages : DEFAULT_MESSAGES
  const [index, setIndex] = useState(0)

  // Reset the rotating message to the first line whenever a new generation
  // starts. Done during render (React's "adjust state on prop change" pattern)
  // rather than in an effect, so it doesn't trigger a cascading re-render.
  const [prevActive, setPrevActive] = useState(isActive)
  if (isActive !== prevActive) {
    setPrevActive(isActive)
    setIndex(0)
  }

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % msgs.length)
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [isActive, msgs.length])

  if (!isActive) return null

  return (
    <div className={`w-full ${className}`}>
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-ink/10">
        <div className={`shimmer-band absolute inset-y-0 left-0 w-1/2 ${color} animate-shimmer-sweep`} />
      </div>
      <div className={`${showHelper ? 'mt-2' : 'mt-1.5'} space-y-0.5`}>
        {/* When the helper line is shown, reserve 2 lines for the rotating
            message so the layout doesn't jump on long-message wraps. When
            it's hidden (Scripts / B-Roll prompt-gen), tighten to 1 line so
            there's no awkward gap between the bar and the content below. */}
        <p className={`${showHelper ? 'min-h-[2.25rem]' : ''} text-xs leading-snug text-ink-500`}>{msgs[index]}</p>
        {showHelper && (
          <p className="text-[11px] text-ink-600">This can take a couple of minutes. Keep this tab open.</p>
        )}
      </div>
    </div>
  )
}
