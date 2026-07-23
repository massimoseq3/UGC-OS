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
} from 'lucide-react'
import ModelPicker from '../../../components/ModelPicker'
import ConstraintChip from '../../../components/ConstraintChip'
import AspectIcon from '../../../components/AspectIcon'
import ExpandTextModal, { ExpandButton } from '../../../components/ExpandableText'
import type { OneShotSegment, OneShotCardState, GeneratedVideo, ReferenceImage } from '../types'
import type { Product, Model } from '../../../stores/types'
import { ONE_SHOT_MODEL_IDS } from '../services/generateOneShot'
import { useAppStore } from '../../../stores/appStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { useCloseOnAppSwitch } from '../../../hooks/useCloseOnAppSwitch'
import {
  getModel,
  estimateCredits,
  formatCredits,
  videoResolutionLabel,
  snapVideoDuration,
} from '../../../utils/models'
import { downloadImage } from '../../../utils/downloadImage'
import { copyToClipboard } from '../../../utils/clipboard'

interface OneShotDetailModalProps {
  segment: OneShotSegment
  conceptAngle: string
  clipLabel: string // "Clip 2" for multi-clip concepts, else ""
  delivery: 'dialogue' | 'silent'
  cardState: OneShotCardState
  oneShotModelId: string
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  selectedModel?: Model | null
  selectedProduct?: Product | null
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
  clipLabel,
  delivery,
  cardState,
  oneShotModelId,
  characterRef,
  productRef,
  selectedModel,
  selectedProduct,
  onClose,
  onUpdate,
  onGenerate,
  onDeleteVideo,
  onRetryInFlight,
  onDismissInFlight,
}: OneShotDetailModalProps) {
  const [draft, setDraft] = useState(cardState.editablePrompt)
  const [promptExpanded, setPromptExpanded] = useState(false)

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
                {/* Model picker */}
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Video model</span>
                  <div className="mt-1.5">
                    <ModelPicker
                      appId="broll-studio"
                      task="video"
                      persistKey="broll-studio:oneshot:video"
                      allowedModelIds={ONE_SHOT_MODEL_IDS}
                      value={oneShotModelId}
                      requireMode={hasRefs ? 'reference-to-video' : undefined}
                      requireModeNote="Dimmed models can't take reference images — your refs would be dropped (text-to-video only)."
                      costParams={{ durationSeconds: cardState.durationSeconds, resolution: cardState.resolution, audio: cardState.audio }}
                    />
                  </div>
                </div>

                {/* Reference toggles */}
                {(characterRef || productRef) && (
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">References</span>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      {characterRef && (
                        <RefSlot
                          icon={UserRound}
                          label="Character"
                          name={selectedModel?.name}
                          imageRef={characterRef.dataUrl}
                          active={cardState.refsCharacter}
                          onToggle={() => onUpdate((p) => ({ refsCharacter: !p.refsCharacter }))}
                          dimmed={!modelSupportsRefs}
                        />
                      )}
                      {productRef && (
                        <RefSlot
                          icon={Package}
                          label="Product"
                          name={selectedProduct?.productName}
                          imageRef={productRef.dataUrl}
                          active={cardState.refsProduct}
                          onToggle={() => onUpdate((p) => ({ refsProduct: !p.refsProduct }))}
                          dimmed={!modelSupportsRefs}
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

                {/* Prompt — the scene blueprint */}
                <div className="flex grow flex-col">
                  <span className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Scene blueprint</span>
                  <div className="relative flex grow flex-col overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.03] transition-colors focus-within:border-ink/20 focus-within:bg-ink/[0.05]">
                    <textarea
                      value={draft}
                      onChange={(e) => { setDraft(e.target.value); onUpdate(() => ({ editablePrompt: e.target.value })) }}
                      rows={12}
                      placeholder="The scene-by-scene blueprint for this clip…"
                      className="relative min-h-[240px] w-full grow resize-none border-0 bg-transparent px-3.5 pb-3 pt-3 font-mono text-[12px] leading-relaxed text-ink-200 placeholder-ink-600 outline-none"
                    />
                    <div className="flex items-center justify-end border-t border-ink/10 px-2 py-1.5">
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
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex shrink-0 flex-col items-start gap-1">
                  <span className="rounded-full bg-broll-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none text-broll-300 ring-1 ring-inset ring-broll-500/15">
                    {conceptAngle}
                  </span>
                  <span className="text-[10px] uppercase leading-none tracking-wider text-ink-400">
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
              <div className="-mx-5 border-b border-ink/5" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {cardState.videos.length === 0 && cardState.inFlightVideos.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <Clapperboard className="h-9 w-9 text-ink-800" strokeWidth={1.5} />
                  <p className="text-xs text-ink-600">No videos yet — hit Generate to render this clip.</p>
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
        onClose={() => setPromptExpanded(false)}
        value={draft}
        onChange={(v) => { setDraft(v); onUpdate(() => ({ editablePrompt: v })) }}
        title={`${clipLabel || 'Clip'} — Scene blueprint`}
        placeholder="The scene-by-scene blueprint for this clip…"
        accent="broll"
      />
    </div>
  ), document.body)
}

function RefSlot({
  icon: Icon,
  label,
  name,
  imageRef,
  active,
  onToggle,
  dimmed,
}: {
  icon: React.ElementType
  label: string
  name?: string
  imageRef?: string
  active: boolean
  onToggle: () => void
  dimmed?: boolean
}) {
  const url = useAssetUrl(imageRef ?? '')
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition-colors ${
        active && !dimmed
          ? 'border-broll-500/30 bg-broll-500/[0.08]'
          : 'border-ink/10 bg-ink/[0.02] hover:bg-ink/[0.05]'
      } ${dimmed ? 'opacity-50' : ''}`}
    >
      {url ? (
        <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-400"><Icon className="h-4 w-4" /></span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-ink-200">{name ?? label}</p>
        <p className="text-[10px] text-ink-500">{active ? 'Attached' : 'Off'}</p>
      </div>
    </button>
  )
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
