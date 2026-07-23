import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  AlertCircle,
  Coins,
  Volume2,
  VolumeX,
  UserRound,
  Package,
  Link2,
  Download,
  Check,
  RefreshCw,
  Trash2,
  Copy,
  ArrowDown,
  Palette,
  Sparkles,
  Undo2,
  Redo2,
  ChevronRight,
  Star,
} from 'lucide-react'
import ConstraintChip from '../../../components/ConstraintChip'
import AspectIcon from '../../../components/AspectIcon'
import ModelPicker from '../../../components/ModelPicker'
import ModelSidePanel from '../../../components/ModelSidePanel'
import ProviderLogo from '../../../components/ProviderLogo'
import SavingsPill from '../../../components/SavingsPill'
import ExpandTextModal, { ExpandButton } from '../../../components/ExpandableText'
import { ReferenceSlotCard, ExtraRefsRow } from './cardDetailParts'
import type { ContinuousFrameCardState, ContinuousClipCardState, GeneratedVideo, ReferenceImage } from '../types'
import type { Product, Model } from '../../../stores/types'
import { CONTINUOUS_MODEL_IDS } from '../services/generateContinuous'
import { useAppStore } from '../../../stores/appStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { useCloseOnAppSwitch } from '../../../hooks/useCloseOnAppSwitch'
import {
  getModel,
  getDefaultModel,
  estimateCredits,
  formatCredits,
  videoResolutionLabel,
  imageResolutionsFor,
  officialSavingsPercent,
  snapVideoDuration,
  type ImageResolution,
} from '../../../utils/models'
import { downloadImage } from '../../../utils/downloadImage'
import { copyToClipboard } from '../../../utils/clipboard'
import { humanizeError } from '../../../utils/friendlyError'

// ── Shared modal shell ─────────────────────────────────────────

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  useCloseOnAppSwitch(true, onClose)

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
        {children}
      </div>
    </div>
  ), document.body)
}

// The storyboard-wide style block — shown read-only so the user knows what
// rides along with every prompt without being able to fork it per-frame.
function StyleNote({ style }: { style: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="flex w-full items-start gap-2 rounded-2xl border border-ink/10 bg-ink/[0.02] px-3.5 py-2.5 text-left transition-colors hover:bg-ink/[0.04]"
      title={open ? 'Collapse' : 'Show the full style block'}
    >
      <Palette className="mt-0.5 h-3.5 w-3.5 shrink-0 text-broll-300" />
      <span className={`min-w-0 flex-1 text-[11px] leading-relaxed text-ink-500 ${open ? '' : 'line-clamp-2'}`}>
        <span className="font-semibold text-ink-400">Style (applied automatically): </span>
        {style}
      </span>
    </button>
  )
}

// ── Frame modal — keyframe concept workspace ───────────────────

interface ContinuousFrameModalProps {
  frameLabel: string    // "Frame 3" / "Final Frame"
  conceptLabel: string  // the concept's staging slug
  scriptLine: string    // the narration line this frame opens ('' for final)
  style: string
  cardState: ContinuousFrameCardState
  // The previous frame's chosen keyframe (chain reference), if picked.
  chainImageRef?: string
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  selectedModel?: Model | null
  selectedProduct?: Product | null
  // Extra user-attached reference images (memory-only, like the Line-by-Line
  // card's extraRefs — data: URIs are too big to persist).
  extraRefs: ReferenceImage[]
  onAddExtraRef: (ref: ReferenceImage) => void
  onRemoveExtraRef: (index: number) => void
  // Which image (if any) of THIS concept is the frame's chosen keyframe.
  selectedImageIndex: number | null
  onSelectImage: (index: number) => void
  onClose: () => void
  onUpdate: (updater: (prev: ContinuousFrameCardState) => Partial<ContinuousFrameCardState>) => void
  onGenerate: () => void
  // Prompt tools — the LLM rewrites (kept in the view so it owns the storyboard
  // context the calls need).
  onEnhancePrompt: () => Promise<string>
  onRegeneratePrompt: () => Promise<string>
  onRetryInFlight: (id: string) => void
  onDismissInFlight: (id: string) => void
}

