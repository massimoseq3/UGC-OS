import { useState } from 'react'
import type { Model, ScriptHistoryItem } from '../../../stores/types'
import type { ScriptMode, WriteFormat, WriteLength } from '../types'
import OutputPanel from './OutputPanel'
import HistoryView from './HistoryView'
import SegmentedToggle from '../../../components/SegmentedToggle'

type Tab = 'output' | 'history'

interface RightPanelProps {
  variations: string[]
  // Live left-panel mode — drives the empty/loading copy.
  mode: ScriptMode
  // Mode that produced the shown variations — drives the cards' labels.
  outputMode: ScriptMode
  writeFormat: WriteFormat
  writeStyleLabel: string
  linkedProductId: string | null
  // Influencer + clip length for the cinematic 'prompt' format's Playground
  // handoff (ignored by the other formats).
  influencer: Model | null
  cinematicDuration: WriteLength
  isGenerating: boolean
  error: string | null

  history: ScriptHistoryItem[]
  activeHistoryId: string | null
  onSelectHistory: (item: ScriptHistoryItem) => void
  onDeleteHistory: (id: string) => void
}

export default function RightPanel({
  variations,
  mode,
  outputMode,
  writeFormat,
  writeStyleLabel,
  linkedProductId,
  influencer,
  cinematicDuration,
  isGenerating,
  error,
  history,
  activeHistoryId,
  onSelectHistory,
  onDeleteHistory,
}: RightPanelProps) {
  const [tab, setTab] = useState<Tab>('output')

  const handleSelectHistory = (item: ScriptHistoryItem) => {
    onSelectHistory(item)
    setTab('output')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center px-5 pb-2 pt-4">
        <SegmentedToggle<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'output', label: 'Output' },
            { value: 'history', label: 'History', badge: history.length > 0 ? history.length : undefined },
          ]}
        />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tab === 'output' ? (
          <OutputPanel
            variations={variations}
            mode={outputMode}
            liveMode={mode}
            writeFormat={writeFormat}
            writeStyleLabel={writeStyleLabel}
            linkedProductId={linkedProductId}
            influencer={influencer}
            cinematicDuration={cinematicDuration}
            isGenerating={isGenerating}
            error={error}
          />
        ) : (
          <HistoryView
            items={history}
            activeId={activeHistoryId}
            onSelect={handleSelectHistory}
            onDelete={onDeleteHistory}
          />
        )}
      </div>
    </div>
  )
}
