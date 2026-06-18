import { useEffect, useRef, useState } from 'react'
import {
  Image as ImageIcon,
  Film,
  Music as MusicIcon,
  Camera,
  ChevronRight,
  Volume2,
  VolumeX,
} from 'lucide-react'
import ModelPicker from '../../../components/ModelPicker'
import SegmentedToggle from '../../../components/SegmentedToggle'
import ClearAllButton from '../../../components/ClearAllButton'
import AspectIcon from '../../../components/AspectIcon'
import ConstraintChip from '../../../components/ConstraintChip'
import ModelWaitNotice from '../../../components/ModelWaitNotice'
import {
  getDefaultModel,
  getModel,
  estimateCredits,
  formatCredits,
  type Task,
  type Mode,
} from '../../../utils/models'
import { useSettingsStore } from '../../../stores/settingsStore'
import { fileToDataUri } from '../../../utils/kie'
import VideoInputSlot, { type VideoInputValue } from '../../../components/video/VideoInputSlot'
import VideoRefStrip from '../../../components/video/VideoRefStrip'
import MediaRefStrip, { type MediaRefValue } from '../../../components/video/MediaRefStrip'
import { readMediaDuration } from '../../../utils/media'
import OmniInputsSection from './OmniInputsSection'
import MotionControlSection from './MotionControlSection'
import { useAppStore } from '../../../stores/appStore'
import type { BankType } from '../../../utils/constants'
import type { BRoll } from '../../../stores/types'
import PresetCard from './PresetCard'
import SlideOver from '../../../components/SlideOver'
import MentionPopover from './MentionPopover'
import type { PlaygroundMode, BankReference } from '../types'
import { VIDEO_PRESETS, IMAGE_PRESETS, type Preset } from '../presets'

// Tabs passed to BankPicker when used from Playground refs. Characters comes
// first so opening the picker lands the user there by default; B-Rolls are
// filtered to those with stills (videos-only b-rolls aren't useful as image
// refs).
const PLAYGROUND_REF_TABS: Array<{ type: BankType; filter?: (item: BRoll | unknown) => boolean }> = [
  { type: 'models' },
  { type: 'products' },
  { type: 'brolls', filter: (item) => !!(item as BRoll).imageUrl },
]

// Start/end frame picker leads with B-Rolls — the most common source for a
// video's opening frame — then characters and products.
const PLAYGROUND_FRAME_TABS: Array<{ type: BankType; filter?: (item: BRoll | unknown) => boolean }> = [
  { type: 'brolls', filter: (item) => !!(item as BRoll).imageUrl },
  { type: 'models' },
  { type: 'products' },
]

// Reference attached to the prompt — either dropped/uploaded by the user or
// resolved from an @-mention. `source` distinguishes so the UI can render
// the right chip text.
export interface PromptRef {
  // Renderable URL: data: URI, http(s) URL, or asset:// ref. Empty for
  // omni-voice refs (they're ids, not media).
  url: string
  label: string
  source: 'upload' | 'product' | 'character' | 'broll'
  // Where to slot the ref. 'start' → start frame, 'end' → end frame,
  // 'ref' → reference image array. 'audio'/'video' → Seedance reference
  // clips. 'omni-*' → Gemini Omni characters / designed voices / source clip.
  // 'motion-image'/'motion-video' → Kling Motion Control's character + driving clip.
  slot: 'start' | 'end' | 'ref' | 'audio' | 'video' | 'omni-character' | 'omni-voice' | 'omni-clip' | 'motion-image' | 'motion-video'
  // audio / video / omni-clip: clip length read from file metadata.
  durationSeconds?: number
  // omni-character: the Influencers bank row id. The kie characterId is
  // resolved (and minted on first use) at generate time.
  bankModelId?: string
  // omni-voice: the kieAudioId from /omni/audio/create.
  omniId?: string
  // omni-clip: trim window in seconds (ends − start ≤ 10).
  clipStart?: number
  clipEnds?: number
}

