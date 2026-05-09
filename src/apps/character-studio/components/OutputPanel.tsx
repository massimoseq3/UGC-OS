import { useState, useEffect } from 'react'
import { Check, Save, UserRound, Loader2, Download, AlertCircle, X, RectangleVertical, RectangleHorizontal } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import type { GenerationResult } from '../services/generateCharacter'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import GenerationProgress from '../../../components/GenerationProgress'
import ModelPicker from '../../../components/ModelPicker'
import ResolutionToggle from '../../../components/ResolutionToggle'
import { estimateCredits, formatCredits, getDefaultModel, getModel, type ImageResolution } from '../../../utils/models'

interface OutputPanelProps {
  result: GenerationResult | null
  isGenerating: boolean
  error: string | null
  onGenerate: () => void
  onCancel: () => void
  canGenerate: boolean
  aspectRatio: string
  onAspectRatioChange: (value: string) => void
  resolution: ImageResolution
  onResolutionChange: (value: ImageResolution) => void
}

const PORTRAIT_VALUE = 'Portrait (9:16)'
const LANDSCAPE_VALUE = 'Landscape (16:9)'

function AspectRatioToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPortrait = value.includes('9:16')
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
      <button
        onClick={() => onChange(PORTRAIT_VALUE)}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${isPortrait
          ? 'bg-sky-500/15 text-sky-300'
          : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title="Portrait 9:16"
      >
        <RectangleVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
        Portrait <span className="text-zinc-500">9:16</span>
      </button>
      <button
        onClick={() => onChange(LANDSCAPE_VALUE)}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${!isPortrait
          ? 'bg-sky-500/15 text-sky-300'
          : 'text-zinc-500 hover:text-zinc-300'
        }`}
        title="Landscape 16:9"
      >
        <RectangleHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
        Landscape <span className="text-zinc-500">16:9</span>
      </button>
    </div>
  )
}

export default function OutputPanel({ result, isGenerating, error, onGenerate, onCancel, canGenerate, aspectRatio, onAspectRatioChange, resolution, onResolutionChange }: OutputPanelProps) {
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saved, setSaved] = useState(false)

  const addModel = useBankStore((s) => s.addModel)
  const resolvedImageUrl = useAssetUrl(result?.imageUrl)

  const persistedModel = useSettingsStore((s) => s.getAppModel('character-studio:image:text-to-image'))
  const selectedModelId = persistedModel ?? getDefaultModel('character-studio', 'image', 'text-to-image')?.id
  const creditsLabel = formatCredits(estimateCredits(selectedModelId ?? '', { imageCount: 1, resolution }))

  // When the model changes, snap to that model's preferred default tier (or
  // first supported as a fallback). This makes GPT Image 2 land on 2K when
  // users switch into it, and keeps any model switch consistent.
  useEffect(() => {
    const constraints = selectedModelId ? getModel(selectedModelId)?.imageConstraints : undefined
    const tiers = (constraints?.resolutions ?? []) as ImageResolution[]
    if (tiers.length === 0) return
    const preferred = (constraints?.default as ImageResolution | undefined) ?? tiers[0]
    if (preferred !== resolution) onResolutionChange(preferred)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelId])

  const isPortrait = aspectRatio.includes('9:16')

  const handleSave = () => {
    if (!saveName.trim() || !result) return
    addModel({
      characterImage: result.imageUrl,
      name: saveName.trim(),
      notes: '',
      jsonProfile: result.jsonPrompt as unknown as Record<string, unknown>,
      source: 'character-studio',
    })
    setShowSaveForm(false)
    setSaveName('')
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // Loading state with progress bar
  if (isGenerating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <div className={`skeleton w-full max-w-sm rounded-xl ${isPortrait ? 'aspect-[9/16]' : 'aspect-video'}`} />
        <div className="w-full max-w-sm">
          <GenerationProgress
            isActive
            color="bg-sky-500"
            messages={['Building character prompt...', 'Sending request...', 'Generating image...', 'Rendering final image...']}
          />
          <button
            onClick={onCancel}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Empty state — no result yet
  if (!result) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <UserRound className="h-10 w-10 text-zinc-800" strokeWidth={1.5} />
          <p className="text-sm text-zinc-700">Configure parameters and generate</p>
          <p className="text-xs text-zinc-800">Your character visualization will appear here</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
            <p className="text-xs leading-relaxed text-red-300">{error}</p>
          </div>
        )}

        {/* Generate button always visible */}
        <div className="space-y-3 border-t border-white/5 p-4">
          <AspectRatioToggle value={aspectRatio} onChange={onAspectRatioChange} />
          <ModelPicker
            appId="character-studio"
            task="image"
            mode="text-to-image"
            costParams={{ imageCount: 1, resolution }}
          />
          <ResolutionToggle modelId={selectedModelId} value={resolution} onChange={onResolutionChange} />
          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-sky-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <UserRound className="h-4 w-4" />
            <span>Generate Character{creditsLabel ? ` (${creditsLabel})` : ''}</span>
          </button>
        </div>
      </div>
    )
  }

  // Result state — image fits within panel, no scrolling
  return (
    <div className="flex h-full flex-col">
      {/* Image + actions area — fills available space */}
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {/* Image container — takes available height, image fits inside */}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className={`group relative overflow-hidden rounded-xl border border-white/10 bg-black ${isPortrait ? 'h-full max-h-full' : 'w-full'}`}>
            <img
              src={resolvedImageUrl}
              alt="Generated character"
              className={`${isPortrait ? 'h-full' : 'w-full'} object-contain`}
            />
            {/* Download overlay on hover */}
            <button
              onClick={() => {
                if (!resolvedImageUrl) return
                const a = document.createElement('a')
                a.href = resolvedImageUrl
                a.download = `character-${Date.now()}.png`
                a.click()
              }}
              className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-black/80 hover:text-white"
              title="Download image"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Actions below image — compact, no scroll */}
        <div className="mt-3 flex flex-col gap-2">
          {/* Save to Character Bank */}
          {showSaveForm ? (
            <div className="flex gap-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                placeholder='e.g. "Sarah - Bedroom Setup"'
                autoFocus
                className="flex-1 rounded-full border border-white/10 bg-transparent px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-sky-500/30"
              />
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="rounded-full bg-sky-500/15 px-5 py-3 text-sm font-medium text-sky-400 transition-colors hover:bg-sky-500/25 disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => { setShowSaveForm(false); setSaveName('') }}
                className="rounded-full px-5 py-3 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveForm(true)}
              className={`flex w-full items-center justify-center gap-2 rounded-full border px-6 py-3.5 text-[13px] font-medium tracking-tight transition-colors ${saved
                ? 'border-green-500/20 bg-green-500/10 text-green-400'
                : 'border-white/15 text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100'
                }`}
            >
              {saved ? (
                <><Check className="h-4 w-4" /> Saved to Character Bank</>
              ) : (
                <><Save className="h-4 w-4" /> Save to Character Bank</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Generate button — pinned to bottom */}
      <div className="space-y-2 border-t border-white/5 p-3">
        <AspectRatioToggle value={aspectRatio} onChange={onAspectRatioChange} />
        <ModelPicker
          appId="character-studio"
          task="image"
          mode="text-to-image"
          costParams={{ imageCount: 1, resolution }}
        />
        <ResolutionToggle modelId={selectedModelId} value={resolution} onChange={onResolutionChange} />
        <button
          onClick={onGenerate}
          disabled={!canGenerate || isGenerating}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-sky-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <UserRound className="h-4 w-4" />
              <span>Generate Character{creditsLabel ? ` (${creditsLabel})` : ''}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