export function ContinuousFrameModal({
  frameLabel,
  conceptLabel,
  scriptLine,
  style,
  cardState,
  chainImageRef,
  characterRef,
  productRef,
  selectedModel,
  selectedProduct,
  extraRefs,
  onAddExtraRef,
  onRemoveExtraRef,
  selectedImageIndex,
  onSelectImage,
  onClose,
  onUpdate,
  onGenerate,
  onEnhancePrompt,
  onRegeneratePrompt,
  onRetryInFlight,
  onDismissInFlight,
}: ContinuousFrameModalProps) {
  const [draft, setDraft] = useState(cardState.editablePrompt)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [promptWorking, setPromptWorking] = useState(false)
  // Adjust-during-render sync: external prompt changes (undo, restore) reset
  // the local draft without an effect round-trip.
  const [syncedPrompt, setSyncedPrompt] = useState(cardState.editablePrompt)
  if (syncedPrompt !== cardState.editablePrompt) {
    setSyncedPrompt(cardState.editablePrompt)
    setDraft(cardState.editablePrompt)
  }

  const isBusy = cardState.inFlightImages.some((e) => !e.error)

  // Image model is the app-wide B-Roll pick (same ModelPicker as the
  // Line-by-Line card), so its constraints drive the footer chips.
  const imageModelId = useSettingsStore((s) => s.perAppModel['broll-studio:image:text-to-image'])
    ?? getDefaultModel('broll-studio', 'image', 'text-to-image')?.id
  const imageConstraints = imageModelId ? getModel(imageModelId)?.imageConstraints : undefined
  const resolutions = (imageConstraints?.resolutions ?? imageResolutionsFor(imageModelId ?? '')) as ImageResolution[]
  const aspects = imageConstraints?.aspectRatios ?? ['9:16', '1:1', '16:9', '4:3', '3:4']
  const credits = imageModelId
    ? formatCredits(estimateCredits(imageModelId, { imageCount: 1, resolution: cardState.resolution }))
    : null

  // ── Prompt history (Enhance / Regenerate / Undo / Redo) ──
  const history = cardState.promptHistory.length > 0 ? cardState.promptHistory : [cardState.editablePrompt]
  const historyIndex = Math.max(0, Math.min(cardState.promptHistoryIndex, history.length - 1))
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const pushHistory = (next: string) => {
    const trimmed = history.slice(0, historyIndex + 1)
    const updated = [...trimmed, next]
    onUpdate(() => ({ editablePrompt: next, promptHistory: updated, promptHistoryIndex: updated.length - 1 }))
    setDraft(next)
  }
  const commitDraft = () => {
    if (draft === history[historyIndex]) { onUpdate(() => ({ editablePrompt: draft })); return }
    pushHistory(draft)
  }
  const handleUndo = () => {
    if (!canUndo) return
    const i = historyIndex - 1
    onUpdate(() => ({ editablePrompt: history[i], promptHistoryIndex: i }))
    setDraft(history[i])
  }
  const handleRedo = () => {
    if (!canRedo) return
    const i = historyIndex + 1
    onUpdate(() => ({ editablePrompt: history[i], promptHistoryIndex: i }))
    setDraft(history[i])
  }
  const runPromptTool = async (tool: () => Promise<string>, label: string) => {
    if (promptWorking) return
    setPromptWorking(true)
    try {
      const next = await tool()
      if (next.trim()) pushHistory(next.trim())
    } catch (err) {
      useAppStore.getState().addToast(`${label} failed: ${humanizeError(err, `${label} failed.`)}`, 'error')
    } finally {
      setPromptWorking(false)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        {/* LEFT — model + refs + prompt over a pinned Generate footer */}
        <div className="col-span-1 flex min-h-0 flex-col border-b border-ink/5 md:border-b-0 md:border-r">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex grow flex-col gap-3 px-5 pb-6 pt-4">
              {/* Image model — the same app-wide picker the Line-by-Line card
                  uses, so a model swap applies across the whole storyboard. */}
              <ModelPicker appId="broll-studio" task="image" mode="text-to-image" />

              <StyleNote style={style} />

              {/* Reference toggles — the chain ref (previous keyframe) is the
                  continuity lock; character/product fix identity. */}
              {(chainImageRef || characterRef || productRef) && (
                <div className="grid grid-cols-2 gap-2">
                  {chainImageRef && (
                    <ReferenceSlotCard
                      icon={<Link2 className="h-4 w-4 text-broll-300" />}
                      accentClass="bg-broll-500/15 text-broll-300"
                      kind="Previous frame"
                      name="Chain link"
                      imageRef={chainImageRef}
                      onClick={() => onUpdate((p) => ({ chainLink: !p.chainLink }))}
                      active={cardState.chainLink}
                      onToggleActive={() => onUpdate((p) => ({ chainLink: !p.chainLink }))}
                    />
                  )}
                  {characterRef && (
                    <ReferenceSlotCard
                      icon={<UserRound className="h-4 w-4 text-influencers-400 light:text-influencers-600" />}
                      accentClass="bg-influencers-500/15 text-influencers-400 light:text-influencers-600"
                      kind="Character"
                      name={selectedModel?.name}
                      imageRef={characterRef.dataUrl}
                      onClick={() => onUpdate((p) => ({ refsCharacter: !p.refsCharacter }))}
                      active={cardState.refsCharacter}
                      onToggleActive={() => onUpdate((p) => ({ refsCharacter: !p.refsCharacter }))}
                    />
                  )}
                  {productRef && (
                    <ReferenceSlotCard
                      icon={<Package className="h-4 w-4 text-gold-400 light:text-gold-600" />}
                      accentClass="bg-gold-500/15 text-gold-400 light:text-gold-600"
                      kind="Product"
                      name={selectedProduct?.productName}
                      imageRef={productRef.dataUrl}
                      onClick={() => onUpdate((p) => ({ refsProduct: !p.refsProduct }))}
                      active={cardState.refsProduct}
                      onToggleActive={() => onUpdate((p) => ({ refsProduct: !p.refsProduct }))}
                    />
                  )}
                </div>
              )}

              {/* Extra references — attach more (a prop, a location, a pose). */}
              <ExtraRefsRow refs={extraRefs} onAdd={onAddExtraRef} onRemove={onRemoveExtraRef} />

              {/* Prompt — the keyframe description, with the same toolbar the
                  Line-by-Line card carries. */}
              <div className="flex grow flex-col">
                <div className="relative flex grow flex-col overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.03] transition-colors focus-within:border-ink/20 focus-within:bg-ink/[0.05]">
                  <textarea
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); onUpdate(() => ({ editablePrompt: e.target.value })) }}
                    onBlur={commitDraft}
                    rows={10}
                    placeholder="Describe this keyframe as one paragraph — what's in frame, the light, the framing…"
                    className="relative min-h-[200px] w-full grow resize-none border-0 bg-transparent px-3.5 pb-3 pt-3 text-[13px] leading-relaxed text-ink-200 placeholder-ink-600 outline-none"
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-ink/10 px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        title="Enhance — same staging, richer detail"
                        onClick={() => void runPromptTool(onEnhancePrompt, 'Enhance')}
                        disabled={promptWorking || !draft.trim()}
                        className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium text-ink-400 transition-colors hover:bg-broll-500/10 hover:text-broll-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {promptWorking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        Enhance Prompt
                      </button>
                      <button
                        type="button"
                        title="Regenerate — a fresh staging for this keyframe"
                        onClick={() => void runPromptTool(onRegeneratePrompt, 'Regenerate')}
                        disabled={promptWorking}
                        className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium text-ink-400 transition-colors hover:bg-ink/[0.06] hover:text-ink-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Regenerate Prompt
                      </button>
                      <button
                        type="button"
                        title="Undo"
                        onClick={handleUndo}
                        disabled={!canUndo || promptWorking}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink/[0.06] hover:text-ink-200 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Undo2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="Redo"
                        onClick={handleRedo}
                        disabled={!canRedo || promptWorking}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink/[0.06] hover:text-ink-200 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Redo2 className="h-3 w-3" />
                      </button>
                    </div>
                    <ExpandButton onClick={() => setPromptExpanded(true)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pinned footer — output settings + Generate, matching the
              Line-by-Line card modal. */}
          <div className="shrink-0 border-t border-ink/5 px-5 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {resolutions.length > 0 && (
                <ConstraintChip
                  grow
                  openDirection="up"
                  options={resolutions as string[]}
                  value={cardState.resolution}
                  onChange={(v) => onUpdate(() => ({ resolution: v as ImageResolution }))}
                  render={(v) => {
                    const c = imageModelId ? formatCredits(estimateCredits(imageModelId, { imageCount: 1, resolution: v as ImageResolution })) : null
                    return <span>{v}{c ? ` · ${c}` : ''}</span>
                  }}
                />
              )}
              {aspects.length > 0 && (
                <ConstraintChip
                  grow
                  openDirection="up"
                  options={aspects}
                  value={cardState.aspectRatio}
                  onChange={(v) => onUpdate(() => ({ aspectRatio: v }))}
                  render={(v) => (
                    <span className="flex items-center gap-1.5">
                      <AspectIcon ratio={v} />
                      <span>{v}</span>
                    </span>
                  )}
                />
              )}
            </div>
            <button
              onClick={onGenerate}
              disabled={!cardState.editablePrompt.trim()}
              className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-broll-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-broll-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              Generate Image
              {credits && !isBusy && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold tracking-tight">
                  <Coins className="h-3 w-3" strokeWidth={2} />
                  {credits}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT — header + image gallery */}
        <div className="col-span-1 flex min-h-0 flex-col overflow-hidden">
          <div className="flex flex-col gap-3 px-5 pt-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-full border border-ink/10 bg-ink/[0.03] px-2 py-0.5 text-[10px] font-medium uppercase leading-none tracking-wider text-ink-400">
                  {frameLabel}
                </span>
                <span className="rounded-full border border-ink/10 bg-ink/[0.03] px-2 py-0.5 text-[10px] font-medium uppercase leading-none tracking-wider text-ink-400">
                  {conceptLabel}
                </span>
              </div>
              {scriptLine && (
                <>
                  <div className="h-7 w-px shrink-0 bg-ink/10" />
                  <span
                    className="min-w-0 flex-1 truncate text-[15px] leading-none text-ink-300"
                    style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
                    title={scriptLine}
                  >
                    &ldquo;{scriptLine}&rdquo;
                  </span>
                </>
              )}
            </div>
            <div className="-mx-5 border-b border-ink/5" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {cardState.images.length === 0 && cardState.inFlightImages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <ImageIcon className="h-9 w-9 text-ink-800" strokeWidth={1.5} />
                <p className="text-xs text-ink-600">No images yet — hit Generate, then click one to make it the keyframe.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {cardState.inFlightImages.map((entry) =>
                  entry.error ? (
                    <div key={entry.id} className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400 light:text-red-600" />
                      <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-red-300 light:text-red-700">{entry.error}</p>
                      <button type="button" title="Retry" onClick={() => onRetryInFlight(entry.id)} className="shrink-0 rounded-full p-1 text-ink-400 hover:bg-ink/10 hover:text-ink-200"><RefreshCw className="h-3.5 w-3.5" /></button>
                      <button type="button" title="Dismiss" onClick={() => onDismissInFlight(entry.id)} className="shrink-0 rounded-full p-1 text-ink-400 hover:bg-ink/10 hover:text-ink-200"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <div key={entry.id} className="flex items-center gap-2 rounded-xl border border-ink/5 bg-ink/[0.02] px-3 py-2.5">
                      <Loader2 className="h-4 w-4 animate-spin text-broll-300" />
                      <p className="text-[11px] text-ink-500">Generating the keyframe… survives a refresh.</p>
                    </div>
                  ),
                )}
                <div className="grid grid-cols-2 gap-3">
                  {cardState.images.map((image, i) => (
                    <FrameImageTile
                      key={`${image.imageUrl}-${i}`}
                      imageRef={image.imageUrl}
                      isKeyframe={selectedImageIndex === i}
                      onSelect={() => onSelectImage(i)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ExpandTextModal
        open={promptExpanded}
        onClose={() => setPromptExpanded(false)}
        value={draft}
        onChange={(v) => { setDraft(v); onUpdate(() => ({ editablePrompt: v })) }}
        title={`${frameLabel} — Keyframe prompt`}
        placeholder="Describe this keyframe…"
        accent="broll"
      />
    </ModalShell>
  )
}

function FrameImageTile({ imageRef, isKeyframe, onSelect }: {
  imageRef: string
  isKeyframe: boolean
  onSelect: () => void
}) {
  const url = useAssetUrl(imageRef)
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const resolved = await getUrl(imageRef)
    if (!resolved) { useAppStore.getState().addToast('Could not load the image.', 'error'); return }
    await downloadImage(resolved, 'continuous-keyframe', 'png')
  }
  return (
    <div
      onClick={onSelect}
      title={isKeyframe ? 'This is the keyframe' : 'Use as the keyframe'}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-black transition-all ${
        isKeyframe ? 'border-broll-400 ring-2 ring-broll-500/40' : 'border-ink/10 hover:border-ink/25'
      }`}
    >
      {url ? (
        <img src={url} alt="Keyframe option" className="aspect-[9/16] w-full object-cover" />
      ) : (
        <div className="flex aspect-[9/16] w-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-white/40" /></div>
      )}
      {isKeyframe && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-broll-500 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
          <Check className="h-2.5 w-2.5" strokeWidth={3} /> Keyframe
        </span>
      )}
      <div className="pointer-events-none absolute right-1.5 top-1.5 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" title="Download" onClick={handleDownload} className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"><Download className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}

// ── Clip modal — frames-to-video workspace ─────────────────────

interface ContinuousClipModalProps {
  clipLabel: string     // "Clip 2"
  scriptLine: string
  style: string
  cardState: ContinuousClipCardState
  modelId: string
  startImageRef?: string
  endImageRef?: string
  onClose: () => void
  onUpdate: (updater: (prev: ContinuousClipCardState) => Partial<ContinuousClipCardState>) => void
  onGenerate: () => void
  onDeleteVideo: (index: number) => void
  onRetryInFlight: (id: string) => void
  onDismissInFlight: (id: string) => void
}

export function ContinuousClipModal({
  clipLabel,
  scriptLine,
  style,
  cardState,
  modelId,
  startImageRef,
  endImageRef,
  onClose,
  onUpdate,
  onGenerate,
  onDeleteVideo,
  onRetryInFlight,
  onDismissInFlight,
}: ContinuousClipModalProps) {
  const [draft, setDraft] = useState(cardState.editablePrompt)
  const [promptExpanded, setPromptExpanded] = useState(false)
  // Adjust-during-render sync — same pattern as the frame modal above.
  const [syncedPrompt, setSyncedPrompt] = useState(cardState.editablePrompt)
  if (syncedPrompt !== cardState.editablePrompt) {
    setSyncedPrompt(cardState.editablePrompt)
    setDraft(cardState.editablePrompt)
  }

  const [modelPanelOpen, setModelPanelOpen] = useState(false)

  const model = getModel(modelId)
  const constraints = model?.videoConstraints
  const isBusy = cardState.inFlightVideos.some((e) => !e.error)
  const framesReady = !!startImageRef && !!endImageRef
  const credits = formatCredits(estimateCredits(modelId, {
    durationSeconds: cardState.durationSeconds,
    resolution: cardState.resolution,
    audio: cardState.audio,
  }))

  // Clamp this clip's settings onto the active model's grid whenever the model
  // changes, so the chips never offer something the model can't render.
  const [syncedModel, setSyncedModel] = useState(modelId)
  if (syncedModel !== modelId) {
    setSyncedModel(modelId)
    if (constraints) {
      const updates: Partial<ContinuousClipCardState> = {}
      if (!constraints.resolutions.includes(cardState.resolution)) {
        updates.resolution = constraints.default ?? constraints.resolutions[0]
      }
      const snapped = snapVideoDuration(cardState.durationSeconds, constraints.durations)
      if (snapped !== cardState.durationSeconds) updates.durationSeconds = snapped
      if (Object.keys(updates).length) onUpdate(() => updates)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        {/* LEFT — model + endpoints + motion prompt over a pinned Generate footer */}
        <div className="col-span-1 flex min-h-0 flex-col border-b border-ink/5 md:border-b-0 md:border-r">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex grow flex-col gap-3 px-5 pb-6 pt-4">
              {/* Video model — picked HERE rather than in the left input panel:
                  the model only matters once there are keyframes to animate.
                  Frames-to-video capable models only. */}
              <button
                type="button"
                onClick={() => setModelPanelOpen(true)}
                className="flex h-12 w-full items-center gap-2.5 rounded-full border border-ink/10 bg-ink/[0.02] px-3 text-left transition-colors hover:bg-ink/[0.05]"
              >
                {model ? (
                  <>
                    <ProviderLogo provider={model.provider ?? ''} />
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-ink-100">{model.displayName}</span>
                      {model.tags.includes('recommended') && (
                        <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400 light:fill-yellow-600 light:text-yellow-600" strokeWidth={1.5} />
                      )}
                      {officialSavingsPercent(modelId) != null && <SavingsPill pct={officialSavingsPercent(modelId)!} />}
                    </div>
                  </>
                ) : (
                  <span className="flex-1 truncate text-sm text-ink-400">Select model</span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />
              </button>
              <ModelSidePanel
                appId="broll-studio"
                task="video"
                allowedModelIds={CONTINUOUS_MODEL_IDS}
                value={modelId}
                onChange={(id) => useSettingsStore.getState().setAppModel('broll-studio:continuous:video', id)}
                isOpen={modelPanelOpen}
                onClose={() => setModelPanelOpen(false)}
                requireMode="frames-to-video"
                requireModeNote="Continuous clips interpolate between two keyframes, so only frame-to-frame models are offered."
                costParams={{
                  durationSeconds: cardState.durationSeconds,
                  resolution: cardState.resolution,
                  audio: cardState.audio,
                }}
              />

              {/* Start → end keyframes this clip interpolates between. */}
              <div className="flex items-center gap-3">
                <EndpointThumb label="Start frame" imageRef={startImageRef} />
                <ArrowDown className="h-4 w-4 shrink-0 -rotate-90 text-ink-500" />
                <EndpointThumb label="End frame" imageRef={endImageRef} />
              </div>
              {!framesReady && (
                <p className="text-[11px] leading-relaxed text-amber-300 light:text-amber-700">
                  Pick a keyframe for both ends of this clip first — click an image on each frame card.
                </p>
              )}

              <StyleNote style={style} />

              {/* Motion prompt — the transition between the two keyframes. */}
              <div className="flex grow flex-col">
                <div className="relative flex grow flex-col overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.03] transition-colors focus-within:border-ink/20 focus-within:bg-ink/[0.05]">
                  <textarea
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); onUpdate(() => ({ editablePrompt: e.target.value })) }}
                    rows={8}
                    placeholder="Describe the motion from the start frame to the end frame, plus the SFX…"
                    className="relative min-h-[160px] w-full grow resize-none border-0 bg-transparent px-3.5 pb-3 pt-3 text-[13px] leading-relaxed text-ink-200 placeholder-ink-600 outline-none"
                  />
                  <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-2 py-1.5">
                    <ExpandButton onClick={() => setPromptExpanded(true)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-ink/5 px-5 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {constraints && (
                <>
                  <ConstraintChip
                    grow
                    openDirection="up"
                    options={constraints.resolutions}
                    value={cardState.resolution}
                    onChange={(v) => onUpdate(() => ({ resolution: v }))}
                    render={videoResolutionLabel}
                  />
                  {constraints.durations.length > 0 && (
                    <ConstraintChip
                      grow
                      openDirection="up"
                      options={constraints.durations.map(String)}
                      value={String(cardState.durationSeconds)}
                      onChange={(v) => onUpdate(() => ({ durationSeconds: Number(v) }))}
                      render={(v) => <span>{v}s</span>}
                    />
                  )}
                  {(constraints.supportsAudio ?? false) && (
                    <ConstraintChip
                      grow
                      openDirection="up"
                      options={['Audio', 'Mute']}
                      value={cardState.audio ? 'Audio' : 'Mute'}
                      onChange={(v) => onUpdate(() => ({ audio: v === 'Audio' }))}
                      triggerClassName={cardState.audio
                        ? 'border-broll-500/40 bg-broll-500/15 text-broll-200'
                        : 'border-ink/10 bg-ink/[0.02] text-ink-400 group-hover:bg-ink/[0.05]'}
                      render={(v) => (
                        <span className="flex items-center gap-1.5">
                          {v === 'Audio' ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                          <span>{v}</span>
                        </span>
                      )}
                    />
                  )}
                </>
              )}
            </div>
            <button
              onClick={onGenerate}
              disabled={!framesReady || !cardState.editablePrompt.trim() || isBusy}
              className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-broll-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-broll-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <VideoIcon className="h-4 w-4" />}
              Generate Video
              {credits && !isBusy && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold tracking-tight">
                  <Coins className="h-3 w-3" strokeWidth={2} />
                  {credits}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT — header + video gallery */}
        <div className="col-span-1 flex min-h-0 flex-col overflow-hidden">
          <div className="flex flex-col gap-3 px-5 pt-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0 rounded-full border border-ink/10 bg-ink/[0.03] px-2 py-0.5 text-[10px] font-medium uppercase leading-none tracking-wider text-ink-400">
                {clipLabel}
              </span>
              <div className="h-7 w-px shrink-0 bg-ink/10" />
              <span
                className="min-w-0 flex-1 truncate text-[15px] leading-none text-ink-300"
                style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
                title={scriptLine}
              >
                &ldquo;{scriptLine}&rdquo;
              </span>
            </div>
            <div className="-mx-5 border-b border-ink/5" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {cardState.videos.length === 0 && cardState.inFlightVideos.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <VideoIcon className="h-9 w-9 text-ink-800" strokeWidth={1.5} />
                <p className="text-xs text-ink-600">No videos yet — hit Generate to animate between the keyframes.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {cardState.inFlightVideos.map((entry) =>
                  entry.error ? (
                    <div key={entry.id} className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400 light:text-red-600" />
                      <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-red-300 light:text-red-700">{entry.error}</p>
                      <button type="button" title="Retry" onClick={() => onRetryInFlight(entry.id)} className="shrink-0 rounded-full p-1 text-ink-400 hover:bg-ink/10 hover:text-ink-200"><RefreshCw className="h-3.5 w-3.5" /></button>
                      <button type="button" title="Dismiss" onClick={() => onDismissInFlight(entry.id)} className="shrink-0 rounded-full p-1 text-ink-400 hover:bg-ink/10 hover:text-ink-200"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <div key={entry.id} className="flex items-center gap-2 rounded-xl border border-ink/5 bg-ink/[0.02] px-3 py-2.5">
                      <Loader2 className="h-4 w-4 animate-spin text-broll-300" />
                      <p className="text-[11px] text-ink-500">Rendering with {getModel(entry.modelId)?.displayName ?? entry.modelId}… survives a refresh.</p>
                    </div>
                  ),
                )}
                <div className="grid grid-cols-2 gap-3">
                  {cardState.videos.map((video, i) => (
                    <ClipVideoTile key={`${video.url}-${i}`} video={video} onDelete={() => onDeleteVideo(i)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ExpandTextModal
        open={promptExpanded}
        onClose={() => setPromptExpanded(false)}
        value={draft}
        onChange={(v) => { setDraft(v); onUpdate(() => ({ editablePrompt: v })) }}
        title={`${clipLabel} — Motion prompt`}
        placeholder="Describe the motion from the start frame to the end frame…"
        accent="broll"
      />
    </ModalShell>
  )
}

function EndpointThumb({ label, imageRef }: { label: string; imageRef?: string }) {
  const url = useAssetUrl(imageRef ?? '')
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-ink/10 bg-ink/[0.02] p-2">
      {imageRef && url ? (
        <img src={url} alt={label} className="h-14 w-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-14 w-9 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05]">
          <ImageIcon className="h-3.5 w-3.5 text-ink-600" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-ink-500">{label}</p>
        <p className="truncate text-[11px] text-ink-400">{imageRef ? 'Keyframe picked' : 'Not picked yet'}</p>
      </div>
    </div>
  )
}

function ClipVideoTile({ video, onDelete }: { video: GeneratedVideo; onDelete: () => void }) {
  const url = useAssetUrl(video.url)
  const [copied, setCopied] = useState(false)
  const handleDownload = async () => {
    const resolved = await getUrl(video.url)
    if (!resolved) { useAppStore.getState().addToast('Could not load the video.', 'error'); return }
    await downloadImage(resolved, 'continuous-clip', 'mp4')
  }
  const handleCopy = async () => {
    if (await copyToClipboard(video.prompt)) { setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
  }
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-ink/10 bg-black">
      {url ? (
        <video src={url} controls playsInline preload="metadata" className="aspect-[9/16] w-full object-cover" />
      ) : (
        <div className="flex aspect-[9/16] w-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-white/40" /></div>
      )}
      <div className="pointer-events-none absolute right-1.5 top-1.5 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" title="Download" onClick={handleDownload} className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"><Download className="h-3.5 w-3.5" /></button>
        <button type="button" title="Copy prompt" onClick={handleCopy} className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
        <button type="button" title="Delete" onClick={onDelete} className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-red-500/80"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium tabular-nums text-white backdrop-blur-sm">{video.durationSeconds}s</span>
    </div>
  )
}
