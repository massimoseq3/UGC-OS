import { useState, useEffect } from 'react'
import type { VoiceSettings } from '../types'
import type { VoiceHistoryItem } from '../../../stores/types'
import SettingsView from './SettingsView'
import VoicePickerView from './VoicePickerView'
import HistoryView from './HistoryView'
import HistoryDetailsView from './HistoryDetailsView'

type Tab = 'settings' | 'history'

interface RightPanelProps {
  settings: VoiceSettings
  onSettingsChange: (next: VoiceSettings) => void
  history: VoiceHistoryItem[]
  activeHistoryId: string | null
  detailsItem: VoiceHistoryItem | null
  onSelectHistory: (item: VoiceHistoryItem) => void
  onDeleteHistory: (id: string) => void
  onShowDetails: (item: VoiceHistoryItem) => void
  onCloseDetails: () => void
  onRestoreText: (text: string) => void
  onRestoreSettings: (settings: Partial<VoiceSettings>) => void
}

export default function RightPanel({
  settings,
  onSettingsChange,
  history,
  activeHistoryId,
  detailsItem,
  onSelectHistory,
  onDeleteHistory,
  onShowDetails,
  onCloseDetails,
  onRestoreText,
  onRestoreSettings,
}: RightPanelProps) {
  const [tab, setTab] = useState<Tab>('settings')
  const [voicePickerOpen, setVoicePickerOpen] = useState(false)

  const openPicker = () => setVoicePickerOpen(true)
  const closePicker = () => setVoicePickerOpen(false)

  // When details opens (e.g. from BottomPlayer), make sure we're on the History tab.
  useEffect(() => {
    if (detailsItem) setTab('history')
  }, [detailsItem])

  const handleSelectVoice = (voice: { id: string; name: string; gender?: 'Female' | 'Male' }) => {
    onSettingsChange({
      ...settings,
      voiceId: voice.id,
      voiceName: voice.name,
      gender: voice.gender,
    })
    closePicker()
  }

  const handleShowDetails = (item: VoiceHistoryItem) => {
    onShowDetails(item)
  }

  const handleCloseDetails = () => {
    onCloseDetails()
  }

  // Tabs are hidden when a slide-over view (picker, details) owns the chrome.
  const showTabs = !voicePickerOpen && !detailsItem

  return (
    <div className="flex h-full flex-col">
      {showTabs && (
        <div className="flex items-center gap-1 border-b border-white/5 px-5">
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
            Settings
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
      )}

      {/* Body — base layer switches between Settings and History instantly.
          Slide-in overlays (picker, details) ride on top via AnimatePresence. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tab === 'settings' ? (
          <SettingsView
            settings={settings}
            onSettingsChange={onSettingsChange}
            onOpenVoicePicker={openPicker}
          />
        ) : (
          <HistoryView
            items={history}
            activeId={activeHistoryId}
            onSelect={onSelectHistory}
            onDelete={onDeleteHistory}
            onShowDetails={handleShowDetails}
          />
        )}

        {voicePickerOpen && (
          <div className="absolute inset-0 bg-[#0A0A0A]">
            <VoicePickerView
              selectedId={settings.voiceId}
              onSelect={handleSelectVoice}
              onClose={closePicker}
            />
          </div>
        )}
        {detailsItem && (
          <div className="absolute inset-0 bg-[#0A0A0A]">
            <HistoryDetailsView
              item={detailsItem}
              onClose={handleCloseDetails}
              onRestoreText={onRestoreText}
              onRestoreSettings={onRestoreSettings}
            />
          </div>
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
