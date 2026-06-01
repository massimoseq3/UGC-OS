import { useEffect, useRef, useCallback, useState } from 'react'
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
import { startCharacterTask, finishCharacterTask } from './services/generateCharacter'
import { humanizeError } from '../../utils/friendlyError'
import { analyzeImage } from './services/analyzeImage'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'

// In-flight character generations older than 30 min are evicted on resume —
// matches the cap used by Playground so the user's mental model is uniform.
const INFLIGHT_TTL_MS = 30 * 60 * 1000

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

  // Parallel generations: persisted to localStorage so a mid-flight refresh
  // resumes polling via finishCharacterTask. Stale entries (>30 min, e.g. a
  // tab left overnight) are evicted on resume so the gallery doesn't stay
  // stuck on a phantom spinner.
  const [inFlight, setInFlight] = usePersistedState<InFlightCharacterGen[]>(`${baseKey}:in-flight`, [])
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
      setExtractError(humanizeError(err, 'Failed to extract DNA from image.'))
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

  // Finish an already-started task (poll → save asset → write history → drop
  // the in-flight entry). Shared by handleGenerate (foreground) and the
  // mount-time resume effect (background).
  const finishGen = useCallback(async (gen: InFlightCharacterGen, controller: AbortController) => {
    if (!gen.taskId) return
    try {
      const assetId = await finishCharacterTask(gen.taskId, gen.modelId, controller.signal)
      addCharacterHistory({
        id: crypto.randomUUID(),
        imageRef: assetId,
        profile: (gen.profile as CharacterProfile | undefined) ?? createEmptyProfile(),
        modelId: gen.modelId,
        aspectRatio: gen.aspectRatio,
        resolution: gen.resolution,
        createdAt: Date.now(),
      })
      useAppStore.getState().addToast('Character generated', 'success')
    } catch (err) {
      if (!controller.signal.aborted) {
        const msg = humanizeError(err, 'Image generation failed. Check your API key and try again.')
        setError(msg)
        useAppStore.getState().addToast(`Character generation failed: ${msg}`, 'error')
      }
    } finally {
      abortersRef.current.delete(gen.id)
      setInFlight((prev) => prev.filter((g) => g.id !== gen.id))
    }
  }, [addCharacterHistory, setInFlight])

  const handleGenerate = async () => {
    // Snapshot every input the gen depends on at click time — the user can
    // freely mutate the form while this job runs in parallel.
    const snapshotProfile: CharacterProfile = { ...profile }
    const snapshotResolution = resolution
    const snapshotAspect = profile.aspectRatio || 'Portrait (9:16)'
    const modelId = useSettingsStore.getState().getAppModel('character-studio:image:text-to-image')
      ?? getDefaultModel('character-studio', 'image', 'text-to-image')?.id
      ?? 'unknown'

    const id = crypto.randomUUID()
    const controller = new AbortController()
    abortersRef.current.set(id, controller)
    // Stamp an entry without taskId immediately so the in-flight tile renders
    // while createTask is on the wire. We fill in taskId as soon as it lands.
    const placeholder: InFlightCharacterGen = {
      id,
      modelId,
      aspectRatio: snapshotAspect,
      startedAt: Date.now(),
      resolution: snapshotResolution,
      profile: snapshotProfile,
    }
    setInFlight((prev) => [...prev, placeholder])
    setError(null)

    let taskId: string
    try {
      const start = await startCharacterTask(snapshotProfile, undefined, snapshotResolution, controller.signal)
      taskId = start.taskId
    } catch (err) {
      abortersRef.current.delete(id)
      setInFlight((prev) => prev.filter((g) => g.id !== id))
      if (!controller.signal.aborted) {
        const msg = humanizeError(err, 'Image generation failed. Check your API key and try again.')
        setError(msg)
        useAppStore.getState().addToast(`Character generation failed: ${msg}`, 'error')
      }
      return
    }

    // Persist taskId so a refresh between createTask and poll completion can
    // still resume the gen via the mount-time effect.
    setInFlight((prev) => prev.map((g) => g.id === id ? { ...g, taskId } : g))
    await finishGen({ ...placeholder, taskId }, controller)
  }

  const handleCancelGen = (id: string) => {
    const controller = abortersRef.current.get(id)
    controller?.abort()
    // Cancelling drops the entry even if the kie task itself can't be cancelled
    // server-side — the user has signalled they don't want this one.
    setInFlight((prev) => prev.filter((g) => g.id !== id))
    abortersRef.current.delete(id)
  }

  // Mount-time resume: walk the persisted in-flight list and either resume
  // polling (entries with a taskId) or evict stale / un-started entries. Runs
  // once on mount; new gens started this session are owned by handleGenerate.
  const didResumeRef = useRef(false)
  useEffect(() => {
    if (didResumeRef.current) return
    didResumeRef.current = true
    const now = Date.now()
    const toResume: InFlightCharacterGen[] = []
    const toEvict: string[] = []
    for (const gen of inFlight) {
      const stale = now - gen.startedAt > INFLIGHT_TTL_MS
      if (stale || !gen.taskId) {
        toEvict.push(gen.id)
      } else if (!abortersRef.current.has(gen.id)) {
        toResume.push(gen)
      }
    }
    if (toEvict.length > 0) {
      setInFlight((prev) => prev.filter((g) => !toEvict.includes(g.id)))
      useAppStore.getState().addToast(
        `${toEvict.length} stalled character gen${toEvict.length === 1 ? '' : 's'} cleared.`,
        'info',
      )
    }
    for (const gen of toResume) {
      const controller = new AbortController()
      abortersRef.current.set(gen.id, controller)
      void finishGen(gen, controller)
    }
    // We intentionally only resume on the first mount of this component.
    // Subsequent setInFlight calls re-render but must not re-trigger the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
