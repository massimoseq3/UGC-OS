import { useState, useRef } from 'react'
import { Film, Loader2, Upload, X, AlertCircle, Save, Check } from 'lucide-react'
import { useBankStore } from '../../stores/bankStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import ModelPicker from '../../components/ModelPicker'
import CostPreview from '../../components/CostPreview'
import { getDefaultModel } from '../../utils/models'
import { fileToDataUri } from '../../utils/kie'
import { generateVideo } from './services/generateVideo'
import type { VideoGenResult, VideoMode } from './types'

const ASPECT_OPTIONS: Array<'9:16' | '16:9' | '1:1'> = ['9:16', '16:9', '1:1']
const DURATION_OPTIONS = [4, 5, 6, 8, 10, 12, 15] as const
const RESOLUTION_OPTIONS: Array<'480p' | '720p' | '1080p'> = ['480p', '720p', '1080p']

export default function VideoStudio() {
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<VideoMode>('text-to-video')
  const [firstFrameDataUri, setFirstFrameDataUri] = useState<string | null>(null)
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16')
  const [duration, setDuration] = useState<typeof DURATION_OPTIONS[number]>(5)
  const [resolution, setResolution] = useState<'480p' | '720p' | '1080p'>('720p')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VideoGenResult | null>(null)
  const [savedToBank, setSavedToBank] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const addBRoll = useBankStore((s) => s.addBRoll)

  const persistedModel = useSettingsStore((s) =>
    s.getAppModel(`video-studio:video:${mode}`),
  )
  const selectedModelId =
    persistedModel ?? getDefaultModel('video-studio', 'video', mode)?.id

  const resolvedVideoUrl = useAssetUrl(result?.assetId ?? null)

  const canGenerate =
    prompt.trim().length > 0 &&
    (mode === 'text-to-video' || firstFrameDataUri !== null) &&
    !!selectedModelId

  async function handleFile(file: File | null) {
    if (!file) {
      setFirstFrameDataUri(null)
      return
    }
    const dataUri = await fileToDataUri(file)
    setFirstFrameDataUri(dataUri)
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
        aspectRatio,
        durationSeconds: duration,
        resolution,
        modelId: selectedModelId,
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video generation failed.')
    } finally {
      setIsGenerating(false)
    }
  }

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

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Left — controls */}
      <div className="flex w-full lg:w-1/2 shrink-0 flex-col overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/5 p-5">
        {/* Mode toggle */}
        <div className="mb-5 flex gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
          {(['text-to-video', 'image-to-video'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md py-2 text-[12px] font-medium tracking-tight transition-colors ${
                mode === m ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {m === 'text-to-video' ? 'Text → Video' : 'Image → Video'}
            </button>
          ))}
        </div>

        {/* First frame upload (image-to-video only) */}
        {mode === 'image-to-video' && (
          <div className="mb-5">
            <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              First frame
            </label>
            {firstFrameDataUri ? (
              <div className="relative overflow-hidden rounded-lg border border-white/10">
                <img src={firstFrameDataUri} alt="First frame" className="w-full" />
                <button
                  onClick={() => setFirstFrameDataUri(null)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white/80 backdrop-blur-sm hover:bg-black/90 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-sm text-zinc-500 transition-colors hover:border-white/25 hover:text-zinc-300"
              >
                <Upload className="h-4 w-4" />
                <span>Upload first-frame image</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        {/* Prompt */}
        <div className="mb-5">
          <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Describe the video you want to generate..."
            className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-purple-500/30"
          />
        </div>

        {/* Aspect / duration / resolution */}
        <div className="mb-5 grid grid-cols-3 gap-3">
          <SegmentedControl
            label="Aspect"
            options={ASPECT_OPTIONS}
            value={aspectRatio}
            onChange={setAspectRatio}
          />
          <SegmentedControl
            label="Duration"
            options={DURATION_OPTIONS}
            value={duration}
            onChange={setDuration}
            renderOption={(d) => `${d}s`}
          />
          <SegmentedControl
            label="Resolution"
            options={RESOLUTION_OPTIONS}
            value={resolution}
            onChange={setResolution}
          />
        </div>

        {/* Model picker */}
        <div className="mb-5">
          <ModelPicker appId="video-studio" task="video" mode={mode} />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
            <p className="text-xs leading-relaxed text-red-300">{error}</p>
          </div>
        )}

        {/* Generate */}
        <div className="mt-auto space-y-2 pt-2">
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
                <span>Generate Video</span>
              </>
            )}
          </button>
          <div className="flex justify-center">
            <CostPreview modelId={selectedModelId} params={{ durationSeconds: duration }} />
          </div>
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
