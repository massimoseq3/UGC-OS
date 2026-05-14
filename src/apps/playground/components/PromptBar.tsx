import { useEffect, useRef, useState } from 'react'
import {
  Image as ImageIcon,
  Film,
  Music as MusicIcon,
  Send,
  Loader2,
  X,
  Volume2,
  VolumeX,
  Upload,
} from 'lucide-react'
import ModelPicker from '../../../components/ModelPicker'
import {
  getDefaultModel,
  getModel,
  type Task,
  type Mode,
} from '../../../utils/models'
import { useSettingsStore } from '../../../stores/settingsStore'
import { fileToDataUri } from '../../../utils/kie'
import PresetPicker from './PresetPicker'
import MentionPopover from './MentionPopover'
import type { PlaygroundMode, BankReference } from '../types'
import type { Preset } from '../presets'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Mention popover state — open when the user just typed an @ that isn't
  // followed by a space. `mentionQuery` is what follows the most recent @.
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  // Drag-over visual hint.
  const [dragOver, setDragOver] = useState(false)

  const model = getModel(state.modelId)
  const taskForMode: Task = state.mode === 'image' ? 'image' : state.mode === 'video' ? 'video' : 'music'

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

  // Snap constraint controls to allowed values when the model changes.
  useEffect(() => {
    if (state.mode === 'video' && model?.videoConstraints) {
      const c = model.videoConstraints
      const patch: Partial<PromptBarState> = {}
      if (!c.aspectRatios.includes(state.aspectRatio)) patch.aspectRatio = c.aspectRatios[0]
      if (c.durations.length > 0 && !c.durations.includes(state.durationSeconds)) patch.durationSeconds = c.durations[0]
      if (!c.resolutions.includes(state.resolution)) patch.resolution = c.resolutions[0] ?? '720p'
      if (!c.supportsAudio) patch.audio = false
      if (Object.keys(patch).length > 0) onChange({ ...state, ...patch })
    }
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

    onChange({
      ...state,
      prompt: preset.prompt,
      aspectRatio: finalAspect,
      durationSeconds: finalDuration,
    })
    textareaRef.current?.focus()
  }

  async function handleFileUpload(file: File | null) {
    if (!file || state.mode === 'music') return
    const dataUri = await fileToDataUri(file)
    // Image mode → 'ref'; video mode → 'start' if no start frame yet, else 'ref'.
    let slot: PromptRef['slot'] = 'ref'
    if (state.mode === 'video' && !state.refs.some((r) => r.slot === 'start')) slot = 'start'
    onChange({
      ...state,
      refs: [...state.refs, { url: dataUri, label: file.name, source: 'upload', slot }],
    })
  }

  function removeRef(idx: number) {
    onChange({ ...state, refs: state.refs.filter((_, i) => i !== idx) })
  }

  // Drag-and-drop anywhere on the bar.
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (state.mode === 'music') return
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) handleFileUpload(file)
  }

  const canSubmit = state.prompt.trim().length > 0 && !!state.modelId && !isGenerating

  // Position the mention popover near the textarea (lower-left for now).
  const popoverAnchor = { top: 8, left: 8 }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (state.mode !== 'music') setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`relative w-full rounded-2xl border bg-[#0B0B0D]/95 shadow-2xl backdrop-blur-xl transition-colors ${
        dragOver ? 'border-yellow-500/40' : 'border-white/10'
      }`}
    >
      {/* Mode tabs */}
      <div className="flex items-center gap-1 border-b border-white/5 px-3 pt-3">
        {MODE_TABS.map((tab) => {
          const Icon = tab.icon
          const active = state.mode === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange({ ...state, mode: tab.id })}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                active ? 'bg-white/[0.06] text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          )
        })}
        {state.mode === 'video' && (
          <div className="ml-auto">
            <PresetPicker onSelect={applyPreset} />
          </div>
        )}
      </div>

      {/* Ref strip */}
      {state.refs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-white/5 px-3 py-2">
          {state.refs.map((ref, i) => (
            <div
              key={i}
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.04]"
            >
              <img src={ref.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeRef(i)}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white/80 hover:bg-black hover:text-white"
              >
                <X className="h-2.5 w-2.5" />
              </button>
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 py-0.5 text-[8px] text-zinc-300">
                {ref.slot}
              </span>
            </div>
          ))}
        </div>
      )}

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
      <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-3 py-2.5">
        <div className="min-w-[160px] flex-1">
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

        {/* Constraint chips based on mode + model */}
        {state.mode === 'video' && model?.videoConstraints && (
          <>
            <ConstraintChip
              options={model.videoConstraints.aspectRatios}
              value={state.aspectRatio}
              onChange={(v) => onChange({ ...state, aspectRatio: v })}
            />
            {model.videoConstraints.durations.length > 0 && (
              <ConstraintChip
                options={model.videoConstraints.durations.map(String)}
                value={String(state.durationSeconds)}
                onChange={(v) => onChange({ ...state, durationSeconds: Number(v) })}
                render={(v) => `${v}s`}
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
                    ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'
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
          <ConstraintChip
            options={model.imageConstraints.resolutions}
            value={state.resolution}
            onChange={(v) => onChange({ ...state, resolution: v })}
          />
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

        {state.mode !== 'music' && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Upload reference image"
            className="flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-2.5 text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
          >
            <Upload className="h-3 w-3" />
            <span>Image refs</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files?.[0] ?? null)}
        />

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-yellow-500 text-black transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
          title="Generate"
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
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
  render?: (v: string) => string
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
        <span>{render ? render(value) : value}</span>
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

