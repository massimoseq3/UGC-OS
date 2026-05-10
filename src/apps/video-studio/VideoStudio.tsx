import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { Film, Loader2, AlertCircle, Save, Check, Volume2, VolumeX, ChevronDown, Download, Clock, FolderOpen } from 'lucide-react'
import { useBankStore } from '../../stores/bankStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAppStore } from '../../stores/appStore'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import ModelPicker from '../../components/ModelPicker'
import GenerationProgress from '../../components/GenerationProgress'
import VideoInputSlot, { type VideoInputValue } from '../../components/video/VideoInputSlot'
import VideoRefStrip from '../../components/video/VideoRefStrip'
import VideoHistoryGrid from './components/VideoHistoryGrid'
import ProjectTagPopover from './components/ProjectTagPopover'
import {
  getDefaultModel,
  getModel,
  estimateCredits,
  formatCredits,
} from '../../utils/models'
import { saveFromDataUrl, getUrl } from '../../utils/assetStore'
import { generateVideo } from './services/generateVideo'
import type { VideoMode } from './types'
import type { VideoHistoryItem } from '../../stores/types'

const RESOLUTION_LABELS: Record<string, string> = {
  '480p': '480p',
  '720p': '720p',
  '1080p': '1080p',
  '4k': '4K',
  std: 'Standard',
  pro: 'Pro',
  '4K': '4K',
  // Sora 2 Pro: kie's `size` enum surfaces in the UI as 720p / 1080p chips.
  standard: '720p',
  high: '1080p',
}

const MODEL_KEY = 'video-studio:video'
const SLOT_COUNT = 4

// One independently-configured generation slot. Four of these mount as tabs at
// the top of the left panel; each can be in flight at the same time without
// blocking the others. Per-slot status surfaces as a glowing dot on the tab.
interface Slot {
  prompt: string
  firstFrame: VideoInputValue | null
  lastFrame: VideoInputValue | null
  references: VideoInputValue[]
  aspectRatio: string
  duration: number
  resolution: string
  audio: boolean
  modelId: string
  status: 'idle' | 'generating' | 'error'
  error: string | null
  // History item id of this slot's most recent successful generation. Used
  // by the Preview tab when the user clicks the slot's tab strip.
  lastResultId: string | null
}

interface InFlightGen {
  id: string
  slotIndex: number
  modelId: string
  prompt: string
  aspectRatio: string
  startedAt: number
}

// Mode is inferred from which slots the user filled, in priority order:
//   any references → reference-to-video
//   start + end    → frames-to-video
//   start only     → image-to-video
//   none           → text-to-video
function inferMode(opts: {
  firstFrame: VideoInputValue | null
  lastFrame: VideoInputValue | null
  references: VideoInputValue[]
}): VideoMode {
  if (opts.references.length > 0) return 'reference-to-video'
  if (opts.firstFrame && opts.lastFrame) return 'frames-to-video'
  if (opts.firstFrame) return 'image-to-video'
  return 'text-to-video'
}

function makeSlot(modelId: string): Slot {
  return {
    prompt: '',
    firstFrame: null,
    lastFrame: null,
    references: [],
    aspectRatio: '9:16',
    duration: 5,
    resolution: '720p',
    audio: false,
    modelId,
    status: 'idle',
    error: null,
    lastResultId: null,
  }
}

