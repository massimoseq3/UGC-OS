import { useState, useCallback, useEffect } from 'react'
import {
  Copy,
  Check,
  Film,
  ImageIcon,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Pencil,
  FolderOpen,
  AlertCircle,
} from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'
import type { BrollResult, Scene, PromptVariation, CardState, GeneratedImage, ReferenceImage } from '../types'
import { generateImage } from '../services/generateBroll'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getAsBase64, isAssetRef } from '../../../utils/assetStore'

interface OutputPanelProps {
  result: BrollResult | null
  isGenerating?: boolean
  error?: string | null
  onAddVariation: (sceneNumber: number, variation: PromptVariation) => void
  referenceImages?: ReferenceImage[]
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
}

const TAG_STYLES: Record<PromptVariation['tag'], string> = {
  'LITERAL / ACTION': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'EMOTIONAL / REACTION': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  'PRODUCT / DETAIL': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}


function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex shrink-0 items-center gap-1 rounded-md p-1 text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-400"
      title="Copy prompt"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

function DownloadButton({ url, filename }: { url: string; filename: string }) {
  const resolvedUrl = useAssetUrl(url)
  const handleDownload = () => {
    if (!resolvedUrl) return
    const a = document.createElement('a')
    a.href = resolvedUrl
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-1 rounded-full bg-black/50 p-1 text-white/70 transition-colors hover:bg-black/70 hover:text-white"
      title="Download"
    >
      <Download className="h-3 w-3" />
    </button>
  )
}

