import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  ImageIcon,
  Video as VideoIcon,
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
import type { PromptVariation, CardState, ReferenceImage } from '../types'
import type { BRoll, Product, Model } from '../../../stores/types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { getDefaultModel, getModel, estimateCredits, formatCredits, type ImageResolution } from '../../../utils/models'
import { tagChipStyle, tagLabel, rollTypeForTag } from './variationTags'
import { humanizeError } from '../../../utils/friendlyError'
import {
  ModalGallery,
  ModalTabButton,
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

type Tab = 'video' | 'image'

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
  handleAnimateStill?: (videoModelId: string | undefined) => void
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
    handleRetryInFlight,
    handleDismissInFlight,
  } = props

  const [tab, setTab] = useState<Tab>('image')
  const [draft, setDraft] = useState(cardState.editablePrompt)
  // Per-tile saved/saving sets so the Bookmark button can show a check.
  const [savedImageIdxs, setSavedImageIdxs] = useState<Set<number>>(new Set())
  const [savedVideoIdxs, setSavedVideoIdxs] = useState<Set<number>>(new Set())
  const [savingImageIdxs, setSavingImageIdxs] = useState<Set<number>>(new Set())
  const [savingVideoIdxs, setSavingVideoIdxs] = useState<Set<number>>(new Set())

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
    if (!c.aspectRatios.includes(cardState.cardVideoAspectRatio)) updates.cardVideoAspectRatio = c.aspectRatios[0]
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

  const handleSaveVideoTile = async (index: number) => {
    if (savedVideoIdxs.has(index) || savingVideoIdxs.has(index)) return
    const vid = cardState.videos[index]
    if (!vid) return
    setSavingVideoIdxs((prev) => new Set(prev).add(index))
    try {
      await useBankStore.getState().addBRoll({
        imageUrl: '',
        prompt: vid.prompt,
        productId: selectedProductId,
        modelId: selectedModelId,
        scriptId: selectedScriptId,
        videos: [{ url: vid.url, aspectRatio: vid.aspectRatio, createdAt: vid.createdAt }],
        sourceApp: 'broll-studio',
      } as Omit<BRoll, 'id' | 'createdAt'>)
      setSavedVideoIdxs((prev) => new Set(prev).add(index))
    } catch (err) {
      useAppStore.getState().addToast(humanizeError(err, 'Save failed'), 'error')
    } finally {
      setSavingVideoIdxs((prev) => {
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
    setSavedVideoIdxs(rekeyAfterDelete(savedVideoIdxs, index))
    setSavingVideoIdxs(rekeyAfterDelete(savingVideoIdxs, index))
  }

  // ─── Per-tile copy prompt ──────────────────────────────────────────────
  // Uses navigator.clipboard.writeText with a document.execCommand fallback
  // for older browsers. Guards against an empty/whitespace-only prompt so
  // the toast doesn't lie about copying nothing.
  const handleCopyPrompt = async (text: string) => {
    const trimmed = (text ?? '').trim()
    if (!trimmed) {
      useAppStore.getState().addToast('No prompt to copy', 'error')
      return
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        // Legacy fallback — older browsers / non-secure contexts
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      useAppStore.getState().addToast('Prompt copied', 'success')
    } catch (err) {
      useAppStore.getState().addToast(humanizeError(err, 'Copy failed'), 'error')
    }
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
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl"
      >
        {/* Header — chip + scene line only. Descriptive ALL-CAPS label is gone. */}
        <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {!isManual && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-tight ${tagChipStyle(variation.tag)}`}>
                {tagLabel(variation.tag)}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              {rollTypeForTag(variation.tag)} · Scene {sceneNumber}
            </span>
          </div>
        </div>

        {/* Tab strip — Image first (default), Video second. */}
        <div className="flex items-center gap-1 border-b border-white/5 px-5">
          <ModalTabButton active={tab === 'image'} onClick={() => setTab('image')}>
            <ImageIcon className="h-3.5 w-3.5" />
            Image
          </ModalTabButton>
          <ModalTabButton active={tab === 'video'} onClick={() => setTab('video')}>
            <VideoIcon className="h-3.5 w-3.5" />
            Video
          </ModalTabButton>
        </div>

        {/* Body — fixed 50/50 grid; content scrolls inside each column. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          {/* LEFT 50% — model + refs + prompt + generate */}
          <div className="col-span-1 flex min-h-0 flex-col overflow-y-auto border-b border-white/5 md:border-b-0 md:border-r">
            <div className="flex flex-col gap-6 px-5 py-6">
              {/* 1) Model + constraint chips */}
              {tab === 'image' ? (
                <div>
                  <span className="text-sm font-medium text-zinc-200">Image Model</span>
                  <div className="mt-2 flex flex-col gap-2">
                    <ModelPicker
                      appId="broll-studio"
                      task="image"
                      mode="text-to-image"
                      costParams={{ imageCount: 1, resolution: cardState.cardImageResolution }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {imageConstraints?.aspectRatios && imageConstraints.aspectRatios.length > 0 && (
                        <ConstraintChip
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
                      {imageConstraints?.resolutions && imageConstraints.resolutions.length > 0 && (
                        <ConstraintChip
                          openDirection="down"
                          options={imageConstraints.resolutions as string[]}
                          value={cardState.cardImageResolution}
                          onChange={(v) => onUpdateState({ cardImageResolution: v as ImageResolution })}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="text-sm font-medium text-zinc-200">Video Model</span>
                  <div className="mt-2 flex flex-col gap-2">
                    <ModelPicker
                      appId="broll-studio"
                      task="video"
                      requireMode={hasActiveRef ? 'reference-to-video' : undefined}
                      requireModeNote="Greyed-out models don't support reference image-to-video. To use these, generate still frames in the Image tab, then send them to Playground for start/end frames."
                      costParams={{
                        durationSeconds: cardState.cardVideoDurationSeconds,
                        resolution: cardState.cardVideoResolution,
                        audio: cardState.cardVideoAudio,
                      }}
                    />
                    {videoConstraints && (
                      <div className="flex flex-wrap items-center gap-2">
                        <ConstraintChip
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
                        {videoConstraints.durations.length > 0 && (
                          <ConstraintChip
                            openDirection="down"
                            options={videoConstraints.durations.map(String)}
                            value={String(cardState.cardVideoDurationSeconds)}
                            onChange={(v) => onUpdateState({ cardVideoDurationSeconds: Number(v) })}
                            render={(v) => <span>{v}s</span>}
                          />
                        )}
                        <ConstraintChip
                          openDirection="down"
                          options={videoConstraints.resolutions}
                          value={cardState.cardVideoResolution}
                          onChange={(v) => onUpdateState({ cardVideoResolution: v })}
                        />
                        {videoConstraints.supportsAudio && (
                          <button
                            type="button"
                            onClick={() => onUpdateState({ cardVideoAudio: !cardState.cardVideoAudio })}
                            className={`flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] transition-colors ${
                              cardState.cardVideoAudio
                                ? 'border-green-500/30 bg-green-500/10 text-green-200'
                                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]'
                            }`}
                          >
                            {cardState.cardVideoAudio ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                            <span>{cardState.cardVideoAudio ? 'Audio' : 'Mute'}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2) Reference Images — side-by-side BankPicker-style slot
                  cards. Click body to pick from bank; tick-circle button at
                  the top-right toggles whether the ref is sent to the model.
                  Active slots are highlighted orange. */}
              <div>
                <span className="text-sm font-medium text-zinc-200">Reference Images</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <ReferenceSlotCard
                    icon={<User className="h-4 w-4 text-sky-400" />}
                    accentClass="bg-sky-500/15 text-sky-400"
                    kind="Character"
                    name={selectedModel?.name}
                    imageRef={selectedModel?.characterImage}
                    onClick={() => onOpenCharacterPicker?.()}
                    active={cardState.refsCharacter !== false}
                    onToggleActive={() => onUpdateState({ refsCharacter: cardState.refsCharacter === false })}
                    dimmed={refsUnsupportedForVideo}
                    dimmedReason={`${videoModelName} doesn't accept reference images. Switch to Veo 3.1 Fast or Seedance 2.0 to use them.`}
                  />
                  <ReferenceSlotCard
                    icon={<Package className="h-4 w-4 text-amber-400" />}
                    accentClass="bg-amber-500/15 text-amber-400"
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
                  <p className="mt-2 text-[11px] leading-relaxed text-amber-400/80">
                    {videoModelName} doesn't support reference images — this will generate text-to-video only. Pick Veo 3.1 Fast or Seedance 2.0 to use your character/product.
                  </p>
                )}
              </div>

              {/* 3) Prompt — always-editable textarea */}
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-200">Prompt</span>
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

                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={handleDraftBlur}
                  rows={10}
                  placeholder="Write your custom B-roll prompt here..."
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[13px] leading-relaxed text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.05]"
                />

                {cardState.promptError && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                    <p className="text-[11px] leading-relaxed text-red-300">{cardState.promptError}</p>
                  </div>
                )}
              </div>

              {/* 4) Generate button — orange Playground-pill */}
              {tab === 'image' ? (
                <button
                  onClick={handleGenerateImage}
                  disabled={!cardState.editablePrompt.trim()}
                  className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-orange-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ImageIcon className="h-4 w-4" />
                  Generate Image{imageCreditsLabel ? ` (${imageCreditsLabel})` : ''}
                </button>
              ) : (
                <button
                  onClick={() => handleGenerateVideo(videoModelId)}
                  disabled={!cardState.editablePrompt.trim()}
                  className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-orange-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <VideoIcon className="h-4 w-4" />
                  Generate Video{videoCreditsLabel ? ` (${videoCreditsLabel})` : ''}
                </button>
              )}
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
              savedVideoIdxs={savedVideoIdxs}
              savingVideoIdxs={savingVideoIdxs}
              onSaveImage={handleSaveImageTile}
              onSaveVideo={handleSaveVideoTile}
              onDeleteImage={handleDeleteImageTile}
              onDeleteVideo={handleDeleteVideoTile}
              onCopyPrompt={handleCopyPrompt}
              onRetryInFlight={handleRetryInFlight}
              onDismissInFlight={handleDismissInFlight}
            />
          </div>
        </div>
      </div>
    </div>
  ), document.body)
}
