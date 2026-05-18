import { useState, useEffect, useRef, useCallback } from 'react'
import { Dna } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { CharacterProfile, TabId } from './types'
import { createEmptyProfile, flattenDna, PHOTOREALISM_STYLE } from './types'
import type { ImageResolution } from '../../utils/models'
import { getDefaultModel } from '../../utils/models'
import ControlsPanel from './components/ControlsPanel'
import GalleryPanel, { type InFlightCharacterGen } from './components/GalleryPanel'
import { generateCharacter } from './services/generateCharacter'
import { analyzeImage } from './services/analyzeImage'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024

export default function CharacterStudio() {
  const baseKey = useProjectScopedKey('character-studio')
  const [profile, setProfile] = usePersistedState<CharacterProfile>(`${baseKey}:profile`, createEmptyProfile())
  const [activeTab, setActiveTab] = usePersistedState<TabId>(`${baseKey}:tab`, 'physical')
  // Characters always opens at 1K — high-res image generation is opt-in
  // here. The user can pick 2K / 4K from the resolution toggle when they
  // want it.
  const [resolution, setResolution] = usePersistedState<ImageResolution>(`${baseKey}:resolution`, '1K')
  const [extractedThumb, setExtractedThumb] = usePersistedState<string | null>(`${baseKey}:thumb`, null)

  // Parallel generations: in-memory only. Each generateCharacter call is a
  // single awaited promise (no createTask/poll split), so a refresh ends any
  // in-flight gens — that matches prior behaviour. Persistence happens on
  // success via addCharacterHistory.
  const [inFlight, setInFlight] = useState<InFlightCharacterGen[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [overlayActive, setOverlayActive] = useState(false)

  // Abort controllers keyed by gen id so per-tile Cancel can target one job.
  const abortersRef = useRef<Map<string, AbortController>>(new Map())
  const dragDepthRef = useRef(0)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)

  const addCharacterHistory = useBankStore((s) => s.addCharacterHistory)

  // Consume inter-app payload (kept for cross-app handoffs into the form)
  useEffect(() => {
    if (activeApp !== 'character-studio') return
    if (!interAppPayload || interAppPayload.targetApp !== 'character-studio') return

    const { targetField, data } = interAppPayload

    if (targetField === 'profile' && typeof data === 'object' && data !== null) {
      const incoming = data as Record<string, string>
      const newProfile = createEmptyProfile()
      for (const [key, value] of Object.entries(incoming)) {
        if (key === 'cameraDevice') continue
        if (key in newProfile && typeof value === 'string') {
          newProfile[key] = value
        }
      }
      newProfile.cameraDevice = PHOTOREALISM_STYLE
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
        if (key === 'cameraDevice') continue
        if (key in newProfile && typeof value === 'string') {
          newProfile[key] = value
        }
      }
      newProfile.cameraDevice = PHOTOREALISM_STYLE
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
    // Snapshot every input the gen depends on at click time — the user can
    // freely mutate the form while this job runs in parallel.
    const snapshotProfile = { ...profile }
    const snapshotResolution = resolution
    const snapshotAspect = profile.aspectRatio || 'Portrait (9:16)'
    const modelId = useSettingsStore.getState().getAppModel('character-studio:image:text-to-image')
      ?? getDefaultModel('character-studio', 'image', 'text-to-image')?.id
      ?? 'unknown'

    const id = crypto.randomUUID()
    const controller = new AbortController()
    abortersRef.current.set(id, controller)
    setInFlight((prev) => [...prev, { id, modelId, aspectRatio: snapshotAspect, startedAt: Date.now() }])
    setError(null)

    try {
      const gen = await generateCharacter(snapshotProfile, controller.signal, undefined, snapshotResolution)
      addCharacterHistory({
        id: crypto.randomUUID(),
        imageRef: gen.imageUrl,
        profile: snapshotProfile,
        modelId,
        aspectRatio: snapshotAspect,
        resolution: snapshotResolution,
        createdAt: Date.now(),
      })
      useAppStore.getState().addToast('Character generated', 'success')
    } catch (err) {
      if (controller.signal.aborted) {
        // Silent — the user explicitly cancelled this one.
      } else {
        const msg = err instanceof Error ? err.message : 'Image generation failed. Check your API key and try again.'
        setError(msg)
        useAppStore.getState().addToast(`Character generation failed: ${msg}`, 'error')
      }
    } finally {
      abortersRef.current.delete(id)
      setInFlight((prev) => prev.filter((g) => g.id !== id))
    }
  }

  const handleCancelGen = (id: string) => {
    const controller = abortersRef.current.get(id)
    controller?.abort()
  }

  return (
    <div
      className="relative flex flex-col pb-72 md:flex-row md:h-full md:pb-0"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleOverlayDrop}
    >
      {/* Controls panel — 50% on desktop */}
      <div className="flex w-full min-w-0 md:w-1/2 shrink-0 flex-col border-b md:border-b-0 md:border-r border-white/5">
        <ControlsPanel
          profile={profile}
          onProfileChange={setProfile}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          isExtracting={isExtracting}
          extractError={extractError}
          extractedThumb={extractedThumb}
          onPhotoDrop={handlePhotoDrop}
          onResetExtract={handleResetExtract}
        />
      </div>

      {/* Gallery panel — 50% on desktop */}
      <div className="flex min-w-0 w-full md:w-1/2 flex-col md:overflow-hidden">
        <GalleryPanel
          inFlight={inFlight}
          onCancelGen={handleCancelGen}
          error={error}
          onGenerate={handleGenerate}
          canGenerate={Object.values(profile).some((v) => v.trim() !== '')}
          aspectRatio={profile.aspectRatio || 'Portrait (9:16)'}
          onAspectRatioChange={(value) => setProfile({ ...profile, aspectRatio: value })}
          resolution={resolution}
          onResolutionChange={setResolution}
          onLoadProfile={setProfile}
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
