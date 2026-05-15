import { useEffect, useRef } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  startPlaygroundImageTask,
  finishPlaygroundImageTask,
  startPlaygroundVideoTask,
  finishPlaygroundVideoTask,
  startPlaygroundMusicTask,
  finishPlaygroundMusicTask,
} from './service'
import PromptBar, { type PromptBarState, type PromptRef } from './components/PromptBar'
import PlaygroundHistoryGrid from './components/PlaygroundHistoryGrid'
import { getDefaultModel, getModel, type AspectRatio, type ImageResolution, type VideoMode } from '../../utils/models'
import type { PlaygroundMode, InFlightGen } from './types'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'

// Tasks older than this are almost always dead on kie's side too — resume
// would just timeout. Surface the error and clear the tile.
const STALE_TASK_MS = 30 * 60 * 1000 // 30 minutes

// Infer the video mode from which ref slots the user filled.
function inferVideoMode(refs: PromptRef[]): VideoMode {
  const startCount = refs.filter((r) => r.slot === 'start').length
  const endCount = refs.filter((r) => r.slot === 'end').length
  const refCount = refs.filter((r) => r.slot === 'ref').length
  if (refCount > 0 && startCount === 0 && endCount === 0) return 'reference-to-video'
  if (startCount > 0 && endCount > 0) return 'frames-to-video'
  if (startCount > 0) return 'image-to-video'
  if (refCount > 0) return 'reference-to-video'
  return 'text-to-video'
}

function initialState(): PromptBarState {
  const defaultImage = getDefaultModel('playground', 'image', 'text-to-image')?.id
    ?? getDefaultModel('broll-studio', 'image', 'text-to-image')?.id
    ?? 'gpt-image-2-text-to-image'
  const persistedImage = useSettingsStore.getState().getAppModel('playground:image:text-to-image')
  return {
    mode: 'image',
    prompt: '',
    modelId: persistedImage ?? defaultImage,
    aspectRatio: '9:16',
    durationSeconds: 5,
    resolution: '1K',
    audio: false,
    instrumental: false,
    refs: [],
  }
}

