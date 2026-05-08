import { useState, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { VoiceSettings } from '../types'
import type { VoiceHistoryItem } from '../../../stores/types'
import SettingsView from './SettingsView'
import VoicePickerView from './VoicePickerView'
import HistoryView from './HistoryView'

// Spring slide with subtle blur — forward (settings → picker) goes right→center,
// back (picker → settings) reverses. Direction is tracked so AnimatePresence
// passes the right custom value to enter/exit.
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
    filter: 'blur(4px)',
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: 'blur(0px)',
    transition: {
      x: { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const },
      opacity: { duration: 0.14 },
      filter: { duration: 0.14 },
    },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
    filter: 'blur(4px)',
    transition: {
      x: { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const },
      opacity: { duration: 0.14 },
      filter: { duration: 0.14 },
    },
  }),
}

type Tab = 'settings' | 'history'

interface RightPanelProps {
  settings: VoiceSettings
  onSettingsChange: (next: VoiceSettings) => void
  history: VoiceHistoryItem[]
  activeHistoryId: string | null
  onSelectHistory: (item: VoiceHistoryItem) => void
  onDeleteHistory: (id: string) => void
}

export default function RightPanel({
  settings,
  onSettingsChange,
  history,
  activeHistoryId,
  onSelectHistory,
  onDeleteHistory,
}: RightPanelProps) {
  const [tab, setTab] = useState<Tab>('settings')
  const [voicePickerOpen, setVoicePickerOpen] = useState(false)
  // +1 when going forward (settings → picker), -1 going back. Drives the
  // slide direction in AnimatePresence so back navigation reverses cleanly.
  const direction = useRef(1)
  const openPicker = () => { direction.current = 1; setVoicePickerOpen(true) }
  const closePicker = () => { direction.current = -1; setVoicePickerOpen(false) }

  const handleSelectVoice = (voice: { id: string; name: string; gender?: 'Female' | 'Male' }) => {
    onSettingsChange({
      ...settings,
      voiceId: voice.id,
      voiceName: voice.name,
      gender: voice.gender,
    })
    closePicker()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tabs — hidden while in voice picker so the picker owns the chrome */}
      {!voicePickerOpen && (
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

      {/* Body */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tab === 'settings' ? (
          <AnimatePresence initial={false} mode="popLayout" custom={direction.current}>
            {voicePickerOpen ? (
              <motion.div
                key="picker"
                custom={direction.current}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="absolute inset-0"
              >
                <VoicePickerView
                  selectedId={settings.voiceId}
                  onSelect={handleSelectVoice}
                  onClose={closePicker}
                />
              </motion.div>
            ) : (
              <motion.div
                key="settings"
                custom={direction.current}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="absolute inset-0"
              >
                <SettingsView
                  settings={settings}
                  onSettingsChange={onSettingsChange}
                  onOpenVoicePicker={openPicker}
                />
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <HistoryView
            items={history}
            activeId={activeHistoryId}
            onSelect={onSelectHistory}
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
