import { useMemo, useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import { useCreditsStore } from '../../stores/creditsStore'
import type { Script, VoiceHistoryItem } from '../../stores/types'
import type { VoiceSettings } from './types'
import { createDefaultSettings } from './types'
import { startVoiceTask, finishVoiceTask } from './services/generateVoice'
import { getUrl } from '../../utils/assetStore'
import { humanizeError } from '../../utils/friendlyError'
import EditorArea from './components/EditorArea'
import RightPanel from './components/RightPanel'
import BottomPlayer from './components/BottomPlayer'
import BankPicker from '../../components/BankPicker'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'

// Persisted in-flight TTS task. Survives a refresh so the user doesn't lose
// the gen (and the kie credit) when the tab reloads mid-generation. Stale
// entries (>30 min) are evicted on resume — matches the cap used by other
// apps so behaviour is uniform.
interface InFlightVoice {
  id: string
  taskId: string
  settings: VoiceSettings
  scriptText: string
  startedAt: number
}
const INFLIGHT_TTL_MS = 30 * 60 * 1000

export default function VoiceStudio() {
  const baseKey = useProjectScopedKey('voice-studio')
  const [settings, setSettings] = usePersistedState<VoiceSettings>(`${baseKey}:settings`, createDefaultSettings())
  const [scriptText, setScriptText] = usePersistedState(`${baseKey}:scriptText`, '')
  const [activePlayerItemId, setActivePlayerItemId] = usePersistedState<string | null>(`${baseKey}:playerId`, null)
  // Persisted so a refresh between createTask and the audio download still
  // resumes polling. We store the kie taskId + the original settings/script
  // snapshot needed to build the history row on success.
  const [inFlightVoice, setInFlightVoice] = usePersistedState<InFlightVoice | null>(`${baseKey}:in-flight`, null)

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

  // Shared finisher used by handleGenerate (foreground) and the mount-time
  // resume effect (background) so both code paths land in the same place on
  // success / failure.
  const finishVoice = async (entry: InFlightVoice) => {
    setIsGenerating(true)
    setError(null)
    try {
      const item = await finishVoiceTask(entry.taskId, entry.settings, entry.scriptText)
      addVoiceHistory(item)
      setActivePlayerItem(item)
      refreshCredits()
      useAppStore.getState().addToast('Voiceover generated', 'success')
    } catch (err) {
      const msg = humanizeError(err, 'Audio generation failed. Check your API key and try again.')
      setError(msg)
      useAppStore.getState().addToast(`Voiceover generation failed: ${msg}`, 'error')
    } finally {
      setIsGenerating(false)
      setInFlightVoice(null)
    }
  }

  const handleGenerate = async () => {
    if (!scriptText.trim()) return
    if (inFlightVoice) return // single-slot — wait for the current gen to land or fail
    setIsGenerating(true)
    setError(null)

    let taskId: string
    try {
      const start = await startVoiceTask(settings, scriptText)
      taskId = start.taskId
    } catch (err) {
      const msg = humanizeError(err, 'Audio generation failed. Check your API key and try again.')
      setError(msg)
      useAppStore.getState().addToast(`Voiceover generation failed: ${msg}`, 'error')
      setIsGenerating(false)
      return
    }

    const entry: InFlightVoice = {
      id: crypto.randomUUID(),
      taskId,
      settings,
      scriptText,
      startedAt: Date.now(),
    }
    // Persist BEFORE we start the poll so a tab refresh during the poll can
    // resume rather than burning the kie credit.
    setInFlightVoice(entry)
    await finishVoice(entry)
  }

  // Mount-time resume: if a persisted in-flight TTS taskId survived, poll it
  // until success (or evict if it's older than 30 min — kie's record retention
  // is short enough that an older taskId likely 404s anyway).
  const didResumeRef = useRef(false)
  useEffect(() => {
    if (didResumeRef.current) return
    didResumeRef.current = true
    if (!inFlightVoice) return
    if (Date.now() - inFlightVoice.startedAt > INFLIGHT_TTL_MS) {
      setInFlightVoice(null)
      useAppStore.getState().addToast('A stalled voice gen was cleared.', 'info')
      return
    }
    void finishVoice(inFlightVoice)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