export default function VideoStudio() {
  const persistedModelId = useSettingsStore((s) => s.getAppModel(MODEL_KEY))
  const initialModelId = useMemo(
    () => persistedModelId ?? getDefaultModel('video-studio', 'video')?.id ?? '',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Slots are session-only state — they don't persist across reloads. The
  // global persisted model selection is the only thing that bridges sessions.
  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: SLOT_COUNT }, () => makeSlot(initialModelId)),
  )
  const [activeSlotIndex, setActiveSlotIndex] = useState(0)
  const [inFlight, setInFlight] = useState<InFlightGen[]>([])
  const [previewHistoryId, setPreviewHistoryId] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<'history' | 'preview'>('history')
  const [savedToBank, setSavedToBank] = useState(false)

  const addBRoll = useBankStore((s) => s.addBRoll)
  const updateBRoll = useBankStore((s) => s.updateBRoll)
  const getBRollById = useBankStore((s) => s.getBRollById)
  const videoHistory = useBankStore((s) => s.videoHistory)
  const addVideoHistory = useBankStore((s) => s.addVideoHistory)
  const updateVideoHistory = useBankStore((s) => s.updateVideoHistory)
  const deleteVideoHistory = useBankStore((s) => s.deleteVideoHistory)
  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)

  const activeSlot = slots[activeSlotIndex]
  const activeModel = getModel(activeSlot.modelId)
  const constraints = activeModel?.videoConstraints
  const refsAllowed = activeModel?.supportsReferenceImages ?? false
  // Veo 3.1 Fast is reference-capped at 3; Seedance variants allow up to 9.
  const maxRefs = activeSlot.modelId === 'veo3_fast' ? 3 : 9

  // Functional patch helpers — always read latest state, safe to call from async closures.
  function patchSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function patchActive(patch: Partial<Slot>) {
    patchSlot(activeSlotIndex, patch)
  }

  // Snap the active slot's constraint controls + clear unsupported inputs when
  // ITS model changes. Only the active slot is observed here; other slots
  // self-correct when the user switches to them and changes their model there.
  useEffect(() => {
    if (!constraints) return
    const patch: Partial<Slot> = {}
    if (!constraints.aspectRatios.includes(activeSlot.aspectRatio)) patch.aspectRatio = constraints.aspectRatios[0]
    if (constraints.durations.length > 0 && !constraints.durations.includes(activeSlot.duration)) {
      patch.duration = constraints.durations[0]
    }
    if (!constraints.resolutions.includes(activeSlot.resolution)) {
      patch.resolution = constraints.resolutions[0] ?? '720p'
    }
    if (!constraints.supportsAudio) patch.audio = false
    if (!refsAllowed && activeSlot.references.length > 0) patch.references = []
    if (Object.keys(patch).length > 0) patchActive(patch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot.modelId])

  // Inter-app payload: B-Roll Images → B-Roll Videos handoff drops a still in
  // the *active* slot's start-frame slot.
  useEffect(() => {
    if (activeApp !== 'video-studio') return
    if (!interAppPayload || interAppPayload.targetApp !== 'video-studio') return

    if (interAppPayload.targetField === 'firstFrame') {
      const data = interAppPayload.data
      if (typeof data === 'string') {
        patchActive({ firstFrame: { dataUri: data } })
      } else if (data && typeof data === 'object' && 'imageUrl' in data) {
        const { imageUrl, prompt: incomingPrompt, sourceBRollId } = data as {
          imageUrl: string
          prompt?: string
          sourceBRollId?: string
        }
        const patch: Partial<Slot> = { firstFrame: { dataUri: imageUrl, sourceBRollId } }
        if (typeof incomingPrompt === 'string' && incomingPrompt.trim()) {
          patch.prompt = incomingPrompt
        }
        patchActive(patch)
      }
    }
    consumePayload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interAppPayload, activeApp, consumePayload])

  const inferredMode = inferMode({
    firstFrame: activeSlot.firstFrame,
    lastFrame: activeSlot.lastFrame,
    references: activeSlot.references,
  })

  const modeSupported = activeModel?.modes?.includes(inferredMode) ?? false
  const canGenerate =
    activeSlot.prompt.trim().length > 0 &&
    !!activeSlot.modelId &&
    modeSupported &&
    activeSlot.status !== 'generating'

  // Kicks off the active slot's generation. Captures the slotIndex at call time
  // so the user can switch tabs while it runs and still have results land in
  // the right slot.
  async function handleGenerate() {
    if (!canGenerate) return
    const slotIndex = activeSlotIndex
    const slot = slots[slotIndex]
    const inFlightId = crypto.randomUUID()
    const mode = inferMode(slot)
    const sourceBRollId =
      slot.firstFrame?.sourceBRollId ??
      slot.lastFrame?.sourceBRollId ??
      slot.references.find((r) => r.sourceBRollId)?.sourceBRollId

    patchSlot(slotIndex, { status: 'generating', error: null })
    setInFlight((prev) => [
      ...prev,
      {
        id: inFlightId,
        slotIndex,
        modelId: slot.modelId,
        prompt: slot.prompt,
        aspectRatio: slot.aspectRatio,
        startedAt: Date.now(),
      },
    ])

    try {
      const res = await generateVideo({
        prompt: slot.prompt.trim(),
        mode,
        firstFrameDataUri: slot.firstFrame?.dataUri,
        lastFrameDataUri: slot.lastFrame?.dataUri,
        referenceDataUris: slot.references.length > 0 ? slot.references.map((r) => r.dataUri) : undefined,
        aspectRatio: slot.aspectRatio,
        durationSeconds: slot.duration,
        resolution: slot.resolution,
        audio: slot.audio,
        modelId: slot.modelId,
      })

      const historyEntry: VideoHistoryItem = {
        id: crypto.randomUUID(),
        modelId: slot.modelId,
        prompt: slot.prompt.trim(),
        mode,
        aspectRatio: res.aspectRatio,
        durationSeconds: res.durationSeconds,
        resolution: slot.resolution,
        audio: slot.audio,
        videoUrl: res.assetId,
        sourceBRollId,
        createdAt: Date.now(),
      }
      addVideoHistory(historyEntry)
      patchSlot(slotIndex, { status: 'idle', error: null, lastResultId: historyEntry.id })
      useAppStore.getState().addToast(`Video ${slotIndex + 1} ready`, 'success')
      // Auto-promote to Preview only if the user is still looking at this slot.
      // Otherwise leave them in their current context — the new tile will
      // surface in History where they can click it.
      setActiveSlotIndex((cur) => {
        if (cur === slotIndex) {
          setPreviewHistoryId(historyEntry.id)
          setRightTab('preview')
          setSavedToBank(false)
        }
        return cur
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video generation failed.'
      patchSlot(slotIndex, { status: 'error', error: msg })
      useAppStore.getState().addToast(`Video ${slotIndex + 1} failed: ${msg}`, 'error')
    } finally {
      setInFlight((prev) => prev.filter((i) => i.id !== inFlightId))
    }
  }

  const previewItem = previewHistoryId
    ? videoHistory.find((h) => h.id === previewHistoryId) ?? null
    : null
  const resolvedPreviewUrl = useAssetUrl(previewItem?.videoUrl ?? null)

  // Save the previewed video into the B-Rolls Bank. If the generation tracked
  // a sourceBRollId (start/end/reference came from the bank), append the video
  // to that record. Otherwise create a fresh BRoll — preserving the start
  // frame as the still if one was uploaded directly into the originating slot.
  async function handleSaveToBank() {
    if (!previewItem) return

    const newVideo = {
      url: previewItem.videoUrl,
      aspectRatio: previewItem.aspectRatio,
      createdAt: previewItem.createdAt,
    }

    const sourceId = previewItem.sourceBRollId
    if (sourceId) {
      const existing = getBRollById(sourceId)
      if (existing) {
        const nextVideos = [...(existing.videos ?? []), newVideo]
        updateBRoll(sourceId, { videos: nextVideos })
        updateVideoHistory(previewItem.id, { linkedBRollId: sourceId })
        setSavedToBank(true)
        setTimeout(() => setSavedToBank(false), 2000)
        return
      }
    }

    // Walk back to the slot that owned this generation (lastResultId match) to
    // pull a fresh first-frame data URI for the still, if it's still around.
    const owner = slots.find((s) => s.lastResultId === previewItem.id)
    let imageUrl = ''
    if (owner?.firstFrame?.dataUri) {
      try {
        imageUrl = await saveFromDataUrl(owner.firstFrame.dataUri)
      } catch {
        imageUrl = ''
      }
    }

    addBRoll({
      imageUrl,
      prompt: previewItem.prompt,
      videos: [newVideo],
    })
    updateVideoHistory(previewItem.id, { linkedBRollId: 'pending' })
    setSavedToBank(true)
    setTimeout(() => setSavedToBank(false), 2000)
  }

  // Save a history-grid item directly (no preview required). Same linkage logic.
  function handleSaveHistoryItem(item: VideoHistoryItem) {
    if (item.linkedBRollId) return
    if (item.sourceBRollId) {
      const existing = getBRollById(item.sourceBRollId)
      if (existing) {
        updateBRoll(item.sourceBRollId, {
          videos: [
            ...(existing.videos ?? []),
            { url: item.videoUrl, aspectRatio: item.aspectRatio, createdAt: item.createdAt },
          ],
        })
        updateVideoHistory(item.id, { linkedBRollId: item.sourceBRollId })
        return
      }
    }
    addBRoll({
      imageUrl: '',
      prompt: item.prompt,
      videos: [{ url: item.videoUrl, aspectRatio: item.aspectRatio, createdAt: item.createdAt }],
    })
    updateVideoHistory(item.id, { linkedBRollId: 'pending' })
  }

  const credits = formatCredits(
    estimateCredits(activeSlot.modelId, {
      durationSeconds: activeSlot.duration,
      resolution: activeSlot.resolution,
      audio: activeSlot.audio,
    }),
  )

  const inFlightCount = inFlight.length

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Left — slot tabs + controls */}
      <div className="flex w-full lg:w-1/2 shrink-0 flex-col overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/5">
        {/* Slot tab strip — same height + underline style as the right panel
            tabs so the two tab rows visually align across the divider. */}
        <div className="flex shrink-0 items-center gap-1 border-b border-white/5 px-5">
          {slots.map((s, i) => (
            <SlotTab
              key={i}
              index={i}
              slot={s}
              active={i === activeSlotIndex}
              onClick={() => setActiveSlotIndex(i)}
            />
          ))}
        </div>

        <div className="flex flex-1 flex-col p-5">
          {/* Model picker — leads the panel; choosing a model determines what's possible below. */}
          <div className="mb-5">
            <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">Model</label>
            <ModelPicker
              appId="video-studio"
              task="video"
              value={activeSlot.modelId}
              onChange={(modelId) => patchActive({ modelId })}
              costParams={{ durationSeconds: activeSlot.duration, resolution: activeSlot.resolution, audio: activeSlot.audio }}
            />
          </div>

          {/* Frame slots — start + end side by side. Both optional. */}
          <div className="mb-5 grid grid-cols-2 gap-3">
            <VideoInputSlot
              label="Start frame"
              helper="— optional"
              value={activeSlot.firstFrame}
              onChange={(v) => patchActive({ firstFrame: v })}
            />
            <VideoInputSlot
              label="End frame"
              helper="— optional"
              value={activeSlot.lastFrame}
              onChange={(v) => patchActive({ lastFrame: v })}
            />
          </div>

          {/* Reference images — only for models that support them. */}
          {refsAllowed && (
            <div className="mb-5">
              <VideoRefStrip
                label="Reference images"
                helper="optional"
                values={activeSlot.references}
                onChange={(v) => patchActive({ references: v })}
                max={maxRefs}
              />
            </div>
          )}

          {/* Prompt */}
          <div className="mb-5">
            <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">Prompt</label>
            <textarea
              value={activeSlot.prompt}
              onChange={(e) => patchActive({ prompt: e.target.value })}
              rows={5}
              placeholder="Describe the video you want to generate..."
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-purple-500/30"
            />
          </div>

          {/* Constraint controls */}
          {constraints && (
            <div className={`mb-5 grid gap-3 ${constraints.durations.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <ChoiceControl
                label="Aspect"
                options={constraints.aspectRatios}
                value={activeSlot.aspectRatio}
                onChange={(v) => patchActive({ aspectRatio: v })}
                renderOption={(r) => (
                  <span className="flex items-center justify-center gap-1.5">
                    <AspectIcon ratio={String(r)} />
                    <span>{r}</span>
                  </span>
                )}
              />
              {constraints.durations.length > 0 && (
                <ChoiceControl
                  label="Duration"
                  options={constraints.durations}
                  value={activeSlot.duration}
                  onChange={(v) => patchActive({ duration: v })}
                  renderOption={(d) => `${d}s`}
                />
              )}
              <ChoiceControl
                label="Resolution"
                options={constraints.resolutions}
                value={activeSlot.resolution}
                onChange={(v) => patchActive({ resolution: v })}
                renderOption={(r) => RESOLUTION_LABELS[String(r)] ?? String(r)}
              />
            </div>
          )}

          {/* Audio toggle */}
          {constraints?.supportsAudio && (
            <div className="mb-5">
              <button
                onClick={() => patchActive({ audio: !activeSlot.audio })}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                  activeSlot.audio ? 'border-purple-500/30 bg-purple-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2">
                  {activeSlot.audio ? <Volume2 className="h-4 w-4 text-purple-400" /> : <VolumeX className="h-4 w-4 text-zinc-500" />}
                  <span className="text-sm text-zinc-200">Audio</span>
                  <span className="text-[11px] text-zinc-500">{activeSlot.audio ? 'On' : 'Off'}</span>
                </div>
                <span className="text-[11px] text-zinc-500">Affects credits</span>
              </button>
            </div>
          )}

          {/* Active-slot error */}
          {activeSlot.error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
              <p className="text-xs leading-relaxed text-red-300">{activeSlot.error}</p>
            </div>
          )}

          {/* Generate button. Disabled while THIS slot is in flight; a different
              slot's generation doesn't block this one. */}
          <div className="mt-auto pt-2">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-purple-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white transition-all hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {activeSlot.status === 'generating' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Generating Slot {activeSlotIndex + 1}…</span>
                </>
              ) : (
                <>
                  <Film className="h-4 w-4" />
                  <span>Generate Video{credits ? ` (${credits})` : ''}</span>
                </>
              )}
            </button>
            {inFlightCount > 0 && (
              <p className="mt-2 text-center text-[11px] text-zinc-500">
                {inFlightCount} generation{inFlightCount === 1 ? '' : 's'} running in parallel
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right — History | Preview tabs */}
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex items-center gap-1 border-b border-white/5 px-5">
          <RightTabButton active={rightTab === 'history'} onClick={() => setRightTab('history')}>
            History
            {(videoHistory.length > 0 || inFlightCount > 0) && (
              <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                {videoHistory.length + inFlightCount}
              </span>
            )}
          </RightTabButton>
          <RightTabButton active={rightTab === 'preview'} onClick={() => setRightTab('preview')}>
            Preview
          </RightTabButton>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {rightTab === 'preview' ? (
            <PreviewPane
              previewItem={previewItem}
              resolvedUrl={resolvedPreviewUrl}
              activeSlotGenerating={activeSlot.status === 'generating'}
              activeSlotIndex={activeSlotIndex}
              activeModelName={activeModel?.displayName ?? ''}
              savedToBank={savedToBank}
              onSaveToBank={handleSaveToBank}
            />
          ) : (
            <VideoHistoryGrid
              items={videoHistory}
              inFlight={inFlight}
              activeId={previewHistoryId}
              onSelect={(item) => {
                setPreviewHistoryId(item.id)
                setSavedToBank(!!item.linkedBRollId)
                setRightTab('preview')
              }}
              onSaveToBank={handleSaveHistoryItem}
              onDownload={async (item) => {
                const url = await getUrl(item.videoUrl)
                if (url) downloadVideo(url, item.id)
              }}
              onDelete={(id) => {
                deleteVideoHistory(id)
                if (previewHistoryId === id) setPreviewHistoryId(null)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Slot tab strip ─────────────────────────────────────────────

// Slot tab — same chrome as RightTabButton (pt-5 pb-2, underline indicator,
// no background fill) so the two tab strips read as one continuous bar across
// the panel divider. Status dot sits inline before the label.
function SlotTab({
  index,
  slot,
  active,
  onClick,
}: {
  index: number
  slot: Slot
  active: boolean
  onClick: () => void
}) {
  const dotClass =
    slot.status === 'generating'
      ? 'bg-purple-400 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.7)]'
      : slot.status === 'error'
      ? 'bg-red-400'
      : slot.lastResultId
      ? 'bg-emerald-400/70'
      : 'bg-zinc-700'
  return (
    <button
      onClick={onClick}
      title={
        slot.status === 'generating'
          ? `Slot ${index + 1} — generating`
          : slot.status === 'error'
          ? `Slot ${index + 1} — last run failed`
          : slot.lastResultId
          ? `Slot ${index + 1} — last result ready`
          : `Slot ${index + 1} — idle`
      }
      className={`relative flex items-center gap-1.5 px-3 pb-2 pt-5 text-sm font-medium tracking-tight transition-colors ${
        active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
      <span>Slot {index + 1}</span>
      <span
        className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors ${
          active ? 'bg-zinc-100' : 'bg-transparent'
        }`}
      />
    </button>
  )
}

// ── Preview pane ───────────────────────────────────────────────

function PreviewPane({
  previewItem,
  resolvedUrl,
  activeSlotGenerating,
  activeSlotIndex,
  activeModelName,
  savedToBank,
  onSaveToBank,
}: {
  previewItem: VideoHistoryItem | null
  resolvedUrl: string | undefined
  activeSlotGenerating: boolean
  activeSlotIndex: number
  activeModelName: string
  savedToBank: boolean
  onSaveToBank: () => void
}) {
  const addItemToProject = useBankStore((s) => s.addItemToProject)
  const removeItemFromProject = useBankStore((s) => s.removeItemFromProject)
  const [projectPopoverOpen, setProjectPopoverOpen] = useState(false)

  const projectCount = previewItem?.projectIds?.length ?? 0

  return (
    <div className="flex h-full items-center justify-center p-5">
      {previewItem && resolvedUrl ? (
        <div className="flex h-full w-full flex-col items-center gap-3">
          <video
            src={resolvedUrl}
            controls
            autoPlay
            loop
            className="max-h-[70vh] max-w-full rounded-xl border border-white/10"
          />
          {/* All three action buttons share the same width so the stack reads
              as a unified menu rather than three pills of different sizes. */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => downloadVideo(resolvedUrl, previewItem.id)}
              className="flex w-52 items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[12px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Video</span>
            </button>
            <button
              onClick={onSaveToBank}
              disabled={savedToBank || !!previewItem.linkedBRollId}
              className="flex w-52 items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[12px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:cursor-not-allowed"
            >
              {savedToBank || previewItem.linkedBRollId ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Saved to B-Rolls</span>
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>Save to B-Rolls Bank</span>
                </>
              )}
            </button>
            <div className="relative">
              <button
                onClick={() => setProjectPopoverOpen((v) => !v)}
                className="flex w-52 items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[12px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="truncate">
                  {projectCount > 0 ? `Saved to ${projectCount} project${projectCount === 1 ? '' : 's'}` : 'Save to Project'}
                </span>
                <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${projectPopoverOpen ? 'rotate-180' : ''}`} />
              </button>
              {projectPopoverOpen && (
                <ProjectTagPopover
                  projectIds={previewItem.projectIds}
                  onAdd={(pid) => addItemToProject('videoHistory', previewItem.id, pid)}
                  onRemove={(pid) => removeItemFromProject('videoHistory', previewItem.id, pid)}
                  onClose={() => setProjectPopoverOpen(false)}
                  anchorClassName="absolute left-1/2 bottom-full z-30 mb-1 -translate-x-1/2"
                />
              )}
            </div>
          </div>
        </div>
      ) : activeSlotGenerating ? (
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-500/15">
            <Loader2 className="h-6 w-6 animate-spin text-purple-300" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-200">
              Generating Video {activeSlotIndex + 1}{activeModelName ? ` · ${activeModelName}` : ''}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              <Clock className="mr-1 inline h-3 w-3 align-[-1px]" />
              This can take 1–3 minutes. Feel free to switch slots and start another in parallel —
              results will appear in the History tab as they finish.
            </p>
          </div>
          <div className="w-full max-w-xs">
            <GenerationProgress isActive color="bg-purple-500" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          <Film className="h-10 w-10 text-zinc-800" strokeWidth={1.5} />
          <p className="text-sm text-zinc-700">Click a History tile to preview it</p>
          <p className="text-xs text-zinc-800">Or generate a new video from the slot panel</p>
        </div>
      )}
    </div>
  )
}

// ── Right-tab button (shared chrome) ───────────────────────────

function RightTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1 px-3 pb-2 pt-5 text-sm font-medium tracking-tight transition-colors ${
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

// Triggers a browser download for a video URL. Fetches the blob first so the
// `download` attribute works cross-origin (asset blob URLs work directly;
// remote http URLs would otherwise just navigate).
async function downloadVideo(url: string | null | undefined, fallbackName: string) {
  if (!url) return
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `ugc-lab-${fallbackName.replace(/[^\w-]/g, '')}.mp4`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    // Fall back to opening in a new tab if fetch is blocked.
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

// ── Constraint controls (segmented vs dropdown) ────────────────

interface SegmentedControlProps<T> {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  renderOption?: (v: T) => ReactNode
}

// Tiny outlined rectangle scaled to the given aspect ratio. Bounded to a
// 14×14 box so the icon stays compact next to the text label, with the
// shape itself proportional inside.
function AspectIcon({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(':').map(Number)
  if (!w || !h) return null
  const max = 14
  const longSide = Math.max(w, h)
  const width = (w / longSide) * max
  const height = (h / longSide) * max
  return (
    <span
      className="inline-block shrink-0 rounded-[2px] border border-current"
      style={{ width: `${width}px`, height: `${height}px` }}
      aria-hidden="true"
    />
  )
}

// Picks segmented vs dropdown based on cardinality. Up to 3 options stay as
// inline toggles (always visible). 4+ collapse into a compact dropdown so the
// panel doesn't wrap or feel crowded.
function ChoiceControl<T extends string | number>(props: SegmentedControlProps<T>) {
  if (props.options.length > 3) return <DropdownControl {...props} />
  return <SegmentedControl {...props} />
}

function SegmentedControl<T extends string | number>({ label, options, value, onChange, renderOption }: SegmentedControlProps<T>) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
        {options.map((opt) => (
          <button
            key={String(opt)}
            onClick={() => onChange(opt)}
            className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
              value === opt ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {renderOption ? renderOption(opt) : String(opt)}
          </button>
        ))}
      </div>
    </div>
  )
}

function DropdownControl<T extends string | number>({ label, options, value, onChange, renderOption }: SegmentedControlProps<T>) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const renderValue = (opt: T) => (renderOption ? renderOption(opt) : String(opt))

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-1 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-[11px] font-medium text-zinc-100 transition-colors hover:bg-white/[0.05]"
      >
        <span className="flex min-w-0 flex-1 items-center justify-center">{renderValue(value)}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#0B0B0D]/95 shadow-xl backdrop-blur-xl">
          <div className="max-h-[260px] overflow-y-auto p-1">
            {options.map((opt) => (
              <button
                key={String(opt)}
                type="button"
                onClick={() => { onChange(opt); setOpen(false) }}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition-colors ${
                  value === opt ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-300 hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5">{renderValue(opt)}</span>
                {value === opt && <Check className="h-3 w-3 shrink-0 text-sky-400" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
