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
} from 'lucide-react'
import ConstraintChip from '../../../components/ConstraintChip'
import ExpandTextModal, { ExpandButton } from '../../../components/ExpandableText'
import { ReferenceSlotCard } from './cardDetailParts'
import type { AnimatedFrameCardState, AnimatedClipCardState, GeneratedVideo, ReferenceImage } from '../types'
import type { Product, Model } from '../../../stores/types'
import { useAppStore } from '../../../stores/appStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { useCloseOnAppSwitch } from '../../../hooks/useCloseOnAppSwitch'
import { getModel, estimateCredits, formatCredits, videoResolutionLabel } from '../../../utils/models'
import { downloadImage } from '../../../utils/downloadImage'
import { copyToClipboard } from '../../../utils/clipboard'

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

interface AnimatedFrameModalProps {
  frameLabel: string    // "Frame 3" / "Final Frame"
  conceptLabel: string  // the concept's staging slug
  scriptLine: string    // the narration line this frame opens ('' for final)
  style: string
  cardState: AnimatedFrameCardState
  // The previous frame's chosen keyframe (chain reference), if picked.
  chainImageRef?: string
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  selectedModel?: Model | null
  selectedProduct?: Product | null
  // Which image (if any) of THIS concept is the frame's chosen keyframe.
  selectedImageIndex: number | null
  onSelectImage: (index: number) => void
  onClose: () => void
  onUpdate: (updater: (prev: AnimatedFrameCardState) => Partial<AnimatedFrameCardState>) => void
  onGenerate: () => void
  onRetryInFlight: (id: string) => void
  onDismissInFlight: (id: string) => void
}

export function AnimatedFrameModal({
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
  selectedImageIndex,
  onSelectImage,
  onClose,
  onUpdate,
  onGenerate,
  onRetryInFlight,
  onDismissInFlight,
}: AnimatedFrameModalProps) {
  const [draft, setDraft] = useState(cardState.editablePrompt)
  const [promptExpanded, setPromptExpanded] = useState(false)
  // Adjust-during-render sync: external prompt changes (undo, restore) reset
  // the local draft without an effect round-trip.
  const [syncedPrompt, setSyncedPrompt] = useState(cardState.editablePrompt)
  if (syncedPrompt !== cardState.editablePrompt) {
    setSyncedPrompt(cardState.editablePrompt)
    setDraft(cardState.editablePrompt)
  }

  const isBusy = cardState.inFlightImages.some((e) => !e.error)

  return (
    <ModalShell onClose={onClose}>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        {/* LEFT — refs + prompt over a pinned Generate footer */}
        <div className="col-span-1 flex min-h-0 flex-col border-b border-ink/5 md:border-b-0 md:border-r">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex grow flex-col gap-3 px-5 pb-6 pt-4">
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

              {/* Prompt — the keyframe scene description. */}
              <div className="flex grow flex-col">
                <div className="relative flex grow flex-col overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.03] transition-colors focus-within:border-ink/20 focus-within:bg-ink/[0.05]">
                  <textarea
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); onUpdate(() => ({ editablePrompt: e.target.value })) }}
                    rows={10}
                    placeholder="Describe this keyframe — subject, pose, environment, camera angle…"
                    className="relative min-h-[200px] w-full grow resize-none border-0 bg-transparent px-3.5 pb-3 pt-3 text-[13px] leading-relaxed text-ink-200 placeholder-ink-600 outline-none"
                  />
                  <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-2 py-1.5">
                    <ExpandButton onClick={() => setPromptExpanded(true)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-ink/5 px-5 py-4">
            <button
              onClick={onGenerate}
              disabled={!cardState.editablePrompt.trim()}
              className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-broll-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-broll-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              Generate Image
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
    await downloadImage(resolved, 'animated-keyframe', 'png')
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

interface AnimatedClipModalProps {
  clipLabel: string     // "Clip 2"
  scriptLine: string
  style: string
  cardState: AnimatedClipCardState
  modelId: string
  startImageRef?: string
  endImageRef?: string
  onClose: () => void
  onUpdate: (updater: (prev: AnimatedClipCardState) => Partial<AnimatedClipCardState>) => void
  onGenerate: () => void
  onDeleteVideo: (index: number) => void
  onRetryInFlight: (id: string) => void
  onDismissInFlight: (id: string) => void
}

export function AnimatedClipModal({
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
}: AnimatedClipModalProps) {
  const [draft, setDraft] = useState(cardState.editablePrompt)
  const [promptExpanded, setPromptExpanded] = useState(false)
  // Adjust-during-render sync — same pattern as the frame modal above.
  const [syncedPrompt, setSyncedPrompt] = useState(cardState.editablePrompt)
  if (syncedPrompt !== cardState.editablePrompt) {
    setSyncedPrompt(cardState.editablePrompt)
    setDraft(cardState.editablePrompt)
  }

  const model = getModel(modelId)
  const constraints = model?.videoConstraints
  const isBusy = cardState.inFlightVideos.some((e) => !e.error)
  const framesReady = !!startImageRef && !!endImageRef
  const credits = formatCredits(estimateCredits(modelId, {
    durationSeconds: cardState.durationSeconds,
    resolution: cardState.resolution,
    audio: cardState.audio,
  }))

  return (
    <ModalShell onClose={onClose}>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        {/* LEFT — endpoints + motion prompt over a pinned Generate footer */}
        <div className="col-span-1 flex min-h-0 flex-col border-b border-ink/5 md:border-b-0 md:border-r">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex grow flex-col gap-3 px-5 pb-6 pt-4">
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
    await downloadImage(resolved, 'animated-clip', 'mp4')
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
