import type { ScriptHistoryItem } from '../../../stores/types'
import type { PendingScriptRun, RemixAngle, ScriptMode, WriteFormat } from '../types'
import OutputPanel from './OutputPanel'
import HistoryRail from './HistoryRail'
import RailOverlay from '../../../components/RailOverlay'
import HistoryRailToggle from '../../../components/HistoryRailToggle'

interface RightPanelProps {
  variations: string[]
  outputAngles?: RemixAngle[] | null
  // Live left-panel mode — drives the empty/loading copy.
  mode: ScriptMode
  // Mode that produced the shown variations — drives the cards' labels.
  outputMode: ScriptMode
  writeFormat: WriteFormat
  writeStyleLabel: string
  // Hooks format only — labels the pack's card ("Best Mix" / a family name).
  hookCategoryLabel: string
  // Hooks format only — the live pick, so the empty/loading copy names the
  // number of hooks the next Generate will actually write.
  hookCount: number
  linkedProductId: string | null
  // The run this pane is parked on while it writes, or null when it is showing
  // finished work. Non-null is the one state that draws the writing face.
  watchedRun: PendingScriptRun | null
  // The active run's id — a generation stamps a new one, a history restore
  // stamps that row's. The panel scrolls to the top on this and nothing else.
  activeHistoryId: string | null
  error: string | null
  // Commits an inline edit of take `index` back to the persisted output state.
  onEditVariation: (index: number, text: string) => void
  // Remix only: the run's one voice brief, shown above the takes. Empty → no card.
  voiceProfile?: string
  onEditVoiceProfile?: (text: string) => void

  // "Clear the canvas" — owned by the app, because picking from History is what
  // uncovers it again and the app is what knows a pick happened (restoring the
  // very run that was cleared changes neither the takes nor the active id).
  // The app's handler resets the SETUP COLUMN alongside the canvas; the rail's
  // New button is where it fires from, and it arms first.
  cleared: boolean
  onClearCanvas: () => void

  history: ScriptHistoryItem[]
  // Every run still being written. They are History rows from the moment they
  // are fired, so they lead the rail rather than owning the Output pane.
  pendingRuns: PendingScriptRun[]
  onSelectHistory: (item: ScriptHistoryItem) => void
  onWatchPending: (run: PendingScriptRun) => void
  onDeleteHistory: (id: string) => void
  historyOpen: boolean
  onToggleHistory: () => void
}

export default function RightPanel({
  variations,
  outputAngles,
  mode,
  outputMode,
  writeFormat,
  writeStyleLabel,
  hookCategoryLabel,
  hookCount,
  linkedProductId,
  watchedRun,
  activeHistoryId,
  error,
  onEditVariation,
  voiceProfile,
  onEditVoiceProfile,
  cleared,
  onClearCanvas,
  history,
  pendingRuns,
  onSelectHistory,
  onWatchPending,
  onDeleteHistory,
  historyOpen,
  onToggleHistory,
}: RightPanelProps) {
  // This pane carries NO header band. It held an Output / History
  // `SegmentedToggle` and the canvas reset; history is a rail beside the takes
  // now and the reset leads that rail, which left 57px saying nothing over the
  // one thing this column is for. The takes start at the top of the pane and
  // the switcher already floats there.
  return (
    // `relative` is what `RailOverlay` positions against — without it the rail
    // escapes this pane and lands over the dock.
    <div className="relative flex h-full min-h-0">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* The output pane's header band, and the way into the rail leads it —
            the same `h-[57px]` hairline Playground's history header and
            B-Roll's storyboard bar carry, so every pane answers "where is the
            list?" in the same corner and the panel's separator line runs the
            full width (Massimo's call, September 2026). This pane dropped its
            header when History became a rail and the toggle went with it; a
            band with one real control in it is exactly the case the app's own
            rule keeps a header for. It floated over the output for an hour in
            between and stood on the first card it was above. */}
        <div className="flex h-[57px] shrink-0 items-center border-b border-ink/5 px-5">
          <HistoryRailToggle
            open={historyOpen}
            onToggle={onToggleHistory}
            showLabel
            count={history.length + pendingRuns.length}
          />
        </div>

        <OutputPanel
          variations={cleared ? [] : variations}
          outputAngles={outputAngles}
          mode={outputMode}
          liveMode={mode}
          writeFormat={writeFormat}
          writeStyleLabel={writeStyleLabel}
          hookCategoryLabel={hookCategoryLabel}
          hookCount={hookCount}
          linkedProductId={linkedProductId}
          pendingRun={watchedRun}
          error={error}
          // What a "new set of takes" is, is the parent's knowledge: a run, or
          // the history row being shown. The panel scrolls back to the top on
          // this and on nothing else.
          runId={activeHistoryId}
          onEditVariation={onEditVariation}
          voiceProfile={cleared ? '' : voiceProfile}
          onEditVoiceProfile={onEditVoiceProfile}
        />
      </div>

      <RailOverlay open={historyOpen} onClose={onToggleHistory}>
        <HistoryRail
          items={history}
          pending={pendingRuns}
          activeId={activeHistoryId}
          onSelect={onSelectHistory}
          onSelectPending={onWatchPending}
          onDelete={onDeleteHistory}
          onNew={onClearCanvas}
        />
      </RailOverlay>
    </div>
  )
}
