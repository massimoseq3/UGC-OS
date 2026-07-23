import { useEffect, useRef, useState } from 'react'
import {
  Clapperboard,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Sparkles,
  Video as VideoIcon,
  Play,
} from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'
import OneShotDetailModal from './OneShotDetailModal'
import type { OneShotResult, OneShotConcept, OneShotSegment, OneShotCardState, ReferenceImage, GeneratedVideo } from '../types'
import type { Product, Model, VideoHistoryItem } from '../../../stores/types'
import type { VideoMode } from '../../../utils/models'
import { createDefaultOneShotCardState } from '../cardState'
import { startVideoTask, finishVideoTask } from '../services/generateVideo'
import { buildReferencePreamble } from '../services/generateBroll'
import { resolveOneShotTokens } from '../services/generateOneShot'
import { isPollTimeout } from '../../../utils/kie'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getAsBase64, isAssetRef } from '../../../utils/assetStore'
import { getModel, snapVideoDurationUp } from '../../../utils/models'
import { humanizeError } from '../../../utils/friendlyError'

interface OneShotViewProps {
  result: OneShotResult | null
  isGenerating?: boolean
  error?: string | null
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  selectedModel?: Model | null
  selectedProduct?: Product | null
  productName?: string
  // Currently selected One Shot video model. May differ from result.modelId
  // (the model the split was planned against) — that shows the stale-plan hint.
  oneShotModelId: string
  cardStates: Record<string, OneShotCardState>
  setCardStates: React.Dispatch<React.SetStateAction<Record<string, OneShotCardState>>>
}

function cardKey(conceptId: string, segmentIndex: number): string {
  return `${conceptId}:${segmentIndex}`
}

