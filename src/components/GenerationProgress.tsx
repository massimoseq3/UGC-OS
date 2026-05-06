import { useState, useEffect, useRef } from 'react'

interface GenerationProgressProps {
  isActive: boolean
  color?: string
  messages?: string[]
  className?: string
}

export default function GenerationProgress({
  isActive,
  color = 'bg-sky-500',
  messages,
  className = '',
}: GenerationProgressProps) {
  const [progress, setProgress] = useState(0)
  const startTimeRef = useRef(0)

  useEffect(() => {
    if (!isActive) {
      setProgress(0)
      return
    }

    startTimeRef.current = Date.now()
    const interval = setInterval(() => {
      const seconds = (Date.now() - startTimeRef.current) / 1000
      setProgress(95 * (1 - Math.exp(-seconds / 15)))
    }, 200)

    return () => clearInterval(interval)
  }, [isActive])

  const defaultMessages = ['Preparing...', 'Sending request...', 'Processing...', 'Almost done...']
  const msgs = messages || defaultMessages
  const messageIndex = progress < 15 ? 0 : progress < 35 ? 1 : progress < 75 ? 2 : 3
  const message = msgs[Math.min(messageIndex, msgs.length - 1)]

  if (!isActive) return null

  return (
    <div className={`w-full ${className}`}>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500 ease-out`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-zinc-500">{message}</p>
        <p className="text-xs tabular-nums text-zinc-600">{Math.round(progress)}%</p>
      </div>
    </div>
  )
}
