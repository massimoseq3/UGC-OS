import { useState, useRef, useEffect, useMemo } from 'react'
import { Film, Loader2, Upload, X, AlertCircle, Save, Check, Volume2, VolumeX } from 'lucide-react'
import { useBankStore } from '../../stores/bankStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAppStore } from '../../stores/appStore'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import ModelPicker from '../../components/ModelPicker'
import {
  getDefaultModel,
  getModel,
  estimateCredits,
  formatCredits,
  listModels,
} from '../../utils/models'
import { fileToDataUri } from '../../utils/kie'
import { generateVideo } from './services/generateVideo'
import type { VideoGenResult, VideoMode } from './types'

const MODE_OPTIONS: Array<{ value: VideoMode; label: string }> = [
  { value: 'text-to-video', label: 'Text → Video' },
  { value: 'image-to-video', label: 'Image → Video' },
  { value: 'frames-to-video', label: 'Start + End Frame' },
  { value: 'reference-to-video', label: 'Reference Images' },
]

const RESOLUTION_LABELS: Record<string, string> = {
  '480p': '480p',
  '720p': '720p',
  '1080p': '1080p',
  '4k': '4K',
  std: 'Standard',
  pro: 'Pro',
  '4K': '4K',
}

export default function VideoStudio() {
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<VideoMode>('text-to-video')
  const [firstFrameDataUri, setFirstFrameDataUri] = useState<string | null>(null)
  const [lastFrameDataUri, setLastFrameDataUri] = useState<string | null>(null)
  const [referenceDataUris, setReferenceDataUris] = useState<string[]>([])
  const [aspectRatio, setAspectRatio] = useState<string>('9:16')
  const [duration, setDuration] = useState<number>(5)
  const [resolution, setResolution] = useState<string>('720p')
  const [audio, setAudio] = useState<boolean>(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VideoGenResult | null>(null)
  const [savedToBank, setSavedToBank] = useState(false)

  const firstFrameInputRef = useRef<HTMLInputElement>(null)
  const lastFrameInputRef = useRef<HTMLInputElement>(null)
  const refImageInputRef = useRef<HTMLInputElement>(null)

  const addBRoll = useBankStore((s) => s.addBRoll)
  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)

  // Resolve the selected model for the current mode.
  const persistedModelId = useSettingsStore((s) =>
    s.getAppModel(`video-studio:video:${mode}`),
  )
  const setAppModel = useSettingsStore((s) => s.setAppModel)
  const selectedModelId =
    persistedModelId ?? getDefaultModel('video-studio', 'video', mode)?.id ?? ''
  const selectedModel = getModel(selectedModelId)

  // Modes the selected model actually supports — gates the mode toggle.
  const supportedModes = useMemo<VideoMode[]>(() => {
    return MODE_OPTIONS
      .map((m) => m.value)
      .filter((mv) => {
        const candidates = listModels({ task: 'video', mode: mv })
        return candidates.length > 0
      })
  }, [])

  // When the selected model changes, snap constraint controls to allowed values.
  useEffect(() => {
    const c = selectedModel?.videoConstraints
    if (!c) return
    if (!c.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(c.aspectRatios[0])
    }
    if (!c.durations.includes(duration)) {
      setDuration(c.durations[0] ?? 5)
    }
    if (!c.resolutions.includes(resolution)) {
      setResolution(c.resolutions[0] ?? '720p')
    }
    if (!c.supportsAudio) {
      setAudio(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelId])

  // Inter-app payload: B-Roll Images → B-Roll Videos handoff (first frame).
  useEffect(() => {
    if (activeApp !== 'video-studio') return
    if (!interAppPayload || interAppPayload.targetApp !== 'video-studio') return

    if (interAppPayload.targetField === 'firstFrame') {
      const data = interAppPayload.data
      if (typeof data === 'string') {
        setFirstFrameDataUri(data)
        setMode('image-to-video')
      } else if (data && typeof data === 'object' && 'imageUrl' in data) {
        const { imageUrl, prompt: incomingPrompt } = data as { imageUrl: string; prompt?: string }
        setFirstFrameDataUri(imageUrl)
        if (typeof incomingPrompt === 'string' && incomingPrompt.trim()) {
          setPrompt(incomingPrompt)
        }
        setMode('image-to-video')
      }
    }
    consumePayload()
  }, [interAppPayload, activeApp, consumePayload])

  const constraints = selectedModel?.videoConstraints

  const canGenerate =
    prompt.trim().length > 0 &&
    !!selectedModelId &&
    (mode === 'text-to-video' ||
      (mode === 'image-to-video' && firstFrameDataUri !== null) ||
      (mode === 'frames-to-video' && firstFrameDataUri !== null && lastFrameDataUri !== null) ||
      (mode === 'reference-to-video' && referenceDataUris.length > 0))

  async function handleSingleFile(setter: (v: string | null) => void, file: File | null) {
    if (!file) {
      setter(null)
      return
    }
    setter(await fileToDataUri(file))
  }

  async function handleAddReference(file: File | null) {
    if (!file) return
    if (referenceDataUris.length >= 9) return
    const uri = await fileToDataUri(file)
    setReferenceDataUris((prev) => [...prev, uri])
  }

  function removeReference(index: number) {
    setReferenceDataUris((prev) => prev.filter((_, i) => i !== index))
  }

  function handleModeChange(next: VideoMode) {
    setMode(next)
    // If current model doesn't support the new mode, fall back to that mode's default.
    if (!selectedModel?.modes?.includes(next)) {
      const fallback = getDefaultModel('video-studio', 'video', next)
      if (fallback) setAppModel(`video-studio:video:${next}`, fallback.id)
    }
  }

  async function handleGenerate() {
    if (!canGenerate || !selectedModelId) return
    setIsGenerating(true)
    setError(null)
    setResult(null)
    setSavedToBank(false)
    try {
      const res = await generateVideo({
        prompt: prompt.trim(),
        mode,
        firstFrameDataUri: firstFrameDataUri ?? undefined,
        lastFrameDataUri: lastFrameDataUri ?? undefined,
        referenceDataUris: referenceDataUris.length > 0 ? referenceDataUris : undefined,
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

  function handleSaveToBank() {
    if (!result) return
    addBRoll({
      imageUrl: '',
      prompt: prompt.trim(),
      videos: [{ url: result.assetId, aspectRatio: result.aspectRatio, createdAt: Date.now() }],
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
        {/* Mode toggle */}
        <div className="mb-5 flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
          {MODE_OPTIONS.filter((m) => supportedModes.includes(m.value)).map((m) => (
            <button
              key={m.value}
              onClick={() => handleModeChange(m.value)}
              className={`flex-1 min-w-[100px] rounded-md py-2 text-[11px] font-medium tracking-tight transition-colors ${
                mode === m.value ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Per-mode input area */}
        {mode === 'image-to-video' && (
          <div className="mb-5">
            <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">First frame</label>
            {firstFrameDataUri ? (
              <ImagePreview src={firstFrameDataUri} onRemove={() => setFirstFrameDataUri(null)} />
            ) : (
              <UploadSlot label="Upload first-frame image" onClick={() => firstFrameInputRef.current?.click()} />
            )}
            <input ref={firstFrameInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => handleSingleFile(setFirstFrameDataUri, e.target.files?.[0] ?? null)} />
          </div>
        )}

        {mode === 'frames-to-video' && (
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">Start frame</label>
              {firstFrameDataUri ? (
                <ImagePreview src={firstFrameDataUri} onRemove={() => setFirstFrameDataUri(null)} />
              ) : (
                <UploadSlot label="Start" onClick={() => firstFrameInputRef.current?.click()} />
              )}
              <input ref={firstFrameInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => handleSingleFile(setFirstFrameDataUri, e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">End frame</label>
              {lastFrameDataUri ? (
                <ImagePreview src={lastFrameDataUri} onRemove={() => setLastFrameDataUri(null)} />
              ) : (
                <UploadSlot label="End" onClick={() => lastFrameInputRef.current?.click()} />
              )}
              <input ref={lastFrameInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => handleSingleFile(setLastFrameDataUri, e.target.files?.[0] ?? null)} />
            </div>
          </div>
        )}

        {mode === 'reference-to-video' && (
          <div className="mb-5">
            <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Reference images <span className="text-zinc-700 normal-case">({referenceDataUris.length}/9)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {referenceDataUris.map((uri, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-white/10">
                  <img src={uri} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => removeReference(i)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white/80 hover:bg-black/90">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {referenceDataUris.length < 9 && (
                <button onClick={() => refImageInputRef.current?.click()}
                  className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-zinc-500 transition-colors hover:border-white/25 hover:text-zinc-300">
                  <Upload className="h-4 w-4" />
                </button>
              )}
            </div>
            <input ref={refImageInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => handleAddReference(e.target.files?.[0] ?? null)} />
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

        {/* Model picker */}
        <div className="mb-5">
          <ModelPicker
            appId="video-studio"
            task="video"
            mode={mode}
            costParams={{ durationSeconds: duration, resolution, audio }}
          />
        </div>

        {/* Constraint controls — populated from selected model */}
        {constraints && (
          <div className="mb-5 grid grid-cols-3 gap-3">
            <SegmentedControl
              label="Aspect"
              options={constraints.aspectRatios}
              value={aspectRatio}
              onChange={setAspectRatio}
            />
            <SegmentedControl
              label="Duration"
              options={constraints.durations}
              value={duration}
              onChange={setDuration}
              renderOption={(d) => `${d}s`}
            />
            <SegmentedControl
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

function ImagePreview({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10">
      <img src={src} alt="" className="w-full" />
      <button
        onClick={onRemove}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white/80 backdrop-blur-sm hover:bg-black/90 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function UploadSlot({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-sm text-zinc-500 transition-colors hover:border-white/25 hover:text-zinc-300"
    >
      <Upload className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}

interface SegmentedControlProps<T> {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  renderOption?: (v: T) => string
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