// Right-panel view for One Shot mode: concept cards, each holding one clickable
// clip card per segment. Clicking a clip opens the detail modal (model picker,
// prompt editor, settings, generate, gallery). Video plumbing (startVideoTask /
// finishVideoTask, in-flight queues, refresh-resume, videoHistory) mirrors the
// line-by-line path.
export default function OneShotView({
  result,
  isGenerating,
  error,
  characterRef,
  productRef,
  selectedModel,
  selectedProduct,
  productName,
  oneShotModelId,
  cardStates,
  setCardStates,
}: OneShotViewProps) {
  // The clip whose detail modal is open ("conceptId:segmentIndex"), or null.
  const [openKey, setOpenKey] = useState<string | null>(null)

  // Seed a card state for every segment when a result lands (history restore
  // included). Existing entries win — they hold the user's edits and videos.
  useEffect(() => {
    if (!result) return
    setCardStates((prev) => {
      const next: Record<string, OneShotCardState> = {}
      for (const concept of result.concepts) {
        for (const segment of concept.segments) {
          const key = cardKey(concept.id, segment.index)
          next[key] = prev[key] ?? createDefaultOneShotCardState(segment, result.modelId)
        }
      }
      return next
    })
  }, [result, setCardStates])

  const updateCard = (key: string, updater: (prev: OneShotCardState) => Partial<OneShotCardState>) => {
    setCardStates((prev) => {
      const existing = prev[key]
      if (!existing) return prev
      return { ...prev, [key]: { ...existing, ...updater(existing) } }
    })
  }

  const toDataUri = async (ref: string): Promise<string | null> => {
    if (!isAssetRef(ref)) return ref
    const asset = await getAsBase64(ref)
    if (!asset) return null
    return `data:${asset.mimeType};base64,${asset.base64}`
  }

  // ── Video generation (adaptation of VariationCard.runVideoTask) ──
  const runSegmentVideo = async (key: string) => {
    const card = cardStates[key]
    if (!card) return
    const model = getModel(oneShotModelId)
    if (!model) {
      useAppStore.getState().addToast(`Unknown video model: ${oneShotModelId}`, 'error')
      return
    }

    const refs: ReferenceImage[] = [
      ...(card.refsCharacter && characterRef ? [characterRef] : []),
      ...(card.refsProduct && productRef ? [productRef] : []),
    ]
    const referenceDataUris: string[] = []
    for (const r of refs) {
      const uri = await toDataUri(r.dataUrl)
      if (uri) referenceDataUris.push(uri)
    }

    let mode: VideoMode = referenceDataUris.length > 0 ? 'reference-to-video' : 'text-to-video'
    let effectiveRefs: string[] | undefined = referenceDataUris.length > 0 ? referenceDataUris : undefined
    if (mode === 'reference-to-video' && !model.modes?.includes('reference-to-video')) {
      useAppStore.getState().addToast(
        `${model.displayName} doesn't support reference images — generating text-to-video only.`,
        'error',
      )
      mode = 'text-to-video'
      effectiveRefs = undefined
    }

    // Fire-time re-validation against the CURRENT model.
    const constraints = model.videoConstraints
    const durationSeconds = constraints
      ? snapVideoDurationUp(card.durationSeconds, constraints.durations)
      : card.durationSeconds
    const resolution = constraints && !constraints.resolutions.includes(card.resolution)
      ? constraints.default ?? constraints.resolutions[0]
      : card.resolution

    // Resolve [CHARACTER]/[PRODUCT] tokens to plain words the moment before
    // sending — a video model reads brackets literally.
    const rawPrompt = effectiveRefs
      ? `${buildReferencePreamble(refs)}\n\n${card.editablePrompt}`
      : card.editablePrompt
    const promptText = resolveOneShotTokens(rawPrompt, productName)

    const inFlightId = crypto.randomUUID()
    updateCard(key, (prev) => ({
      inFlightVideos: [
        ...prev.inFlightVideos,
        {
          id: inFlightId,
          taskId: null,
          modelId: oneShotModelId,
          startedAt: Date.now(),
          prompt: promptText,
          mode,
          aspectRatio: card.aspectRatio,
          durationSeconds,
          resolution,
          audio: card.audio,
        },
      ],
    }))

    try {
      const { taskId, videoEndpoint } = await startVideoTask({
        prompt: promptText,
        mode,
        referenceDataUris: effectiveRefs,
        aspectRatio: card.aspectRatio,
        durationSeconds,
        resolution,
        audio: card.audio,
        modelId: oneShotModelId,
        multiShots: true,
      })
      updateCard(key, (prev) => ({
        inFlightVideos: prev.inFlightVideos.map((e) =>
          e.id === inFlightId ? { ...e, taskId, endpoint: videoEndpoint } : e,
        ),
      }))

      const res = await finishVideoTask(taskId, oneShotModelId, videoEndpoint, durationSeconds, card.aspectRatio)
      const assetRef = `asset://${res.assetId}`
      const newVideo: GeneratedVideo = {
        url: assetRef,
        modelId: oneShotModelId,
        prompt: promptText,
        aspectRatio: res.aspectRatio,
        durationSeconds: res.durationSeconds,
        resolution,
        audio: card.audio,
        mode,
        createdAt: Date.now(),
      }
      updateCard(key, (prev) => {
        const newVideos = [...prev.videos, newVideo]
        return {
          videos: newVideos,
          currentVideoIndex: newVideos.length - 1,
          inFlightVideos: prev.inFlightVideos.filter((e) => e.id !== inFlightId),
        }
      })

      const historyEntry: VideoHistoryItem = {
        id: crypto.randomUUID(),
        modelId: oneShotModelId,
        prompt: promptText,
        mode,
        aspectRatio: res.aspectRatio,
        durationSeconds: res.durationSeconds,
        resolution,
        audio: card.audio,
        videoUrl: assetRef,
        sourceApp: 'broll-studio',
        createdAt: Date.now(),
      }
      await useBankStore.getState().addVideoHistory(historyEntry)
      useAppStore.getState().addToast('One-Shot clip ready', 'success')
    } catch (err) {
      if (isPollTimeout(err)) return
      const msg = humanizeError(err, 'Video generation failed.')
      updateCard(key, (prev) => ({
        inFlightVideos: prev.inFlightVideos.map((e) =>
          e.id === inFlightId ? { ...e, error: msg } : e,
        ),
      }))
      useAppStore.getState().addToast(`Video generation failed: ${msg}`, 'error')
    }
  }

  const deleteVideo = (key: string, index: number) => {
    updateCard(key, (prev) => {
      const videos = prev.videos.filter((_, i) => i !== index)
      return { videos, currentVideoIndex: Math.max(0, Math.min(prev.currentVideoIndex, videos.length - 1)) }
    })
  }
  const retryInFlight = (key: string, id: string) => {
    updateCard(key, (prev) => ({ inFlightVideos: prev.inFlightVideos.filter((e) => e.id !== id) }))
    void runSegmentVideo(key)
  }
  const dismissInFlight = (key: string, id: string) => {
    updateCard(key, (prev) => ({ inFlightVideos: prev.inFlightVideos.filter((e) => e.id !== id) }))
  }

  // ── Refresh-resume (lean copy of ScenesView's video-queue walker) ──
  const INFLIGHT_TTL_MS = 30 * 60 * 1000
  const resumingRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const now = Date.now()
    setCardStates((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [key, card] of Object.entries(prev)) {
        const stalled = card.inFlightVideos.filter((e) => !e.taskId && now - e.startedAt > INFLIGHT_TTL_MS)
        if (stalled.length === 0) continue
        changed = true
        next[key] = {
          ...card,
          inFlightVideos: card.inFlightVideos.map((e) =>
            stalled.includes(e) ? { ...e, error: 'Generation stalled before kie returned a task id. Dismiss and try again.' } : e,
          ),
        }
      }
      return changed ? next : prev
    })

    for (const [key, card] of Object.entries(cardStates)) {
      for (const entry of card.inFlightVideos) {
        if (!entry.taskId) continue
        const resumeKey = `oneshot-video:${entry.taskId}`
        if (resumingRef.current.has(resumeKey)) continue
        resumingRef.current.add(resumeKey)
        const { id: inFlightId, taskId, modelId, endpoint, durationSeconds, aspectRatio, resolution, audio, prompt, mode } = entry
        ;(async () => {
          try {
            const res = await finishVideoTask(taskId, modelId, endpoint, durationSeconds, aspectRatio)
            const assetRef = `asset://${res.assetId}`
            const newVideo: GeneratedVideo = {
              url: assetRef, modelId, prompt, aspectRatio: res.aspectRatio,
              durationSeconds: res.durationSeconds, resolution, audio, mode, createdAt: Date.now(),
            }
            setCardStates((prev) => {
              const existing = prev[key]
              if (!existing) return prev
              const newVideos = [...existing.videos, newVideo]
              return { ...prev, [key]: { ...existing, videos: newVideos, currentVideoIndex: newVideos.length - 1, inFlightVideos: existing.inFlightVideos.filter((e) => e.id !== inFlightId) } }
            })
            const historyEntry: VideoHistoryItem = {
              id: crypto.randomUUID(), modelId, prompt, mode, aspectRatio: res.aspectRatio,
              durationSeconds: res.durationSeconds, resolution, audio, videoUrl: assetRef, sourceApp: 'broll-studio', createdAt: Date.now(),
            }
            await useBankStore.getState().addVideoHistory(historyEntry)
            useAppStore.getState().addToast('One-Shot clip ready', 'success')
          } catch (err) {
            if (isPollTimeout(err)) return
            const msg = humanizeError(err, 'Video resume failed.')
            setCardStates((prev) => {
              const existing = prev[key]
              if (!existing) return prev
              return { ...prev, [key]: { ...existing, inFlightVideos: existing.inFlightVideos.map((e) => e.id === inFlightId ? { ...e, error: msg } : e) } }
            })
            useAppStore.getState().addToast(`Video resume failed: ${msg}`, 'error')
          } finally {
            resumingRef.current.delete(resumeKey)
          }
        })()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isGenerating) {
    return (
      <div className="flex h-full flex-col overflow-hidden p-5">
        <GenerationProgress
          isActive
          color="bg-broll-500"
          messages={['Reading the script...', 'Planning the clips...', 'Designing 4 concepts...', 'Writing scene blueprints...']}
          className="mb-6"
          showHelper={false}
        />
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-3xl border border-ink/5 bg-ink/[0.03]" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Clapperboard className="h-10 w-10 text-ink-800" strokeWidth={1.5} />
        <p className="text-sm text-ink-700">Generate 4 full-video concepts from your script</p>
        <p className="text-xs text-ink-800">Each renders as one multi-cut clip — no image step</p>
        {error && (
          <div className="mt-2 flex max-w-sm items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400 light:text-red-600" />
            <p className="text-xs leading-relaxed text-red-300 light:text-red-700">{error}</p>
          </div>
        )}
      </div>
    )
  }

  const planModel = getModel(result.modelId)
  const currentModel = getModel(oneShotModelId)
  const stalePlan = result.modelId !== oneShotModelId

  // Resolve the open clip → its concept + segment for the modal.
  const openConcept = openKey ? result.concepts.find((c) => c.segments.some((s) => cardKey(c.id, s.index) === openKey)) : undefined
  const openSegment = openConcept?.segments.find((s) => cardKey(openConcept.id, s.index) === openKey)
  const openCard = openKey ? cardStates[openKey] : undefined

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      {result.demo && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-broll-500/25 bg-broll-500/10 px-4 py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-broll-300" />
          <p className="text-xs leading-relaxed text-ink-300">
            <span className="font-semibold text-broll-300">Sample concepts.</span>{' '}
            This is a preview of what One-Shot produces. Add your kie.ai key in Settings to generate concepts from your own script and render the clips.
          </p>
        </div>
      )}
      {stalePlan && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300 light:text-amber-700" />
          <p className="text-xs leading-relaxed text-amber-200 light:text-amber-800">
            These concepts were split for {planModel?.displayName ?? result.modelId}. You can still generate with{' '}
            {currentModel?.displayName ?? oneShotModelId} (clip lengths re-snap automatically), or regenerate to re-plan the split.
          </p>
        </div>
      )}
      {result.capped && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300 light:text-amber-700" />
          <p className="text-xs leading-relaxed text-amber-200 light:text-amber-800">
            The script runs long (~{result.estimatedSeconds}s of speech) — it was squeezed into {result.segmentCount} clips. For longer scripts, Line-by-Line gives better coverage.
          </p>
        </div>
      )}
      {result.concepts.length < 4 && (
        <p className="mb-4 text-[11px] text-ink-600">
          {result.concepts.length} of 4 concepts generated — the rest failed. Regenerate for a fresh set.
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {result.concepts.map((concept) => (
          <ConceptCard
            key={concept.id}
            concept={concept}
            delivery={result.delivery}
            oneShotModelId={oneShotModelId}
            cardStates={cardStates}
            onOpenClip={setOpenKey}
            onGenerateAll={(c) => c.segments.forEach((s) => void runSegmentVideo(cardKey(c.id, s.index)))}
          />
        ))}
      </div>

      {openKey && openConcept && openSegment && openCard && (
        <OneShotDetailModal
          segment={openSegment}
          conceptAngle={openConcept.angle}
          clipLabel={openConcept.segments.length > 1 ? `Clip ${openSegment.index}` : ''}
          delivery={result.delivery}
          cardState={openCard}
          oneShotModelId={oneShotModelId}
          characterRef={characterRef}
          productRef={productRef}
          selectedModel={selectedModel}
          selectedProduct={selectedProduct}
          onClose={() => setOpenKey(null)}
          onUpdate={(updater) => updateCard(openKey, updater)}
          onGenerate={() => runSegmentVideo(openKey)}
          onDeleteVideo={(i) => deleteVideo(openKey, i)}
          onRetryInFlight={(id) => retryInFlight(openKey, id)}
          onDismissInFlight={(id) => dismissInFlight(openKey, id)}
        />
      )}
    </div>
  )
}

