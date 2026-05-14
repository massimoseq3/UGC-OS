import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import { useCreditsStore } from '../../stores/creditsStore'
import type { Script, VoiceHistoryItem } from '../../stores/types'
import type { VoiceSettings } from './types'
import { createDefaultSettings } from './types'
import { generateVoice } from './services/generateVoice'
import { getUrl } from '../../utils/assetStore'
import EditorArea from './components/EditorArea'
import RightPanel from './components/RightPanel'
import BottomPlayer from './components/BottomPlayer'
import BankPicker from '../../components/BankPicker'
import ProviderChip from '../../components/ProviderChip'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'

export default function VoiceStudio() {
  const baseKey = useProjectScopedKey('voice-studio')
  const [settings, setSettings] = usePersistedState<VoiceSettings>(`${baseKey}:settings`, createDefaultSettings())
  const [scriptText, setScriptText] = usePersistedState(`${baseKey}:scriptText`, '')
  const [activePlayerItemId, setActivePlayerItemId] = usePersistedState<string | null>(`${baseKey}:playerId`, null)

  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scriptPickerOpen, setScriptPickerOpen] = useState(false)
  const [highlightField, setHighlightField] = useState<string | null>(null)
  const [detailsItem, setDetailsItem] = useState<VoiceHistoryItem | null>(null)

  const history = useBankStore((s) => s.voiceHistory)
  const activePlayerItem = useMemo<VoiceHistoryItem | null>(
    () => (activePlayerItemId ? history.find((h) => h.id === activePlayerItemId) ?? null : null),
    [activePlayerItemId, history],
  )
  const setActivePlayerItem = (item: VoiceHistoryItem | null) => setActivePlayerItemId(item?.id ?? null)
  const addVoiceHistory = useBankStore((s) => s.addVoiceHistory)
  const deleteVoiceHistory = useBankStore((s) => s.deleteVoiceHistory)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)

  // Inter-app payload: Scripts → Voiceovers (scriptText).
  useEffect(() => {
    if (activeApp !== 'voice-studio') return
    if (!interAppPayload || interAppPayload.targetApp !== 'voice-studio') return

    const { targetField, data } = interAppPayload

    if (targetField === 'scriptText' && typeof data === 'string') {
      setScriptText(data)
      setHighlightField('script')
      setTimeout(() => setHighlightField(null), 800)
    }

    consumePayload()
  }, [interAppPayload, activeApp, consumePayload])

  const handleLoadScript = (item: unknown) => {
    const script = item as Script
    setScriptText(script.scriptText)
    setScriptPickerOpen(false)
  }

  const refreshCredits = useCreditsStore((s) => s.refresh)

  const handleGenerate = async () => {
    if (!scriptText.trim()) return
    setIsGenerating(true)
    setError(null)
    try {
      const item = await generateVoice(settings, scriptText)
      addVoiceHistory(item)
      setActivePlayerItem(item)
      // Pull the new credit balance after the generation has settled.
      refreshCredits()
      useAppStore.getState().addToast('Voiceover generated', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Audio generation failed. Check your API key and try again.'
      setError(msg)
      useAppStore.getState().addToast(`Voiceover generation failed: ${msg}`, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDeleteHistoryItem = (id: string) => {
    deleteVoiceHistory(id)
    if (activePlayerItem?.id === id) setActivePlayerItem(null)
    if (detailsItem?.id === id) setDetailsItem(null)
  }

  const handleRestoreText = (text: string) => {
    setScriptText(text)
    setHighlightField('script')
    setTimeout(() => setHighlightField(null), 800)
    setDetailsItem(null)
  }

  const handleRestoreSettings = (next: Partial<VoiceSettings>) => {
    setSettings((prev) => ({ ...prev, ...next }))
    setDetailsItem(null)
  }

  const handleDownloadLatest = async () => {
    if (!activePlayerItem) return
    const ref = activePlayerItem.audioUrl
    const url = ref.startsWith('asset-') ? await getUrl(ref) : ref
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${activePlayerItem.voiceName}-${Date.now()}.mp3`
    a.click()
  }

  return (
    <div className="relative flex flex-col pb-28 md:h-full md:pb-0">
      <ProviderChip provider="ElevenLabs" />
      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        {/* Center — editor */}
        <div className="flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
          <EditorArea
            scriptText={scriptText}
            onScriptChange={setScriptText}
            onSelectScript={() => setScriptPickerOpen(true)}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            canGenerate={scriptText.trim().length > 0}
            highlightField={highlightField}
            error={error}
            onDownloadLatest={handleDownloadLatest}
            hasLatest={!!activePlayerItem}
          />
        </div>

        {/* Right — settings / voice picker / history */}
        <div className="flex w-full md:w-[400px] shrink-0 flex-col border-t md:border-t-0 md:border-l border-white/5">
          <RightPanel
            settings={settings}
            onSettingsChange={setSettings}
            history={history}
            activeHistoryId={activePlayerItem?.id ?? null}
            detailsItem={detailsItem}
            onSelectHistory={setActivePlayerItem}
            onDeleteHistory={handleDeleteHistoryItem}
            onShowDetails={setDetailsItem}
            onCloseDetails={() => setDetailsItem(null)}
            onRestoreText={handleRestoreText}
            onRestoreSettings={handleRestoreSettings}
          />
        </div>
      </div>

      {/* Bottom player — slides in once a generation lands */}
      {activePlayerItem && (
        <BottomPlayer
          item={activePlayerItem}
          onClose={() => setActivePlayerItem(null)}
          onShowDetails={setDetailsItem}
        />
      )}

      {/* Script picker */}
      <BankPicker
        bankType="scripts"
        isOpen={scriptPickerOpen}
        onSelect={handleLoadScript}
        onClose={() => setScriptPickerOpen(false)}
      />
    </div>
  )
}
