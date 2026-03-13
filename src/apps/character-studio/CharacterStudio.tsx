import { useState, useEffect, useRef } from 'react'
import { User, Shirt, MapPin, Move, Camera } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import type { CharacterProfile, TabId } from './types'
import { createEmptyProfile, TABS } from './types'
import ControlsPanel from './components/ControlsPanel'
import OutputPanel from './components/OutputPanel'
import { generateCharacter } from './services/generateCharacter'
import type { GenerationResult } from './services/generateCharacter'

const TAB_ICONS: Record<TabId, React.ElementType> = {
  physical: User,
  style: Shirt,
  scene: MapPin,
  pose: Move,
  camera: Camera,
}

export default function CharacterStudio() {
  const [profile, setProfile] = useState<CharacterProfile>(createEmptyProfile)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('physical')
  const abortRef = useRef<AbortController | null>(null)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)

  // Consume inter-app payload (e.g. from Image DNA Extractor)
  useEffect(() => {
    if (activeApp !== 'character-studio') return
    if (!interAppPayload || interAppPayload.targetApp !== 'character-studio') return

    const { targetField, data } = interAppPayload

    if (targetField === 'profile' && typeof data === 'object' && data !== null) {
      const incoming = data as Record<string, string>
      const newProfile = createEmptyProfile()
      for (const [key, value] of Object.entries(incoming)) {
        if (key in newProfile && typeof value === 'string') {
          newProfile[key] = value
        }
      }
      setProfile(newProfile)
    }

    consumePayload()
  }, [interAppPayload, activeApp, consumePayload])

  const handleGenerate = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // 90-second timeout
    const timeout = setTimeout(() => controller.abort(), 90_000)

    setIsGenerating(true)
    setError(null)
    try {
      const gen = await generateCharacter(profile, controller.signal)
      setResult(gen)
    } catch (err) {
      if (controller.signal.aborted) {
        setError('Generation was cancelled or timed out. Try again.')
      } else {
        setError(err instanceof Error ? err.message : 'Image generation failed. Check your API key and try again.')
      }
    } finally {
      clearTimeout(timeout)
      setIsGenerating(false)
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const tabCompletion = (tabId: TabId) => {
    const tab = TABS.find((t) => t.id === tabId)!
    const filled = tab.fields.filter((f) => (profile[f.key] ?? '').trim() !== '').length
    return { filled, total: tab.fields.length }
  }

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Side tabs — horizontal scrollable on mobile, vertical on desktop */}
      <div className="flex lg:w-44 shrink-0 flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible border-b lg:border-b-0 lg:border-r border-white/5 bg-white/[0.01] px-2 py-2 lg:py-3">
        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.id]
          const isActive = activeTab === tab.id
          const { filled, total } = tabCompletion(tab.id)
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-[11px] font-medium transition-colors ${isActive
                  ? 'bg-sky-500/15 text-sky-400'
                  : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300'
                }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{tab.label}</span>
              <span className={`ml-auto text-[10px] tabular-nums ${isActive ? 'text-sky-400/60' : 'text-zinc-700'}`}>
                {filled}/{total}
              </span>
            </button>
          )
        })}
      </div>

      {/* Controls panel */}
      <div className="flex w-full lg:w-1/2 shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-white/5">
        <ControlsPanel
          profile={profile}
          onProfileChange={setProfile}
          activeTab={activeTab}
        />
      </div>

      {/* Output panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden min-h-[300px] lg:min-h-0">
        <OutputPanel
          result={result}
          isGenerating={isGenerating}
          error={error}
          onGenerate={handleGenerate}
          onCancel={handleCancel}
          canGenerate={Object.values(profile).some((v) => v.trim() !== '')}
          aspectRatio={profile.aspectRatio || 'Portrait (9:16)'}
        />
      </div>
    </div>
  )
}
