import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Copy,
  Check,
  Film,
  ImageIcon,
  Video as VideoIcon,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Pencil,
  FolderOpen,
  AlertCircle,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'
import ModelPicker from '../../../components/ModelPicker'
import AspectIcon from '../../../components/AspectIcon'
import ConstraintChip from '../../../components/ConstraintChip'
import type { BrollResult, Scene, PromptVariation, CardState, GeneratedImage, ReferenceImage } from '../types'
import { refsToToggles } from '../types'
import type { VideoHistoryItem, BRoll } from '../../../stores/types'
import { startImageTask, finishImageTask } from '../services/generateBroll'
import { startVideoTask, finishVideoTask } from '../services/generateVideo'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getAsBase64, isAssetRef } from '../../../utils/assetStore'
import { getDefaultModel, getModel, type ImageResolution, type VideoMode } from '../../../utils/models'
import { usePersistedState, useProjectScopedKey } from '../../../hooks/usePersistedState'

interface OutputPanelProps {
  result: BrollResult | null
  isGenerating?: boolean
  error?: string | null
  onAddVariation: (sceneNumber: number, variation: PromptVariation) => void
  onDeleteVariation: (sceneNumber: number, variationId: string) => void
  // Single-ref breakdown. The card decides per-option which ones to attach
  // via its refsCharacter / refsProduct toggle pills (initialised from the
  // variation's LLM-emitted REFS hint, then user-overridable).
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
}

// The user wants the chip to communicate roll type (A-roll = character on
// camera saying the line; B-roll = cutaway / action / product / reaction)
// rather than the fine-grained tag. The descriptive label underneath the
// chip already conveys the specific shot kind.
type ChipKind = 'A-ROLL' | 'B-ROLL'
const CHIP_STYLES: Record<ChipKind, string> = {
  'A-ROLL': 'bg-cyan-500/15 text-cyan-200 border-cyan-400/40',
  'B-ROLL': 'bg-amber-500/15 text-amber-200 border-amber-400/40',
}
function chipKindForTag(tag: PromptVariation['tag']): ChipKind {
  return tag === 'DIALOGUE' ? 'A-ROLL' : 'B-ROLL'
}