export default function Playground() {
  const baseKey = useProjectScopedKey('playground')
  const [state, setState] = usePersistedState<PromptBarState>(`${baseKey}:state`, initialState())
  // Persisted across reload so a tab refresh / app switch can resume polling
  // an in-flight kie task. Tasks without a `taskId` (still in the createTask
  // leg when the tab died) and tasks older than 30 min are auto-expired on
  // mount — see the resume effect below.
  const [inFlight, setInFlight] = usePersistedState<InFlightGen[]>(`${baseKey}:inflight`, [])
  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)
  const addToast = useAppStore((s) => s.addToast)

  // Inter-app payload consumer: incoming refs / prompt seed from other apps.
  useEffect(() => {
    if (activeApp !== 'playground') return
    if (!interAppPayload || interAppPayload.targetApp !== 'playground') return
    const { targetField, data } = interAppPayload
    if (targetField === 'prompt' && typeof data === 'string') {
      setState((s) => ({ ...s, prompt: data }))
    } else if (targetField === 'imageRef' && typeof data === 'string') {
      setState((s) => ({
        ...s,
        refs: [...s.refs, { url: data, label: 'imported', source: 'upload', slot: 'ref' }],
      }))
    } else if (targetField === 'videoStartFrame' && typeof data === 'string') {
      setState((s) => ({
        ...s,
        mode: 'video',
        refs: [...s.refs.filter((r) => r.slot !== 'start'), { url: data, label: 'start', source: 'upload', slot: 'start' }],
      }))
    }
    consumePayload()
  }, [interAppPayload, activeApp, consumePayload])

  // Resume-on-mount. Walks persisted inFlight[] and finishes any task that
  // still has a taskId. useRef<Set> guards against React 18 strict-mode
  // double-invoke. Only runs once on mount — new entries added during this
  // session don't need resume, they already run in handleSubmit.
  const resuming = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const gen of inFlight) {
      if (resuming.current.has(gen.id)) continue
      if (!gen.taskId) {
        setInFlight((prev) => prev.filter((g) => g.id !== gen.id))
        continue
      }
      if (Date.now() - gen.startedAt > STALE_TASK_MS) {
        setInFlight((prev) => prev.filter((g) => g.id !== gen.id))
        addToast(`${gen.mode} generation expired (>30 min)`, 'error')
        continue
      }
      resuming.current.add(gen.id)
      void (async () => {
        try {
          if (gen.mode === 'image' && gen.imageParams) {
            await finishPlaygroundImageTask(gen.taskId!, gen.modelId, {
              prompt: gen.prompt,
              aspectRatio: gen.imageParams.aspectRatio,
              resolution: gen.imageParams.resolution,
            })
          } else if (gen.mode === 'video' && gen.videoParams) {
            await finishPlaygroundVideoTask(gen.taskId!, gen.modelId, gen.videoParams.videoEndpoint, {
              prompt: gen.prompt,
              mode: gen.videoParams.mode,
              aspectRatio: gen.videoParams.aspectRatio,
              durationSeconds: gen.videoParams.durationSeconds,
              resolution: gen.videoParams.resolution,
              audio: gen.videoParams.audio,
            })
          } else if (gen.mode === 'music' && gen.musicParams) {
            await finishPlaygroundMusicTask(gen.taskId!, gen.modelId, {
              prompt: gen.prompt,
              instrumental: gen.musicParams.instrumental,
            })
          }
          addToast(`${gen.mode} resumed and ready`, 'success')
        } catch (err) {
          addToast(err instanceof Error ? err.message : `Resume failed (${gen.mode})`, 'error')
        } finally {
          setInFlight((prev) => prev.filter((g) => g.id !== gen.id))
          resuming.current.delete(gen.id)
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit() {
    const promptText = state.prompt.trim()
    if (!promptText || !state.modelId) return

    const id = crypto.randomUUID()
    const mode = state.mode
    const modelId = state.modelId

    // Snapshot every input synchronously so subsequent prompt-bar edits don't
    // mutate this job's params while it runs.
    const imageParams = mode === 'image'
      ? { aspectRatio: state.aspectRatio as AspectRatio, resolution: state.resolution as ImageResolution }
      : undefined
    const refsSnapshot = state.refs.slice()
    const inferredVideoMode = inferVideoMode(refsSnapshot)
    const videoParams = mode === 'video'
      ? {
          mode: inferredVideoMode,
          aspectRatio: state.aspectRatio,
          durationSeconds: state.durationSeconds,
          resolution: state.resolution,
          audio: state.audio,
          videoEndpoint: getModel(modelId)?.videoEndpoint === 'veo' ? ('veo' as const) : undefined,
        }
      : undefined
    const musicParams = mode === 'music'
      ? { instrumental: state.instrumental }
      : undefined

    // Add to inFlight WITHOUT a taskId yet — covers the createTask leg.
    setInFlight((prev) => [...prev, {
      id, mode, modelId, prompt: promptText, startedAt: Date.now(),
      imageParams, videoParams, musicParams,
    }])

    // Clear prompt + refs immediately so the user can queue the next one.
    setState((s) => ({ ...s, prompt: '', refs: [] }))

    try {
      let taskId: string
      let videoEndpoint: 'veo' | undefined

      if (mode === 'image') {
        const started = await startPlaygroundImageTask({
          prompt: promptText,
          modelId,
          aspectRatio: imageParams!.aspectRatio,
          resolution: imageParams!.resolution,
          referenceUrls: refsSnapshot.map((r) => r.url),
        })
        taskId = started.taskId
      } else if (mode === 'video') {
        const first = refsSnapshot.find((r) => r.slot === 'start')?.url
          ?? (inferredVideoMode === 'reference-to-video' ? undefined : refsSnapshot.find((r) => r.slot === 'ref')?.url)
        const last = refsSnapshot.find((r) => r.slot === 'end')?.url
        const references = refsSnapshot.filter((r) => r.slot === 'ref').map((r) => r.url)
        const started = await startPlaygroundVideoTask({
          prompt: promptText,
          modelId,
          mode: inferredVideoMode,
          aspectRatio: videoParams!.aspectRatio,
          durationSeconds: videoParams!.durationSeconds,
          resolution: videoParams!.resolution,
          audio: videoParams!.audio,
          firstFrameUrl: inferredVideoMode === 'image-to-video' || inferredVideoMode === 'frames-to-video' ? first : undefined,
          lastFrameUrl: last,
          referenceImageUrls: inferredVideoMode === 'reference-to-video' ? references : undefined,
        })
        taskId = started.taskId
        videoEndpoint = started.videoEndpoint
      } else {
        const started = await startPlaygroundMusicTask({
          prompt: promptText,
          modelId,
          instrumental: musicParams!.instrumental,
        })
        taskId = started.taskId
      }

      // Patch the in-flight entry with the taskId so a refresh from this
      // point on resumes correctly. For video, also persist the endpoint
      // identifier in case the model registry changes between sessions.
      setInFlight((prev) => prev.map((g) => g.id === id
        ? {
            ...g,
            taskId,
            videoParams: g.videoParams && videoEndpoint !== undefined
              ? { ...g.videoParams, videoEndpoint }
              : g.videoParams,
          }
        : g))

      if (mode === 'image') {
        await finishPlaygroundImageTask(taskId, modelId, {
          prompt: promptText,
          aspectRatio: imageParams!.aspectRatio,
          resolution: imageParams!.resolution,
        })
        addToast('Image ready', 'success')
      } else if (mode === 'video') {
        await finishPlaygroundVideoTask(taskId, modelId, videoEndpoint, {
          prompt: promptText,
          mode: inferredVideoMode,
          aspectRatio: videoParams!.aspectRatio,
          durationSeconds: videoParams!.durationSeconds,
          resolution: videoParams!.resolution,
          audio: videoParams!.audio,
        })
        addToast('Video ready', 'success')
      } else {
        await finishPlaygroundMusicTask(taskId, modelId, {
          prompt: promptText,
          instrumental: musicParams!.instrumental,
        })
        addToast('Track ready', 'success')
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Generation failed.', 'error')
    } finally {
      setInFlight((prev) => prev.filter((g) => g.id !== id))
    }
  }

  // Filter the history grid to the active mode. Users frequently bounce
  // between modes and want to see what they just made, not noise from the
  // other tabs.
  const filterMode: PlaygroundMode = state.mode

  // Submit button no longer disables on in-flight count — users can queue
  // unlimited parallel generations. The prop stays for any future use.
  const isGenerating = inFlight.length > 0

  return (
    <div className="relative h-full">
      {/* History grid fills the full height. Bottom padding leaves room for
          the floating glassmorphism prompt bar so tiles scroll *underneath*
          the bar instead of being clipped at its top edge. */}
      <div className="h-full overflow-hidden">
        <PlaygroundHistoryGrid inFlight={inFlight} filterMode={filterMode} bottomPadding />
      </div>

      {/* Bottom-anchored prompt bar — absolute over the grid so it floats
          with a translucent glassmorphism backdrop. */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 px-4 pb-4 pt-2">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl">
          <PromptBar
            state={state}
            onChange={setState}
            onSubmit={handleSubmit}
            isGenerating={isGenerating}
          />
          <p className="mt-2 text-center text-[10px] text-zinc-600">
            Tip: type <span className="font-medium text-zinc-500">@</span> to reference Products, Characters, or B-Rolls.
          </p>
        </div>
      </div>
    </div>
  )
}
