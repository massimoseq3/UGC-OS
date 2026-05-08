import { useState, useEffect, useRef, useCallback } from 'react'
import { User, MapPin, Move, Camera, Dna } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import type { CharacterProfile, TabId } from './types'
import { createEmptyProfile, flattenDna, getTabFields, TABS } from './types'
import ControlsPanel from './components/ControlsPanel'
import OutputPanel from './components/OutputPanel'
import SideRailActions from './components/SideRailActions'
import { generateCharacter } from './services/generateCharacter'
import { analyzeImage } from './services/analyzeImage'
import type { GenerationResult } from './services/generateCharacter'

const TAB_ICONS: Record<TabId, React.ElementType> = {
  physical: User,
  scene: MapPin,
  pose: Move,
  camera: Camera,
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024

export default function CharacterStudio() {
  const [profile, setProfile] = useState<CharacterProfile>(createEmptyProfile)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('physical')

  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractedThumb, setExtractedThumb] = useState<string | null>(null)
  const [overlayActive, setOverlayActive] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const dragDepthRef = useRef(0)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)

  // Consume inter-app payload (kept for cross-app handoffs into the form)
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

  const handlePhotoDrop = useCallback(async (file: File) => {
    setExtractError(null)
    setIsExtracting(true)

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setExtractedThumb(reader.result)
    }
    reader.readAsDataURL(file)

    try {
      const dna = await analyzeImage(file)
      const flat = flattenDna(dna)
      const newProfile = createEmptyProfile()
      for (const [key, value] of Object.entries(flat)) {
        if (key in newProfile && typeof value === 'string') {
          newProfile[key] = value
        }
      }
      setProfile(newProfile)
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Failed to extract DNA from image.')
      setExtractedThumb(null)
    } finally {
      setIsExtracting(false)
    }
  }, [])

  const handleResetExtract = useCallback(() => {
    setExtractedThumb(null)
    setExtractError(null)
    setProfile(createEmptyProfile())
  }, [])

  // Full-area drag overlay handlers
  const handleDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    dragDepthRef.current += 1
    setOverlayActive(true)
  }
  const handleDragLeave = () => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setOverlayActive(false)
  }
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }
  const handleOverlayDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepthRef.current = 0
    setOverlayActive(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setExtractError('Unsupported format. Use JPG, PNG, or WebP.')
      return
    }
    if (file.size > MAX_SIZE) {
      setExtractError('File too large. Maximum size is 10 MB.')
      return
    }
    handlePhotoDrop(file)
  }

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
    const fields = getTabFields(tab)
    const filled = fields.filter((f) => (profile[f.key] ?? '').trim() !== '').length
    return { filled, total: fields.length }
  }

  return (
    <div
      className="relative flex flex-col lg:flex-row h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleOverlayDrop}
    >
      {/* Side tabs + presets/bank — matches Finder's Banks rail aesthetic */}
      <div className="flex lg:w-52 shrink-0 flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible border-b lg:border-b-0 lg:border-r border-white/5 bg-white/[0.02] py-2 lg:py-3 px-2 lg:px-0 gap-1 lg:gap-0">
        <span className="mb-3 hidden px-4 text-[11px] font-medium uppercase tracking-widest text-zinc-600 lg:block">
          Customize character
        </span>

        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.id]
          const isActive = activeTab === tab.id
          const { filled, total } = tabCompletion(tab.id)
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors lg:mx-2 lg:gap-2.5 ${isActive
                  ? 'bg-white/[0.07] text-zinc-200'
                  : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
                }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span className="flex-1 truncate tracking-tight">{tab.label}</span>
              <span className="text-[11px] tabular-nums text-zinc-600">
                {filled}/{total}
              </span>
            </button>
          )
        })}

        <SideRailActions profile={profile} onProfileChange={setProfile} />
      </div>

      {/* Controls panel */}
      <div className="flex w-full lg:w-1/2 shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-white/5">
        <ControlsPanel
          profile={profile}
          onProfileChange={setProfile}
          activeTab={activeTab}
          isExtracting={isExtracting}
          extractError={extractError}
          extractedThumb={extractedThumb}
          onPhotoDrop={handlePhotoDrop}
          onResetExtract={handleResetExtract}
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
          onAspectRatioChange={(value) => setProfile({ ...profile, aspectRatio: value })}
        />
      </div>

      {/* Full-area drag overlay */}
      {overlayActive && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-green-400/40 bg-green-400/[0.06] px-12 py-10">
            <div className="rounded-xl bg-green-400/10 p-3">
              <Dna className="h-8 w-8 text-green-400" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-green-300">Drop to extract DNA</p>
            <p className="text-xs text-zinc-500">Auto-fills every field from the photo</p>
          </div>
        </div>
      )}
    </div>
  )
}
