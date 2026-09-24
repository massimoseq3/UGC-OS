// The B-Roll and Playground blocks' settings. B-Roll runs Line-by-Line — a
// storyboard of the script, a still per shot, then a clip per kept still — and
// every run lands as a session that opens in B-Roll. Playground makes one
// image, clip or track per run from its prompt and whatever pictures are
// wired into References.

import type { FlowBlock, FlowDoc } from '../../types'
import { useFlowStore } from '../../store/flowStore'
import { wiresInto } from '../../engine/graph'
import { brollVideoResolution } from '../../engine/cost'
import { CONTINUOUS_STYLES } from '../../../../utils/visualStyle'
import { getDefaultModel, getModel, imageResolutionsFor } from '../../../../utils/models'
import { useSettingsStore } from '../../../../stores/settingsStore'
import SegmentedToggle from '../../../../components/SegmentedToggle'
import Dropdown from '../../../../components/Dropdown'
import AutoGrowTextarea from '../../../../components/AutoGrowTextarea'
import ModelPicker from '../../../../components/ModelPicker'
import ScriptModelRow from '../../../../components/ScriptModelRow'
import { FieldLabel, ToggleRow } from './common'

const TEXTAREA = 'w-full resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-[13px] text-ink-100 placeholder-ink-600 outline-none transition-colors focus:border-ink/20'
const ASPECTS = ['9:16', '16:9', '1:1']

