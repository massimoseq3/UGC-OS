// The flow's past runs, by day. Loading one puts that run's flow and results
// back into the blocks without running anything — one undo step, so it can
// be taken back out.

import { History } from 'lucide-react'
import { useFlowRunStore, loadRun } from '../run/runtime'
import { useAppStore } from '../../../stores/appStore'
import DayPill from '../../../components/DayPill'
import { groupByDay, sectionLabel } from '../../../utils/history'
import { creditsLabel } from '../hooks/useFlowPlan'

const STATUS: Record<string, string> = { done: 'Finished', error: 'Finished with errors', stopped: 'Stopped', running: 'Running' }

export default function RunHistory({ flowId, onDone }: { flowId: string; onDone: () => void }) {
  const log = useFlowRunStore((s) => s.log[flowId]) ?? []
  const addToast = useAppStore((s) => s.addToast)
  const groups = groupByDay(log, (e) => e.startedAt)
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[57px] shrink-0 items-center gap-2 border-b border-ink/5 px-5">
        <History className="h-4 w-4 text-ink-400" />
        {/* The name of the ⋯ row that opens it. */}
        <span className="text-sm font-semibold text-ink-100">Past Runs</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {log.length === 0 && <p className="px-2 py-8 text-center text-xs text-ink-500">Runs of this flow land here. Loading one puts its results back without running anything.</p>}
        {groups.map(([day, entries]) => (
          <div key={day}>
            <DayPill label={sectionLabel(day)} />
            <div className="flex flex-col gap-1">
              {entries.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    if (loadRun(flowId, e.id)) addToast("Loaded that run's results back into the blocks. Nothing re-ran.", 'success')
                    onDone()
                  }}
                  className="flex flex-col items-start gap-0.5 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-ink/[0.05]"
                >
                  <span className="text-[12.5px] font-medium text-ink-100">
                    {new Date(e.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {e.summary}
                  </span>
                  <span className={`text-[11px] ${e.status === 'error' ? 'text-red-400/90' : 'text-ink-500'}`}>
                    {STATUS[e.status] ?? e.status}{e.spent > 0 ? ` · ${creditsLabel(e.spent)}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
