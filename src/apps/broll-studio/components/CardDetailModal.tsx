import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  ImageIcon,
  Video as VideoIcon,
  Film,
  RefreshCw,
  Loader2,
  AlertCircle,
  Sparkles,
  Undo2,
  Redo2,
  Volume2,
  VolumeX,
  User,
  Package,
} from 'lucide-react'
import ModelPicker from '../../../components/ModelPicker'
import AspectIcon from '../../../components/AspectIcon'
import ConstraintChip from '../../../components/ConstraintChip'
import SegmentedToggle from '../../../components/SegmentedToggle'
import type { PromptVariation, CardState, ReferenceImage } from '../types'
import type { BRoll, Product, Model } from '../../../stores/types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getDefaultModel, getModel, estimateCredits, formatCredits, videoResolutionLabel, type ImageResolution } from '../../../utils/models'
import { tagChipStyle, tagLabel, rollTypeForTag } from './variationTags'
import { humanizeError } from '../../../utils/friendlyError'
import ModelWaitNotice from '../../../components/ModelWaitNotice'
import ExpandTextModal, { ExpandButton } from '../../../components/ExpandableText'
import {
  ModalGallery,
  IconChipButton,
  ReferenceSlotCard,
} from './cardDetailParts'

// After deleting tile #removed, shift the saved/saving index sets so they
// still point at the right tiles (indices above the removed one slide down).
function rekeyAfterDelete(set: Set<number>, removed: number): Set<number> {
  const next = new Set<number>()
  for (const i of set) {
    if (i === removed) continue
    next.add(i > removed ? i - 1 : i)
  }
  return next
}

type Tab = 'video' | 'image' | 'animate'

interface CardDetailModalProps {
  sceneNumber: number
  scriptLine: string
  variation: PromptVariation
  cardState: CardState
  onUpdateState: (updates: Partial<CardState>) => void
  onClose: () => void
  onDelete?: () => void
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  // Full bank entries — rendered as side-by-side slot cards in the modal.
  selectedProduct?: Product | null
  selectedModel?: Model | null
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
  // Open the script-level BankPicker (slide-in) when the user clicks a slot.
  onOpenCharacterPicker?: () => void
  onOpenProductPicker?: () => void
  handleUndo: () => void
  handleRedo: () => void
  handleCommitDraft: (draft: string) => void
  handleEnhance: () => void
  handleRegeneratePrompt: () => void
  handleGenerateImage: () => void
  handleSaveToBank?: () => void
  // Animate a still (image-to-video). startFrameRef is one of the card's images.
  handleAnimate: (startFrameRef: string | undefined, videoModelId: string | undefined) => void
  handleGenerateVideo: (videoModelId: string | undefined) => void
  handleResetVideo: () => void
  // Re-fire / drop a failed in-flight gen surfaced in the gallery.
  handleRetryInFlight: (id: string, isVideo: boolean) => void
  handleDismissInFlight: (id: string, isVideo: boolean) => void
}

