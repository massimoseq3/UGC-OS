import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Film, Loader2, AlertCircle, Save, Check, Volume2, VolumeX, ChevronDown } from 'lucide-react'
import { useBankStore } from '../../stores/bankStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAppStore } from '../../stores/appStore'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import ModelPicker from '../../components/ModelPicker'
import VideoInputSlot, { type VideoInputValue } from '../../components/video/VideoInputSlot'
import VideoRefStrip from '../../components/video/VideoRefStrip'
import {
  getDefaultModel,
  getModel,
  estimateCredits,
  formatCredits,
} from '../../utils/models'
import { saveFromDataUrl } from '../../utils/assetStore'
import { generateVideo } from './services/generateVideo'
import type { VideoGenResult, VideoMode } from './types'

const RESOLUTION_LABELS: Record<string, string> = {
  '480p': '480p',
  '720p': '720p',
  '1080p': '1080p',
  '4k': '4K',
  std: 'Standard',
  pro: 'Pro',
  '4K': '4K',
}

const MODEL_KEY = 'video-studio:video'

// Mode is inferred from which slots the user filled, in priority order:
//   any references → reference-to-video
//   start + end    → frames-to-video
//   start only     → image-to-video
//   none           → text-to-video
function inferMode(opts: {
  firstFrame: VideoInputValue | null
  lastFrame: VideoInputValue | null
  references: VideoInputValue[]
}): VideoMode {
  if (opts.references.length > 0) return 'reference-to-video'
  if (opts.firstFrame && opts.lastFrame) return 'frames-to-video'
  if (opts.firstFrame) return 'image-to-video'
  return 'text-to-video'
}

