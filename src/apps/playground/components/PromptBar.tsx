import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Image as ImageIcon,
  Film,
  Music as MusicIcon,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react'
import ModelPicker from '../../../components/ModelPicker'
import AspectIcon from '../../../components/AspectIcon'
import {
  getDefaultModel,
  getModel,
  type Task,
  type Mode,
} from '../../../utils/models'
import { useSettingsStore } from '../../../stores/settingsStore'
import { fileToDataUri } from '../../../utils/kie'
import VideoInputSlot, { type VideoInputValue } from '../../../components/video/VideoInputSlot'
import VideoRefStrip from '../../../components/video/VideoRefStrip'
import type { BankType } from '../../../utils/constants'
import type { BRoll } from '../../../stores/types'
import PresetPicker from './PresetPicker'
import MentionPopover from './MentionPopover'
import type { PlaygroundMode, BankReference } from '../types'
import type { Preset } from '../presets'

// Tabs passed to BankPicker when used from Playground refs. Characters comes
// first so opening the picker lands the user there by default; B-Rolls are
// filtered to those with stills (videos-only b-rolls aren't useful as image
// refs).
const PLAYGROUND_REF_TABS: Array<{ type: BankType; filter?: (item: BRoll | unknown) => boolean }> = [
  { type: 'models' },
  { type: 'products' },
  { type: 'brolls', filter: (item) => !!(item as BRoll).imageUrl },
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

export interface PromptBarState {
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

interface PromptBarProps {
  state: PromptBarState
  onChange: (next: PromptBarState) => void
  onSubmit: () => void
  isGenerating: boolean
}

const MODE_TABS: Array<{ id: PlaygroundMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'music', label: 'Music', icon: MusicIcon },
]

export default function PromptBar({ state, onChange, onSubmit, isGenerating }: PromptBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Mention popover state — open when the user just typed an @ that isn't
  // followed by a space. `mentionQuery` is what follows the most recent @.
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  // Drag-over visual hint.
  const [dragOver, setDragOver] = useState(false)

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
    const patch: Partial<PromptBarState> = {}
    if (state.mode === 'video' && model?.videoConstraints) {
      const c = model.videoConstraints
      if (!c.aspectRatios.includes(state.aspectRatio)) patch.aspectRatio = c.aspectRatios[0]
      if (c.durations.length > 0 && !c.durations.includes(state.durationSeconds)) patch.durationSeconds = c.durations[0]
      if (!c.resolutions.includes(state.resolution)) patch.resolution = c.resolutions[0] ?? '720p'
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
    // Clamp aspect / duration to the current model's constraints if it's a
    // video model — otherwise the constraint useEffect will snap them.
    const c = model?.videoConstraints
    const finalAspect = c && !c.aspectRatios.includes(aspectFromPreset)
      ? c.aspectRatios[0]
      : aspectFromPreset
    const finalDuration =
      c && c.durations.length > 0 && !c.durations.includes(durationFromPreset)
        ? c.durations[0]
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

  // Drag-and-drop image onto the prompt bar. Routes to the appropriate slot:
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

  // Position the mention popover near the textarea (lower-left for now).
  const popoverAnchor = { top: 8, left: 8 }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (state.mode !== 'music') setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      // Glassmorphism: translucent + backdrop blur so history tiles
      // visibly slide *under* the bar as the grid scrolls behind it.
      // Safe to use backdrop-filter here because BankPicker renders through
      // a portal at document.body, so it isn't trapped by our containing
      // block.
      className={`relative w-full rounded-2xl border bg-[#0B0B0D]/70 shadow-2xl backdrop-blur-xl transition-colors ${
        dragOver ? 'border-green-500/40' : 'border-white/10'
      }`}
    >
      {/* Mode tabs — underline style, matches VoiceStudio's Settings/History
          tab strip so the two pieces of chrome read consistently across apps. */}
      <div className="flex items-center gap-1 border-b border-white/5 px-3">
        {MODE_TABS.map((tab) => {
          const Icon = tab.icon
          const active = state.mode === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange({ ...state, mode: tab.id })}
              className={`relative flex items-center gap-1.5 px-3 pb-2 pt-3 text-[13px] font-medium tracking-tight transition-colors ${
                active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
              {active && (
                <motion.span
                  layoutId="playground-mode-underline"
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-zinc-100"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          )
        })}
        {/* Presets apply to Image and Video modes — the curated UGC ad formats
            describe a frame's content, which is meaningful for both a still
            and a clip. Music mode has no curated presets in v1. */}
        {(state.mode === 'image' || state.mode === 'video') && (
          <div className="ml-auto">
            <PresetPicker onSelect={applyPreset} />
          </div>
        )}
      </div>

      {/* Frame + reference inputs.
          Height is animated via the CSS grid-rows trick (0fr ↔ 1fr) so
          collapsing/expanding the section between Video / Image / Music
          slides everything below it smoothly instead of snapping. An
          inner AnimatePresence cross-fades between video↔image content
          when both modes have refs. Music: no refs (Suno doesn't accept them). */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: state.mode === 'music' ? '0fr' : '1fr' }}
      >
        <div className="overflow-hidden">
          <motion.div
            layout
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="border-b border-white/5 px-3 py-3"
          >
            <AnimatePresence mode="wait" initial={false}>
              {state.mode === 'video' && (
                <motion.div
                  key="video-refs"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                  {supportsFrames && (
                    <div className="flex flex-wrap gap-3">
                      <VideoInputSlot
                        label="Start frame"
                        helper="— optional"
                        value={startFrameValue()}
                        onChange={(v) => setSlot('start', v)}
                        bankType="models"
                        tabs={PLAYGROUND_REF_TABS}
                        compact
                      />
                      <VideoInputSlot
                        label="End frame"
                        helper={supportsEndFrame ? '— optional' : '— not supported by this model'}
                        value={supportsEndFrame ? endFrameValue() : null}
                        onChange={(v) => supportsEndFrame && setSlot('end', v)}
                        bankType="models"
                        tabs={PLAYGROUND_REF_TABS}
                        compact
                      />
                    </div>
                  )}
                  {refsAllowed && (
                    <div className={supportsFrames ? 'mt-3' : ''}>
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
                </motion.div>
              )}
              {state.mode === 'image' && (
                <motion.div
                  key="image-refs"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                  <VideoRefStrip
                    label="Reference images"
                    helper="optional"
                    values={refStripValues()}
                    onChange={setRefStrip}
                    max={4}
                    bankType="models"
                    tabs={PLAYGROUND_REF_TABS}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* Textarea */}
      <div className="relative px-3 pt-2">
        <textarea
          ref={textareaRef}
          value={state.prompt}
          onChange={handlePromptChange}
          onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
          rows={3}
          placeholder={
            state.mode === 'image'
              ? 'Describe the image you want… (type @ to reference banks)'
              : state.mode === 'video'
              ? 'Describe the video… (type @ to reference banks)'
              : 'Describe the music — genre, mood, instruments…'
          }
          className="w-full resize-none bg-transparent text-[13px] text-zinc-200 placeholder-zinc-600 outline-none"
        />
        {mentionOpen && state.mode !== 'music' && (
          <MentionPopover
            query={mentionQuery}
            onSelect={handleMentionSelect}
            anchor={popoverAnchor}
          />
        )}
      </div>

      {/* Footer: model + constraints + submit */}
      <motion.div
        layout
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex flex-wrap items-center gap-2 border-t border-white/5 px-3 py-2.5"
      >
        <motion.div layout="position" className="min-w-[160px] flex-1">
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
        </motion.div>

        {/* Constraint chips based on mode + model. Aspect chips include a
            tiny outlined rectangle preview so users can see at a glance what
            '9:16' vs '16:9' actually looks like. */}
        {state.mode === 'video' && model?.videoConstraints && (
          <>
            <ConstraintChip
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
                options={model.videoConstraints.durations.map(String)}
                value={String(state.durationSeconds)}
                onChange={(v) => onChange({ ...state, durationSeconds: Number(v) })}
                render={(v) => <span>{v}s</span>}
              />
            )}
            <ConstraintChip
              options={model.videoConstraints.resolutions}
              value={state.resolution}
              onChange={(v) => onChange({ ...state, resolution: v })}
            />
            {model.videoConstraints.supportsAudio && (
              <button
                type="button"
                onClick={() => onChange({ ...state, audio: !state.audio })}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  state.audio
                    ? 'border-green-500/30 bg-green-500/10 text-green-200'
                    : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]'
                }`}
              >
                {state.audio ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                <span>{state.audio ? 'Audio' : 'Mute'}</span>
              </button>
            )}
          </>
        )}

        {state.mode === 'image' && model?.imageConstraints && (
          <>
            {model.imageConstraints.aspectRatios && (
              <ConstraintChip
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
            <ConstraintChip
              options={model.imageConstraints.resolutions}
              value={state.resolution}
              onChange={(v) => onChange({ ...state, resolution: v })}
            />
          </>
        )}

        {state.mode === 'music' && (
          <button
            type="button"
            onClick={() => onChange({ ...state, instrumental: !state.instrumental })}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              state.instrumental
                ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200'
                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]'
            }`}
          >
            <span>{state.instrumental ? 'Instrumental' : 'With lyrics'}</span>
          </button>
        )}

        <motion.button
          layout
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-black transition-colors hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-40"
          title="Generate"
        >
          <Send className="h-4 w-4" />
        </motion.button>
      </motion.div>
    </div>
  )
}

function ConstraintChip({
  options,
  value,
  onChange,
  render,
}: {
  options: string[]
  value: string
  onChange: (next: string) => void
  // Returns the chip's content — pass JSX (e.g. icon + label) or a string.
  render?: (v: string) => React.ReactNode
}) {
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
  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-2.5 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.05]"
      >
        {render ? render(value) : <span>{value}</span>}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-1 min-w-[100px] overflow-hidden rounded-md border border-white/10 bg-[#0B0B0D]/95 shadow-xl backdrop-blur-xl">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`block w-full px-3 py-1.5 text-left text-[11px] transition-colors ${
                opt === value ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-300 hover:bg-white/[0.05]'
              }`}
            >
              {render ? render(opt) : opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

