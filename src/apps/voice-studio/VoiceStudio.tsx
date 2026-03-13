import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import type { VoicePreset, Script } from '../../stores/types'
import type { VoiceSettings } from './types'
import { createDefaultSettings } from './types'
import { generateVoice } from './services/generateVoice'
import ControlsSidebar from './components/ControlsSidebar'
import EditorPanel from './components/EditorPanel'
import HistoryPanel from './components/HistoryPanel'
import BankPicker from '../../components/BankPicker'

type PickerMode = 'voices' | 'scripts' | null

export default function VoiceStudio() {
  const [settings, setSettings] = useState<VoiceSettings>(createDefaultSettings)
  const [scriptText, setScriptText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerMode, setPickerMode] = useState<PickerMode>(null)
  const [highlightField, setHighlightField] = useState<string | null>(null)

  const history = useBankStore((s) => s.voiceHistory)
  const addVoiceHistory = useBankStore((s) => s.addVoiceHistory)
  const deleteVoiceHistory = useBankStore((s) => s.deleteVoiceHistory)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)

  // Consume inter-app payload (from Script Architect "Send to Voice Studio")
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

  const handleSettingsChange = (next: VoiceSettings) => {
    setSettings(next)
  }

  const handleStyleChange = (value: string) => {
    setSettings((prev) => ({ ...prev, styleInstructions: value }))
  }

  const handleLoadVoicePreset = (item: unknown) => {
    const preset = item as VoicePreset
    setSettings({
      voiceName: preset.voiceName,
      gender: preset.gender,
      creativity: preset.creativity,
      ambience: preset.ambience,
      styleInstructions: preset.styleInstructions,
    })
    setPickerMode(null)
  }

  const handleLoadScript = (item: unknown) => {
    const script = item as Script
    setScriptText(script.scriptText)
    setPickerMode(null)
  }

  const handleGenerate = async () => {
    if (!scriptText.trim()) return
    setIsGenerating(true)
    setError(null)
    try {
      const item = await generateVoice(settings, scriptText)
      addVoiceHistory(item)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio generation failed. Check your API key and try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDeleteHistoryItem = (id: string) => {
    deleteVoiceHistory(id)
  }

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left sidebar — controls */}
      <div className="flex w-full lg:w-[340px] shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-white/5">
        <ControlsSidebar
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onLoadPreset={() => setPickerMode('voices')}
        />
      </div>

      {/* Center — editor */}
      <div className="flex min-h-[420px] lg:min-h-0 flex-1 flex-col overflow-hidden">
        <EditorPanel
          styleInstructions={settings.styleInstructions}
          onStyleChange={handleStyleChange}
          scriptText={scriptText}
          onScriptChange={setScriptText}
          onSelectScript={() => setPickerMode('scripts')}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          canGenerate={scriptText.trim().length > 0}
          highlightField={highlightField}
          error={error}
        />
      </div>

      {/* Right sidebar — history */}
      <div className="flex w-full lg:w-[400px] shrink-0 flex-col border-t lg:border-t-0 lg:border-l border-white/5 max-h-[50vh] lg:max-h-none">
        <HistoryPanel
          items={history}
          onDelete={handleDeleteHistoryItem}
        />
      </div>

      {/* Bank Pickers */}
      <BankPicker
        bankType="voices"
        isOpen={pickerMode === 'voices'}
        onSelect={handleLoadVoicePreset}
        onClose={() => setPickerMode(null)}
      />
      <BankPicker
        bankType="scripts"
        isOpen={pickerMode === 'scripts'}
        onSelect={handleLoadScript}
        onClose={() => setPickerMode(null)}
      />
    </div>
  )
}