/* ─── Variation Card ─── */
function VariationCard({
  variation,
  index,
  cardState,
  onUpdateState,
  referenceImages,
  selectedProductId,
  selectedModelId,
  selectedScriptId,
}: {
  variation: PromptVariation
  index: number
  cardState: CardState
  onUpdateState: (updates: Partial<CardState>) => void
  referenceImages?: ReferenceImage[]
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
}) {
  const [isEditingPrompt, setIsEditingPrompt] = useState(!variation.prompt)
  const [saved, setSaved] = useState(false)
  const hasImages = cardState.images.length > 0
  const currentImage: GeneratedImage | undefined = cardState.images[cardState.currentImageIndex]
  const resolvedImageUrl = useAssetUrl(currentImage?.imageUrl)
  const resolvedVideoUrl = useAssetUrl(cardState.videoUrl ?? undefined)

  const handleGenerateImage = async () => {
    onUpdateState({ isGeneratingImage: true, imageError: null })
    try {
      const imageUrl = await generateImage(cardState.editablePrompt, referenceImages)
      const newImage: GeneratedImage = { imageUrl, prompt: cardState.editablePrompt }
      const newImages = [...cardState.images, newImage]
      onUpdateState({
        isGeneratingImage: false,
        images: newImages,
        currentImageIndex: newImages.length - 1,
      })
      setSaved(false)
    } catch (err) {
      onUpdateState({
        isGeneratingImage: false,
        imageError: err instanceof Error ? err.message : 'Image generation failed. Try again.',
      })
    }
  }

  const handleSaveToBank = () => {
    if (!currentImage) return
    useBankStore.getState().addBRoll({
      imageUrl: currentImage.imageUrl,
      prompt: currentImage.prompt,
      productId: selectedProductId,
      modelId: selectedModelId,
      scriptId: selectedScriptId,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAnimateInVideoStudio = async () => {
    if (!currentImage) return
    let dataUri = currentImage.imageUrl
    if (isAssetRef(dataUri)) {
      const asset = await getAsBase64(dataUri)
      if (!asset) return
      dataUri = `data:${asset.mimeType};base64,${asset.base64}`
    }
    useAppStore.getState().sendToApp({
      targetApp: 'video-studio',
      targetField: 'firstFrame',
      data: dataUri,
    })
  }

  const goToPrev = () => {
    if (cardState.currentImageIndex > 0) {
      onUpdateState({ currentImageIndex: cardState.currentImageIndex - 1 })
    }
  }

  const goToNext = () => {
    if (cardState.currentImageIndex < cardState.images.length - 1) {
      onUpdateState({ currentImageIndex: cardState.currentImageIndex + 1 })
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-tight text-zinc-400">
            Option {index + 1}
          </span>
          <span className={`rounded-md border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${TAG_STYLES[variation.tag]}`}>
            {variation.tag}
          </span>
        </div>
        <CopyButton text={cardState.editablePrompt} />
      </div>

      {/* Prompt text */}
      <div className="px-3 pb-3">
        {isEditingPrompt ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              value={cardState.editablePrompt}
              onChange={(e) => onUpdateState({ editablePrompt: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] leading-relaxed text-zinc-300 placeholder-zinc-700 outline-none transition-colors focus:border-white/20 resize-none"
            />
            <button
              onClick={() => setIsEditingPrompt(false)}
              className="self-end rounded-md px-2 py-0.5 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="group relative">
            <p className="text-[11px] leading-relaxed text-zinc-500 line-clamp-4">
              {cardState.editablePrompt || <span className="italic text-zinc-600">No prompt entered...</span>}
            </p>
            <button
              onClick={() => setIsEditingPrompt(true)}
              className="absolute -right-1 -top-1 rounded-md p-1 text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/5 hover:text-zinc-400"
              title="Edit prompt"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Image area */}
      <div className="px-3 pb-3">
        {cardState.isGeneratingImage ? (
          <div className="flex aspect-square items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02]">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
              <span className="text-[10px] text-zinc-700">Generating...</span>
            </div>
          </div>
        ) : hasImages && currentImage ? (
          <div className="flex flex-col gap-2">
            {/* Image with carousel */}
            <div className="relative overflow-hidden rounded-lg border border-white/[0.06]">
              <img
                src={resolvedImageUrl}
                alt="Generated visual"
                className="aspect-square w-full object-contain bg-black/40"
              />
              {/* Carousel controls */}
              {cardState.images.length > 1 && (
                <>
                  <button
                    onClick={goToPrev}
                    disabled={cardState.currentImageIndex === 0}
                    className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white transition-opacity hover:bg-black/80 disabled:opacity-20"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <button
                    onClick={goToNext}
                    disabled={cardState.currentImageIndex === cardState.images.length - 1}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white transition-opacity hover:bg-black/80 disabled:opacity-20"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] tabular-nums text-white">
                    {cardState.currentImageIndex + 1} / {cardState.images.length}
                  </div>
                </>
              )}
              {/* Download */}
              <div className="absolute right-1 top-1">
                <DownloadButton url={currentImage.imageUrl} filename={`broll-scene-${variation.id}.png`} />
              </div>
            </div>

            {/* Prompt used for this image */}
            <p className="text-[9px] leading-relaxed text-zinc-700 line-clamp-2">
              Prompt: {currentImage.prompt}
            </p>

            {/* Regenerate + Animate + Save buttons */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={handleGenerateImage}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/[0.06] px-2 py-1.5 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </button>
              <button
                onClick={handleAnimateInVideoStudio}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-purple-500/20 bg-purple-500/10 px-2 py-1.5 text-[10px] font-medium text-purple-400 transition-colors hover:bg-purple-500/20"
                title="Send this still to Video Studio as the first frame"
              >
                <Film className="h-3 w-3" />
                Animate in Video Studio
              </button>
              <button
                onClick={handleSaveToBank}
                disabled={saved}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition-colors ${saved
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                  : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'
                }`}
              >
                {saved ? (
                  <><Check className="h-3 w-3" /> Saved</>
                ) : (
                  <><FolderOpen className="h-3 w-3" /> Save to B-Roll Bank</>
                )}
              </button>
            </div>

            {/* Video player */}
            {resolvedVideoUrl && (
              <div className="relative overflow-hidden rounded-lg border border-white/[0.06]">
                <video
                  src={resolvedVideoUrl}
                  controls
                  className="aspect-video w-full"
                />
                <div className="absolute right-1 top-1">
                  <DownloadButton url={cardState.videoUrl!} filename={`broll-video-${variation.id}.mp4`} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              onClick={handleGenerateImage}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-white/10 py-4 text-[11px] font-medium text-zinc-500 transition-colors hover:border-white/20 hover:bg-white/[0.02] hover:text-zinc-300"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Generate B-Roll Image
            </button>
            {cardState.imageError && (
              <div className="flex items-start gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                <p className="text-[10px] leading-relaxed text-red-300">{cardState.imageError}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Add New Card ─── */
function AddNewCard({
  onAdd,
}: {
  scene: Scene
  onAdd: (variation: PromptVariation) => void
}) {
  const handleAdd = () => {
    onAdd({
      id: `manual-${Date.now()}`,
      label: 'Manual Option',
      tag: 'LITERAL / ACTION',
      prompt: '',
    })
  }

  return (
    <button
      onClick={handleAdd}
      className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.08] transition-colors hover:border-white/15 hover:bg-white/[0.02]"
    >
      <Plus className="h-5 w-5 text-zinc-700" />
      <span className="text-[10px] font-medium text-zinc-600">Add Option</span>
    </button>
  )
}

/* ─── Scene Section ─── */
function SceneSection({
  scene,
  cardStates,
  onUpdateCardState,
  onAddVariation,
  referenceImages,
  selectedProductId,
  selectedModelId,
  selectedScriptId,
}: {
  scene: Scene
  cardStates: Record<string, CardState>
  onUpdateCardState: (key: string, updates: Partial<CardState>) => void
  onAddVariation: (sceneNumber: number, variation: PromptVariation) => void
  referenceImages?: ReferenceImage[]
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
}) {
  return (
    <div>
      {/* Scene header */}
      <div className="mb-4 flex items-center gap-4">
        <span className="text-4xl font-bold tabular-nums text-zinc-800">
          {String(scene.number).padStart(2, '0')}
        </span>
        <div className="h-8 w-px bg-white/10" />
        <div className="flex flex-col gap-1.5">
          <span className="inline-flex w-fit rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-violet-400">
            {scene.type}
          </span>
          <p className="text-sm italic leading-relaxed text-zinc-500" style={{ fontFamily: 'Georgia, serif' }}>
            &ldquo;{scene.scriptLine}&rdquo;
          </p>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {scene.variations.map((variation, i) => {
          const key = `${scene.number}-${i}`
          const state = cardStates[key] ?? createDefaultCardState(variation.prompt)
          return (
            <VariationCard
              key={variation.id}
              variation={variation}
              index={i}
              cardState={state}
              onUpdateState={(updates) => onUpdateCardState(key, updates)}
              referenceImages={referenceImages}
              selectedProductId={selectedProductId}
              selectedModelId={selectedModelId}
              selectedScriptId={selectedScriptId}
            />
          )
        })}
        <AddNewCard
          scene={scene}
          onAdd={(variation) => onAddVariation(scene.number, variation)}
        />
      </div>
    </div>
  )
}

function createDefaultCardState(prompt: string): CardState {
  return {
    editablePrompt: prompt,
    images: [],
    currentImageIndex: 0,
    isGeneratingImage: false,
    imageError: null,
    videoUrl: null,
    isAnimating: false,
  }
}

/* ─── Skeleton ─── */
function SkeletonScene() {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="skeleton h-8 w-10" />
        <div className="flex flex-col gap-1">
          <div className="skeleton h-4 w-28" />
          <div className="skeleton h-3 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="skeleton h-3 w-14" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-[90%]" />
              <div className="skeleton h-3 w-[70%]" />
            </div>
            <div className="mt-3 skeleton h-8 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Main OutputPanel ─── */
export default function OutputPanel({ result, isGenerating, error, onAddVariation, referenceImages, selectedProductId, selectedModelId, selectedScriptId }: OutputPanelProps) {
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({})

  const handleUpdateCardState = useCallback((key: string, updates: Partial<CardState>) => {
    setCardStates((prev) => {
      const existing = prev[key]
      if (!existing) {
        return { ...prev, [key]: { ...createDefaultCardState(''), ...updates } }
      }
      return { ...prev, [key]: { ...existing, ...updates } }
    })
  }, [])

  // Initialize card states when result changes or variations are added
  useEffect(() => {
    if (!result) return
    setCardStates((prev) => {
      const next = { ...prev }
      let changed = false
      for (const scene of result.scenes) {
        for (let i = 0; i < scene.variations.length; i++) {
          const key = `${scene.number}-${i}`
          if (!next[key]) {
            next[key] = createDefaultCardState(scene.variations[i].prompt)
            changed = true
          }
        }
      }
      return changed ? next : prev
    })
  }, [result])

  if (isGenerating) {
    return (
      <div className="flex h-full flex-col overflow-hidden p-5">
        <GenerationProgress
          isActive
          color="bg-orange-500"
          messages={['Analyzing script scenes...', 'Sending request...', 'Generating B-Roll prompts...', 'Finalizing scene breakdowns...']}
          className="mb-6"
        />
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-8">
            {[1, 2, 3].map((i) => (
              <SkeletonScene key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Film className="h-10 w-10 text-zinc-800" strokeWidth={1.5} />
        <p className="text-sm text-zinc-700">Select your inputs and generate</p>
        <p className="text-xs text-zinc-800">B-Roll prompts will appear here</p>
        {error && (
          <div className="mt-2 flex max-w-sm items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
            <p className="text-xs leading-relaxed text-red-300">{error}</p>
          </div>
        )}
      </div>
    )
  }

  const totalVariations = result.scenes.reduce((sum, s) => sum + s.variations.length, 0)

  return (
    <div className="flex h-full flex-col overflow-hidden p-5">
      {/* Scene count header */}
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">
          {result.scenes.length} SCENES
        </h3>
        <span className="text-[10px] text-zinc-600">
          {totalVariations} prompt variations
        </span>
      </div>

      {/* Scenes */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-8">
          {result.scenes.map((scene) => (
            <SceneSection
              key={scene.number}
              scene={scene}
              cardStates={cardStates}
              onUpdateCardState={handleUpdateCardState}
              onAddVariation={onAddVariation}
              referenceImages={referenceImages}
              selectedProductId={selectedProductId}
              selectedModelId={selectedModelId}
              selectedScriptId={selectedScriptId}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
