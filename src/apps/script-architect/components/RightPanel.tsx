import { useState } from 'react'
import type { ScriptHistoryItem } from '../../../stores/types'
import type { ScriptMode, WriteFormat } from '../types'
import OutputPanel from './OutputPanel'
import HistoryView from './HistoryView'
import SegmentedToggle from '../../../components/SegmentedToggle'

type Tab = 'output' | 'history'

interface RightPanelProps {
  variations: string[]
  mode: ScriptMode
  writeFormat: WriteFormat
  writeStyleLabel: string
  linkedProductId: string | null
  isGenerating: boolean
  error: string | null

  history: ScriptHistoryItem[]
  activeHistoryId: string | null
  onSelectHistory: (item: ScriptHistoryItem) => void
  onDeleteHistory: (id: string) => void
  onClearOutput: () => void
}

export default function RightPanel({
  variations,
  mode,
  writeFormat,
  writeStyleLabel,
  linkedProductId,
  isGenerating,
  error,
  history,
  activeHistoryId,
  onSelectHistory,
  onDeleteHistory,
  onClearOutput,
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
            mode={mode}
            writeFormat={writeFormat}
            writeStyleLabel={writeStyleLabel}
            linkedProductId={linkedProductId}
            isGenerating={isGenerating}
            error={error}
            onClear={onClearOutput}
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
