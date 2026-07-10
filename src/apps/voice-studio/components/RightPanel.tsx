import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { VoiceSettings } from '../types'
import { isV3, snapStability } from '../types'
import type { VoiceHistoryItem } from '../../../stores/types'
import SettingsView from './SettingsView'
import VoicePickerView from './VoicePickerView'
import ModelPickerView from './ModelPickerView'
import HistoryView from './HistoryView'
import HistoryDetailsView from './HistoryDetailsView'
import SegmentedToggle from '../../../components/SegmentedToggle'

type Tab = 'settings' | 'history'

// Shared slide-in for the settings-panel overlays (voice picker, model picker,
// history details). Enters from the right edge, exits back to it — ~280ms with
// an iOS-style ease so it feels like a panel gliding in, not a hard cut.
const SLIDE_OVER = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
  transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] as const },
}

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
  const [modelPickerOpen, setModelPickerOpen] = useState(false)

  const openPicker = () => setVoicePickerOpen(true)
  const closePicker = () => setVoicePickerOpen(false)
  const openModelPicker = () => setModelPickerOpen(true)
  const closeModelPicker = () => setModelPickerOpen(false)

  const handleSelectModel = (modelId: string) => {
    // Switching into V3 must snap the (possibly continuous) V2 stability onto
    // V3's 0 / 0.5 / 1 grid so the value is API-valid.
    const stability = isV3(modelId) ? snapStability(settings.stability) : settings.stability
    onSettingsChange({ ...settings, modelId, stability })
    closeModelPicker()
  }

  // When details opens (e.g. from BottomPlayer), make sure we're on the History
  // tab. Done during render (prop-change sync), not in an effect.
  const [prevDetails, setPrevDetails] = useState(detailsItem)
  if (detailsItem !== prevDetails) {
    setPrevDetails(detailsItem)
    if (detailsItem) setTab('history')
  }

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
  const showTabs = !voicePickerOpen && !modelPickerOpen && !detailsItem

  return (
    <div className="flex h-full flex-col">
      {showTabs && (
        <div className="flex h-[57px] items-center border-b border-ink/5 px-5">
          <SegmentedToggle<Tab>
            className="h-10 !p-1"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'settings', label: 'Settings' },
              { value: 'history', label: 'History', badge: history.length > 0 ? history.length : undefined },
            ]}
          />
        </div>
      )}

      {/* Body — base layer switches between Settings and History instantly.
          Slide-in overlays (picker, details) ride on top: they slide in from
          the right and back out via AnimatePresence. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tab === 'settings' ? (
          <SettingsView
            settings={settings}
            onSettingsChange={onSettingsChange}
            onOpenVoicePicker={openPicker}
            onOpenModelPicker={openModelPicker}
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

        <AnimatePresence>
          {voicePickerOpen && (
            <motion.div key="voice-picker" className="absolute inset-0 bg-surface-1" {...SLIDE_OVER}>
              <VoicePickerView
                selectedId={settings.voiceId}
                onSelect={handleSelectVoice}
                onClose={closePicker}
              />
            </motion.div>
          )}
          {modelPickerOpen && (
            <motion.div key="model-picker" className="absolute inset-0 bg-surface-1" {...SLIDE_OVER}>
              <ModelPickerView
                selectedId={settings.modelId}
                onSelect={handleSelectModel}
                onClose={closeModelPicker}
              />
            </motion.div>
          )}
          {detailsItem && (
            <motion.div key="details" className="absolute inset-0 bg-surface-1" {...SLIDE_OVER}>
              <HistoryDetailsView
                item={detailsItem}
                onClose={handleCloseDetails}
                onRestoreText={onRestoreText}
                onRestoreSettings={onRestoreSettings}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
