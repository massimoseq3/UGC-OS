import { useState } from 'react'
import {
  ImageIcon,
  Loader2,
  AlertCircle,
  Play,
  Trash2,
} from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'
import type { PromptVariation, CardState, GeneratedImage, ReferenceImage } from '../types'
import type { VideoHistoryItem, Product, Model } from '../../../stores/types'
import { enhanceVariationPrompt, generateNewVariation, startImageTask, finishImageTask } from '../services/generateBroll'
import { startVideoTask, finishVideoTask } from '../services/generateVideo'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getAsBase64, isAssetRef } from '../../../utils/assetStore'
import { getModel, type VideoMode } from '../../../utils/models'
import CardDetailModal from './CardDetailModal'

// Tag-driven chip wording + palette. Top-left chip shows what the variation
// IS (Dialogue / Action / Emotional / Product shot); roll type (A-Roll /
// B-Roll) moves to the small bottom text so the face stays scannable.
const TAG_LABELS: Record<PromptVariation['tag'], string> = {
  DIALOGUE: 'Dialogue',
  ACTION: 'Action',
  EMOTIONAL: 'Emotional',
  PRODUCT: 'Product shot',
}
const TAG_CHIP_STYLES: Record<PromptVariation['tag'], string> = {
  DIALOGUE: 'bg-cyan-500/25 text-cyan-100 border-cyan-400/40',
  ACTION: 'bg-lime-500/25 text-lime-100 border-lime-400/40',
  EMOTIONAL: 'bg-pink-500/25 text-pink-100 border-pink-400/40',
  PRODUCT: 'bg-amber-500/25 text-amber-100 border-amber-400/40',
}
export function rollTypeForTag(tag: PromptVariation['tag']): 'A-Roll' | 'B-Roll' {
  return tag === 'DIALOGUE' ? 'A-Roll' : 'B-Roll'
}
export function tagLabel(tag: PromptVariation['tag']): string {
  return TAG_LABELS[tag]
}
export function tagChipStyle(tag: PromptVariation['tag']): string {
  return TAG_CHIP_STYLES[tag]
}

interface VariationCardProps {
  sceneNumber: number
  scriptLine: string
  variation: PromptVariation
  cardState: CardState
  onUpdateState: (updates: Partial<CardState>) => void
  // Functional setter — handed the latest cardState, returns a partial.
  // Used for atomic array updates so parallel Generate clicks don't clobber
  // each other's `inFlightImages` / `inFlightVideos` entries.
  onUpdateStateFn: (updater: (prev: CardState) => Partial<CardState>) => void
  onDelete: () => void
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  selectedProduct?: Product | null
  selectedModel?: Model | null
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
  productContext?: string
  modelContext?: string
  onOpenCharacterPicker?: () => void
  onOpenProductPicker?: () => void
}

