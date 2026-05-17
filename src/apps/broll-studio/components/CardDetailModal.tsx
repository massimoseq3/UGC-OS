import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  ImageIcon,
  Video as VideoIcon,
  RefreshCw,
  Loader2,
  Check,
  AlertCircle,
  Download,
  Trash2,
  Bookmark,
  Sparkles,
  Undo2,
  Redo2,
  Volume2,
  VolumeX,
  User,
  Package,
  Play,
  Copy,
} from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'
import ModelPicker from '../../../components/ModelPicker'
import AspectIcon from '../../../components/AspectIcon'
import ConstraintChip from '../../../components/ConstraintChip'
import type { PromptVariation, CardState, ReferenceImage } from '../types'
import type { BRoll, Product, Model } from '../../../stores/types'
import { useAssetUrlState, useAssetUrl } from '../../../hooks/useAssetUrl'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { getUrl } from '../../../utils/assetStore'
import { getDefaultModel, getModel, estimateCredits, formatCredits, type ImageResolution } from '../../../utils/models'
import { tagChipStyle, tagLabel, rollTypeForTag } from './VariationCard'

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
    onOpenCharacterPicker,
    onOpenProductPicker,
    handleUndo,
    handleRedo,
    handleCommitDraft,
    handleEnhance,
    handleRegeneratePrompt,
    handleGenerateImage,
    handleGenerateVideo,
  } = props

  const [tab, setTab] = useState<Tab>('video')
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
      useAppStore.getState().addToast(err instanceof Error ? err.message : 'Save failed', 'error')
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
      useAppStore.getState().addToast(err instanceof Error ? err.message : 'Save failed', 'error')
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
      useAppStore.getState().addToast(err instanceof Error ? err.message : 'Copy failed', 'error')
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

        {/* Tab strip — Video first, Image second. */}
        <div className="flex items-center gap-1 border-b border-white/5 px-5">
          <ModalTabButton active={tab === 'video'} onClick={() => setTab('video')}>
            <VideoIcon className="h-3.5 w-3.5" />
            Video
          </ModalTabButton>
          <ModalTabButton active={tab === 'image'} onClick={() => setTab('image')}>
            <ImageIcon className="h-3.5 w-3.5" />
            Image
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
                  cards. Click opens the script-level picker. Same height as
                  the model picker above. */}
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
                  />
                  <ReferenceSlotCard
                    icon={<Package className="h-4 w-4 text-amber-400" />}
                    accentClass="bg-amber-500/15 text-amber-400"
                    kind="Product"
                    name={selectedProduct?.productName}
                    imageRef={selectedProduct?.productImage}
                    onClick={() => onOpenProductPicker?.()}
                  />
                </div>
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
            />
          </div>
        </div>
      </div>
    </div>
  ), document.body)
}

// ─── Modal gallery — per-card masonry ────────────────────────────────────

interface ModalGalleryProps {
  cardState: CardState
  onUpdateState: (updates: Partial<CardState>) => void
  setTab: (t: Tab) => void
  savedImageIdxs: Set<number>
  savingImageIdxs: Set<number>
  savedVideoIdxs: Set<number>
  savingVideoIdxs: Set<number>
  onSaveImage: (index: number) => void
  onSaveVideo: (index: number) => void
  onDeleteImage: (index: number) => void
  onDeleteVideo: (index: number) => void
  onCopyPrompt: (text: string) => void
}

type ModalEntry =
  | { kind: 'image'; idx: number; createdAt: number; imageUrl: string; prompt: string }
  | { kind: 'video'; idx: number; createdAt: number; videoUrl: string; aspectRatio: string; prompt: string; modelId: string }
  | { kind: 'in-flight-image'; id: string; createdAt: number; prompt: string }
  | { kind: 'in-flight-video'; id: string; createdAt: number; prompt: string; mode: 'animating' | 'rendering' }

