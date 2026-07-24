import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Video as VideoIcon,
  Loader2,
  AlertCircle,
  Coins,
  Volume2,
  VolumeX,
  UserRound,
  Package,
  Download,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Clapperboard,
  Sparkles,
  Undo2,
  Redo2,
  ChevronRight,
  Star,
} from 'lucide-react'
import ModelSidePanel from '../../../components/ModelSidePanel'
import SegmentedToggle from '../../../components/SegmentedToggle'
import ProviderLogo from '../../../components/ProviderLogo'
import SavingsPill from '../../../components/SavingsPill'
import ConstraintChip from '../../../components/ConstraintChip'
import AspectIcon from '../../../components/AspectIcon'
import ExpandTextModal, { ExpandButton } from '../../../components/ExpandableText'
import { ReferenceSlotCard, ExtraRefsRow, PendingMediaTile } from './cardDetailParts'
import type { OneShotSegment, OneShotCardState, GeneratedVideo, ReferenceImage } from '../types'
import type { Product, Model } from '../../../stores/types'
import { ONE_SHOT_MODEL_IDS, ONE_SHOT_ENABLED_MODEL_IDS, enhanceOneShotClip, regenerateOneShotClip } from '../services/generateOneShot'
import { useAppStore } from '../../../stores/appStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { useCloseOnAppSwitch } from '../../../hooks/useCloseOnAppSwitch'
import {
  getModel,
  estimateCredits,
  formatCredits,
  videoResolutionLabel,
  snapVideoDuration,
  officialSavingsPercent,
} from '../../../utils/models'
import { downloadImage } from '../../../utils/downloadImage'
import { copyToClipboard } from '../../../utils/clipboard'
import { humanizeError } from '../../../utils/friendlyError'

interface OneShotDetailModalProps {
  segment: OneShotSegment
  conceptAngle: string // the internal angle slug — grounds Enhance / Regenerate
  conceptLabel: string // display label, e.g. "Variation 1"
  clipLabel: string // "Clip 2" for multi-clip concepts, else ""
  delivery: 'dialogue' | 'silent'
  cardState: OneShotCardState
  oneShotModelId: string
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  selectedModel?: Model | null
  selectedProduct?: Product | null
  // Plain-text context strings — ground the Enhance / Regenerate LLM calls.
  productContext?: string
  modelContext?: string
  // Extra user-attached reference images (beyond the bank-keyed refs), memory-only.
  extraRefs: ReferenceImage[]
  onAddExtraRef: (ref: ReferenceImage) => void
  onRemoveExtraRef: (index: number) => void
  onClose: () => void
  onUpdate: (updater: (prev: OneShotCardState) => Partial<OneShotCardState>) => void
  onGenerate: () => void
  onDeleteVideo: (index: number) => void
  onRetryInFlight: (id: string) => void
  onDismissInFlight: (id: string) => void
}