export default function VideoStudio() {
  const [prompt, setPrompt] = useState('')
  const [firstFrame, setFirstFrame] = useState<VideoInputValue | null>(null)
  const [lastFrame, setLastFrame] = useState<VideoInputValue | null>(null)
  const [references, setReferences] = useState<VideoInputValue[]>([])
  const [aspectRatio, setAspectRatio] = useState<string>('9:16')
  const [duration, setDuration] = useState<number>(5)
  const [resolution, setResolution] = useState<string>('720p')
  const [audio, setAudio] = useState<boolean>(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VideoGenResult | null>(null)
  const [savedToBank, setSavedToBank] = useState(false)

  const addBRoll = useBankStore((s) => s.addBRoll)
  const updateBRoll = useBankStore((s) => s.updateBRoll)
  const getBRollById = useBankStore((s) => s.getBRollById)
  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)

  // Single persisted model for B-Roll Videos. Mode is inferred at generate-time.
  const persistedModelId = useSettingsStore((s) => s.getAppModel(MODEL_KEY))
  const selectedModelId =
    persistedModelId ?? getDefaultModel('video-studio', 'video')?.id ?? ''
  const selectedModel = getModel(selectedModelId)
  const constraints = selectedModel?.videoConstraints
  const refsAllowed = selectedModel?.supportsReferenceImages ?? false
  // Veo 3.1 Fast is reference-capped at 3; Seedance variants allow up to 9.
  const maxRefs = selectedModelId === 'veo3_fast' ? 3 : 9

  // Snap constraint controls + clear unsupported inputs when the model changes.
  useEffect(() => {
    const c = selectedModel?.videoConstraints
    if (!c) return
    if (!c.aspectRatios.includes(aspectRatio)) setAspectRatio(c.aspectRatios[0])
    if (!c.durations.includes(duration)) setDuration(c.durations[0] ?? 5)
    if (!c.resolutions.includes(resolution)) setResolution(c.resolutions[0] ?? '720p')
    if (!c.supportsAudio) setAudio(false)
    if (!selectedModel?.supportsReferenceImages && references.length > 0) {
      setReferences([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelId])

  // Inter-app payload: B-Roll Images → B-Roll Videos handoff (drops a still in
  // the start-frame slot). No mode to set — the slot itself signals intent.
  useEffect(() => {
    if (activeApp !== 'video-studio') return
    if (!interAppPayload || interAppPayload.targetApp !== 'video-studio') return

    if (interAppPayload.targetField === 'firstFrame') {
      const data = interAppPayload.data
      if (typeof data === 'string') {
        setFirstFrame({ dataUri: data })
      } else if (data && typeof data === 'object' && 'imageUrl' in data) {
        const { imageUrl, prompt: incomingPrompt, sourceBRollId } = data as {
          imageUrl: string
          prompt?: string
          sourceBRollId?: string
        }
        setFirstFrame({ dataUri: imageUrl, sourceBRollId })
        if (typeof incomingPrompt === 'string' && incomingPrompt.trim()) {
          setPrompt(incomingPrompt)
        }
      }
    }
    consumePayload()
  }, [interAppPayload, activeApp, consumePayload])

  const inferredMode = inferMode({ firstFrame, lastFrame, references })

  const modeSupported = selectedModel?.modes?.includes(inferredMode) ?? false
  const canGenerate = prompt.trim().length > 0 && !!selectedModelId && modeSupported

  async function handleGenerate() {
    if (!canGenerate || !selectedModelId) return
    setIsGenerating(true)
    setError(null)
    setResult(null)
    setSavedToBank(false)
    try {
      const res = await generateVideo({
        prompt: prompt.trim(),
        mode: inferredMode,
        firstFrameDataUri: firstFrame?.dataUri,
        lastFrameDataUri: lastFrame?.dataUri,
        referenceDataUris: references.length > 0 ? references.map((r) => r.dataUri) : undefined,
        aspectRatio,
        durationSeconds: duration,
        resolution,
        audio,
        modelId: selectedModelId,
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video generation failed.')
    } finally {
      setIsGenerating(false)
    }
  }

  const resolvedVideoUrl = useAssetUrl(result?.assetId ?? null)

  // Save linkage: prefer the start frame's source BRoll, then end frame, then
  // first reference. If found, append the video to that record. Otherwise:
  //   - upload-only first frame: create a new BRoll with both still + video
  //   - text-only: create video-only BRoll
  async function handleSaveToBank() {
    if (!result) return

    const newVideo = {
      url: result.assetId,
      aspectRatio: result.aspectRatio,
      createdAt: Date.now(),
    }

    const sourceId =
      firstFrame?.sourceBRollId ??
      lastFrame?.sourceBRollId ??
      references.find((r) => r.sourceBRollId)?.sourceBRollId

    if (sourceId) {
      const existing = getBRollById(sourceId)
      if (existing) {
        const nextVideos = [...(existing.videos ?? []), newVideo]
        updateBRoll(sourceId, { videos: nextVideos })
        setSavedToBank(true)
        setTimeout(() => setSavedToBank(false), 2000)
        return
      }
    }

    // No source bank id — if a fresh first-frame upload exists, persist the
    // still as an asset alongside the video so the new BRoll is paired.
    let imageUrl = ''
    if (firstFrame?.dataUri) {
      try {
        imageUrl = await saveFromDataUrl(firstFrame.dataUri)
      } catch {
        imageUrl = ''
      }
    }

    addBRoll({
      imageUrl,
      prompt: prompt.trim(),
      videos: [newVideo],
    })
    setSavedToBank(true)
    setTimeout(() => setSavedToBank(false), 2000)
  }

  const credits = formatCredits(
    estimateCredits(selectedModelId, { durationSeconds: duration, resolution, audio }),
  )

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Left — controls */}
      <div className="flex w-full lg:w-1/2 shrink-0 flex-col overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/5 p-5">
        {/* Model picker — leads the panel; choosing a model determines what's possible below. */}
        <div className="mb-5">
          <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">Model</label>
          <ModelPicker
            appId="video-studio"
            task="video"
            costParams={{ durationSeconds: duration, resolution, audio }}
          />
        </div>

        {/* Frame slots — start + end side by side. Both optional. */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <VideoInputSlot
            label="Start frame"
            helper="— optional"
            value={firstFrame}
            onChange={setFirstFrame}
          />
          <VideoInputSlot
            label="End frame"
            helper="— optional"
            value={lastFrame}
            onChange={setLastFrame}
          />
        </div>

        {/* Reference images — only for models that support them. */}
        {refsAllowed && (
          <div className="mb-5">
            <VideoRefStrip
              label="Reference images"
              helper="optional"
              values={references}
              onChange={setReferences}
              max={maxRefs}
            />
          </div>
        )}

        {/* Prompt */}
        <div className="mb-5">
          <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Describe the video you want to generate..."
            className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-purple-500/30"
          />
        </div>

        {/* Constraint controls — populated from selected model. Each control
            renders as a segmented toggle when there are ≤3 options, else a
            dropdown to keep the panel compact for high-cardinality sets. */}
        {constraints && (
          <div className="mb-5 grid grid-cols-3 gap-3">
            <ChoiceControl
              label="Aspect"
              options={constraints.aspectRatios}
              value={aspectRatio}
              onChange={setAspectRatio}
              renderOption={(r) => (
                <span className="flex items-center justify-center gap-1.5">
                  <AspectIcon ratio={String(r)} />
                  <span>{r}</span>
                </span>
              )}
            />
            <ChoiceControl
              label="Duration"
              options={constraints.durations}
              value={duration}
              onChange={setDuration}
              renderOption={(d) => `${d}s`}
            />
            <ChoiceControl
              label="Resolution"
              options={constraints.resolutions}
              value={resolution}
              onChange={setResolution}
              renderOption={(r) => RESOLUTION_LABELS[String(r)] ?? String(r)}
            />
          </div>
        )}

        {/* Audio toggle (only for models that support it) */}
        {constraints?.supportsAudio && (
          <div className="mb-5">
            <button
              onClick={() => setAudio(!audio)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                audio ? 'border-purple-500/30 bg-purple-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2">
                {audio ? <Volume2 className="h-4 w-4 text-purple-400" /> : <VolumeX className="h-4 w-4 text-zinc-500" />}
                <span className="text-sm text-zinc-200">Audio</span>
                <span className="text-[11px] text-zinc-500">{audio ? 'On' : 'Off'}</span>
              </div>
              <span className="text-[11px] text-zinc-500">Affects credits</span>
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
            <p className="text-xs leading-relaxed text-red-300">{error}</p>
          </div>
        )}

        {/* Generate */}
        <div className="mt-auto pt-2">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-purple-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white transition-all hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating Video…</span>
              </>
            ) : (
              <>
                <Film className="h-4 w-4" />
                <span>Generate Video{credits ? ` (${credits})` : ''}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right — output */}
      <div className="flex flex-1 items-center justify-center p-5">
        {result && resolvedVideoUrl ? (
          <div className="flex h-full w-full flex-col items-center gap-3">
            <video
              src={resolvedVideoUrl}
              controls
              autoPlay
              loop
              className="max-h-[70vh] max-w-full rounded-xl border border-white/10"
            />
            <button
              onClick={handleSaveToBank}
              disabled={savedToBank}
              className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[12px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            >
              {savedToBank ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Saved to B-Rolls</span>
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>Save to B-Rolls Bank</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <Film className="h-10 w-10 text-zinc-800" strokeWidth={1.5} />
            <p className="text-sm text-zinc-700">Configure your video and generate</p>
            <p className="text-xs text-zinc-800">Output will play here</p>
          </div>
        )}
      </div>
    </div>
  )
}

interface SegmentedControlProps<T> {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  renderOption?: (v: T) => ReactNode
}

// Tiny outlined rectangle scaled to the given aspect ratio. Bounded to a
// 14×14 box so the icon stays compact next to the text label, with the
// shape itself proportional inside.
function AspectIcon({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(':').map(Number)
  if (!w || !h) return null
  const max = 14
  const longSide = Math.max(w, h)
  const width = (w / longSide) * max
  const height = (h / longSide) * max
  return (
    <span
      className="inline-block shrink-0 rounded-[2px] border border-current"
      style={{ width: `${width}px`, height: `${height}px` }}
      aria-hidden="true"
    />
  )
}

// Picks segmented vs dropdown based on cardinality. Up to 3 options stay as
// inline toggles (always visible). 4+ collapse into a compact dropdown so the
// panel doesn't wrap or feel crowded.
function ChoiceControl<T extends string | number>(props: SegmentedControlProps<T>) {
  if (props.options.length > 3) return <DropdownControl {...props} />
  return <SegmentedControl {...props} />
}

function SegmentedControl<T extends string | number>({ label, options, value, onChange, renderOption }: SegmentedControlProps<T>) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
        {options.map((opt) => (
          <button
            key={String(opt)}
            onClick={() => onChange(opt)}
            className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
              value === opt ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {renderOption ? renderOption(opt) : String(opt)}
          </button>
        ))}
      </div>
    </div>
  )
}

function DropdownControl<T extends string | number>({ label, options, value, onChange, renderOption }: SegmentedControlProps<T>) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const renderValue = (opt: T) => (renderOption ? renderOption(opt) : String(opt))

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-1 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-[11px] font-medium text-zinc-100 transition-colors hover:bg-white/[0.05]"
      >
        <span className="flex min-w-0 flex-1 items-center justify-center">{renderValue(value)}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#0B0B0D]/95 shadow-xl backdrop-blur-xl">
          <div className="max-h-[260px] overflow-y-auto p-1">
            {options.map((opt) => (
              <button
                key={String(opt)}
                type="button"
                onClick={() => { onChange(opt); setOpen(false) }}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition-colors ${
                  value === opt ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-300 hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5">{renderValue(opt)}</span>
                {value === opt && <Check className="h-3 w-3 shrink-0 text-sky-400" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