export interface PromptPanelState {
  mode: PlaygroundMode
  prompt: string
  modelId: string
  aspectRatio: string
  durationSeconds: number
  resolution: string
  audio: boolean
  instrumental: boolean
  refs: PromptRef[]
  // Kling Motion Control: how the output character is oriented. Defaults to
  // 'video' (follow the driving clip). Unused by other models.
  characterOrientation?: 'image' | 'video'
}

interface PromptPanelProps {
  state: PromptPanelState
  onChange: (next: PromptPanelState) => void
  // Mode switch is special-cased so the parent can stash/restore each tab's
  // own prompt + refs instead of carrying them across tabs.
  onModeChange: (mode: PlaygroundMode) => void
  onClear: () => void
  onSubmit: () => void
  isGenerating: boolean
}

const MODE_TABS: Array<{ id: PlaygroundMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'video', label: 'Video', icon: Film },
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'music', label: 'Music', icon: MusicIcon },
]

export default function PromptPanel({ state, onChange, onModeChange, onClear, onSubmit, isGenerating }: PromptPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Mention popover state — open when the user just typed an @ that isn't
  // followed by a space. `mentionQuery` is what follows the most recent @.
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  // Drag-over visual hint.
  const [dragOver, setDragOver] = useState(false)
  // Preset slide-in overlay.
  const [presetOpen, setPresetOpen] = useState(false)

  const model = getModel(state.modelId)
  const taskForMode: Task = state.mode === 'image' ? 'image' : state.mode === 'video' ? 'video' : 'music'
  const addToast = useAppStore((s) => s.addToast)

  // Video ref slots derived from the refs[] array — start/end frames live as
  // single-value slots, ref strip as a list. Mutating these calls back through
  // setRefs which rewrites the whole refs[] array.
  function startFrameValue(): VideoInputValue | null {
    const r = state.refs.find((x) => x.slot === 'start')
    return r ? { dataUri: r.url } : null
  }
  function endFrameValue(): VideoInputValue | null {
    const r = state.refs.find((x) => x.slot === 'end')
    return r ? { dataUri: r.url } : null
  }
  function refStripValues(): VideoInputValue[] {
    return state.refs.filter((r) => r.slot === 'ref').map((r) => ({ dataUri: r.url }))
  }

  function setSlot(slot: PromptRef['slot'], value: VideoInputValue | null) {
    const others = state.refs.filter((r) => r.slot !== slot)
    if (!value) {
      onChange({ ...state, refs: others })
      return
    }
    onChange({
      ...state,
      refs: [...others, { url: value.dataUri, label: slot, source: 'upload', slot }],
    })
  }

  function setRefStrip(values: VideoInputValue[]) {
    const nonRefs = state.refs.filter((r) => r.slot !== 'ref')
    const refs = values.map((v) => ({ url: v.dataUri, label: 'ref', source: 'upload' as const, slot: 'ref' as const }))
    onChange({ ...state, refs: [...nonRefs, ...refs] })
  }

  // Audio / video reference clips (Seedance 2 family) live in refs[] under
  // their own slots, surfaced as MediaRefStrip chip values.
  function mediaStripValues(slot: 'audio' | 'video'): MediaRefValue[] {
    return state.refs
      .filter((r) => r.slot === slot)
      .map((r) => ({ dataUri: r.url, name: r.label, durationSeconds: r.durationSeconds }))
  }

  function setMediaStrip(slot: 'audio' | 'video', values: MediaRefValue[]) {
    const others = state.refs.filter((r) => r.slot !== slot)
    const refs = values.map((v) => ({
      url: v.dataUri, label: v.name, source: 'upload' as const, slot, durationSeconds: v.durationSeconds,
    }))
    onChange({ ...state, refs: [...others, ...refs] })
  }

  // Veo 3.1 Fast caps reference inputs at 3; Seedance family allows up to 9.
  // Match B-Roll Videos' rule. Gemini Omni's image cap is whatever its 7-slot
  // quota leaves after characters (×1 each) and the source clip (×2).
  const omniImageCap = 7
    - state.refs.filter((r) => r.slot === 'omni-character').length
    - (state.refs.some((r) => r.slot === 'omni-clip') ? 2 : 0)
  const maxRefs = model?.omniInputs
    ? Math.max(0, omniImageCap)
    : state.modelId === 'veo3_fast' ? 3 : 9
  const refsAllowed = model?.supportsReferenceImages ?? false
  const supportsFrames = !!model?.modes?.includes('image-to-video') || !!model?.modes?.includes('frames-to-video')
  const supportsEndFrame = !!model?.modes?.includes('frames-to-video')
  const supportsRefAudio = state.mode === 'video' && !!model?.supportsReferenceAudio
  const supportsRefVideos = state.mode === 'video' && !!model?.supportsReferenceVideos
  const isOmni = state.mode === 'video' && !!model?.omniInputs
  const isMotionControl = state.mode === 'video' && !!model?.motionControl
  const motionOrientation = state.characterOrientation ?? 'video'

  // For Image we register text-to-image by default; pickers filter on task
  // alone so models can advertise multiple modes and the picker shows them.
  const pickerMode: Mode | undefined = state.mode === 'image'
    ? 'text-to-image'
    : state.mode === 'video'
    ? undefined
    : 'text-to-music'

  // When the mode flips, swap to a sensible default model for that mode if
  // the previously-selected model doesn't fit. ModelPicker's persistence
  // layer (per-app + per-task key) handles per-mode memory automatically.
  useEffect(() => {
    if (!model || model.task !== taskForMode) {
      const persistedKey = `playground:${taskForMode}${pickerMode ? `:${pickerMode}` : ''}`
      const persisted = useSettingsStore.getState().getAppModel(persistedKey)
      const fallback = getDefaultModel('playground', taskForMode, pickerMode)?.id
      const next = persisted ?? fallback ?? ''
      if (next && next !== state.modelId) {
        onChange({ ...state, modelId: next })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode])

  // Snap constraint controls to allowed values when the model OR the mode
  // changes. Video and Image constraint sets don't overlap (video tier
  // strings like '720p' aren't valid image tiers like '1K'), so swapping
  // modes without re-clamping leaves stale values in `state.resolution`.
  useEffect(() => {
    const patch: Partial<PromptPanelState> = {}
    if (state.mode === 'video' && model?.videoConstraints) {
      const c = model.videoConstraints
      // Motion Control declares no aspect ratios (output inherits the image),
      // so only snap when the model actually offers a set.
      if (c.aspectRatios.length > 0 && !c.aspectRatios.includes(state.aspectRatio)) patch.aspectRatio = c.aspectRatios[0]
      if (c.durations.length > 0 && !c.durations.includes(state.durationSeconds)) patch.durationSeconds = c.durations[0]
      if (!c.resolutions.includes(state.resolution)) patch.resolution = c.default ?? c.resolutions[0] ?? '720p'
      if (!c.supportsAudio) patch.audio = false
    } else if (state.mode === 'image' && model?.imageConstraints) {
      const c = model.imageConstraints
      if (!c.resolutions.includes(state.resolution)) {
        patch.resolution = c.default ?? c.resolutions[0] ?? '1K'
      }
    }

    // Keep refs[] consistent with what the new model's UI can show — a slot
    // the panel doesn't render would otherwise hold invisible, undeletable
    // state that still alters the generation.
    if (state.mode === 'video') {
      let nextRefs = state.refs
      if (model?.motionControl) {
        // Motion Control only understands its own image + driving clip; every
        // other slot is dead state the panel won't render.
        nextRefs = nextRefs.filter((r) => r.slot === 'motion-image' || r.slot === 'motion-video')
      } else {
        // Leaving a motion-control model: drop its slots before the rest.
        nextRefs = nextRefs.filter((r) => r.slot !== 'motion-image' && r.slot !== 'motion-video')
        if (model?.omniInputs) {
          // Omni has no frame slots; a start/end frame is just another image ref.
          nextRefs = nextRefs.map((r) =>
            r.slot === 'start' || r.slot === 'end' ? { ...r, slot: 'ref' as const } : r,
          )
        } else {
          nextRefs = nextRefs.filter(
            (r) => r.slot !== 'omni-character' && r.slot !== 'omni-voice' && r.slot !== 'omni-clip',
          )
        }
        if (!model?.supportsReferenceAudio) nextRefs = nextRefs.filter((r) => r.slot !== 'audio')
        if (!model?.supportsReferenceVideos) nextRefs = nextRefs.filter((r) => r.slot !== 'video')
      }
      const changed = nextRefs.length !== state.refs.length
        || nextRefs.some((r, i) => r !== state.refs[i])
      if (changed) patch.refs = nextRefs
    }

    if (Object.keys(patch).length > 0) onChange({ ...state, ...patch })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.modelId, state.mode])

  function handlePromptChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    onChange({ ...state, prompt: value })

    // Detect mention trigger: most recent @ in the text, no space after.
    const caret = e.target.selectionStart ?? value.length
    const left = value.slice(0, caret)
    const at = left.lastIndexOf('@')
    if (at >= 0) {
      const after = left.slice(at + 1)
      if (!/\s/.test(after) && after.length <= 30) {
        setMentionQuery(after)
        setMentionOpen(true)
        return
      }
    }
    setMentionOpen(false)
  }

  function handleMentionSelect(ref: BankReference) {
    const textarea = textareaRef.current
    if (!textarea) return
    const value = state.prompt
    const caret = textarea.selectionStart ?? value.length
    const left = value.slice(0, caret)
    const at = left.lastIndexOf('@')
    if (at < 0) return

    const label =
      ref.kind === 'product' ? ref.item.productName
      : ref.kind === 'character' ? ref.item.name
      : ref.item.prompt.slice(0, 30) || 'b-roll'

    // Replace the @query with @Label + space; users see a chip-like inline token.
    const token = `@${label} `
    const before = value.slice(0, at)
    const after = value.slice(caret)
    const nextPrompt = before + token + after

    // Add a ref slot for the picked item.
    const imageSource =
      ref.kind === 'product' ? ref.item.productImage
      : ref.kind === 'character' ? ref.item.characterImage
      : ref.item.imageUrl

    // Skip refs for music mode (Suno doesn't accept them).
    const acceptsRefs = state.mode !== 'music' && !!imageSource
    const nextRefs = acceptsRefs
      ? [...state.refs, { url: imageSource, label, source: ref.kind, slot: 'ref' as const }]
      : state.refs

    onChange({ ...state, prompt: nextPrompt, refs: nextRefs })
    setMentionOpen(false)

    // Focus + put caret after the inserted token.
    requestAnimationFrame(() => {
      const t = textareaRef.current
      if (!t) return
      t.focus()
      const pos = (before + token).length
      t.setSelectionRange(pos, pos)
    })
  }

  function applyPreset(preset: Preset) {
    const aspectFromPreset = preset.defaultAspect ?? state.aspectRatio
    const durationFromPreset = preset.defaultDuration ?? state.durationSeconds
    // Clamp aspect / duration to the active model's constraints so the chips
    // don't show an unsupported value (the constraint useEffect only re-snaps
    // on model/mode change, not on a preset apply).
    const vc = model?.videoConstraints
    const allowedAspects = state.mode === 'image'
      ? model?.imageConstraints?.aspectRatios
      : vc?.aspectRatios
    const finalAspect = allowedAspects && !allowedAspects.includes(aspectFromPreset)
      ? allowedAspects[0]
      : aspectFromPreset
    const finalDuration =
      vc && vc.durations.length > 0 && !vc.durations.includes(durationFromPreset)
        ? vc.durations[0]
        : durationFromPreset

    // Append (with a blank-line separator) when there's already text in the
    // textarea — users were losing typed context every time they picked a
    // preset. Empty box → replace cleanly.
    const existing = state.prompt.trim()
    const nextPrompt = existing ? `${existing}\n\n${preset.prompt}` : preset.prompt

    onChange({
      ...state,
      prompt: nextPrompt,
      aspectRatio: finalAspect,
      durationSeconds: finalDuration,
    })
    textareaRef.current?.focus()
  }

  // Adds a dropped audio/video file to the matching media strip, enforcing
  // the same 15s-total cap as the strip's own upload button.
  async function addDroppedMedia(slot: 'audio' | 'video', file: File) {
    const existing = mediaStripValues(slot)
    if (existing.length >= 3) return
    const dataUri = await fileToDataUri(file)
    let durationSeconds: number | undefined
    try {
      durationSeconds = await readMediaDuration(dataUri, slot)
    } catch { /* let kie validate */ }
    if (durationSeconds) {
      const total = existing.reduce((s, v) => s + (v.durationSeconds ?? 0), 0) + durationSeconds
      if (total > 15) {
        addToast(`Combined ${slot} length can't exceed 15s — this clip would make it ${Math.ceil(total)}s.`, 'error')
        return
      }
    }
    setMediaStrip(slot, [...existing, { dataUri, name: file.name, durationSeconds }])
  }

  // Drag-and-drop a file onto the prompt panel. Routes by file type:
  // - Images: video mode → start frame if empty, else the reference strip;
  //   image mode → reference strip.
  // - Audio / video files: the matching reference strip when the active
  //   model accepts them (Seedance 2 family).
  // - Music mode → ignored.
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (state.mode === 'music') return
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.type.startsWith('audio/')) {
      if (supportsRefAudio) await addDroppedMedia('audio', file)
      return
    }
    if (file.type.startsWith('video/')) {
      if (supportsRefVideos) await addDroppedMedia('video', file)
      return
    }
    if (!file.type.startsWith('image/')) return
    const dataUri = await fileToDataUri(file)
    if (state.mode === 'video' && supportsFrames && !startFrameValue()) {
      setSlot('start', { dataUri })
      return
    }
    if (refsAllowed || state.mode === 'image') {
      setRefStrip([...refStripValues(), { dataUri }])
    }
  }

  // Parallel generations are allowed — the in-flight count never gates
  // submit. The user's kie.ai credits are the natural ceiling. Motion Control
  // has an optional prompt but two required inputs (character image + driving
  // video), so it gates on those instead of the prompt.
  const hasMotionInputs =
    state.refs.some((r) => r.slot === 'motion-image') && state.refs.some((r) => r.slot === 'motion-video')
  const canSubmit = !!state.modelId && (
    isMotionControl ? hasMotionInputs : state.prompt.trim().length > 0
  )
  void isGenerating

  // Position the mention popover near the textarea (lower-left).
  const popoverAnchor = { top: 8, left: 8 }

  const hasRefsSection = state.mode === 'video' || state.mode === 'image'
  // Presets are prompt formats; Motion Control's prompt is secondary, so skip them.
  const presetsApplicable = state.mode === 'image' || (state.mode === 'video' && !isMotionControl)

  const generateLabel =
    state.mode === 'image' ? 'Generate Image'
    : state.mode === 'video' ? 'Generate Video'
    : 'Generate Music'

  const GenerateIcon =
    state.mode === 'image' ? ImageIcon
    : state.mode === 'video' ? Film
    : MusicIcon

  const modelHeading =
    state.mode === 'image' ? 'Image Model'
    : state.mode === 'video' ? 'Video Model'
    : 'Music Model'

  // Motion Control bills per second of the *output*, which tracks the driving
  // clip clamped to the orientation cap (≤30s video / ≤10s photo). Estimate
  // from the attached clip's measured length so the credit readout is honest.
  const motionDrivingSeconds = state.refs.find((r) => r.slot === 'motion-video')?.durationSeconds
  const motionDuration = Math.min(motionDrivingSeconds ?? 5, motionOrientation === 'image' ? 10 : 30)

  const generateCredits = formatCredits(
    estimateCredits(state.modelId, {
      durationSeconds: isMotionControl ? motionDuration : state.mode === 'video' ? state.durationSeconds : undefined,
      imageCount: state.mode === 'image' ? 1 : undefined,
      resolution: state.mode !== 'music' ? state.resolution : undefined,
      audio: state.mode === 'video' ? state.audio : undefined,
      videoInput: state.mode === 'video' ? state.refs.some((r) => r.slot === 'omni-clip') : undefined,
    }),
  )

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (state.mode !== 'music') setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`relative flex h-full flex-col transition-colors ${
        dragOver ? 'bg-playground-500/[0.04]' : ''
      }`}
    >
      {/* Mode toggle — mirrors Voiceovers' Settings/History pattern. */}
      <div className="flex items-center px-5 pb-2 pt-4">
        <SegmentedToggle<PlaygroundMode>
          value={state.mode}
          onChange={onModeChange}
          options={MODE_TABS.map((tab) => ({ value: tab.id, label: tab.label, icon: tab.icon }))}
        />
      </div>

      {/* Middle: scrollable body — model picker, preset, refs, prompt. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full flex-col overflow-y-auto">
          <div className="flex grow flex-col gap-6 px-5 pb-6 pt-3">
            {/* Model */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink-200">{modelHeading}</span>
                <ClearAllButton onClear={onClear} />
              </div>
              <div className="mt-2">
                <ModelPicker
                  appId="playground"
                  task={taskForMode}
                  mode={pickerMode}
                  value={state.modelId}
                  onChange={(modelId) => onChange({ ...state, modelId })}
                  costParams={
                    state.mode === 'video'
                      ? {
                          durationSeconds: isMotionControl ? motionDuration : state.durationSeconds,
                          resolution: state.resolution,
                          audio: state.audio,
                        }
                      : state.mode === 'image'
                      ? { imageCount: 1, resolution: state.resolution }
                      : {}
                  }
                />
              </div>

              {/* Output settings — resolution / aspect (+ duration, audio,
                  lyrics per mode). Lives inside the Model section so the
                  chips hug the picker instead of floating a section away. */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {state.mode === 'video' && model?.videoConstraints && (
                <>
                  <ConstraintChip
                    openDirection="down"
                    options={model.videoConstraints.resolutions}
                    value={state.resolution}
                    onChange={(v) => onChange({ ...state, resolution: v })}
                  />
                  {/* Motion Control has no aspect/duration/audio controls — clip
                      length comes from the driving video and aspect from the
                      character image. Only the resolution chip applies. */}
                  {!isMotionControl && (
                  <ConstraintChip
                    openDirection="down"
                    options={model.videoConstraints.aspectRatios}
                    value={state.aspectRatio}
                    onChange={(v) => onChange({ ...state, aspectRatio: v })}
                    render={(v) => (
                      <span className="flex items-center gap-1.5">
                        <AspectIcon ratio={v} />
                        <span>{v}</span>
                      </span>
                    )}
                  />
                  )}
                  {!isMotionControl && model.videoConstraints.durations.length > 0 && (
                    <ConstraintChip
                      openDirection="down"
                      options={model.videoConstraints.durations.map(String)}
                      value={String(state.durationSeconds)}
                      onChange={(v) => onChange({ ...state, durationSeconds: Number(v) })}
                      render={(v) => <span>{v}s</span>}
                    />
                  )}
                  {!isMotionControl && model.videoConstraints.supportsAudio && (
                    <button
                      type="button"
                      onClick={() => onChange({ ...state, audio: !state.audio })}
                      className={`flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] transition-colors ${
                        state.audio
                          ? 'border-playground-500/30 bg-playground-500/10 text-playground-200'
                          : 'border-ink/10 bg-ink/[0.02] text-ink-400 hover:bg-ink/[0.05]'
                      }`}
                    >
                      {state.audio ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                      <span>{state.audio ? 'Audio' : 'Mute'}</span>
                    </button>
                  )}
                </>
              )}

              {state.mode === 'image' && model?.imageConstraints && (
                <>
                  <ConstraintChip
                    openDirection="down"
                    options={model.imageConstraints.resolutions}
                    value={state.resolution}
                    onChange={(v) => onChange({ ...state, resolution: v })}
                  />
                  {model.imageConstraints.aspectRatios && (
                    <ConstraintChip
                      openDirection="down"
                      options={model.imageConstraints.aspectRatios}
                      value={state.aspectRatio}
                      onChange={(v) => onChange({ ...state, aspectRatio: v })}
                      render={(v) => (
                        <span className="flex items-center gap-1.5">
                          <AspectIcon ratio={v} />
                          <span>{v}</span>
                        </span>
                      )}
                    />
                  )}
                </>
              )}

              {state.mode === 'music' && (
                <div className="inline-flex rounded-full border border-ink/10 bg-ink/[0.02] p-0.5">
                  <button
                    type="button"
                    onClick={() => onChange({ ...state, instrumental: true })}
                    className={`rounded-full px-4 py-1.5 text-[12px] transition-colors ${
                      state.instrumental
                        ? 'bg-playground-500/15 text-playground-200'
                        : 'text-ink-400 hover:text-ink-200'
                    }`}
                  >
                    Instrumental
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ...state, instrumental: false })}
                    className={`rounded-full px-4 py-1.5 text-[12px] transition-colors ${
                      !state.instrumental
                        ? 'bg-playground-500/15 text-playground-200'
                        : 'text-ink-400 hover:text-ink-200'
                    }`}
                  >
                    With lyrics
                  </button>
                </div>
              )}
              </div>
            </div>

            {/* Reference inputs */}
            {hasRefsSection && (
              <>
                {state.mode === 'video' && isMotionControl && (
                  <div>
                    <span className="text-sm font-medium text-ink-200">Motion inputs</span>
                    <div className="mt-2">
                      <MotionControlSection
                        refs={state.refs}
                        onChangeRefs={(refs) => onChange({ ...state, refs })}
                        orientation={motionOrientation}
                        onChangeOrientation={(o) => onChange({ ...state, characterOrientation: o })}
                        onError={(m) => addToast(m, 'error')}
                      />
                    </div>
                  </div>
                )}
                {state.mode === 'video' && !isMotionControl && (
                  <div>
                    <span className="text-sm font-medium text-ink-200">
                      {supportsFrames ? 'Reference frames' : 'Reference images'}
                    </span>
                    {supportsFrames && (
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <VideoInputSlot
                          label="Start frame"
                          helper="— optional"
                          value={startFrameValue()}
                          onChange={(v) => setSlot('start', v)}
                          bankType="brolls"
                          tabs={PLAYGROUND_FRAME_TABS}
                          compact
                        />
                        <VideoInputSlot
                          label="End frame"
                          helper={supportsEndFrame ? '— optional' : '— not supported'}
                          value={supportsEndFrame ? endFrameValue() : null}
                          onChange={(v) => supportsEndFrame && setSlot('end', v)}
                          bankType="brolls"
                          tabs={PLAYGROUND_FRAME_TABS}
                          compact
                        />
                      </div>
                    )}
                    {refsAllowed && (
                      <div className={supportsFrames ? 'mt-4' : 'mt-2'}>
                        <VideoRefStrip
                          label={supportsFrames ? 'Reference images' : ''}
                          helper="optional"
                          values={refStripValues()}
                          onChange={setRefStrip}
                          max={maxRefs}
                          bankType="models"
                          tabs={PLAYGROUND_REF_TABS}
                        />
                      </div>
                    )}
                    {supportsRefAudio && (
                      <div className="mt-4">
                        <MediaRefStrip
                          label="Reference audio"
                          helper="voice / lip-sync guidance, ≤15s total"
                          kind="audio"
                          values={mediaStripValues('audio')}
                          onChange={(v) => setMediaStrip('audio', v)}
                          max={3}
                          maxTotalSeconds={15}
                          onLimitError={(m) => addToast(m, 'error')}
                        />
                      </div>
                    )}
                    {supportsRefVideos && (
                      <div className="mt-4">
                        <MediaRefStrip
                          label="Reference videos"
                          helper="motion / style guidance, ≤15s total"
                          kind="video"
                          values={mediaStripValues('video')}
                          onChange={(v) => setMediaStrip('video', v)}
                          max={3}
                          maxTotalSeconds={15}
                          onLimitError={(m) => addToast(m, 'error')}
                        />
                      </div>
                    )}
                    {isOmni && (
                      <div className="mt-4">
                        <OmniInputsSection refs={state.refs} onChangeRefs={(refs) => onChange({ ...state, refs })} />
                      </div>
                    )}
                  </div>
                )}
                {state.mode === 'image' && (
                  <div>
                    <span className="text-sm font-medium text-ink-200">Reference images</span>
                    <div className="mt-2">
                      <VideoRefStrip
                        label=""
                        helper="optional"
                        values={refStripValues()}
                        onChange={setRefStrip}
                        max={4}
                        bankType="models"
                        tabs={PLAYGROUND_REF_TABS}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Prompt — grows to absorb leftover panel height so the textarea
                fills the page without making the panel itself scroll; once at
                max size, overflow scrolls inside the textarea. */}
            <div className="relative flex grow flex-col">
              <span className="text-sm font-medium text-ink-200">Prompt</span>
              {/* UGC Prompt Presets — slim row between the heading and the
                  textarea. Opens the slide-in picker. */}
              {presetsApplicable && (
                <button
                  type="button"
                  onClick={() => setPresetOpen(true)}
                  className="mt-2 flex w-full items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.02] px-3 py-1.5 text-left transition-colors hover:bg-ink/[0.05]"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-playground-500/10 text-playground-400">
                    <Camera className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-100">UGC Prompt Presets</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />
                </button>
              )}
              <textarea
                ref={textareaRef}
                value={state.prompt}
                onChange={handlePromptChange}
                onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
                rows={6}
                placeholder={
                  state.mode === 'image'
                    ? 'Describe the image you want… (type @ to reference banks)'
                    : isMotionControl
                    ? 'Optional — refine the motion or leave blank…'
                    : state.mode === 'video'
                    ? 'Describe the video… (type @ to reference banks)'
                    : 'Describe the music — genre, mood, instruments…'
                }
                className="mt-2 min-h-[120px] w-full grow resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-3.5 py-3 text-[13px] text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-ink/20 focus:bg-ink/[0.05]"
              />
              {mentionOpen && state.mode !== 'music' && !isMotionControl && (
                <MentionPopover
                  query={mentionQuery}
                  onSelect={handleMentionSelect}
                  anchor={popoverAnchor}
                />
              )}
              {!isMotionControl && (
                <p className="mt-2 text-[11px] text-ink-500">
                  Tip: type <span className="font-medium text-ink-400">@</span> to reference Products, Influencers, or B-Rolls.
                </p>
              )}
            </div>

          </div>
        </div>

        {/* Preset picker — right-edge slide-over, same chrome as the bank
            pickers so the app reads as one pattern. */}
        <SlideOver
          open={presetOpen}
          onClose={() => setPresetOpen(false)}
          title="UGC Prompt Presets"
          subtitle="Pick a format to prefill the prompt + aspect ratio"
        >
          <div className="grid grid-cols-2 gap-3 p-4">
            {(state.mode === 'image' ? IMAGE_PRESETS : VIDEO_PRESETS).map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                onClick={() => {
                  applyPreset(preset)
                  setPresetOpen(false)
                }}
              />
            ))}
          </div>
        </SlideOver>
      </div>

      {/* Bottom: pinned footer — big Generate button. */}
      <div className="shrink-0 border-t border-ink/5 px-5 py-4">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-playground-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] btn-soft-shadow transition-all hover:bg-playground-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GenerateIcon className="h-4 w-4" strokeWidth={2.5} />
          <span>
            {generateLabel}
            {generateCredits && <span className="text-white/70"> ({generateCredits})</span>}
          </span>
        </button>
        {state.mode === 'image' && <ModelWaitNotice modelId={state.modelId} className="mt-2" />}
      </div>
    </div>
  )
}