export default function VariationCard(props: VariationCardProps) {
  const {
    sceneNumber,
    scriptLine,
    variation,
    cardState,
    onUpdateState,
    onUpdateStateFn,
    onDelete,
    characterRef,
    productRef,
    selectedProduct,
    selectedModel,
    selectedProductId,
    selectedModelId,
    selectedScriptId,
    productContext,
    modelContext,
    onOpenCharacterPicker,
    onOpenProductPicker,
  } = props

  const hasImages = cardState.images.length > 0
  const hasVideos = cardState.videos.length > 0
  // Resolve the cover output for the scene card face. If `selected` points
  // at a valid generation, that wins; otherwise fall back to the most-recent
  // image, then video, then nothing.
  const coverKind: 'image' | 'video' | null = (() => {
    const sel = cardState.selected
    if (sel?.kind === 'image' && cardState.images[sel.index]) return 'image'
    if (sel?.kind === 'video' && cardState.videos[sel.index]) return 'video'
    if (hasImages) return 'image'
    if (hasVideos) return 'video'
    return null
  })()
  const coverImage = coverKind === 'image'
    ? cardState.images[cardState.selected?.kind === 'image' ? cardState.selected.index : cardState.currentImageIndex]
    : null
  const coverVideo = coverKind === 'video'
    ? cardState.videos[cardState.selected?.kind === 'video' ? cardState.selected.index : cardState.currentVideoIndex]
    : null
  const resolvedImageUrl = useAssetUrl(coverImage?.imageUrl)
  const resolvedVideoUrl = useAssetUrl(coverVideo?.url)
  const [detailOpen, setDetailOpen] = useState(false)
  // Two-click confirm for the card-face trash icon. First click flips this
  // flag (icon styling switches to red); second click within ~3s actually
  // calls onDelete. Matches the old modal-footer Delete behaviour.
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Drive the in-flight indicator off the parallel-queue array — the legacy
  // single-slot `videoStatus` field is no longer written by runVideoTask so
  // it stayed permanently 'idle', making the card face look idle even mid-gen.
  const isGeneratingVideo = cardState.inFlightVideos.length > 0
  const generatingVideoMode = cardState.inFlightVideos[0]?.mode
  const isAnimating = isGeneratingVideo && generatingVideoMode === 'image-to-video'

  // ────────────────────────────────────────────────────────────────────────
  // Action handlers — owned here so both the modal (rendered as a child)
  // and any future face-level quick action use the same code path. The
  // current iteration only renders these actions inside the modal.
  // ────────────────────────────────────────────────────────────────────────

  // Attach script-level refs respecting the per-card on/off toggles
  // (cardState.refsCharacter / refsProduct), which the user controls via
  // the tick-circle button in each ReferenceSlotCard.
  const buildCardRefs = (): ReferenceImage[] => {
    const out: ReferenceImage[] = []
    if (characterRef && cardState.refsCharacter !== false) out.push(characterRef)
    if (productRef && cardState.refsProduct !== false) out.push(productRef)
    return out
  }

  // Push a new entry onto the prompt undo/redo stack, trimming any forward
  // redo branch. Caller pre-pads CardState.editablePrompt with the new value.
  const pushPromptHistory = (newPrompt: string) => {
    const truncated = cardState.promptHistory.slice(0, cardState.promptHistoryIndex + 1)
    const nextHistory = [...truncated, newPrompt]
    onUpdateState({
      editablePrompt: newPrompt,
      promptHistory: nextHistory,
      promptHistoryIndex: nextHistory.length - 1,
    })
  }

  const handleUndo = () => {
    if (cardState.promptHistoryIndex <= 0) return
    const nextIndex = cardState.promptHistoryIndex - 1
    onUpdateState({
      editablePrompt: cardState.promptHistory[nextIndex],
      promptHistoryIndex: nextIndex,
    })
  }
  const handleRedo = () => {
    if (cardState.promptHistoryIndex >= cardState.promptHistory.length - 1) return
    const nextIndex = cardState.promptHistoryIndex + 1
    onUpdateState({
      editablePrompt: cardState.promptHistory[nextIndex],
      promptHistoryIndex: nextIndex,
    })
  }

  // Commit the current textarea draft into history (used when the user
  // clicks Done after typing into the prompt textarea). Skips if the value
  // hasn't changed from the most recent history entry.
  const handleCommitDraft = (draft: string) => {
    const last = cardState.promptHistory[cardState.promptHistoryIndex]
    if (draft === last) {
      onUpdateState({ editablePrompt: draft })
      return
    }
    pushPromptHistory(draft)
  }

  const handleEnhance = async () => {
    if (cardState.isPromptWorking) return
    onUpdateState({ isPromptWorking: true, promptError: null })
    try {
      const rewritten = await enhanceVariationPrompt(
        cardState.editablePrompt,
        { number: sceneNumber, scriptLine },
        { tag: variation.tag, label: variation.label ?? '' },
        productContext,
        modelContext,
      )
      pushPromptHistory(rewritten)
      onUpdateState({ isPromptWorking: false, promptError: null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enhance failed.'
      onUpdateState({ isPromptWorking: false, promptError: msg })
      useAppStore.getState().addToast(`Enhance failed: ${msg}`, 'error')
    }
  }

  const handleRegeneratePrompt = async () => {
    if (cardState.isPromptWorking) return
    onUpdateState({ isPromptWorking: true, promptError: null })
    try {
      const fresh = await generateNewVariation(
        sceneNumber,
        scriptLine,
        scriptLine,
        variation.tag,
        productContext,
        modelContext,
      )
      pushPromptHistory(fresh.prompt)
      onUpdateState({ isPromptWorking: false, promptError: null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Regenerate failed.'
      onUpdateState({ isPromptWorking: false, promptError: msg })
      useAppStore.getState().addToast(`Regenerate failed: ${msg}`, 'error')
    }
  }

  // Non-blocking parallel image generation. Each click pushes a new entry
  // onto `inFlightImages`; the button never disables. Completion removes
  // the entry and appends to `images`.
  const handleGenerateImage = async () => {
    const inFlightId = crypto.randomUUID()
    const promptText = cardState.editablePrompt
    const imageAspectRatio = cardState.cardImageAspectRatio
    const imageResolution = cardState.cardImageResolution

    // Push the in-flight entry immediately so the gallery shows the tile.
    onUpdateStateFn((prev) => ({
      inFlightImages: [
        ...prev.inFlightImages,
        {
          id: inFlightId,
          taskId: null,
          modelId: null,
          startedAt: Date.now(),
          prompt: promptText,
          aspectRatio: imageAspectRatio,
          resolution: imageResolution,
        },
      ],
    }))

    let taskId: string
    let modelId: string
    try {
      const started = await startImageTask(promptText, buildCardRefs(), imageAspectRatio, imageResolution)
      taskId = started.taskId
      modelId = started.modelId
      onUpdateStateFn((prev) => ({
        inFlightImages: prev.inFlightImages.map((e) =>
          e.id === inFlightId ? { ...e, taskId, modelId } : e,
        ),
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image generation failed. Try again.'
      onUpdateStateFn((prev) => ({
        inFlightImages: prev.inFlightImages.map((e) =>
          e.id === inFlightId ? { ...e, error: msg } : e,
        ),
      }))
      useAppStore.getState().addToast(`Image generation failed: ${msg}`, 'error')
      return
    }

    try {
      const imageUrl = await finishImageTask(taskId, modelId)
      const newImage: GeneratedImage = { imageUrl, prompt: promptText, createdAt: Date.now() }
      onUpdateStateFn((prev) => {
        const newImages = [...prev.images, newImage]
        return {
          images: newImages,
          currentImageIndex: newImages.length - 1,
          selected: { kind: 'image', index: newImages.length - 1 },
          inFlightImages: prev.inFlightImages.filter((e) => e.id !== inFlightId),
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image generation failed. Try again.'
      onUpdateStateFn((prev) => ({
        inFlightImages: prev.inFlightImages.map((e) =>
          e.id === inFlightId ? { ...e, error: msg } : e,
        ),
      }))
      useAppStore.getState().addToast(`Image generation failed: ${msg}`, 'error')
    }
  }

  // Save lives per-tile inside the modal's gallery now — the card itself
  // no longer needs a bundle-save handler.

  const toDataUri = async (ref: string): Promise<string | null> => {
    if (!isAssetRef(ref)) return ref
    const asset = await getAsBase64(ref)
    if (!asset) return null
    return `data:${asset.mimeType};base64,${asset.base64}`
  }

  // Non-blocking parallel video generation. Same shape as image gen — push
  // to `inFlightVideos`, fire-and-forget, completion appends to `videos`.
  const runVideoTask = async (
    mode: VideoMode,
    firstFrameDataUri: string | undefined,
    referenceDataUris: string[] | undefined,
    videoModelId: string | undefined,
  ) => {
    if (!videoModelId) {
      useAppStore.getState().addToast('No video model configured.', 'error')
      return
    }
    const model = getModel(videoModelId)
    if (!model) {
      useAppStore.getState().addToast(`Unknown video model: ${videoModelId}`, 'error')
      return
    }

    let effectiveMode = mode
    if (!model.modes?.includes(effectiveMode)) {
      // The model can't honour the requested mode. We deliberately do NOT
      // promote the reference image into a first-frame seed (that hijack
      // produced distorted clips) and we don't silently swap models. When the
      // chosen model can't take refs as refs, drop them and run text-to-video
      // — the picker greys these models out and the Reference Images note
      // tells the user this will be text-to-video only.
      // model.modes is the broader Mode union (also includes image modes);
      // narrow to VideoMode before consuming.
      const VIDEO_MODES: VideoMode[] = ['text-to-video', 'image-to-video', 'frames-to-video', 'reference-to-video']
      const videoModes = (model.modes ?? []).filter((m): m is VideoMode =>
        (VIDEO_MODES as string[]).includes(m),
      )
      const fallback: VideoMode | undefined = videoModes.includes('text-to-video')
        ? 'text-to-video'
        : videoModes[0]
      if (!fallback) {
        useAppStore.getState().addToast('Video model has no supported modes.', 'error')
        return
      }
      if (effectiveMode === 'reference-to-video' && referenceDataUris?.length) {
        useAppStore.getState().addToast(
          `${model.displayName} doesn't support reference images — generating text-to-video only.`,
          'error',
        )
      }
      referenceDataUris = undefined
      firstFrameDataUri = undefined
      effectiveMode = fallback
    }

    const inFlightId = crypto.randomUUID()
    const promptText = cardState.editablePrompt
    const videoAspectRatio = cardState.cardVideoAspectRatio
    const videoDurationSeconds = cardState.cardVideoDurationSeconds
    const videoResolution = cardState.cardVideoResolution
    const videoAudio = cardState.cardVideoAudio
    const sourceBRollId = cardState.videoSourceBRollId

    onUpdateStateFn((prev) => ({
      inFlightVideos: [
        ...prev.inFlightVideos,
        {
          id: inFlightId,
          taskId: null,
          modelId: videoModelId,
          startedAt: Date.now(),
          prompt: promptText,
          mode: effectiveMode,
          aspectRatio: videoAspectRatio,
          durationSeconds: videoDurationSeconds,
          resolution: videoResolution,
          audio: videoAudio,
          sourceBRollId,
        },
      ],
    }))

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
      onUpdateStateFn((prev) => ({
        inFlightVideos: prev.inFlightVideos.map((e) =>
          e.id === inFlightId ? { ...e, taskId, endpoint: videoEndpoint } : e,
        ),
      }))

      const res = await finishVideoTask(
        taskId,
        videoModelId,
        videoEndpoint,
        videoDurationSeconds,
        videoAspectRatio,
      )

      const assetRef = `asset://${res.assetId}`
      const newVideo = {
        url: assetRef,
        modelId: videoModelId,
        prompt: promptText,
        aspectRatio: res.aspectRatio,
        durationSeconds: res.durationSeconds,
        resolution: videoResolution,
        audio: videoAudio,
        mode: effectiveMode,
        sourceBRollId,
        createdAt: Date.now(),
      }
      onUpdateStateFn((prev) => {
        const newVideos = [...prev.videos, newVideo]
        return {
          videos: newVideos,
          currentVideoIndex: newVideos.length - 1,
          selected: { kind: 'video', index: newVideos.length - 1 },
          inFlightVideos: prev.inFlightVideos.filter((e) => e.id !== inFlightId),
        }
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
        sourceBRollId,
        sourceApp: 'broll-studio',
        createdAt: Date.now(),
      }
      await useBankStore.getState().addVideoHistory(historyEntry)
      useAppStore.getState().addToast('B-Roll video ready', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video generation failed.'
      onUpdateStateFn((prev) => ({
        inFlightVideos: prev.inFlightVideos.map((e) =>
          e.id === inFlightId ? { ...e, error: msg } : e,
        ),
      }))
      useAppStore.getState().addToast(`Video generation failed: ${msg}`, 'error')
    }
  }

  // Animate-still was removed from the modal — Playground covers that flow.
  // The runVideoTask 'image-to-video' branch stays in case it's needed later.

  const handleGenerateVideo = async (videoModelId: string | undefined) => {
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
      videoModelId,
    )
  }

  const handleResetVideo = () => {
    onUpdateState({
      videoStatus: 'idle',
      videoError: null,
      videoTaskId: null,
      videoStartedAt: null,
    })
  }

  // ────────────────────────────────────────────────────────────────────────
  // Face
  // ────────────────────────────────────────────────────────────────────────

  const isManual = variation.id.startsWith('manual-') || variation.label === 'Manual Option'
  // "Has any video at all" — drives the small video count badge on cards
  // whose cover is the image.
  const showVideoBadge = hasVideos && coverKind === 'image'
  const tagText = tagLabel(variation.tag)
  const rollText = rollTypeForTag(variation.tag)

  return (
    <>
      <div className="group flex flex-col gap-1.5">
        <div
          onClick={() => setDetailOpen(true)}
          title={variation.label}
          className="relative aspect-[9/16] cursor-pointer overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] transition-colors hover:border-white/15"
        >
          {cardState.isGeneratingImage ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4">
              <GenerationProgress
                isActive
                color="bg-orange-500"
                showHelper={false}
                messages={[
                  'Sending request...',
                  'Composing the scene...',
                  'Rendering details...',
                  'Finalizing the frame...',
                ]}
                className="max-w-[180px]"
              />
            </div>
          ) : isGeneratingVideo && !coverImage && !coverVideo ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4">
              <GenerationProgress
                isActive
                color="bg-orange-500"
                showHelper={false}
                messages={isAnimating
                  ? [
                      'Sending request...',
                      'Animating still...',
                      'Rendering motion...',
                      'Finalizing the clip...',
                    ]
                  : [
                      'Sending request...',
                      'Storyboarding frames...',
                      'Rendering motion...',
                      'Finalizing the clip...',
                    ]}
                className="max-w-[180px]"
              />
            </div>
          ) : coverKind === 'video' && resolvedVideoUrl ? (
            <>
              <video
                src={resolvedVideoUrl}
                muted
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
                onMouseEnter={(e) => { (e.currentTarget as HTMLVideoElement).play().catch(() => {}) }}
                onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="pointer-events-none absolute left-2 top-1/2 hidden -translate-y-1/2 group-hover:hidden">
                <Play className="h-4 w-4 fill-white text-white" />
              </div>
            </>
          ) : coverKind === 'image' && coverImage ? (
            <>
              <img
                src={resolvedImageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
              <ImageIcon className="h-7 w-7 text-zinc-700" strokeWidth={1.5} />
              <p className="text-[11px] text-zinc-500">Click to set up</p>
            </div>
          )}

          {/* Top-left chip — type (Dialogue / Action / Emotional / Product shot) */}
          {!isManual && (
            <span
              className={`pointer-events-none absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-tight backdrop-blur ${tagChipStyle(variation.tag)}`}
            >
              {tagText}
            </span>
          )}

          {/* Top-right status badges — small "Video N" indicator when the
              cover is the image but the card also has video gens. */}
          {showVideoBadge && (
            <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-purple-100 backdrop-blur">
              <Play className="h-2.5 w-2.5 fill-current" />
              {cardState.videos.length > 1 ? `${cardState.videos.length} videos` : 'Video'}
            </span>
          )}
          {isGeneratingVideo && (
            <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-purple-100 backdrop-blur">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {isAnimating ? 'Animating' : 'Rendering'}
            </span>
          )}
          {cardState.videoStatus === 'error' && (
            <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-red-100 backdrop-blur">
              <AlertCircle className="h-2.5 w-2.5" />
              Video error
            </span>
          )}

          {/* Top-right hover-reveal trash. Two-click confirm so a user can't
              accidentally nuke a variation. The card body is still clickable
              to open the detail modal, so no Maximize button is needed. */}
          <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              title={confirmingDelete ? 'Click again to delete' : 'Delete variation'}
              onClick={(e) => {
                e.stopPropagation()
                if (!confirmingDelete) {
                  setConfirmingDelete(true)
                  setTimeout(() => setConfirmingDelete(false), 3000)
                  return
                }
                onDelete()
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-md border backdrop-blur transition-colors ${
                confirmingDelete
                  ? 'border-red-400/60 bg-red-500/40 text-red-50 hover:bg-red-500/55'
                  : 'border-white/20 bg-white/15 text-white hover:bg-red-500/30 hover:text-red-100 hover:border-red-400/40'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {cardState.imageError && !hasImages && !cardState.isGeneratingImage && (
            <div className="absolute inset-x-2 bottom-2 flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/15 px-2 py-1.5 backdrop-blur">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-300" />
              <p className="line-clamp-2 text-[10px] leading-relaxed text-red-200">{cardState.imageError}</p>
            </div>
          )}
        </div>

        {/* Bottom text — roll type. Centred + small so it reads as a quiet label. */}
        {!isManual && (
          <p className="text-center text-[10px] font-medium tracking-wider text-zinc-500">
            {rollText}
          </p>
        )}
      </div>

      {detailOpen && (
        <CardDetailModal
          sceneNumber={sceneNumber}
          scriptLine={scriptLine}
          variation={variation}
          cardState={cardState}
          onUpdateState={onUpdateState}
          onClose={() => setDetailOpen(false)}
          characterRef={characterRef}
          productRef={productRef}
          selectedProduct={selectedProduct}
          selectedModel={selectedModel}
          selectedProductId={selectedProductId}
          selectedModelId={selectedModelId}
          selectedScriptId={selectedScriptId}
          onOpenCharacterPicker={onOpenCharacterPicker}
          onOpenProductPicker={onOpenProductPicker}
          handleUndo={handleUndo}
          handleRedo={handleRedo}
          handleCommitDraft={handleCommitDraft}
          handleEnhance={handleEnhance}
          handleRegeneratePrompt={handleRegeneratePrompt}
          handleGenerateImage={handleGenerateImage}
          handleGenerateVideo={handleGenerateVideo}
          handleResetVideo={handleResetVideo}
        />
      )}
    </>
  )
}
