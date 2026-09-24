// Stop, beside every Run in Flow — the header's Run Flow, a block window's
// Generate, Run View's Run. Two clicks, like every destructive press here:
// the first arms it for three seconds.

import { useState } from 'react'
import { Square } from 'lucide-react'
import { stopRun } from '../../run/runtime'

// `compact` is the header's 40px height, beside Run Flow; the rest sit beside
// a 50px Generate.
export function StopButton({ flowId, compact = false }: { flowId: string; compact?: boolean }) {
  const [armed, setArmed] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        if (!armed) {
          setArmed(true)
          setTimeout(() => setArmed(false), 3000)
          return
        }
        stopRun(flowId)
      }}
      title="Stop · kie.ai finishes anything already sent, and running again picks those up without paying twice"
      className={`flex ${compact ? 'h-10 px-3.5' : 'h-[50px] px-4'} shrink-0 items-center gap-1.5 rounded-full border text-xs font-semibold transition-colors ${armed ? 'border-red-500/50 bg-red-500/15 text-red-300' : 'border-ink/10 text-ink-300 hover:border-ink/20 hover:text-ink-100'}`}
    >
      <Square className="h-3 w-3" />
      {armed ? 'Stop?' : 'Stop'}
    </button>
  )
}
