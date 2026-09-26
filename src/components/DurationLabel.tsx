import type { ReactNode } from 'react'
import { Clock } from 'lucide-react'

// The face of every duration chip ("5s", "Auto · 8s"): a clock beside the value,
// the way the aspect chip carries `AspectIcon` and the audio chip its speaker.
// A bare "5s" in a row of three pills was the one chip that didn't say what it
// sets (September 2026, Massimo's call). Scripts' length chip wore the same
// clock first, and this is that glyph at that size, shared so the two can't
// drift.
export default function DurationLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  )
}