// Video-only per-clip workspace — the One Shot analogue of CardDetailModal.
// Left column: model picker + reference toggles + prompt editor + settings +
// Generate. Right column: this clip's rendered videos and in-flight rows.
export default function OneShotDetailModal({
  segment,
  conceptAngle,
  conceptLabel,
  clipLabel,
  delivery,
  cardState,
  oneShotModelId,
  characterRef,
  productRef,
  selectedModel,
  selectedProduct,
  productContext,
  modelContext,
  extraRefs,
  onAddExtraRef,
  onRemoveExtraRef,
  onClose,
  onUpdate,
  onGenerate,
  onDeleteVideo,
  onRetryInFlight,
  onDismissInFlight,
}: OneShotDetailModalProps) {
  const [draft, setDraft] = useState(cardState.editablePrompt)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [promptWorking, setPromptWorking] = useState(false)
  const [modelPanelOpen, setModelPanelOpen] = useState(false)

  useEffect(() => { setDraft(cardState.editablePrompt) }, [cardState.editablePrompt])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  useCloseOnAppSwitch(true, onClose)

  const model = getModel(oneShotModelId)
  const constraints = model?.videoConstraints
  const modelSupportsRefs = !!model?.modes?.includes('reference-to-video')
  const hasRefs = (!!characterRef && cardState.refsCharacter) || (!!productRef && cardState.refsProduct)

  // Clamp settings to the active model's grid when the model changes so the
  // chips never show an option the model can't do.
  useEffect(() => {
    if (!constraints) return
    const updates: Partial<OneShotCardState> = {}
    if (!constraints.resolutions.includes(cardState.resolution)) {
      updates.resolution = constraints.default ?? constraints.resolutions[0]
    }
    if (constraints.aspectRatios.length > 0 && !constraints.aspectRatios.includes(cardState.aspectRatio)) {
      updates.aspectRatio = constraints.aspectRatios[0]
    }
    const snapped = snapVideoDuration(cardState.durationSeconds, constraints.durations)
    if (snapped !== cardState.durationSeconds) updates.durationSeconds = snapped
    if (Object.keys(updates).length) onUpdate(() => updates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneShotModelId])

  const credits = formatCredits(estimateCredits(oneShotModelId, {
    durationSeconds: cardState.durationSeconds,
    resolution: cardState.resolution,
    audio: cardState.audio,
  }))
  const audioTogglable = oneShotModelId !== 'gemini-omni-video' && (constraints?.supportsAudio ?? false)
  const isBusy = cardState.inFlightVideos.some((e) => !e.error)

  // ── Blueprint prompt history (Enhance / Regenerate / Undo / Redo) ──
  const history = cardState.promptHistory.length > 0 ? cardState.promptHistory : [cardState.editablePrompt]
  const historyIndex = Math.max(0, Math.min(cardState.promptHistoryIndex, history.length - 1))
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const pushHistory = (newPrompt: string) => {
    const truncated = history.slice(0, historyIndex + 1)
    const next = [...truncated, newPrompt]
    onUpdate(() => ({ editablePrompt: newPrompt, promptHistory: next, promptHistoryIndex: next.length - 1 }))
    setDraft(newPrompt)
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
  const clipCtx = { angle: conceptAngle, excerpt: segment.scriptExcerpt, delivery, productContext, modelContext }
  const handleEnhance = async () => {
    if (promptWorking || !draft.trim()) return
    setPromptWorking(true)
    try {
      pushHistory(await enhanceOneShotClip(draft, clipCtx))
    } catch (err) {
      useAppStore.getState().addToast(`Enhance failed: ${humanizeError(err, 'Enhance failed.')}`, 'error')
    } finally {
      setPromptWorking(false)
    }
  }
  const handleRegenerate = async () => {
    if (promptWorking) return
    setPromptWorking(true)
    try {
      pushHistory(await regenerateOneShotClip(clipCtx))
    } catch (err) {
      useAppStore.getState().addToast(`Regenerate failed: ${humanizeError(err, 'Regenerate failed.')}`, 'error')
    } finally {
      setPromptWorking(false)
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
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-ink/10 bg-ink-950/95 shadow-2xl"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          {/* LEFT — controls over a pinned Generate footer */}
          <div className="col-span-1 flex min-h-0 flex-col border-b border-ink/5 md:border-b-0 md:border-r">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="flex grow flex-col gap-3 px-5 pb-6 pt-4">
                {/* Output-type tab — One-Shot renders a whole clip. Styled as
                    the Line-by-Line segmented toggle, single option; separator
                    aligns with the right header. */}
                <SegmentedToggle
                  className="h-10 !p-1"
                  value="video"
                  onChange={() => {}}
                  options={[{ value: 'video', label: 'Video', icon: VideoIcon }]}
                />
                <div className="-mx-5 -mt-1 border-b border-ink/5" />

                {/* Model picker — slide-in side panel (like CardDetailModal's
                    video model), controlled so it persists to the One-Shot key. */}
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
                        {officialSavingsPercent(oneShotModelId) != null && (
                          <SavingsPill pct={officialSavingsPercent(oneShotModelId)!} />
                        )}
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
                  allowedModelIds={ONE_SHOT_MODEL_IDS}
                  enabledModelIds={ONE_SHOT_ENABLED_MODEL_IDS}
                  value={oneShotModelId}
                  onChange={(id) => useSettingsStore.getState().setAppModel('broll-studio:oneshot:video', id)}
                  isOpen={modelPanelOpen}
                  onClose={() => setModelPanelOpen(false)}
                  requireMode={hasRefs ? 'reference-to-video' : undefined}
                  requireModeNote="Greyed-out models aren't built for One-Shot's ref + audio multi-cut — they'd drop your refs and render a plain text-to-video clip."
                  costParams={{ durationSeconds: cardState.durationSeconds, resolution: cardState.resolution, audio: cardState.audio }}
                />

                {/* Reference slot cards — same chrome as CardDetailModal; the
                    whole card and the tick both toggle whether the ref is sent
                    (the product/character themselves are picked in the left
                    input panel, so there's no bank picker to open here). */}
                {(characterRef || productRef) && (
                  <div>
                    <div className="grid grid-cols-2 gap-2">
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
                          dimmed={!modelSupportsRefs}
                          dimmedReason={`${model?.displayName ?? 'This model'} doesn't accept reference images.`}
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
                          dimmed={!modelSupportsRefs}
                          dimmedReason={`${model?.displayName ?? 'This model'} doesn't accept reference images.`}
                        />
                      )}
                    </div>
                    {hasRefs && !modelSupportsRefs && (
                      <p className="mt-2 text-[11px] leading-relaxed text-amber-300 light:text-amber-700">
                        {model?.displayName ?? 'This model'} can't take reference images — this clip renders text-to-video, matching your refs by description only.
                      </p>
                    )}
                  </div>
                )}

                {/* Extra reference images — attach more (a second product, an
                    outfit, a pose), like CardDetailModal. Memory-only. */}
                <ExtraRefsRow
                  refs={extraRefs}
                  onAdd={onAddExtraRef}
                  onRemove={onRemoveExtraRef}
                  dimmed={!modelSupportsRefs}
                />

                {/* Prompt — the scene blueprint, bare like CardDetailModal. */}
                <div className="flex grow flex-col">
                  <div className="relative flex grow flex-col overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.03] transition-colors focus-within:border-ink/20 focus-within:bg-ink/[0.05]">
                    <textarea
                      value={draft}
                      onChange={(e) => { setDraft(e.target.value); onUpdate(() => ({ editablePrompt: e.target.value })) }}
                      onBlur={commitDraft}
                      rows={12}
                      placeholder="The scene-by-scene blueprint for this clip…"
                      className="relative min-h-[240px] w-full grow resize-none border-0 bg-transparent px-3.5 pb-3 pt-3 font-mono text-[12px] leading-relaxed text-ink-200 placeholder-ink-600 outline-none"
                    />
                    {/* Footer toolbar — Enhance / Regenerate / Undo / Redo +
                        Expand, matching CardDetailModal's prompt box. */}
                    <div className="flex items-center justify-between gap-2 border-t border-ink/10 px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          title="Enhance — rewrite this blueprint richer, same format"
                          onClick={handleEnhance}
                          disabled={promptWorking || !draft.trim()}
                          className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium text-ink-400 transition-colors hover:bg-broll-500/10 hover:text-broll-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {promptWorking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Enhance Prompt
                        </button>
                        <button
                          type="button"
                          title="Regenerate — a fresh blueprint for this clip"
                          onClick={handleRegenerate}
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

            {/* Pinned footer — settings + Generate */}
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
                    {constraints.aspectRatios.length > 0 && (
                      <ConstraintChip
                        grow
                        openDirection="up"
                        options={constraints.aspectRatios}
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
                    {audioTogglable && (
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
                disabled={!cardState.editablePrompt.trim() || isBusy}
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

          {/* RIGHT — header + gallery */}
          <div className="col-span-1 flex min-h-0 flex-col overflow-hidden">
            <div className="flex flex-col gap-3 px-5 pt-4">
              <div className="flex h-10 min-w-0 items-center gap-3">
                {/* Angle + clip/delivery as two pills side by side. */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-full border border-ink/10 bg-ink/[0.03] px-2 py-0.5 text-[10px] font-medium uppercase leading-none tracking-wider text-ink-400">
                    {conceptLabel}
                  </span>
                  <span className="rounded-full border border-ink/10 bg-ink/[0.03] px-2 py-0.5 text-[10px] font-medium uppercase leading-none tracking-wider text-ink-400">
                    {clipLabel || (delivery === 'dialogue' ? 'With Dialogue' : 'B-Roll')}
                  </span>
                </div>
                <div className="h-7 w-px shrink-0 bg-ink/10" />
                <span
                  className="min-w-0 flex-1 truncate text-[15px] leading-none text-ink-300"
                  style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
                  title={segment.scriptExcerpt}
                >
                  &ldquo;{segment.scriptExcerpt}&rdquo;
                </span>
              </div>
              <div className="-mx-5 -mt-1 border-b border-ink/5" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {cardState.videos.length === 0 && cardState.inFlightVideos.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <Clapperboard className="h-9 w-9 text-ink-800" strokeWidth={1.5} />
                  <p className="text-xs text-ink-600">No videos yet — hit Generate to render this clip.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {cardState.inFlightVideos.filter((e) => e.error).map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400 light:text-red-600" />
                      <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-red-300 light:text-red-700">{entry.error}</p>
                      <button type="button" title="Retry" onClick={() => onRetryInFlight(entry.id)} className="shrink-0 rounded-full p-1 text-ink-400 hover:bg-ink/10 hover:text-ink-200"><RefreshCw className="h-3.5 w-3.5" /></button>
                      <button type="button" title="Dismiss" onClick={() => onDismissInFlight(entry.id)} className="shrink-0 rounded-full p-1 text-ink-400 hover:bg-ink/10 hover:text-ink-200"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-3">
                    {cardState.inFlightVideos.filter((e) => !e.error).map((entry) => (
                      <PendingMediaTile
                        key={entry.id}
                        kind="video"
                        prompt={entry.prompt}
                        modelId={entry.modelId}
                        aspectRatio={entry.aspectRatio}
                        messages={['Sending request...', 'Rolling the clip...', 'Cutting the shots...', 'Finalizing the clip...']}
                      />
                    ))}
                    {cardState.videos.map((video, i) => (
                      <ModalVideoTile key={`${video.url}-${i}`} video={video} onDelete={() => onDeleteVideo(i)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ExpandTextModal
        open={promptExpanded}
        onClose={() => { setPromptExpanded(false); commitDraft() }}
        value={draft}
        onChange={(v) => { setDraft(v); onUpdate(() => ({ editablePrompt: v })) }}
        title={`${clipLabel || 'Clip'} — Scene blueprint`}
        placeholder="The scene-by-scene blueprint for this clip…"
        accent="broll"
      />
    </div>
  ), document.body)
}

function ModalVideoTile({ video, onDelete }: { video: GeneratedVideo; onDelete: () => void }) {
  const url = useAssetUrl(video.url)
  const [copied, setCopied] = useState(false)
  const handleDownload = async () => {
    const resolved = await getUrl(video.url)
    if (!resolved) { useAppStore.getState().addToast('Could not load the video.', 'error'); return }
    await downloadImage(resolved, 'oneshot-clip', 'mp4')
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