// ── Concept card ───────────────────────────────────────────────

interface ConceptCardProps {
  concept: OneShotConcept
  delivery: OneShotResult['delivery']
  oneShotModelId: string
  cardStates: Record<string, OneShotCardState>
  onOpenClip: (key: string) => void
  onGenerateAll: (concept: OneShotConcept) => void
}

function ConceptCard({ concept, delivery, oneShotModelId, cardStates, onOpenClip, onGenerateAll }: ConceptCardProps) {
  const model = getModel(oneShotModelId)
  const durations = model?.videoConstraints?.durations ?? []
  const totalSeconds = concept.segments.reduce((sum, s) => {
    const card = cardStates[cardKey(concept.id, s.index)]
    const d = card?.durationSeconds ?? s.durationSeconds
    return sum + (durations.length > 0 ? snapVideoDurationUp(d, durations) : d)
  }, 0)
  const multiClip = concept.segments.length > 1
  const anyInFlight = concept.segments.some((s) => (cardStates[cardKey(concept.id, s.index)]?.inFlightVideos.length ?? 0) > 0)

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-ink/10 bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-broll-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-broll-300 ring-1 ring-inset ring-broll-500/15">
              {concept.angle}
            </span>
            <span className="rounded-full bg-ink/[0.04] px-2 py-0.5 text-[10px] font-medium tabular-nums text-ink-500">
              {multiClip ? `${concept.segments.length} clips · ~${totalSeconds}s` : `~${totalSeconds}s`}
            </span>
            <span className="rounded-full bg-ink/[0.04] px-2 py-0.5 text-[10px] font-medium text-ink-500">
              {delivery === 'dialogue' ? 'With Dialogue' : 'B-Roll'}
            </span>
          </div>
          {concept.summary && <p className="mt-2 text-xs leading-relaxed text-ink-500">{concept.summary}</p>}
        </div>
        {multiClip && (
          <button
            type="button"
            disabled={anyInFlight}
            onClick={() => onGenerateAll(concept)}
            className="shrink-0 rounded-full border border-ink/10 bg-ink/[0.02] px-3.5 py-1.5 text-[11px] font-semibold text-ink-300 transition-colors hover:bg-ink/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Generate all
          </button>
        )}
      </div>

      <div className={`grid gap-3 ${multiClip ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {concept.segments.map((segment) => (
          <ClipCard
            key={segment.index}
            segment={segment}
            showClipNumber={multiClip}
            cardState={cardStates[cardKey(concept.id, segment.index)]}
            onOpen={() => onOpenClip(cardKey(concept.id, segment.index))}
          />
        ))}
      </div>
    </div>
  )
}

// ── Clip card (clickable tile) ─────────────────────────────────

function ClipCard({
  segment,
  showClipNumber,
  cardState,
  onOpen,
}: {
  segment: OneShotSegment
  showClipNumber: boolean
  cardState?: OneShotCardState
  onOpen: () => void
}) {
  const currentVideo = cardState && cardState.videos.length > 0
    ? cardState.videos[Math.min(cardState.currentVideoIndex, cardState.videos.length - 1)]
    : undefined
  const videoUrl = useAssetUrl(currentVideo?.url ?? '')
  const inFlight = cardState?.inFlightVideos.some((e) => !e.error) ?? false
  const errored = cardState?.inFlightVideos.some((e) => e.error) ?? false
  const duration = cardState?.durationSeconds ?? segment.durationSeconds

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex aspect-[9/16] w-full flex-col overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.03] text-left transition-colors hover:border-broll-500/40"
    >
      {currentVideo && videoUrl ? (
        <>
          <video src={videoUrl} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"><Play className="h-4 w-4" /></span>
          </div>
          {cardState && cardState.videos.length > 1 && (
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-white backdrop-blur-sm">
              {Math.min(cardState.currentVideoIndex, cardState.videos.length - 1) + 1}/{cardState.videos.length}
            </span>
          )}
        </>
      ) : (
        <div className="flex h-full flex-col p-3.5">
          <div className="flex items-center justify-between">
            {showClipNumber ? (
              <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-ink-400">Clip {segment.index}</span>
            ) : <span />}
            <span className="rounded-full bg-ink/[0.04] px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-ink-500">{duration}s</span>
          </div>
          <p
            className="mt-3 line-clamp-4 text-[14px] leading-snug text-ink-400"
            style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
          >
            &ldquo;{segment.scriptExcerpt}&rdquo;
          </p>
          <div className="mt-auto flex items-center gap-1.5 pt-3 text-[11px] font-semibold text-broll-300">
            {inFlight ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering…</>
            ) : errored ? (
              <span className="flex items-center gap-1.5 text-red-300 light:text-red-600"><AlertCircle className="h-3.5 w-3.5" /> Failed — open to retry</span>
            ) : (
              <><VideoIcon className="h-3.5 w-3.5" /> Set up &amp; generate</>
            )}
          </div>
        </div>
      )}
      {currentVideo && (
        <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium tabular-nums text-white backdrop-blur-sm">{currentVideo.durationSeconds}s</span>
      )}
      {inFlight && currentVideo && (
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm"><Loader2 className="h-2.5 w-2.5 animate-spin" /> Rendering</span>
      )}
    </button>
  )
}
