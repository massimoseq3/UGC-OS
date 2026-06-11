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
import AspectIcon from '../../../components/AspectIcon'
import ConstraintChip from '../../../components/ConstraintChip'
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
  // Renderable URL: data: URI, http(s) URL, or asset:// ref.
  url: string
  label: string
  source: 'upload' | 'product' | 'character' | 'broll'
  // Where to slot the ref. 'start' → start frame, 'end' → end frame, 'ref' → reference image array.
  slot: 'start' | 'end' | 'ref'
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
}

interface PromptPanelProps {
  state: PromptPanelState
  onChange: (next: PromptPanelState) => void
  // Mode switch is special-cased so the parent can stash/restore each tab's
  // own prompt + refs instead of carrying them across tabs.
  onModeChange: (mode: PlaygroundMode) => void
  onSubmit: () => void
  isGenerating: boolean
}

const MODE_TABS: Array<{ id: PlaygroundMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'video', label: 'Video', icon: Film },
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'music', label: 'Music', icon: MusicIcon },
]

export default function PromptPanel({ state, onChange, onModeChange, onSubmit, isGenerating }: PromptPanelProps) {
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

  // Veo 3.1 Fast caps reference inputs at 3; Seedance family allows up to 9.
  // Match B-Roll Videos' rule.
  const maxRefs = state.modelId === 'veo3_fast' ? 3 : 9
  const refsAllowed = model?.supportsReferenceImages ?? false
  const supportsFrames = !!model?.modes?.includes('image-to-video') || !!model?.modes?.includes('frames-to-video')
  const supportsEndFrame = !!model?.modes?.includes('frames-to-video')

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
      if (!c.aspectRatios.includes(state.aspectRatio)) patch.aspectRatio = c.aspectRatios[0]
      if (c.durations.length > 0 && !c.durations.includes(state.durationSeconds)) patch.durationSeconds = c.durations[0]
      if (!c.resolutions.includes(state.resolution)) patch.resolution = c.default ?? c.resolutions[0] ?? '720p'
      if (!c.supportsAudio) patch.audio = false
    } else if (state.mode === 'image' && model?.imageConstraints) {
      const c = model.imageConstraints
      if (!c.resolutions.includes(state.resolution)) {
        patch.resolution = c.default ?? c.resolutions[0] ?? '1K'
      }
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

  // Drag-and-drop image onto the prompt panel. Routes to the appropriate slot:
  // - Video mode → start frame if empty, otherwise the reference strip.
  // - Image mode → reference strip.
  // - Music mode → ignored.
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (state.mode === 'music') return
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
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
  // submit. The user's kie.ai credits are the natural ceiling.
  const canSubmit = state.prompt.trim().length > 0 && !!state.modelId
  void isGenerating

  // Position the mention popover near the textarea (lower-left).
  const popoverAnchor = { top: 8, left: 8 }

  const hasRefsSection = state.mode === 'video' || state.mode === 'image'
  const presetsApplicable = state.mode === 'image' || state.mode === 'video'

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

  const generateCredits = formatCredits(
    estimateCredits(state.modelId, {
      durationSeconds: state.mode === 'video' ? state.durationSeconds : undefined,
      imageCount: state.mode === 'image' ? 1 : undefined,
      resolution: state.mode !== 'music' ? state.resolution : undefined,
      audio: state.mode === 'video' ? state.audio : undefined,
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
      {/* Top: mode toggle — mirrors Voiceovers' Settings/History pattern. */}
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
          <div className="flex grow flex-col gap-6 px-5 py-6">
            {/* Model */}
            <div>
              <span className="text-sm font-medium text-zinc-200">{modelHeading}</span>
              <div className="mt-2">
                <ModelPicker
                  appId="playground"
                  task={taskForMode}
                  mode={pickerMode}
                  value={state.modelId}
                  onChange={(modelId) => onChange({ ...state, modelId })}
                  costParams={
                    state.mode === 'video'
                      ? { durationSeconds: state.durationSeconds, resolution: state.resolution, audio: state.audio }
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
                  {model.videoConstraints.durations.length > 0 && (
                    <ConstraintChip
                      openDirection="down"
                      options={model.videoConstraints.durations.map(String)}
                      value={String(state.durationSeconds)}
                      onChange={(v) => onChange({ ...state, durationSeconds: Number(v) })}
                      render={(v) => <span>{v}s</span>}
                    />
                  )}
                  {model.videoConstraints.supportsAudio && (
                    <button
                      type="button"
                      onClick={() => onChange({ ...state, audio: !state.audio })}
                      className={`flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] transition-colors ${
                        state.audio
                          ? 'border-playground-500/30 bg-playground-500/10 text-playground-200'
                          : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]'
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
                <div className="inline-flex rounded-full border border-white/10 bg-white/[0.02] p-0.5">
                  <button
                    type="button"
                    onClick={() => onChange({ ...state, instrumental: true })}
                    className={`rounded-full px-4 py-1.5 text-[12px] transition-colors ${
                      state.instrumental
                        ? 'bg-playground-500/15 text-playground-200'
                        : 'text-zinc-400 hover:text-zinc-200'
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
                        : 'text-zinc-400 hover:text-zinc-200'
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
                {state.mode === 'video' && (
                  <div>
                    <span className="text-sm font-medium text-zinc-200">Reference frames</span>
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
                      <div className="mt-4">
                        <VideoRefStrip
                          label="Reference images"
                          helper="optional"
                          values={refStripValues()}
                          onChange={setRefStrip}
                          max={maxRefs}
                          bankType="models"
                          tabs={PLAYGROUND_REF_TABS}
                        />
                      </div>
                    )}
                  </div>
                )}
                {state.mode === 'image' && (
                  <div>
                    <span className="text-sm font-medium text-zinc-200">Reference images</span>
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
              <span className="text-sm font-medium text-zinc-200">Prompt</span>
              {/* UGC Prompt Presets — slim row between the heading and the
                  textarea. Opens the slide-in picker. */}
              {presetsApplicable && (
                <button
                  type="button"
                  onClick={() => setPresetOpen(true)}
                  className="mt-2 flex w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-playground-500/10 text-playground-400">
                    <Camera className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-100">UGC Prompt Presets</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
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
                    : state.mode === 'video'
                    ? 'Describe the video… (type @ to reference banks)'
                    : 'Describe the music — genre, mood, instruments…'
                }
                className="mt-2 min-h-[120px] w-full grow resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[13px] text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.05]"
              />
              {mentionOpen && state.mode !== 'music' && (
                <MentionPopover
                  query={mentionQuery}
                  onSelect={handleMentionSelect}
                  anchor={popoverAnchor}
                />
              )}
              <p className="mt-2 text-[11px] text-zinc-500">
                Tip: type <span className="font-medium text-zinc-400">@</span> to reference Products, Influencers, or B-Rolls.
              </p>
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
      <div className="shrink-0 border-t border-white/5 px-5 py-4">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-playground-500 px-6 py-3.5 text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-playground-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GenerateIcon className="h-4 w-4" strokeWidth={2.5} />
          <span>
            {generateLabel}
            {generateCredits && <span className="text-white/70"> ({generateCredits})</span>}
          </span>
        </button>
      </div>
    </div>
  )
}