function ModalGallery({
  cardState,
  onUpdateState,
  setTab,
  savedImageIdxs,
  savingImageIdxs,
  savedVideoIdxs,
  savingVideoIdxs,
  onSaveImage,
  onSaveVideo,
  onDeleteImage,
  onDeleteVideo,
  onCopyPrompt,
}: ModalGalleryProps) {
  const noSelectionYet = !cardState.selected
  useEffect(() => {
    if (!noSelectionYet) return
    if (cardState.images.length > 0) {
      onUpdateState({ selected: { kind: 'image', index: cardState.images.length - 1 } })
    } else if (cardState.videos.length > 0) {
      onUpdateState({ selected: { kind: 'video', index: cardState.videos.length - 1 } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noSelectionYet, cardState.images.length, cardState.videos.length])

  // Unified per-card output stream, newest-first.
  const entries: ModalEntry[] = []
  for (const entry of cardState.inFlightImages) {
    entries.push({ kind: 'in-flight-image', id: entry.id, createdAt: entry.startedAt, prompt: entry.prompt })
  }
  for (const entry of cardState.inFlightVideos) {
    entries.push({
      kind: 'in-flight-video',
      id: entry.id,
      createdAt: entry.startedAt,
      prompt: entry.prompt,
      mode: entry.mode === 'image-to-video' ? 'animating' : 'rendering',
    })
  }
  cardState.images.forEach((img, idx) => {
    entries.push({ kind: 'image', idx, createdAt: img.createdAt ?? 0, imageUrl: img.imageUrl, prompt: img.prompt })
  })
  cardState.videos.forEach((v, idx) => {
    entries.push({ kind: 'video', idx, createdAt: v.createdAt ?? 0, videoUrl: v.url, aspectRatio: v.aspectRatio, prompt: v.prompt, modelId: v.modelId })
  })
  entries.sort((a, b) => b.createdAt - a.createdAt)

  const inFlight = entries.filter((e) => e.kind === 'in-flight-image' || e.kind === 'in-flight-video')
  const finished = entries.filter((e) => e.kind === 'image' || e.kind === 'video')

  const dayGroups = new Map<number, ModalEntry[]>()
  for (const e of finished) {
    const day = startOfDay(e.createdAt)
    const arr = dayGroups.get(day) ?? []
    arr.push(e)
    dayGroups.set(day, arr)
  }
  const dayGroupList = Array.from(dayGroups.entries()).sort(([a], [b]) => b - a)

  const isImageSelected = (idx: number) =>
    cardState.selected?.kind === 'image' && cardState.selected.index === idx
  const isVideoSelected = (idx: number) =>
    cardState.selected?.kind === 'video' && cardState.selected.index === idx

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <ImageIcon className="h-8 w-8 text-zinc-800" strokeWidth={1.5} />
        <p className="text-sm text-zinc-500">No generations yet</p>
        <p className="max-w-[220px] text-xs leading-relaxed text-zinc-600">
          Pick a model and hit Generate. Outputs land here — click any to set
          it as the cover.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {inFlight.length > 0 && (
        <>
          <DayPill label="In progress" />
          <div className="columns-2 gap-2 [column-fill:_balance]">
            {inFlight.map((entry) => (
              <div key={entry.kind === 'in-flight-image' || entry.kind === 'in-flight-video' ? entry.id : ''} className="mb-2 break-inside-avoid">
                <InFlightTile entry={entry} />
              </div>
            ))}
          </div>
        </>
      )}

      {dayGroupList.map(([dayTs, items]) => (
        <div key={dayTs}>
          <DayPill label={dayLabel(dayTs)} />
          <div className="columns-2 gap-2 [column-fill:_balance]">
            {items.map((entry) => {
              if (entry.kind === 'image') {
                return (
                  <div key={`img-${entry.idx}`} className="mb-2 break-inside-avoid">
                    <ImageTile
                      imageRef={entry.imageUrl}
                      selected={isImageSelected(entry.idx)}
                      saved={savedImageIdxs.has(entry.idx)}
                      saving={savingImageIdxs.has(entry.idx)}
                      onClick={() => {
                        onUpdateState({ selected: { kind: 'image', index: entry.idx }, currentImageIndex: entry.idx })
                        setTab('image')
                      }}
                      onSave={() => onSaveImage(entry.idx)}
                      onDelete={() => onDeleteImage(entry.idx)}
                      onCopyPrompt={() => onCopyPrompt(entry.prompt)}
                    />
                  </div>
                )
              }
              if (entry.kind === 'video') {
                return (
                  <div key={`vid-${entry.idx}`} className="mb-2 break-inside-avoid">
                    <VideoTile
                      videoRef={entry.videoUrl}
                      aspectRatio={entry.aspectRatio}
                      modelId={entry.modelId}
                      selected={isVideoSelected(entry.idx)}
                      saved={savedVideoIdxs.has(entry.idx)}
                      saving={savingVideoIdxs.has(entry.idx)}
                      onClick={() => {
                        onUpdateState({ selected: { kind: 'video', index: entry.idx }, currentVideoIndex: entry.idx })
                        setTab('video')
                      }}
                      onSave={() => onSaveVideo(entry.idx)}
                      onDelete={() => onDeleteVideo(entry.idx)}
                      onCopyPrompt={() => onCopyPrompt(entry.prompt)}
                    />
                  </div>
                )
              }
              return null
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tiles ──────────────────────────────────────────────────────────────

// Common hover-reveal layout: trash top-right, action row bottom-right with
// Download / Bookmark+text / Copy prompt. Icons sized at h-4 w-4 (bigger
// than the previous h-3 w-3) so they're easier to hit.
function ImageTile({
  imageRef,
  selected,
  saved,
  saving,
  onClick,
  onSave,
  onDelete,
  onCopyPrompt,
}: {
  imageRef: string
  selected: boolean
  saved: boolean
  saving: boolean
  onClick: () => void
  onSave: () => void
  onDelete: () => void
  onCopyPrompt: () => void
}) {
  const { url, status } = useAssetUrlState(imageRef)
  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-black transition-colors ${
        selected
          ? 'border-orange-500/70 ring-2 ring-orange-500/40'
          : 'border-white/10 hover:border-white/30'
      }`}
    >
      {status === 'ready' && url ? (
        <img src={url} alt="" className="block h-auto w-full" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center">
          {status === 'loading' ? <Loader2 className="h-5 w-5 animate-spin text-zinc-500" /> : <ImageIcon className="h-6 w-6 text-zinc-700" />}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
      {selected && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-orange-500/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-orange-50 backdrop-blur">
          Cover
        </span>
      )}
      {/* Top-right trash — appears on hover */}
      <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <TileIconButton title="Delete" tone="danger" onClick={(e) => { e.stopPropagation(); onDelete() }}>
          <Trash2 className="h-4 w-4" />
        </TileIconButton>
      </div>
      {/* Bottom-right: Copy prompt · Bookmark+text · Download */}
      <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <TileIconButton title="Copy prompt" onClick={(e) => { e.stopPropagation(); onCopyPrompt() }}>
          <Copy className="h-4 w-4" />
        </TileIconButton>
        <TileTextButton
          tone={saved ? 'saved' : 'default'}
          onClick={(e) => { e.stopPropagation(); if (!saved && !saving) onSave() }}
        >
          {saved ? <Check className="h-4 w-4" /> : saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
          <span>{saved ? 'Saved' : 'Save to Bank'}</span>
        </TileTextButton>
        <TileIconButton
          title="Download"
          onClick={async (e) => {
            e.stopPropagation()
            const u = await getUrl(imageRef)
            if (u) downloadFile(u, `broll-${Date.now()}.png`)
          }}
        >
          <Download className="h-4 w-4" />
        </TileIconButton>
      </div>
    </div>
  )
}

function VideoTile({
  videoRef,
  aspectRatio,
  modelId,
  selected,
  saved,
  saving,
  onClick,
  onSave,
  onDelete,
  onCopyPrompt,
}: {
  videoRef: string
  aspectRatio: string
  modelId: string
  selected: boolean
  saved: boolean
  saving: boolean
  onClick: () => void
  onSave: () => void
  onDelete: () => void
  onCopyPrompt: () => void
}) {
  const url = useAssetUrl(videoRef)
  const [hovering, setHovering] = useState(false)
  const ratio = aspectStyle(aspectRatio)
  const modelLabel = getModel(modelId)?.displayName ?? modelId
  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onClick}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-black transition-colors ${
        selected
          ? 'border-orange-500/70 ring-2 ring-orange-500/40'
          : 'border-white/10 hover:border-white/30'
      }`}
      style={ratio}
    >
      {url ? (
        <video
          src={url}
          muted
          loop
          playsInline
          autoPlay={hovering}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      )}
      {!hovering && url && (
        <div className="pointer-events-none absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60">
          <Play className="h-3 w-3 fill-white text-white" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
      <p className="pointer-events-none absolute inset-x-2 bottom-1 line-clamp-1 text-[10px] text-zinc-300/90">{modelLabel}</p>
      {selected && (
        <span className="pointer-events-none absolute left-1.5 bottom-1.5 rounded-full bg-orange-500/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-orange-50 backdrop-blur">
          Cover
        </span>
      )}
      {/* Top-right trash */}
      <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <TileIconButton title="Delete" tone="danger" onClick={(e) => { e.stopPropagation(); onDelete() }}>
          <Trash2 className="h-4 w-4" />
        </TileIconButton>
      </div>
      {/* Bottom-right: Copy prompt · Bookmark+text · Download */}
      <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <TileIconButton title="Copy prompt" onClick={(e) => { e.stopPropagation(); onCopyPrompt() }}>
          <Copy className="h-4 w-4" />
        </TileIconButton>
        <TileTextButton
          tone={saved ? 'saved' : 'default'}
          onClick={(e) => { e.stopPropagation(); if (!saved && !saving) onSave() }}
        >
          {saved ? <Check className="h-4 w-4" /> : saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
          <span>{saved ? 'Saved' : 'Save to Bank'}</span>
        </TileTextButton>
        <TileIconButton
          title="Download"
          onClick={async (e) => {
            e.stopPropagation()
            const u = await getUrl(videoRef)
            if (u) downloadFile(u, `broll-${Date.now()}.mp4`)
          }}
        >
          <Download className="h-4 w-4" />
        </TileIconButton>
      </div>
    </div>
  )
}

function InFlightTile({ entry }: { entry: ModalEntry }) {
  if (entry.kind !== 'in-flight-image' && entry.kind !== 'in-flight-video') return null
  const isVideo = entry.kind === 'in-flight-video'
  const Icon = isVideo ? VideoIcon : ImageIcon
  const label = isVideo
    ? (entry.kind === 'in-flight-video' && entry.mode === 'animating' ? 'animating' : 'rendering')
    : 'image'
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-green-500/30 bg-gradient-to-br from-green-500/[0.08] to-zinc-950">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-green-500/10 via-transparent to-green-500/5" />
      <div className="absolute left-1.5 top-1.5 rounded-full bg-green-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-green-100 backdrop-blur">
        {label}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <Icon className="h-5 w-5 text-green-300" />
        <GenerationProgress
          isActive
          color="bg-green-500"
          showHelper={false}
          messages={
            isVideo
              ? ['Sending request...', 'Storyboarding frames...', 'Rendering motion...', 'Finalizing the clip...']
              : ['Sending request...', 'Composing the scene...', 'Rendering details...', 'Finalizing the frame...']
          }
          className="max-w-[140px]"
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
        <p className="line-clamp-2 text-[10px] text-zinc-300">{entry.prompt}</p>
      </div>
    </div>
  )
}

// ─── Shared bits ─────────────────────────────────────────────────────────

function DayPill({ label }: { label: string }) {
  return (
    <div className="my-2 flex items-center justify-center">
      <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-zinc-300">{label}</span>
    </div>
  )
}

function TileIconButton({
  children,
  onClick,
  title,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title: string
  tone?: 'default' | 'danger'
}) {
  const toneClass = tone === 'danger'
    ? 'bg-black/60 text-zinc-300 hover:bg-red-500/30 hover:text-red-200'
    : 'bg-black/60 text-zinc-200 hover:bg-black/80'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md backdrop-blur transition-colors ${toneClass}`}
    >
      {children}
    </button>
  )
}

function TileTextButton({
  children,
  onClick,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  tone?: 'default' | 'saved'
}) {
  const toneClass = tone === 'saved'
    ? 'bg-emerald-500/40 text-emerald-100 hover:bg-emerald-500/50'
    : 'bg-black/60 text-zinc-200 hover:bg-black/80'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium backdrop-blur transition-colors ${toneClass}`}
    >
      {children}
    </button>
  )
}

function ModalTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 pb-2 pt-3 text-[13px] font-medium tracking-tight transition-colors ${
        active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {children}
      <span
        className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors ${
          active ? 'bg-zinc-100' : 'bg-transparent'
        }`}
      />
    </button>
  )
}

function IconChipButton({
  children,
  onClick,
  title,
  disabled,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  tone?: 'default' | 'emerald'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
      : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  )
}

// Reference Images slot card — Bank-picker-style. Same outer shell as
// the ModelPicker rows: rounded-xl border + bg-white/[0.02] + p-3 with an
// icon avatar on the left. Click opens the script-level BankPicker.
function ReferenceSlotCard({
  icon,
  accentClass,
  kind,
  name,
  imageRef,
  onClick,
}: {
  icon: React.ReactNode
  accentClass: string
  kind: 'Character' | 'Product'
  name?: string | null
  imageRef?: string | null
  onClick: () => void
}) {
  const url = useAssetUrl(imageRef)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]"
    >
      {url ? (
        <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accentClass}`}>
          {icon}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">{kind}</span>
        <span className={`truncate text-[13px] font-medium ${name ? 'text-zinc-100' : 'text-zinc-600'}`}>
          {name || `Select ${kind.toLowerCase()}`}
        </span>
      </div>
    </button>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dayLabel(dayTs: number): string {
  const today = startOfDay(Date.now())
  const yesterday = today - 86_400_000
  if (dayTs === today) return 'Today'
  if (dayTs === yesterday) return 'Yesterday'
  return new Date(dayTs).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

function aspectStyle(ar: string): React.CSSProperties {
  const [w, h] = ar.split(':').map(Number)
  if (!w || !h) return { aspectRatio: '9 / 16' }
  return { aspectRatio: `${w} / ${h}` }
}

async function downloadFile(url: string, fileName: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function rekeyAfterDelete(set: Set<number>, removed: number): Set<number> {
  const next = new Set<number>()
  for (const i of set) {
    if (i === removed) continue
    next.add(i > removed ? i - 1 : i)
  }
  return next
}