export function BrollPanel({ block, doc }: { block: FlowBlock; doc: FlowDoc }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const s = block.settings
  const set = (patch: Record<string, unknown>, coalesce?: string) => patchSettings(block.id, patch, coalesce ? { coalesce: `${coalesce}:${block.id}` } : undefined)
  // Read through the selector so the row follows a pick made in B-Roll; the
  // fallback order is brollVideoModel's (engine/cost.ts), the run's own.
  const appVideo = useSettingsStore((st) => st.getAppModel('broll-studio:video'))
  const videoModel = (s.videoModelId as string | undefined) ?? appVideo ?? getDefaultModel('broll-studio', 'video')?.id
  const resolutions = videoModel ? getModel(videoModel)?.videoConstraints?.resolutions ?? [] : []
  const styleWired = wiresInto(doc, block.id, 'style').length > 0
  const animate = s.animate !== false

  return (
    <div className="flex flex-col gap-3 px-5 pb-4 pt-4">
      <SegmentedToggle
        options={[{ value: 'silent', label: 'B-Roll' }, { value: 'dialogue', label: 'Dialogue' }]}
        value={s.delivery === 'dialogue' ? 'dialogue' : 'silent'}
        onChange={(v) => set({ delivery: v })}
        accent="broll"
      />
      <p className="-mt-1 px-1 text-[11px] leading-relaxed text-ink-500">
        {s.delivery === 'dialogue'
          ? 'The character speaks each line on camera, staged three different ways.'
          : 'Silent shots for each line. The voiceover is laid over them in the edit.'}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {styleWired ? (
          <p className="col-span-2 rounded-2xl border border-dashed border-ink/10 px-4 py-3 text-xs text-ink-500">The look comes in on its wire.</p>
        ) : (
          <Dropdown
            label="Look"
            accent="broll"
            value={String(s.styleId ?? 'ugc')}
            options={CONTINUOUS_STYLES.map((st) => ({ value: st.id, label: st.label }))}
            onChange={(v) => set({ styleId: v })}
            className="col-span-2"
          />
        )}
        <Dropdown
          label="Takes per Line"
          accent="broll"
          value={String(s.takes ?? 1)}
          options={['1', '2', '3']}
          onChange={(v) => set({ takes: Number(v) })}
        />
        <Dropdown
          label="Aspect"
          accent="broll"
          value={String(s.aspectRatio ?? '9:16')}
          options={ASPECTS}
          onChange={(v) => set({ aspectRatio: v })}
        />
      </div>

      <ToggleRow
        label="Animate the Stills"
        hint="Off makes the stills only. On, every kept still becomes a clip."
        checked={animate}
        onChange={(next) => set({ animate: next })}
      />

      {animate && (
        <>
          <ModelPicker
            appId="broll-studio"
            task="video"
            row
            value={videoModel}
            onChange={(id) => set({ videoModelId: id })}
            persist={false}
            requireAnyModes={['image-to-video', 'reference-to-video']}
            requireModeNote="Greyed models can't start from a still."
          />
          {resolutions.length > 1 && (
            <Dropdown
              label="Clip Quality"
              accent="broll"
              value={brollVideoResolution(block, videoModel)}
              options={resolutions}
              onChange={(v) => set({ videoResolution: v })}
            />
          )}
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <FieldLabel>Instructions</FieldLabel>
        <AutoGrowTextarea
          value={String(s.context ?? '')}
          onChange={(e) => set({ context: e.target.value }, 'context')}
          placeholder="Optional. Anything every shot should respect: a setting, a prop, what to avoid."
          className={TEXTAREA}
          rows={2}
        />
      </div>

      <ScriptModelRow appId="broll-studio" className="mb-0" />
      <p className="px-1 text-[11px] leading-relaxed text-ink-500">
        Storyboards with the same model as the B-Roll app. Each run is saved as a session you can open in B-Roll.
      </p>
    </div>
  )
}

export function PlaygroundPanel({ block, doc }: { block: FlowBlock; doc: FlowDoc }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const s = block.settings
  const set = (patch: Record<string, unknown>, coalesce?: string) => patchSettings(block.id, patch, coalesce ? { coalesce: `${coalesce}:${block.id}` } : undefined)
  const mode = s.mode === 'video' || s.mode === 'music' ? s.mode : 'image'
  const promptWired = wiresInto(doc, block.id, 'prompt').length > 0
  const task = mode
  const modelMode = mode === 'image' ? 'text-to-image' : mode === 'music' ? 'text-to-music' : undefined
  // Until the block picks its own, it runs on Playground's pick — the same
  // fallback its run makes (engine/cost.ts playgroundInput).
  const appPick = useSettingsStore((st) => st.getAppModel(mode === 'image' ? 'playground:image:text-to-image' : mode === 'video' ? 'playground:video' : 'playground:music:text-to-music'))
  const modelId = (s.modelId as string | undefined) ?? appPick ?? getDefaultModel('playground', task, modelMode)?.id
  const model = modelId ? getModel(modelId) : undefined
  const video = model?.videoConstraints
  const imageResolutions = modelId && mode === 'image' ? imageResolutionsFor(modelId) : []

  return (
    <div className="flex flex-col gap-3 px-5 pb-4 pt-4">
      <SegmentedToggle
        options={[{ value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }, { value: 'music', label: 'Music' }]}
        value={mode}
        onChange={(v) => set({ mode: v, modelId: undefined })}
        accent="playground"
      />
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Prompt</FieldLabel>
        {promptWired ? (
          <p className="rounded-2xl border border-dashed border-ink/10 px-4 py-3 text-xs text-ink-500">Comes in on its wire.</p>
        ) : (
          <AutoGrowTextarea
            value={String(s.prompt ?? '')}
            onChange={(e) => set({ prompt: e.target.value }, 'prompt')}
            placeholder={mode === 'music' ? 'Describe the track.' : 'Describe what to make. Pictures wired into References come along.'}
            className={TEXTAREA}
            rows={4}
          />
        )}
      </div>
      <ModelPicker
        appId="playground"
        task={task}
        mode={modelMode}
        row
        value={modelId}
        onChange={(id) => set({ modelId: id })}
        persist={false}
      />
      {mode === 'image' && (
        <div className="grid grid-cols-2 gap-2">
          <Dropdown label="Aspect" accent="playground" value={String(s.aspectRatio ?? '9:16')} options={ASPECTS} onChange={(v) => set({ aspectRatio: v })} />
          <Dropdown label="Quality" accent="playground" value={String(s.resolution ?? '1K')} options={imageResolutions} onChange={(v) => set({ resolution: v })} />
        </div>
      )}
      {mode === 'video' && video && (
        <div className="grid grid-cols-2 gap-2">
          <Dropdown label="Aspect" accent="playground" value={String(s.aspectRatio ?? '9:16')} options={video.aspectRatios} onChange={(v) => set({ aspectRatio: v })} />
          <Dropdown label="Length" accent="playground" value={String(s.durationSeconds ?? video.durations[0])} options={video.durations.map((d) => ({ value: String(d), label: `${d}s` }))} onChange={(v) => set({ durationSeconds: Number(v) })} />
          <Dropdown label="Quality" accent="playground" value={String(s.resolution ?? video.default ?? video.resolutions[0])} options={video.resolutions} onChange={(v) => set({ resolution: v })} />
          {video.supportsAudio && (
            <Dropdown label="Sound" accent="playground" value={s.audio ? 'on' : 'off'} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} onChange={(v) => set({ audio: v === 'on' })} />
          )}
        </div>
      )}
      {mode === 'music' && (
        <ToggleRow label="Instrumental" hint="No vocals." checked={!!s.instrumental} onChange={(next) => set({ instrumental: next })} />
      )}
    </div>
  )
}
