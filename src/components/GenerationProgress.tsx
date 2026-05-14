import { useState, useEffect } from 'react'

interface GenerationProgressProps {
  isActive: boolean
  color?: string
  messages?: string[]
  className?: string
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
}: GenerationProgressProps) {
  const msgs = messages && messages.length > 0 ? messages : DEFAULT_MESSAGES
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!isActive) {
      setIndex(0)
      return
    }
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % msgs.length)
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [isActive, msgs.length])

  if (!isActive) return null

  return (
    <div className={`w-full ${className}`}>
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`absolute inset-y-0 left-0 w-1/3 rounded-full ${color} animate-shimmer-sweep`} />
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="text-xs text-zinc-500">{msgs[index]}</p>
        <p className="text-[11px] text-zinc-600">This can take a couple of minutes — keep this tab open.</p>
      </div>
    </div>
  )
}
