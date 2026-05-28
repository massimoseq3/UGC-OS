import { useState } from 'react'
import type { ScriptHistoryItem } from '../../../stores/types'
import type { ScriptMode } from '../types'
import OutputPanel from './OutputPanel'
import HistoryView from './HistoryView'

type Tab = 'output' | 'history'

interface RightPanelProps {
  variations: string[]
  mode: ScriptMode
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
      <div className="flex items-center gap-1 border-b border-white/5 px-5">
        <TabButton active={tab === 'output'} onClick={() => setTab('output')}>
          Output
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          History
          {history.length > 0 && (
            <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
              {history.length}
            </span>
          )}
        </TabButton>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tab === 'output' ? (
          <OutputPanel
            variations={variations}
            mode={mode}
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

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1 px-3 pb-2 pt-5 text-sm font-medium tracking-tight transition-colors ${
        active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {children}
      <span
        className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors ${
          active ? 'bg-zinc-100' : 'bg-transparent'
        }`}
      />
    </button>
  )
}
