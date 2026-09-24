// Pin to Dock: a pinned flow gets its own dock tile beside Flow and opens
// straight into Run View, like an app of its own.

import { Pin, PinOff } from 'lucide-react'
import { useFlowStore } from '../store/flowStore'

export default function PinButton({ flowId, pinned }: { flowId: string; pinned: boolean }) {
  const setPinned = useFlowStore((s) => s.setPinned)
  const Icon = pinned ? PinOff : Pin
  return (
    <button
      type="button"
      onClick={() => setPinned(flowId, !pinned)}
      title={pinned ? 'Unpin From the Dock' : 'Pin to the Dock · opens straight into Run, like an app'}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${pinned ? 'border-flow-500/30 text-flow-300 hover:border-flow-500/50' : 'border-ink/10 text-ink-300 hover:border-ink/20 hover:text-ink-100'}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden lg:inline">{pinned ? 'Pinned' : 'Pin to Dock'}</span>
    </button>
  )
}