// Playground-faithful per-variation workspace.
// Tab order: Video first, Image second (matches the Playground reflexively
// landing on video gens). Sections in the LEFT column run top-down:
//   1. Model picker + constraint chips
//   2. Reference Images (Character / Product toggle pills, orange)
//   3. Prompt (always editable textarea + Enhance / Undo / Redo / Regenerate)
//   4. Orange Generate pill — non-blocking, allows parallel queueing
// RIGHT column is the per-card masonry gallery (same as Playground's history
// grid). The modal is fixed-height (92vh) so model dropdowns never clip
// when the gallery is empty.
export default function CardDetailModal(props: CardDetailModalProps) {
  const {
    sceneNumber,
    variation,
    cardState,
    onUpdateState,
    onClose,
    selectedProduct,
    selectedModel,
    selectedProductId,
    selectedModelId,
    selectedScriptId,
    characterRef,
    productRef,
    onOpenCharacterPicker,
    onOpenProductPicker,
    handleUndo,
    handleRedo,
    handleCommitDraft,
    handleEnhance,
    handleRegeneratePrompt,
    handleGenerateImage,
    handleGenerateVideo,
    handleAnimate,
    handleRetryInFlight,
    handleDismissInFlight,
  } = props

  const [tab, setTab] = useState<Tab>('image')
  // Animate tab: which still gets animated. Null → fall back to the cover /
  // latest image. Set explicitly when the user clicks "Animate" on a tile.
  const [animateFrameRef, setAnimateFrameRef] = useState<string | null>(null)
  const latestImageRef = cardState.images.length > 0
    ? cardState.images[cardState.images.length - 1].imageUrl
    : undefined
  const selectedImageRef = cardState.selected?.kind === 'image'
    ? cardState.images[cardState.selected.index]?.imageUrl
    : undefined
  const effectiveAnimateFrame = animateFrameRef ?? selectedImageRef ?? latestImageRef
  const animateFrameUrl = useAssetUrl(effectiveAnimateFrame)
  const [draft, setDraft] = useState(cardState.editablePrompt)
  // Expand-the-prompt-into-a-modal toggle (parity with Playground / Scripts).
  const [promptExpanded, setPromptExpanded] = useState(false)
  // Per-tile saved/saving sets so the Bookmark button can show a check.
  const [savedImageIdxs, setSavedImageIdxs] = useState<Set<number>>(new Set())
  const [savingImageIdxs, setSavingImageIdxs] = useState<Set<number>>(new Set())

  // Pull cardState.editablePrompt back into the local draft when undo/redo/
  // enhance/regenerate fire. Local edits don't roundtrip through cardState
  // until the textarea blurs (or the user explicitly commits via Enter? we
  // commit on blur via handleCommitDraft so undo/redo history captures it).
  useEffect(() => {
    setDraft(cardState.editablePrompt)
  }, [cardState.editablePrompt])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const persistedImageModel = useSettingsStore((s) => s.getAppModel('broll-studio:image:text-to-image'))
  const imageModelId = persistedImageModel ?? getDefaultModel('broll-studio', 'image', 'text-to-image')?.id

  const persistedVideoModel = useSettingsStore((s) => s.getAppModel('broll-studio:video'))
  const videoModelId =
    persistedVideoModel ?? getDefaultModel('broll-studio', 'video')?.id ?? getDefaultModel('playground', 'video')?.id

  const imageConstraints = imageModelId ? getModel(imageModelId)?.imageConstraints : undefined
  const videoConstraints = videoModelId ? getModel(videoModelId)?.videoConstraints : undefined
  // Does the chosen video model accept reference-to-video? When false, the
  // CHARACTER / PRODUCT slot cards dim with an explanatory tooltip — the
  // toggles still flip so the user can pre-arm them for a model swap, but
  // they no longer suggest the refs will be honoured at gen time.
  const videoModelSupportsRefs = videoModelId
    ? (getModel(videoModelId)?.modes ?? []).includes('reference-to-video')
    : false
  const videoModelName = videoModelId ? (getModel(videoModelId)?.displayName ?? videoModelId) : 'This model'
  // The "doesn't support reference images" caveat is about VIDEO models only —
  // image models always accept references (image-to-image), so dim the slots
  // and show the warning solely while the Video tab is active.
  const refsUnsupportedForVideo = tab === 'video' && !videoModelSupportsRefs

  // Is at least one reference image currently armed? When so, the video model
  // picker greys out models that can't take refs so the user can't pick one
  // that would silently drop the character/product.
  const hasActiveRef =
    (!!characterRef && cardState.refsCharacter !== false) ||
    (!!productRef && cardState.refsProduct !== false)

  // Re-clamp per-card settings when the user switches models. For audio:
  // FORCE on whenever the new model supports audio so it's the default for
  // every audio-capable model (only flipped off explicitly via toggle).
  useEffect(() => {
    if (!imageModelId) return
    const m = getModel(imageModelId)
    const tiers = m?.imageConstraints?.resolutions as ImageResolution[] | undefined
    const aspects = m?.imageConstraints?.aspectRatios
    const updates: Partial<CardState> = {}
    if (tiers && tiers.length > 0 && !tiers.includes(cardState.cardImageResolution)) {
      updates.cardImageResolution = tiers[0]
    }
    if (aspects && aspects.length > 0 && !aspects.includes(cardState.cardImageAspectRatio)) {
      updates.cardImageAspectRatio = aspects[0]
    }
    if (Object.keys(updates).length) onUpdateState(updates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageModelId])

  useEffect(() => {
    const c = videoConstraints
    if (!c) return
    const updates: Partial<CardState> = {}
    if (c.aspectRatios.length > 0 && !c.aspectRatios.includes(cardState.cardVideoAspectRatio)) {
      updates.cardVideoAspectRatio = c.aspectRatios[0]
    }
    if (c.durations.length > 0 && !c.durations.includes(cardState.cardVideoDurationSeconds)) {
      updates.cardVideoDurationSeconds = c.durations[0]
    }
    if (!c.resolutions.includes(cardState.cardVideoResolution)) {
      updates.cardVideoResolution = c.default ?? c.resolutions[0] ?? '720p'
    }
    // Audio: force ON for every audio-capable model. Force OFF when the
    // model can't do audio. Matches the user's "audio on by default" ask.
    updates.cardVideoAudio = c.supportsAudio === true
    if (Object.keys(updates).length) onUpdateState(updates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoModelId])

  const canUndo = cardState.promptHistoryIndex > 0
  const canRedo = cardState.promptHistoryIndex < cardState.promptHistory.length - 1
  const isManual = variation.id.startsWith('manual-') || variation.label === 'Manual Option'

  const handleDraftBlur = () => {
    // Capture the user's typed draft into the prompt history on blur. No
    // explicit Edit/Done toggle anymore — the textarea is always live.
    handleCommitDraft(draft)
  }

  // Credits estimate strings — surfaced in the Generate buttons as "(N credits)".
  const imageCreditsLabel = imageModelId
    ? formatCredits(estimateCredits(imageModelId, { imageCount: 1, resolution: cardState.cardImageResolution }))
    : null
  const videoCreditsLabel = videoModelId
    ? formatCredits(estimateCredits(videoModelId, {
        durationSeconds: cardState.cardVideoDurationSeconds,
        resolution: cardState.cardVideoResolution,
        audio: cardState.cardVideoAudio,
      }))
    : null

  // ─── Per-tile save ─────────────────────────────────────────────────────
  const handleSaveImageTile = async (index: number) => {
    if (savedImageIdxs.has(index) || savingImageIdxs.has(index)) return
    const img = cardState.images[index]
    if (!img) return
    setSavingImageIdxs((prev) => new Set(prev).add(index))
    try {
      await useBankStore.getState().addBRoll({
        imageUrl: img.imageUrl,
        prompt: img.prompt,
        productId: selectedProductId,
        modelId: selectedModelId,
        scriptId: selectedScriptId,
        sourceApp: 'broll-studio',
      } as Omit<BRoll, 'id' | 'createdAt'>)
      setSavedImageIdxs((prev) => new Set(prev).add(index))
    } catch (err) {
      useAppStore.getState().addToast(humanizeError(err, 'Save failed'), 'error')
    } finally {
      setSavingImageIdxs((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

  // ─── Per-tile delete (card outputs only) ───────────────────────────────
  const handleDeleteImageTile = (index: number) => {
    const newImages = cardState.images.filter((_, i) => i !== index)
    let nextSelected = cardState.selected
    if (nextSelected?.kind === 'image') {
      if (nextSelected.index === index) {
        nextSelected = newImages.length > 0
          ? { kind: 'image', index: Math.min(nextSelected.index, newImages.length - 1) }
          : (cardState.videos.length > 0 ? { kind: 'video', index: cardState.currentVideoIndex } : null)
      } else if (nextSelected.index > index) {
        nextSelected = { kind: 'image', index: nextSelected.index - 1 }
      }
    }
    onUpdateState({
      images: newImages,
      currentImageIndex: Math.max(0, Math.min(cardState.currentImageIndex, newImages.length - 1)),
      selected: nextSelected,
    })
    setSavedImageIdxs(rekeyAfterDelete(savedImageIdxs, index))
    setSavingImageIdxs(rekeyAfterDelete(savingImageIdxs, index))
  }

  const handleDeleteVideoTile = (index: number) => {
    const newVideos = cardState.videos.filter((_, i) => i !== index)
    let nextSelected = cardState.selected
    if (nextSelected?.kind === 'video') {
      if (nextSelected.index === index) {
        nextSelected = newVideos.length > 0
          ? { kind: 'video', index: Math.min(nextSelected.index, newVideos.length - 1) }
          : (cardState.images.length > 0 ? { kind: 'image', index: cardState.currentImageIndex } : null)
      } else if (nextSelected.index > index) {
        nextSelected = { kind: 'video', index: nextSelected.index - 1 }
      }
    }
    onUpdateState({
      videos: newVideos,
      currentVideoIndex: Math.max(0, Math.min(cardState.currentVideoIndex, newVideos.length - 1)),
      selected: nextSelected,
    })
  }

  // Load a tile's prompt back into this card's prompt editor (and undo/redo
  // history), so the user can tweak a past generation's prompt and re-run it —
  // replaces the old copy-to-clipboard action.
  const handleReusePrompt = (text: string) => {
    const trimmed = (text ?? '').trim()
    if (!trimmed) {
      useAppStore.getState().addToast('No prompt to reuse', 'error')
      return
    }
    setDraft(trimmed)
    handleCommitDraft(trimmed)
    useAppStore.getState().addToast('Prompt loaded into the editor', 'success')
  }

  return createPortal((
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm sm:px-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white transition-colors hover:bg-black/60"
      >
        <X className="h-4 w-4" />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-ink/10 bg-ink-950/95 shadow-2xl"
      >
        {/* Header — chip + scene line only. Descriptive ALL-CAPS label is gone. */}
        <div className="flex items-center justify-between gap-3 border-b border-ink/5 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {!isManual && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-tight ${tagChipStyle(variation.tag)}`}>
                {tagLabel(variation.tag)}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-wider text-ink-400">
              {rollTypeForTag(variation.tag)} · Scene {sceneNumber}
            </span>
          </div>
        </div>

        {/* Body — fixed 50/50 grid; content scrolls inside each column. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          {/* LEFT 50% — model + refs + prompt + generate */}
          <div className="col-span-1 flex min-h-0 flex-col overflow-y-auto border-b border-ink/5 md:border-b-0 md:border-r">
            <div className="flex grow flex-col gap-6 px-5 pb-6 pt-3">
              {/* Image / Video / Animate — full-width segmented toggle that
                  spans the left column (replaces the old top tab strip). */}
              <SegmentedToggle<Tab>
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'image', label: 'Image', icon: ImageIcon },
                  { value: 'video', label: 'Video', icon: VideoIcon },
                  { value: 'animate', label: 'Animate', icon: Film },
                ]}
              />

              {/* Separator between the tab toggle and the controls below. */}
              <div className="-mt-2 -mb-4 border-b border-ink/5" />

              {/* 1) Model picker + its constraint chips (resolution first). */}
              {tab === 'image' ? (
                <div>
                  <span className="text-sm font-medium text-ink-200">Image Model</span>
                  <div className="mt-2">
                    <ModelPicker
                      appId="broll-studio"
                      task="image"
                      mode="text-to-image"
                      costParams={{ imageCount: 1, resolution: cardState.cardImageResolution }}
                    />
                  </div>
                  {imageConstraints && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {imageConstraints.resolutions && imageConstraints.resolutions.length > 0 && (
                        <ConstraintChip
                          grow
                          openDirection="down"
                          options={imageConstraints.resolutions as string[]}
                          value={cardState.cardImageResolution}
                          onChange={(v) => onUpdateState({ cardImageResolution: v as ImageResolution })}
                        />
                      )}
                      {imageConstraints.aspectRatios && imageConstraints.aspectRatios.length > 0 && (
                        <ConstraintChip
                          grow
                          openDirection="down"
                          options={imageConstraints.aspectRatios}
                          value={cardState.cardImageAspectRatio}
                          onChange={(v) => onUpdateState({ cardImageAspectRatio: v })}
                          render={(v) => (
                            <span className="flex items-center gap-1.5">
                              <AspectIcon ratio={v} />
                              <span>{v}</span>
                            </span>
                          )}
                        />
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <span className="text-sm font-medium text-ink-200">Video Model</span>
                  <div className="mt-2">
                    <ModelPicker
                      appId="broll-studio"
                      task="video"
                      requireMode={tab === 'animate' ? 'image-to-video' : (hasActiveRef ? 'reference-to-video' : undefined)}
                      requireModeNote={tab === 'animate'
                        ? "Greyed-out models can't animate a still — they have no image-to-video mode. Pick Veo 3.1 Fast, Seedance 2.0, or another image-to-video model."
                        : "Greyed-out models don't support reference image-to-video. To use these, generate still frames in the Image tab, then send them to Playground for start/end frames."}
                      costParams={{
                        durationSeconds: cardState.cardVideoDurationSeconds,
                        resolution: cardState.cardVideoResolution,
                        audio: cardState.cardVideoAudio,
                      }}
                    />
                  </div>
                  {videoConstraints && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <ConstraintChip
                        grow
                        openDirection="down"
                        options={videoConstraints.resolutions}
                        value={cardState.cardVideoResolution}
                        onChange={(v) => onUpdateState({ cardVideoResolution: v })}
                        render={videoResolutionLabel}
                      />
                      {/* Image-conditioned models (e.g. Kling 3.0 Turbo) inherit
                          aspect from the input frame and expose no aspect param,
                          so aspectRatios is [] and the chip stays hidden. */}
                      {videoConstraints.aspectRatios.length > 0 && (
                      <ConstraintChip
                        grow
                        openDirection="down"
                        options={videoConstraints.aspectRatios}
                        value={cardState.cardVideoAspectRatio}
                        onChange={(v) => onUpdateState({ cardVideoAspectRatio: v })}
                        render={(v) => (
                          <span className="flex items-center gap-1.5">
                            <AspectIcon ratio={v} />
                            <span>{v}</span>
                          </span>
                        )}
                      />
                      )}
                      {videoConstraints.durations.length > 0 && (
                        <ConstraintChip
                          grow
                          openDirection="down"
                          options={videoConstraints.durations.map(String)}
                          value={String(cardState.cardVideoDurationSeconds)}
                          onChange={(v) => onUpdateState({ cardVideoDurationSeconds: Number(v) })}
                          render={(v) => <span>{v}s</span>}
                        />
                      )}
                      {videoConstraints.supportsAudio && (
                        <button
                          type="button"
                          onClick={() => onUpdateState({ cardVideoAudio: !cardState.cardVideoAudio })}
                          className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border px-3.5 text-[12px] transition-colors ${
                            cardState.cardVideoAudio
                              ? 'border-broll-500/40 bg-broll-500/15 text-broll-200'
                              : 'border-ink/10 bg-ink/[0.02] text-ink-400 hover:bg-ink/[0.05]'
                          }`}
                        >
                          {cardState.cardVideoAudio ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                          <span>{cardState.cardVideoAudio ? 'Audio' : 'Mute'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 3) Animate tab → Start frame preview. Image/Video tabs →
                  the Character / Product reference slot cards. */}
              {tab === 'animate' ? (
                <div>
                  <span className="text-sm font-medium text-ink-200">Start frame</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
                    The still that gets animated. Click <span className="font-medium text-ink-400">Animate</span> on any image in the gallery to swap it.
                  </p>
                  <div className="mt-2">
                    {effectiveAnimateFrame && animateFrameUrl ? (
                      <div
                        className="relative max-w-[140px] overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.02]"
                        style={aspectStyle(cardState.cardVideoAspectRatio)}
                      >
                        <img src={animateFrameUrl} alt="" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-40 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink/10 bg-ink/[0.02] px-4 text-center">
                        <ImageIcon className="h-6 w-6 text-ink-700" strokeWidth={1.5} />
                        <p className="text-[11px] leading-relaxed text-ink-500">
                          Generate an image in the Image tab first, then click Animate on it.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Reference Images — side-by-side BankPicker-style slot
                      cards. Click the body to pick from the bank; the
                      tick-circle toggles whether the ref is sent. */}
                <span className="text-sm font-medium text-ink-200">Reference Images</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <ReferenceSlotCard
                    icon={<User className="h-4 w-4 text-influencers-400 light:text-influencers-600" />}
                    accentClass="bg-influencers-500/15 text-influencers-400 light:text-influencers-600"
                    kind="Influencer"
                    name={selectedModel?.name}
                    imageRef={selectedModel?.characterImage}
                    onClick={() => onOpenCharacterPicker?.()}
                    active={cardState.refsCharacter !== false}
                    onToggleActive={() => onUpdateState({ refsCharacter: cardState.refsCharacter === false })}
                    dimmed={refsUnsupportedForVideo}
                    dimmedReason={`${videoModelName} doesn't accept reference images. Switch to Veo 3.1 Fast or Seedance 2.0 to use them.`}
                  />
                  <ReferenceSlotCard
                    icon={<Package className="h-4 w-4 text-amber-400 light:text-amber-600" />}
                    accentClass="bg-amber-500/15 text-amber-400 light:text-amber-600"
                    kind="Product"
                    name={selectedProduct?.productName}
                    imageRef={selectedProduct?.productImage}
                    onClick={() => onOpenProductPicker?.()}
                    active={cardState.refsProduct !== false}
                    onToggleActive={() => onUpdateState({ refsProduct: cardState.refsProduct === false })}
                    dimmed={refsUnsupportedForVideo}
                    dimmedReason={`${videoModelName} doesn't accept reference images. Switch to Veo 3.1 Fast or Seedance 2.0 to use them.`}
                  />
                </div>
                {hasActiveRef && refsUnsupportedForVideo && (
                  <p className="mt-2 text-[11px] leading-relaxed text-amber-400/80 light:text-amber-600/80">
                    {videoModelName} doesn't support reference images — this will generate text-to-video only. Pick Veo 3.1 Fast or Seedance 2.0 to use your influencer/product.
                  </p>
                )}
                </div>
              )}

              {/* 4) Prompt — always-editable textarea. Grows to absorb the
                  column's leftover height (Playground's expand-don't-scroll
                  pattern); overflow scrolls inside the textarea. */}
              <div className="flex grow flex-col">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-200">Prompt</span>
                  <div className="flex flex-wrap items-center gap-1">
                    {/* Enhance + Regenerate sit next to each other on the
                        right, then Undo/Redo. Both use the default grey
                        tone — the emerald accent felt out of place. */}
                    <IconChipButton
                      title="Enhance with framework"
                      onClick={handleEnhance}
                      disabled={cardState.isPromptWorking || !draft.trim()}
                    >
                      {cardState.isPromptWorking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Enhance Prompt
                    </IconChipButton>
                    <IconChipButton
                      title={`Regenerate prompt — produces a fresh ${tagLabel(variation.tag)} prompt`}
                      onClick={handleRegeneratePrompt}
                      disabled={cardState.isPromptWorking}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Regenerate Prompt
                    </IconChipButton>
                    <IconChipButton title="Undo" onClick={handleUndo} disabled={!canUndo || cardState.isPromptWorking}>
                      <Undo2 className="h-3 w-3" />
                    </IconChipButton>
                    <IconChipButton title="Redo" onClick={handleRedo} disabled={!canRedo || cardState.isPromptWorking}>
                      <Redo2 className="h-3 w-3" />
                    </IconChipButton>
                  </div>
                </div>

                <div className="relative flex grow flex-col">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={handleDraftBlur}
                    rows={8}
                    placeholder="Write your custom B-roll prompt here..."
                    className="min-h-[200px] w-full grow resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-3.5 py-3 text-[13px] leading-relaxed text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-ink/20 focus:bg-ink/[0.05]"
                  />
                  <ExpandButton onClick={() => setPromptExpanded(true)} className="absolute bottom-2 right-2" />
                </div>

                {cardState.promptError && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400 light:text-red-600" />
                    <p className="text-[11px] leading-relaxed text-red-300 light:text-red-700">{cardState.promptError}</p>
                  </div>
                )}
              </div>

              {/* 5) Generate button — orange Playground-pill. Sits a touch
                  below the prompt (mt-2). The wait notice is grouped tight
                  underneath via a fixed-height slot so it reads as part of
                  the button, and so swapping to a model without a notice
                  (e.g. Nano Banana) can't reflow / shift the panel. */}
              <div className="mt-2 flex flex-col gap-1.5">
                {tab === 'image' ? (
                  <button
                    onClick={handleGenerateImage}
                    disabled={!cardState.editablePrompt.trim()}
                    className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-broll-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-broll-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ImageIcon className="h-4 w-4" />
                    Generate Image{imageCreditsLabel ? ` (${imageCreditsLabel})` : ''}
                  </button>
                ) : tab === 'video' ? (
                  <button
                    onClick={() => handleGenerateVideo(videoModelId)}
                    disabled={!cardState.editablePrompt.trim()}
                    className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-broll-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-broll-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <VideoIcon className="h-4 w-4" />
                    Generate Video{videoCreditsLabel ? ` (${videoCreditsLabel})` : ''}
                  </button>
                ) : (
                  <button
                    onClick={() => handleAnimate(effectiveAnimateFrame, videoModelId)}
                    disabled={!cardState.editablePrompt.trim() || !effectiveAnimateFrame}
                    title={!effectiveAnimateFrame ? 'Generate an image first, then animate it' : undefined}
                    className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-broll-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-broll-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Film className="h-4 w-4" />
                    Animate{videoCreditsLabel ? ` (${videoCreditsLabel})` : ''}
                  </button>
                )}
                {tab === 'image' && (
                  <div className="min-h-[16px]">
                    <ModelWaitNotice modelId={imageModelId} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT 50% — per-card gallery (Playground masonry) */}
          <div className="col-span-1 flex min-h-0 flex-col overflow-hidden">
            <ModalGallery
              cardState={cardState}
              onUpdateState={onUpdateState}
              setTab={setTab}
              savedImageIdxs={savedImageIdxs}
              savingImageIdxs={savingImageIdxs}
              onSaveImage={handleSaveImageTile}
              onDeleteImage={handleDeleteImageTile}
              onDeleteVideo={handleDeleteVideoTile}
              onReusePrompt={handleReusePrompt}
              onAnimateImage={(index) => {
                const ref = cardState.images[index]?.imageUrl
                if (ref) {
                  setAnimateFrameRef(ref)
                  setTab('animate')
                }
              }}
              onRetryInFlight={handleRetryInFlight}
              onDismissInFlight={handleDismissInFlight}
            />
          </div>
        </div>
      </div>

      <ExpandTextModal
        open={promptExpanded}
        onClose={() => { setPromptExpanded(false); handleCommitDraft(draft) }}
        value={draft}
        onChange={setDraft}
        title={`Scene ${sceneNumber} — Prompt`}
        placeholder="Write your custom B-roll prompt here..."
        accent="broll"
      />
    </div>
  ), document.body)
}

// Shape the Animate start-frame preview to the chosen video aspect ratio.
function aspectStyle(ar: string): React.CSSProperties {
  const [w, h] = ar.split(':').map(Number)
  if (!w || !h) return { aspectRatio: '9 / 16' }
  return { aspectRatio: `${w} / ${h}` }
}