// Condense the LLM's descriptive shot label into a single hyphenated token
// for the in-progress chip. "TALKING-TO-CAMERA / CLOSE-IN" → "talking-to-camera",
// "MIRROR REACTION" → "mirror-reaction", "PRODUCT MACRO / DROPLET" → "product-macro".
function styleChipLabel(label: string): string {
  if (!label) return ''
  const firstPart = label.split('/')[0].trim()
  return firstPart.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Estimate how long the LINE will take to speak at conversational UGC pace
// (~150 wpm = 2.5 words per second). Returns whole seconds; used as a hint
// next to each scene so the user can match video duration before generating.
function estimateSpokenSeconds(line: string): number {
  const words = line.trim().split(/\s+/).filter(Boolean).length
  if (words === 0) return 0
  return Math.max(2, Math.round(words / 2.5))
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
  onDelete,
  characterRef,
  productRef,
  selectedProductId,
  selectedModelId,
  selectedScriptId,
  imageAspectRatio,
  imageResolution,
  videoModelId,
  videoAspectRatio,
  videoDurationSeconds,
  videoResolution,
  videoAudio,
}: {
  variation: PromptVariation
  index: number
  cardState: CardState
  onUpdateState: (updates: Partial<CardState>) => void
  onDelete?: () => void
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
  imageAspectRatio: string
  imageResolution: ImageResolution
  videoModelId?: string
  videoAspectRatio: string
  videoDurationSeconds: number
  videoResolution: string
  videoAudio: boolean
}) {
  const isManual = variation.id.startsWith('manual-') || variation.label === 'Manual Option'
  const showTagChip = !isManual
  const [isEditingPrompt, setIsEditingPrompt] = useState(!variation.prompt)
  const [saved, setSaved] = useState(false)
  const hasImages = cardState.images.length > 0
  const currentImage: GeneratedImage | undefined = cardState.images[cardState.currentImageIndex]
  const resolvedImageUrl = useAssetUrl(currentImage?.imageUrl)
  const resolvedVideoUrl = useAssetUrl(cardState.videoUrl ?? undefined)
  // Per-button in-progress labels — only the clicked button visually flips
  // to its "…ing" state. videoMode is set by handleAnimateStill /
  // handleGenerateVideo before the kie task starts and cleared on completion.
  const isAnimating = cardState.videoStatus === 'generating' && cardState.videoMode === 'image-to-video'
  const isGeneratingVideo = cardState.videoStatus === 'generating' && cardState.videoMode !== 'image-to-video'

  // Compose the active reference set from the card's toggle pills + the
  // parent's character/product. Image gen and reference-to-video both use
  // this — only the toggled-on refs flow through.
  const buildCardRefs = (): ReferenceImage[] => {
    const out: ReferenceImage[] = []
    if (cardState.refsCharacter && characterRef) out.push(characterRef)
    if (cardState.refsProduct && productRef) out.push(productRef)
    return out
  }

  const handleGenerateImage = async () => {
    onUpdateState({ isGeneratingImage: true, imageError: null })

    // Two-phase: createTask first so we can persist the taskId, then poll.
    // If we already have a pendingTaskId (mid-retry after a timeout), reuse it
    // instead of burning another createTask call — kie may still be working on it.
    let taskId = cardState.pendingTaskId
    let modelId = cardState.pendingModelId
    try {
      if (!taskId || !modelId) {
        const started = await startImageTask(cardState.editablePrompt, buildCardRefs(), imageAspectRatio, imageResolution)
        taskId = started.taskId
        modelId = started.modelId
        onUpdateState({
          pendingTaskId: taskId,
          pendingModelId: modelId,
          pendingStartedAt: Date.now(),
        })
      }
    } catch (err) {
      onUpdateState({
        isGeneratingImage: false,
        imageError: err instanceof Error ? err.message : 'Image generation failed. Try again.',
      })
      return
    }

    try {
      const imageUrl = await finishImageTask(taskId, modelId)
      const newImage: GeneratedImage = { imageUrl, prompt: cardState.editablePrompt }
      const newImages = [...cardState.images, newImage]
      onUpdateState({
        isGeneratingImage: false,
        imageError: null,
        pendingTaskId: null,
        pendingModelId: null,
        pendingStartedAt: null,
        images: newImages,
        currentImageIndex: newImages.length - 1,
      })
      setSaved(false)
    } catch (err) {
      // Leave pendingTaskId set — the user can hit Retry to resume polling
      // the same kie job rather than starting fresh.
      onUpdateState({
        isGeneratingImage: false,
        imageError: err instanceof Error ? err.message : 'Image generation failed. Try again.',
      })
    }
  }

  const [savingToBank, setSavingToBank] = useState(false)
  const handleSaveToBank = async () => {
    if (savingToBank) return
    // Allow saving even without an image — if the card has only a video, we still
    // create a BRoll record with the video attached (image-less B-Roll, like
    // B-Roll Videos used to do).
    if (!currentImage && !cardState.videoUrl) return
    setSavingToBank(true)
    try {
      const bank = useBankStore.getState()
      const newVideoRecord = cardState.videoUrl
        ? {
            url: cardState.videoUrl,
            aspectRatio: cardState.videoAspectRatio ?? videoAspectRatio,
            createdAt: Date.now(),
          }
        : null

      // If the card was generated from an existing BRoll bank still
      // (videoSourceBRollId set), append the video to that record instead of
      // creating a new one — keeps the "this still and its animations" group
      // together in the bank.
      const sourceBRollId = cardState.videoSourceBRollId
      if (newVideoRecord && sourceBRollId) {
        const existing = bank.getBRollById(sourceBRollId)
        if (existing) {
          await bank.updateBRoll(sourceBRollId, {
            videos: [...(existing.videos ?? []), newVideoRecord],
          })
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
          return
        }
      }

      await bank.addBRoll({
        imageUrl: currentImage?.imageUrl ?? '',
        prompt: currentImage?.prompt ?? cardState.editablePrompt,
        productId: selectedProductId,
        modelId: selectedModelId,
        scriptId: selectedScriptId,
        videos: newVideoRecord ? [newVideoRecord] : undefined,
      } as Omit<BRoll, 'id' | 'createdAt'>)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSavingToBank(false)
    }
  }

  // Resolve an asset:// ref or http URL to a data URI so the kie service can
  // upload it as a reference / start frame. Returns null if the ref can't be
  // loaded (caller surfaces an error chip).
  const toDataUri = async (ref: string): Promise<string | null> => {
    if (!isAssetRef(ref)) return ref
    const asset = await getAsBase64(ref)
    if (!asset) return null
    return `data:${asset.mimeType};base64,${asset.base64}`
  }

  // Shared driver — starts the kie task, awaits completion, mints the
  // VideoHistoryItem. Used by both Animate Still and Generate Video.
  const runVideoTask = async (
    mode: VideoMode,
    firstFrameDataUri: string | undefined,
    referenceDataUris: string[] | undefined,
  ) => {
    if (!videoModelId) {
      onUpdateState({ videoStatus: 'error', videoError: 'No video model configured.' })
      return
    }
    const model = getModel(videoModelId)
    if (!model) {
      onUpdateState({ videoStatus: 'error', videoError: `Unknown video model: ${videoModelId}` })
      return
    }

    // If the picked video model doesn't support the chosen mode, fall back
    // to the closest supported one rather than failing the click outright.
    let effectiveMode = mode
    if (!model.modes?.includes(effectiveMode)) {
      const VIDEO_MODES: VideoMode[] = ['text-to-video', 'image-to-video', 'frames-to-video', 'reference-to-video']
      const fallback = model.modes?.find((m): m is VideoMode => (VIDEO_MODES as string[]).includes(m))
      if (!fallback) {
        onUpdateState({ videoStatus: 'error', videoError: 'Video model has no supported modes.' })
        return
      }
      // Fallback: reference-to-video → image-to-video uses first ref as start frame.
      if (effectiveMode === 'reference-to-video' && fallback === 'image-to-video' && referenceDataUris?.length) {
        firstFrameDataUri = referenceDataUris[0]
        referenceDataUris = undefined
      }
      effectiveMode = fallback
    }

    const promptText = cardState.editablePrompt
    onUpdateState({
      videoStatus: 'generating',
      videoError: null,
      videoTaskId: null,
      videoModelId: videoModelId,
      videoStartedAt: Date.now(),
      videoAspectRatio: videoAspectRatio,
      videoDurationSeconds: videoDurationSeconds,
      videoResolution: videoResolution,
      videoAudio: videoAudio,
      videoMode: effectiveMode,
      videoPrompt: promptText,
    })

    try {
      const { taskId, videoEndpoint } = await startVideoTask({
        prompt: promptText,
        mode: effectiveMode,
        firstFrameDataUri,
        referenceDataUris,
        aspectRatio: videoAspectRatio,
        durationSeconds: videoDurationSeconds,
        resolution: videoResolution,
        audio: videoAudio,
        modelId: videoModelId,
      })
      onUpdateState({ videoTaskId: taskId, videoEndpoint })

      const res = await finishVideoTask(
        taskId,
        videoModelId,
        videoEndpoint,
        videoDurationSeconds,
        videoAspectRatio,
      )

      const assetRef = `asset://${res.assetId}`
      onUpdateState({
        videoStatus: 'idle',
        videoError: null,
        videoUrl: assetRef,
        videoTaskId: null,
      })

      const historyEntry: VideoHistoryItem = {
        id: crypto.randomUUID(),
        modelId: videoModelId,
        prompt: promptText,
        mode: effectiveMode,
        aspectRatio: res.aspectRatio,
        durationSeconds: res.durationSeconds,
        resolution: videoResolution,
        audio: videoAudio,
        videoUrl: assetRef,
        sourceBRollId: cardState.videoSourceBRollId,
        createdAt: Date.now(),
      }
      await useBankStore.getState().addVideoHistory(historyEntry)
      useAppStore.getState().addToast('B-Roll video ready', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video generation failed.'
      onUpdateState({ videoStatus: 'error', videoError: msg })
      useAppStore.getState().addToast(`Video generation failed: ${msg}`, 'error')
    }
  }

  // Image-to-video: use the card's generated still as the start frame.
  // Disabled in the UI when no still exists.
  const handleAnimateStill = async () => {
    if (!currentImage) return
    const firstFrameDataUri = await toDataUri(currentImage.imageUrl)
    if (!firstFrameDataUri) {
      onUpdateState({ videoStatus: 'error', videoError: 'Could not load source image.' })
      return
    }
    await runVideoTask('image-to-video', firstFrameDataUri, undefined)
  }

  // Reference-to-video: pass character + product reference images (filtered
  // by the card's toggle pills) so the video model can free-render a clip
  // that resembles them. No start frame required — works even before the
  // card has a still.
  const handleGenerateVideo = async () => {
    const refs = buildCardRefs()
    const referenceDataUris: string[] = []
    for (const r of refs) {
      const uri = await toDataUri(r.dataUrl)
      if (uri) referenceDataUris.push(uri)
    }
    await runVideoTask(
      referenceDataUris.length > 0 ? 'reference-to-video' : 'text-to-video',
      undefined,
      referenceDataUris.length > 0 ? referenceDataUris : undefined,
    )
  }

  // Defensive escape hatch: if a video gen ends up stuck in 'generating' or
  // 'error', the user can clear the slot in one click. Mirrors the reset link
  // in the deleted video-studio app.
  const handleResetVideo = () => {
    onUpdateState({
      videoStatus: 'idle',
      videoError: null,
      videoTaskId: null,
      videoStartedAt: null,
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
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-tight text-zinc-400">
              Option {index + 1}
            </span>
            {showTagChip && (
              <span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${CHIP_STYLES[chipKindForTag(variation.tag)]}`}>
                {chipKindForTag(variation.tag)}
              </span>
            )}
          </div>
          {/* Descriptive shot label from the new system prompt's menu — sits
              under the tag chip so the user sees both the bucket and the
              actual shot intent. */}
          {variation.label && !/^option\s*\d/i.test(variation.label) && (
            <span className="text-[9px] uppercase tracking-wide text-zinc-500">{variation.label}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {!isEditingPrompt && (
            <button
              onClick={() => setIsEditingPrompt(true)}
              className="flex items-center rounded-md p-1 text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-300"
              title="Edit prompt"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          <CopyButton text={cardState.editablePrompt} />
          {onDelete && (
            <button
              onClick={onDelete}
              className="flex items-center rounded-md p-1 text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
              title="Delete option"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Prompt text — full transparency: this is exactly what gets sent to the model. */}
      <div className="px-3 pb-3">
        {isEditingPrompt ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              value={cardState.editablePrompt}
              onChange={(e) => onUpdateState({ editablePrompt: e.target.value })}
              rows={8}
              placeholder="Write your custom B-roll prompt here..."
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
          <p className="text-[11px] leading-relaxed text-zinc-400 whitespace-pre-wrap line-clamp-[9]">
            {cardState.editablePrompt || <span className="italic text-zinc-600">No prompt entered — click the pencil to write one.</span>}
          </p>
        )}
      </div>

      {/* Image area — 9:16 to match the target output framing. */}
      <div className="px-3 pb-3">
        {cardState.isGeneratingImage ? (
          <div className="flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4">
            {variation.label && (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-400">
                {styleChipLabel(variation.label)}
              </span>
            )}
            <GenerationProgress
              isActive
              color="bg-orange-500"
              messages={[
                'Sending request to image model...',
                'Composing the scene...',
                'Rendering details...',
                'Finalizing the frame...',
              ]}
              className="max-w-[220px]"
            />
          </div>
        ) : hasImages && currentImage ? (
          <div className="flex flex-col gap-2">
            {/* Image with carousel */}
            <div className="relative overflow-hidden rounded-lg border border-white/[0.06]">
              <img
                src={resolvedImageUrl}
                alt="Generated visual"
                className="aspect-[9/16] w-full object-cover bg-black/40"
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

            {/* Action row — order: Regenerate Image · Save to Bank ·
                Animate Still (pink, image-to-video) · Generate Video (purple,
                reference-to-video). Compact rounded-lg tile sizing to match
                pre-round-3 density. */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={handleGenerateImage}
                disabled={cardState.isGeneratingImage}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/[0.06] px-2 py-1.5 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate Image
              </button>
              <button
                onClick={handleSaveToBank}
                disabled={saved || savingToBank}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition-colors disabled:cursor-not-allowed ${saved
                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                {savingToBank ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                ) : saved ? (
                  <><Check className="h-3 w-3" /> Saved</>
                ) : (
                  <><FolderOpen className="h-3 w-3" /> Save to Bank</>
                )}
              </button>
              <button
                onClick={handleAnimateStill}
                disabled={cardState.videoStatus === 'generating'}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-pink-500/30 bg-pink-500/10 px-2 py-1.5 text-[10px] font-medium text-pink-300 transition-colors hover:bg-pink-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                title="Animate this still as a B-Roll video (image-to-video)"
              >
                {isAnimating ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Animating…</>
                ) : (
                  <><VideoIcon className="h-3 w-3" /> Animate Still</>
                )}
              </button>
              <button
                onClick={handleGenerateVideo}
                disabled={cardState.videoStatus === 'generating'}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-purple-500/20 bg-purple-500/10 px-2 py-1.5 text-[10px] font-medium text-purple-300 transition-colors hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                title="Generate a fresh B-Roll video from refs (reference-to-video)"
              >
                {isGeneratingVideo ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
                ) : (
                  <><VideoIcon className="h-3 w-3" /> Generate Video</>
                )}
              </button>
            </div>

            {/* Video gen states: in-progress shimmer / error / completed player. */}
            {cardState.videoStatus === 'generating' && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/[0.04] px-2.5 py-2">
                {variation.label && (
                  <span className="self-start rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-400">
                    {styleChipLabel(variation.label)}
                  </span>
                )}
                <GenerationProgress
                  isActive
                  color="bg-purple-500"
                  messages={[
                    'Sending to video model...',
                    'Animating the frame...',
                    'Rendering motion...',
                    'Finalizing the clip...',
                  ]}
                  className="max-w-full"
                />
              </div>
            )}
            {cardState.videoStatus === 'error' && cardState.videoError && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-2">
                <div className="flex items-start gap-1.5">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                  <p className="text-[10px] leading-relaxed text-red-300">{cardState.videoError}</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleResetVideo}
                    className="text-[9px] font-medium text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                  >
                    Reset slot
                  </button>
                  <button
                    onClick={handleGenerateVideo}
                    className="rounded-md border border-red-500/30 bg-red-500/15 px-2 py-1 text-[10px] font-medium text-red-200 transition-colors hover:bg-red-500/25"
                  >
                    <RefreshCw className="mr-1 inline h-3 w-3" />
                    Retry
                  </button>
                </div>
              </div>
            )}
            {resolvedVideoUrl && cardState.videoStatus === 'idle' && (
              <div className="relative overflow-hidden rounded-lg border border-white/[0.06]">
                <video
                  src={resolvedVideoUrl}
                  controls
                  className="aspect-[9/16] w-full object-cover bg-black/40"
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
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-orange-500/50 bg-orange-500/[0.05] py-3 text-[11px] font-medium text-orange-300 transition-colors hover:border-orange-500/70 hover:bg-orange-500/15 hover:text-orange-200"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Generate Image
            </button>
            <button
              onClick={handleGenerateVideo}
              disabled={cardState.videoStatus === 'generating'}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-purple-500/50 bg-purple-500/[0.05] py-3 text-[11px] font-medium text-purple-300 transition-colors hover:border-purple-500/70 hover:bg-purple-500/15 hover:text-purple-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingVideo ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating Video…</>
              ) : (
                <><VideoIcon className="h-3.5 w-3.5" /> Generate Video</>
              )}
            </button>
            {variation.tag === 'DIALOGUE' && (
              <p className="text-[10px] leading-relaxed text-zinc-600">
                Designed for video — &ldquo;Generate Video&rdquo; renders the character saying the line with audio.
              </p>
            )}
            {cardState.imageError && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-2">
                <div className="flex items-start gap-1.5">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                  <p className="text-[10px] leading-relaxed text-red-300">{cardState.imageError}</p>
                </div>
                <button
                  onClick={handleGenerateImage}
                  className="self-end rounded-md border border-red-500/30 bg-red-500/15 px-2 py-1 text-[10px] font-medium text-red-200 transition-colors hover:bg-red-500/25"
                >
                  <RefreshCw className="mr-1 inline h-3 w-3" />
                  {cardState.pendingTaskId ? 'Resume' : 'Retry'}
                </button>
              </div>
            )}
            {cardState.videoStatus === 'generating' && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/[0.04] px-2.5 py-2">
                {variation.label && (
                  <span className="self-start rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-400">
                    {styleChipLabel(variation.label)}
                  </span>
                )}
                <GenerationProgress
                  isActive
                  color="bg-purple-500"
                  messages={[
                    'Sending to video model...',
                    'Animating from prompt...',
                    'Rendering motion...',
                    'Finalizing the clip...',
                  ]}
                  className="max-w-full"
                />
              </div>
            )}
            {cardState.videoStatus === 'error' && cardState.videoError && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-2">
                <div className="flex items-start gap-1.5">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                  <p className="text-[10px] leading-relaxed text-red-300">{cardState.videoError}</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleResetVideo}
                    className="text-[9px] font-medium text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                  >
                    Reset slot
                  </button>
                  <button
                    onClick={handleGenerateVideo}
                    className="rounded-md border border-red-500/30 bg-red-500/15 px-2 py-1 text-[10px] font-medium text-red-200 transition-colors hover:bg-red-500/25"
                  >
                    <RefreshCw className="mr-1 inline h-3 w-3" />
                    Retry
                  </button>
                </div>
              </div>
            )}
            {resolvedVideoUrl && cardState.videoStatus === 'idle' && (
              <div className="relative overflow-hidden rounded-lg border border-white/[0.06]">
                <video
                  src={resolvedVideoUrl}
                  controls
                  className="aspect-[9/16] w-full object-cover bg-black/40"
                />
                <div className="absolute right-1 top-1">
                  <DownloadButton url={cardState.videoUrl!} filename={`broll-video-${variation.id}.mp4`} />
                </div>
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
      tag: 'ACTION',
      refs: 'both',
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
  onDeleteVariation,
  characterRef,
  productRef,
  selectedProductId,
  selectedModelId,
  selectedScriptId,
  imageAspectRatio,
  imageResolution,
  videoModelId,
  videoAspectRatio,
  videoDurationSeconds,
  videoResolution,
  videoAudio,
}: {
  scene: Scene
  cardStates: Record<string, CardState>
  onUpdateCardState: (key: string, updates: Partial<CardState>) => void
  onAddVariation: (sceneNumber: number, variation: PromptVariation) => void
  onDeleteVariation: (sceneNumber: number, variationId: string) => void
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
  imageAspectRatio: string
  imageResolution: ImageResolution
  videoModelId?: string
  videoAspectRatio: string
  videoDurationSeconds: number
  videoResolution: string
  videoAudio: boolean
}) {
  return (
    <div style={{ contentVisibility: 'auto', containIntrinsicSize: '700px' }}>
      {/* Scene header */}
      <div className="mb-4 flex items-center gap-4">
        <span
          className="text-4xl font-bold tabular-nums text-zinc-800"
          style={{ fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif" }}
        >
          {String(scene.number).padStart(2, '0')}
        </span>
        <div className="h-8 w-px bg-white/10" />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex w-fit rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Line {scene.number}
            </span>
            {/* Estimated spoken duration so the user can match video duration
                before generating. Conversational UGC pace ≈ 150 wpm = 2.5 wps. */}
            <span
              className="inline-flex w-fit items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-purple-300/80"
              title="Estimated spoken duration. Match your video duration before clicking Generate Video."
            >
              <VideoIcon className="h-2.5 w-2.5" />
              ~{estimateSpokenSeconds(scene.scriptLine)}s spoken
            </span>
          </div>
          <p
            className="text-base italic leading-relaxed text-zinc-400"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            &ldquo;{scene.scriptLine}&rdquo;
          </p>
        </div>
      </div>

      {/* Cards grid — fits 4 variations on wide screens, wraps gracefully on smaller ones. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {scene.variations.map((variation, i) => {
          const key = `${scene.number}-${i}`
          const state = cardStates[key] ?? createDefaultCardState(variation)
          const isManual = variation.id.startsWith('manual-') || variation.label === 'Manual Option'
          return (
            <VariationCard
              key={variation.id}
              variation={variation}
              index={i}
              cardState={state}
              onUpdateState={(updates) => onUpdateCardState(key, updates)}
              onDelete={isManual ? () => onDeleteVariation(scene.number, variation.id) : undefined}
              characterRef={characterRef}
              productRef={productRef}
              selectedProductId={selectedProductId}
              selectedModelId={selectedModelId}
              selectedScriptId={selectedScriptId}
              imageAspectRatio={imageAspectRatio}
              imageResolution={imageResolution}
              videoModelId={videoModelId}
              videoAspectRatio={videoAspectRatio}
              videoDurationSeconds={videoDurationSeconds}
              videoResolution={videoResolution}
              videoAudio={videoAudio}
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

// Build the initial CardState for a freshly-mounted variation. The refs
// toggle defaults come from the variation's LLM-emitted REFS hint, which
// reflects the prompt's actual content (PRODUCT variation → product only,
// DIALOGUE → character, hook reframe with VISIBILITY=no → character only).
function createDefaultCardState(variation: PromptVariation): CardState {
  const { refsCharacter, refsProduct } = refsToToggles(variation.refs ?? 'both')
  return {
    editablePrompt: variation.prompt,
    images: [],
    currentImageIndex: 0,
    isGeneratingImage: false,
    imageError: null,
    pendingTaskId: null,
    pendingModelId: null,
    pendingStartedAt: null,
    refsCharacter,
    refsProduct,
    videoStatus: 'idle',
    videoUrl: null,
    videoError: null,
    videoTaskId: null,
    videoModelId: null,
    videoEndpoint: undefined,
    videoStartedAt: null,
    videoSourceBRollId: undefined,
    videoAspectRatio: null,
    videoDurationSeconds: null,
    videoResolution: null,
    videoAudio: null,
    videoMode: null,
    videoPrompt: null,
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
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
export default function OutputPanel({ result, isGenerating, error, onAddVariation, onDeleteVariation, characterRef, productRef, selectedProductId, selectedModelId, selectedScriptId }: OutputPanelProps) {
  const baseKey = useProjectScopedKey('broll-studio')
  const [cardStates, setCardStates] = usePersistedState<Record<string, CardState>>(
    `${baseKey}:cardStates`,
    {},
    {
      // Transient flags reset on hydrate so a refresh mid-generation doesn't
      // leave a stuck spinner — *except* when a `pendingTaskId` (image) or a
      // `videoTaskId` (video) is persisted, in which case the mount-time resume
      // effect picks up polling and the spinner should stay visible across the
      // gap. Tasks older than 30 min are dropped: kie outputs persist for 3
      // days but polling something that old is almost always dead, and we
      // surface a friendly chip instead.
      sanitize: (raw) => {
        const next: Record<string, CardState> = {}
        const STALE_MS = 30 * 60_000
        for (const k in raw) {
          const card = raw[k]
          const imageStale = card.pendingStartedAt && Date.now() - card.pendingStartedAt > STALE_MS
          const videoStale = card.videoStartedAt && Date.now() - card.videoStartedAt > STALE_MS
          let patched: CardState = { ...card }
          if (imageStale) {
            patched = {
              ...patched,
              isGeneratingImage: false,
              pendingTaskId: null,
              pendingModelId: null,
              pendingStartedAt: null,
              imageError: 'Generation expired. Click Retry to regenerate.',
            }
          } else {
            patched.isGeneratingImage = !!card.pendingTaskId
          }
          if (videoStale) {
            patched = {
              ...patched,
              videoStatus: 'error',
              videoTaskId: null,
              videoStartedAt: null,
              videoError: 'Video generation expired (>30 min). Reset or retry.',
            }
          } else if (card.videoTaskId) {
            patched.videoStatus = 'generating'
          } else if (card.videoStatus === 'generating') {
            // Was generating but never got a taskId (died inside startVideoTask).
            // Unstick the card so the user can retry.
            patched.videoStatus = 'idle'
            patched.videoStartedAt = null
          }
          next[k] = patched
        }
        return next
      },
    },
  )

  // Image params — top-of-tab dropdowns.
  const [imageAspectRatio, setImageAspectRatio] = usePersistedState<string>(`${baseKey}:imageAspect`, '9:16')
  // B-Roll opens at 1K — high-res is opt-in. The user can pick 2K / 4K
  // from the resolution dropdown when they want it.
  const [imageResolution, setImageResolution] = usePersistedState<ImageResolution>(`${baseKey}:imageResolution`, '1K')

  // Video params — top-of-tab dropdowns.
  const [videoAspectRatio, setVideoAspectRatio] = usePersistedState<string>(`${baseKey}:videoAspect`, '9:16')
  const [videoDurationSeconds, setVideoDurationSeconds] = usePersistedState<number>(`${baseKey}:videoDuration`, 5)
  const [videoResolution, setVideoResolution] = usePersistedState<string>(`${baseKey}:videoResolution`, '720p')
  const [videoAudio, setVideoAudio] = usePersistedState<boolean>(`${baseKey}:videoAudio`, true)

  const persistedImageModel = useSettingsStore((s) => s.getAppModel('broll-studio:image:text-to-image'))
  const imageModelId = persistedImageModel ?? getDefaultModel('broll-studio', 'image', 'text-to-image')?.id

  const persistedVideoModel = useSettingsStore((s) => s.getAppModel('broll-studio:video'))
  const videoModelId = persistedVideoModel ?? getDefaultModel('broll-studio', 'video')?.id
    ?? getDefaultModel('playground', 'video')?.id
  const videoModel = videoModelId ? getModel(videoModelId) : undefined

  // Re-clamp image controls when the picked model can't honour the current values.
  useEffect(() => {
    if (!imageModelId) return
    const m = getModel(imageModelId)
    const tiers = m?.imageConstraints?.resolutions as ImageResolution[] | undefined
    if (tiers && tiers.length > 0 && !tiers.includes(imageResolution)) {
      setImageResolution(tiers[0])
    }
    const aspects = m?.imageConstraints?.aspectRatios
    if (aspects && aspects.length > 0 && !aspects.includes(imageAspectRatio)) {
      setImageAspectRatio(aspects[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageModelId])

  // Re-clamp video controls similarly when the user switches video models.
  // Audio toggle: if the new model supports it, default to ON regardless of
  // previous state. If it doesn't, force OFF. The user explicitly wants every
  // audio-capable model to start with sound enabled.
  useEffect(() => {
    const c = videoModel?.videoConstraints
    if (!c) return
    if (!c.aspectRatios.includes(videoAspectRatio)) setVideoAspectRatio(c.aspectRatios[0])
    if (c.durations.length > 0 && !c.durations.includes(videoDurationSeconds)) setVideoDurationSeconds(c.durations[0])
    if (!c.resolutions.includes(videoResolution)) setVideoResolution(c.default ?? c.resolutions[0] ?? '720p')
    setVideoAudio(c.supportsAudio === true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoModelId])

  const handleUpdateCardState = useCallback((key: string, updates: Partial<CardState>) => {
    setCardStates((prev) => {
      const existing = prev[key]
      if (!existing) {
        // Build a minimal placeholder (no refs hint available here — the
        // result effect below will overwrite when the matching variation
        // mounts). 'both' is the safe default.
        const placeholder: PromptVariation = { id: key, tag: 'ACTION', label: '', refs: 'both', prompt: '' }
        return { ...prev, [key]: { ...createDefaultCardState(placeholder), ...updates } }
      }
      return { ...prev, [key]: { ...existing, ...updates } }
    })
  }, [])

  // Rebuild card states from the current result. Carries forward existing
  // state ONLY when the variation's prompt is unchanged (same generation, just
  // a re-render). On a fresh Generate click the LLM produces new prompts → the
  // record is rebuilt cleanly, dropping any stale empty slots left over from a
  // previous, longer script. Fixes the "Option 2: No prompt entered" bug.
  useEffect(() => {
    if (!result) return
    setCardStates((prev) => {
      const next: Record<string, CardState> = {}
      for (const scene of result.scenes) {
        for (let i = 0; i < scene.variations.length; i++) {
          const key = `${scene.number}-${i}`
          const v = scene.variations[i]
          const existing = prev[key]
          next[key] = existing && existing.editablePrompt === v.prompt
            ? existing
            : createDefaultCardState(v)
        }
      }
      return next
    })
  }, [result])

  // Refresh-resume: on mount, walk all cards and resume any in-flight kie task
  // whose taskId survived the page refresh via usePersistedState. Guarded by a
  // ref-set so React 18 strict-mode double-invoke and rapid project switches
  // don't double-poll. Handles both image and video tasks.
  const resumingRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const [key, card] of Object.entries(cardStates)) {
      // ── Image resume ────────────────────────────────────────────────────
      if (card.pendingTaskId && card.pendingModelId && card.images.length === 0) {
        if (!resumingRef.current.has(card.pendingTaskId)) {
          resumingRef.current.add(card.pendingTaskId)
          const taskId = card.pendingTaskId
          const modelId = card.pendingModelId
          const prompt = card.editablePrompt
          ;(async () => {
            try {
              const imageUrl = await finishImageTask(taskId, modelId)
              const newImage: GeneratedImage = { imageUrl, prompt }
              setCardStates((prev) => {
                const existing = prev[key]
                if (!existing) return prev
                const newImages = [...existing.images, newImage]
                return {
                  ...prev,
                  [key]: {
                    ...existing,
                    isGeneratingImage: false,
                    imageError: null,
                    pendingTaskId: null,
                    pendingModelId: null,
                    pendingStartedAt: null,
                    images: newImages,
                    currentImageIndex: newImages.length - 1,
                  },
                }
              })
            } catch (err) {
              setCardStates((prev) => {
                const existing = prev[key]
                if (!existing) return prev
                return {
                  ...prev,
                  [key]: {
                    ...existing,
                    isGeneratingImage: false,
                    imageError: err instanceof Error ? err.message : 'Image generation failed. Try again.',
                  },
                }
              })
            } finally {
              resumingRef.current.delete(taskId)
            }
          })()
        }
      }

      // ── Video resume ────────────────────────────────────────────────────
      if (
        card.videoTaskId &&
        card.videoModelId &&
        card.videoStatus === 'generating' &&
        !card.videoUrl
      ) {
        const resumeKey = `video:${card.videoTaskId}`
        if (!resumingRef.current.has(resumeKey)) {
          resumingRef.current.add(resumeKey)
          const taskId = card.videoTaskId
          const modelId = card.videoModelId
          const endpoint = card.videoEndpoint
          const duration = card.videoDurationSeconds ?? 5
          const aspect = card.videoAspectRatio ?? '9:16'
          const resolution = card.videoResolution ?? '720p'
          const audio = card.videoAudio ?? true
          const promptText = card.videoPrompt ?? card.editablePrompt
          const mode = card.videoMode ?? 'text-to-video'
          const sourceBRollId = card.videoSourceBRollId
          ;(async () => {
            try {
              const res = await finishVideoTask(taskId, modelId, endpoint, duration, aspect)
              const assetRef = `asset://${res.assetId}`
              setCardStates((prev) => {
                const existing = prev[key]
                if (!existing) return prev
                return {
                  ...prev,
                  [key]: {
                    ...existing,
                    videoStatus: 'idle',
                    videoError: null,
                    videoUrl: assetRef,
                    videoTaskId: null,
                  },
                }
              })
              const historyEntry: VideoHistoryItem = {
                id: crypto.randomUUID(),
                modelId,
                prompt: promptText,
                mode,
                aspectRatio: res.aspectRatio,
                durationSeconds: res.durationSeconds,
                resolution,
                audio,
                videoUrl: assetRef,
                sourceBRollId,
                createdAt: Date.now(),
              }
              await useBankStore.getState().addVideoHistory(historyEntry)
              useAppStore.getState().addToast('B-Roll video ready', 'success')
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Video resume failed.'
              setCardStates((prev) => {
                const existing = prev[key]
                if (!existing) return prev
                return {
                  ...prev,
                  [key]: {
                    ...existing,
                    videoStatus: 'error',
                    videoError: msg,
                    videoTaskId: null,
                  },
                }
              })
              useAppStore.getState().addToast(`Video resume failed: ${msg}`, 'error')
            } finally {
              resumingRef.current.delete(resumeKey)
            }
          })()
        }
      }
    }
    // Only on mount — fresh-task polling is owned by handleGenerateImage /
    // handleGenerateVideo in the card itself, so this effect must not re-trigger
    // when cardStates changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isGenerating) {
    return (
      <div className="flex h-full flex-col overflow-hidden p-5">
        <GenerationProgress
          isActive
          color="bg-orange-500"
          messages={['Analyzing script scenes...', 'Sending request...', 'Generating B-Roll prompts...', 'Finalizing scene breakdowns...']}
          className="mb-6"
          showHelper={false}
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

  const videoConstraints = videoModel?.videoConstraints
  const imageConstraints = imageModelId ? getModel(imageModelId)?.imageConstraints : undefined

  return (
    <div className="flex h-full flex-col overflow-hidden p-5">
      {/* Scene count header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">
          {result.scenes.length} SCENES
        </h3>
        <span className="text-[10px] text-zinc-600">
          {totalVariations} prompt variations
        </span>
      </div>

      {/* Master output-settings toolbar — image and video pickers live side by side. */}
      <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Image settings — model picker on top, constraint chips below. */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            <ImageIcon className="h-3 w-3 text-orange-400/70" />
            Image settings
          </div>
          <div className="flex flex-col gap-2">
            <ModelPicker
              appId="broll-studio"
              task="image"
              mode="text-to-image"
              costParams={{ imageCount: 1, resolution: imageResolution }}
            />
            <div className="flex flex-wrap items-center gap-2">
              {imageConstraints?.aspectRatios && imageConstraints.aspectRatios.length > 0 && (
                <ConstraintChip
                  openDirection="down"
                  options={imageConstraints.aspectRatios}
                  value={imageAspectRatio}
                  onChange={setImageAspectRatio}
                  render={(v) => (
                    <span className="flex items-center gap-1.5">
                      <AspectIcon ratio={v} />
                      <span>{v}</span>
                    </span>
                  )}
                />
              )}
              {imageConstraints?.resolutions && imageConstraints.resolutions.length > 0 && (
                <ConstraintChip
                  openDirection="down"
                  options={imageConstraints.resolutions as string[]}
                  value={imageResolution}
                  onChange={(v) => setImageResolution(v as ImageResolution)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Video settings — model picker on top, constraint chips below. */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            <VideoIcon className="h-3 w-3 text-purple-400/70" />
            Video settings
          </div>
          <div className="flex flex-col gap-2">
            <ModelPicker
              appId="broll-studio"
              task="video"
              costParams={{
                durationSeconds: videoDurationSeconds,
                resolution: videoResolution,
                audio: videoAudio,
              }}
            />
            {videoConstraints && (
              <div className="flex flex-wrap items-center gap-2">
                <ConstraintChip
                  openDirection="down"
                  options={videoConstraints.aspectRatios}
                  value={videoAspectRatio}
                  onChange={setVideoAspectRatio}
                  render={(v) => (
                    <span className="flex items-center gap-1.5">
                      <AspectIcon ratio={v} />
                      <span>{v}</span>
                    </span>
                  )}
                />
                {videoConstraints.durations.length > 0 && (
                  <ConstraintChip
                    openDirection="down"
                    options={videoConstraints.durations.map(String)}
                    value={String(videoDurationSeconds)}
                    onChange={(v) => setVideoDurationSeconds(Number(v))}
                    render={(v) => <span>{v}s</span>}
                  />
                )}
                <ConstraintChip
                  openDirection="down"
                  options={videoConstraints.resolutions}
                  value={videoResolution}
                  onChange={setVideoResolution}
                />
                {videoConstraints.supportsAudio && (
                  <button
                    type="button"
                    onClick={() => setVideoAudio(!videoAudio)}
                    className={`flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] transition-colors ${
                      videoAudio
                        ? 'border-green-500/30 bg-green-500/10 text-green-200'
                        : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]'
                    }`}
                  >
                    {videoAudio ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                    <span>{videoAudio ? 'Audio' : 'Mute'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
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
              onDeleteVariation={onDeleteVariation}
              characterRef={characterRef}
              productRef={productRef}
              selectedProductId={selectedProductId}
              selectedModelId={selectedModelId}
              selectedScriptId={selectedScriptId}
              imageAspectRatio={imageAspectRatio}
              imageResolution={imageResolution}
              videoModelId={videoModelId}
              videoAspectRatio={videoAspectRatio}
              videoDurationSeconds={videoDurationSeconds}
              videoResolution={videoResolution}
              videoAudio={videoAudio}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
