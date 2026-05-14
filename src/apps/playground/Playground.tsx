import { useEffect, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  generatePlaygroundImage,
  generatePlaygroundVideo,
  generatePlaygroundMusic,
} from './service'
import PromptBar, { type PromptBarState, type PromptRef } from './components/PromptBar'
import PlaygroundHistoryGrid, { type InFlightGen } from './components/PlaygroundHistoryGrid'
import { getDefaultModel, type AspectRatio, type ImageResolution, type VideoMode } from '../../utils/models'
import type { PlaygroundMode } from './types'

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
  const [state, setState] = useState<PromptBarState>(() => initialState())
  const [inFlight, setInFlight] = useState<InFlightGen[]>([])
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

  async function handleSubmit() {
    const promptText = state.prompt.trim()
    if (!promptText || !state.modelId) return
    const inFlightId = crypto.randomUUID()
    const modelId = state.modelId
    const mode = state.mode

    setInFlight((prev) => [
      ...prev,
      { id: inFlightId, mode, modelId, prompt: promptText, startedAt: Date.now() },
    ])

    try {
      if (mode === 'image') {
        await generatePlaygroundImage({
          prompt: promptText,
          modelId,
          aspectRatio: state.aspectRatio as AspectRatio,
          resolution: state.resolution as ImageResolution,
          referenceUrls: state.refs.map((r) => r.url),
        })
        addToast('Image ready', 'success')
      } else if (mode === 'video') {
        const inferred = inferVideoMode(state.refs)
        const first = state.refs.find((r) => r.slot === 'start')?.url
          ?? (inferred === 'reference-to-video' ? undefined : state.refs.find((r) => r.slot === 'ref')?.url)
        const last = state.refs.find((r) => r.slot === 'end')?.url
        const references = state.refs.filter((r) => r.slot === 'ref').map((r) => r.url)
        await generatePlaygroundVideo({
          prompt: promptText,
          modelId,
          mode: inferred,
          aspectRatio: state.aspectRatio,
          durationSeconds: state.durationSeconds,
          resolution: state.resolution,
          audio: state.audio,
          firstFrameUrl: inferred === 'image-to-video' || inferred === 'frames-to-video' ? first : undefined,
          lastFrameUrl: last,
          referenceImageUrls: inferred === 'reference-to-video' ? references : undefined,
        })
        addToast('Video ready', 'success')
      } else if (mode === 'music') {
        await generatePlaygroundMusic({
          prompt: promptText,
          modelId,
          instrumental: state.instrumental,
        })
        addToast('Track ready', 'success')
      }
      // Clear the prompt + refs after a successful generation so the user
      // starts fresh for the next one (ElevenLabs-like UX).
      setState((s) => ({ ...s, prompt: '', refs: [] }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed.'
      addToast(msg, 'error')
    } finally {
      setInFlight((prev) => prev.filter((g) => g.id !== inFlightId))
    }
  }

  // Filter the history grid to the active mode. Users frequently bounce
  // between modes and want to see what they just made, not noise from the
  // other tabs.
  const filterMode: PlaygroundMode = state.mode

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
