// Scene Clips, as a block. The left column is how the script is filmed —
// scene by scene or as one clip, how many takes, what goes into every prompt
// (the look, the voice profile, the rules) — over Playground's model row and
// Generate. The right is the script as it'll be filmed: every scene with its
// length, whether the product is in shot, the exact prompt it sends, and the
// clips it made. What a member used to assemble by hand, scene by scene, is
// laid out here before a credit is spent.

import { useState } from 'react'
import { AlertTriangle, Clapperboard, Film, Play, ScrollText, SlidersHorizontal } from 'lucide-react'
import type { ClipRef, FlowBlock } from '../../types'
import { wiresInto } from '../../engine/graph'
import { useFlowStore } from '../../store/flowStore'
import { useSettingsStore } from '../../../../stores/settingsStore'
import { sceneKey, sceneTakes, scenesToFilm, type SceneShot } from '../../engine/sceneShots'
import { matchTextOf, sceneClipInput, sceneOverrun, sceneRefs, scenesVideoModel, scriptTextOf } from '../../engine/sceneClips'
import { getModel, videoResolutionLabel } from '../../../../utils/models'
import SegmentedToggle from '../../../../components/SegmentedToggle'
import SectionCard from '../../../../components/SectionCard'
import ModelPicker from '../../../../components/ModelPicker'
import ConstraintChip from '../../../../components/ConstraintChip'
import AutoGrowTextarea from '../../../../components/AutoGrowTextarea'
import Switch from '../../../../components/Switch'
import GridCanvas from '../../../../components/GridCanvas'
import VideoLightbox from '../../../../components/VideoLightbox'
import { useAssetThumb, useAssetUrl } from '../../../../hooks/useAssetUrl'
import { InputsBand, NothingYet, RunBand, RunChip, WiredCard } from './parts'
import { arrivingLabels, blockRuns, blockTitle, type BlockRun, type WindowProps } from './runs'
import { scenesAdvice } from '../scenesAdvice'

const TAKES = ['1', '2', '3']

export default function ScenesWindow({ doc, block, plan, run, onRun, onReview }: WindowProps) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const s = block.settings
  const set = (patch: Record<string, unknown>, coalesce?: string) => patchSettings(block.id, patch, coalesce ? { coalesce: `${coalesce}:${block.id}` } : undefined)
  const bp = plan?.blocks[block.id]
  const runs = blockRuns(block, bp, run)
  const scriptWires = wiresInto(doc, block.id, 'script')
  const appPick = useSettingsStore((st) => st.getAppModel('playground:video'))
  const modelId = scenesVideoModel(block, appPick)
  const video = getModel(modelId ?? '')?.videoConstraints
  const one = s.shape === 'one'
  const takes = sceneTakes(block)
  const count = runs.length || 1
  const advice = scenesAdvice(doc, block)
  // The chips show what a clip sends — the saved value fitted to the model.
  const probe = sceneClipInput(block, { shots: [], voice: '', style: '', scenes: false }, { number: 1, label: '', body: '', spoken: '', seconds: 8, showsProduct: true }, [])
  const keep = (picked: string, shown: string, patch: Record<string, unknown>) => {
    if (picked !== shown) set(patch)
  }

  return (
    <>
      <div className="flex w-[440px] shrink-0 flex-col border-r border-ink/5">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 px-5 pb-2 pt-4">
            {advice && (
              <div className="flex flex-col items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-[12px] leading-relaxed text-amber-200 light:text-amber-800">
                {advice.text}
                <button type="button" onClick={advice.apply} className="flex h-7 items-center rounded-full bg-amber-400 px-3 text-[12px] font-bold text-[#1c1204] transition-all hover:brightness-110">
                  {advice.fix}
                </button>
              </div>
            )}
            {scriptWires.length ? (
              <WiredCard doc={doc} block={block} port="script" hint="Each script that comes in is filmed as its own ad. Write it in Scripts as scenes, or remix a winning ad's scenes.">
                <Arriving runs={runs} from={blockTitle(doc, scriptWires[0].from)} />
              </WiredCard>
            ) : (
              <SectionCard icon={ScrollText} title="Scene Script">
                <AutoGrowTextarea
                  value={String(s.scriptText ?? '')}
                  onChange={(e) => set({ scriptText: e.target.value }, 'script')}
                  placeholder={'Paste a scene script from Scripts, or wire one in.\n\n--- Scene 1: THE HOOK (00:00-00:04) ---\n[CHARACTER] says: "…"'}
                  rows={6}
                  className="w-full resize-none rounded-2xl border border-ink/10 bg-ink/[0.02] px-4 py-3 text-[13px] leading-relaxed text-ink-200 placeholder-ink-600 outline-none focus:border-playground-500/30"
                />
              </SectionCard>
            )}

            <SectionCard icon={Clapperboard} title="How It's Filmed" contentClassName="flex flex-col gap-3">
              <SegmentedToggle
                options={[{ value: 'scenes', label: 'Scene by Scene' }, { value: 'one', label: 'One Clip' }]}
                value={one ? 'one' : 'scenes'}
                onChange={(v) => set({ shape: v })}
                accent="flow"
              />
              <p className="text-[11.5px] leading-relaxed text-ink-500">
                {one
                  ? 'The whole script as one clip, as long as its scenes together: the one-shot street interview. Keep it under your model\'s longest clip.'
                  : 'One clip per scene, each as long as its scene and never shorter than its lines take to say. Shorter clips fail less and cost less to redo.'}
              </p>
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium text-ink-200">Takes of Each Scene</span>
                  <span className="block text-[11px] text-ink-500">More takes, so the edit can keep the best</span>
                </span>
                <ConstraintChip size="lg" options={TAKES} value={String(takes)} onChange={(v) => set({ takes: Number(v) })} render={(v) => <span>{v} {v === '1' ? 'Take' : 'Takes'}</span>} />
              </div>
            </SectionCard>

            <SectionCard icon={SlidersHorizontal} title="In Every Clip" contentClassName="flex flex-col gap-2.5">
              <Toggle label="Visual Style" hint="The script's master look, in front of every scene" on={s.style !== false} onChange={(v) => set({ style: v })} />
              <Toggle label="Voice Profile" hint="The same voice in every clip, pasted after each scene" on={s.voice !== false} onChange={(v) => set({ voice: v })} />
              {!one && <Toggle label="Continuity" hint="Scene 1's first frame goes into every later scene, so the room and the light hold" on={s.continuity !== false} onChange={(v) => set({ continuity: v })} />}
              {!one && <Toggle label="Product Only Where It's Shown" hint="Scenes that don't show [PRODUCT] leave its photo out" on={s.productWhenShown !== false} onChange={(v) => set({ productWhenShown: v })} />}
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="text-[12.5px] font-medium text-ink-200">Rules for Every Clip</span>
                <AutoGrowTextarea
                  value={String(s.rules ?? '')}
                  onChange={(e) => set({ rules: e.target.value }, 'rules')}
                  placeholder="No captions or text on screen. One location."
                  rows={2}
                  className="w-full resize-none rounded-2xl border border-ink/10 bg-ink/[0.02] px-4 py-2.5 text-[12.5px] leading-relaxed text-ink-200 placeholder-ink-600 outline-none focus:border-playground-500/30"
                />
              </div>
            </SectionCard>
            <p className="px-1 text-[11px] leading-relaxed text-ink-500">The character, the product and any other picture come in on wires: use the strip across the top of the right side to add them.</p>
          </div>
        </div>

        <RunBand block={block} plan={plan} run={run} onRun={onRun} icon={Film} label={count > 1 ? `Film ${count} Ads` : 'Film the Scenes'}>
          <ModelPicker appId="playground" task="video" row value={modelId} onChange={(id) => set({ modelId: id })} persist={false} />
          {video && (
            <div className="flex flex-wrap items-center gap-1.5">
              {video.resolutions.length > 0 && <ConstraintChip grow size="lg" openDirection="up" options={video.resolutions} value={probe.resolution} onChange={(v) => keep(v, probe.resolution, { resolution: v })} render={videoResolutionLabel} />}
              {video.aspectRatios.length > 0 && <ConstraintChip grow size="lg" openDirection="up" options={video.aspectRatios} value={probe.aspectRatio} onChange={(v) => keep(v, probe.aspectRatio, { aspectRatio: v })} />}
              {video.supportsAudio && (
                <ConstraintChip grow size="lg" openDirection="up" options={['Audio', 'Mute']} value={probe.audio ? 'Audio' : 'Mute'} onChange={(v) => keep(v, probe.audio ? 'Audio' : 'Mute', { audio: v === 'Audio' })} />
              )}
            </div>
          )}
        </RunBand>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <InputsBand doc={doc} block={block} plan={plan} run={run} onReview={onReview} />
        <Output block={block} runs={runs} />
      </div>
    </>
  )
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium text-ink-200">{label}</span>
        <span className="block text-[11px] leading-snug text-ink-500">{hint}</span>
      </span>
      <Switch checked={on} onChange={onChange} label={label} accent="flow" size="sm" />
    </div>
  )
}

function Arriving({ runs, from }: { runs: BlockRun[]; from: string }) {
  const arriving = [...new Set(runs.flatMap((r) => arrivingLabels(r.inputs.script, from)))]
  if (!arriving.length) return null
  return (
    <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
      {arriving.slice(0, 6).map((a) => <span key={a} className="truncate rounded-xl bg-ink/[0.05] px-2.5 py-1.5 text-[11.5px] text-ink-300">{a}</span>)}
    </div>
  )
}

// One ad at a time: its scenes as they'll be filmed, and what's been made.
function Output({ block, runs }: { block: FlowBlock; runs: BlockRun[] }) {
  const [picked, setPicked] = useState<string | null>(null)
  const shown = runs.find((r) => r.key === picked) ?? runs.find((r) => r.result) ?? runs[0]
  const text = shown ? scriptTextOf(shown.inputs) : String(block.settings.scriptText ?? '')
  const waiting = !!shown?.inputs.script?.[0]?.pending
  const { script, shots } = text && !waiting ? scenesToFilm(block, text, false, shown ? matchTextOf(shown.inputs) : undefined) : { script: null, shots: [] as SceneShot[] }
  const made = shown?.result?.outputs.clips?.[0]
  const clips = made?.type === 'video' ? made.payload.clips : []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {runs.length > 1 && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-ink/5 px-5 py-2.5 [scrollbar-width:none]">
          {runs.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setPicked(r.key)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${r.key === shown?.key ? 'border-playground-500/40 bg-playground-500/10 text-ink-100' : 'border-ink/10 text-ink-400 hover:border-ink/20 hover:text-ink-200'}`}
            >
              <span className="max-w-[180px] truncate">{r.label}</span>
              <RunChip status={r.status} note={r.note} />
            </button>
          ))}
        </div>
      )}
      <GridCanvas>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!shots.length || !script ? (
            <NothingYet
              icon={Clapperboard}
              title={waiting ? 'Waiting on the script' : 'No scenes yet'}
              hint={shown?.error ?? (waiting
                ? 'Once the block before it writes the script, each scene shows here with its length and the prompt it sends.'
                : 'Wire in a scene script from Scripts, or paste one on the left. Each scene shows here with its length and the prompt it sends.')}
            />
          ) : (
            <div className="flex flex-col gap-3 px-6 py-6">
              {shown?.error && <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-[12px] text-red-300 light:text-red-700">{shown.error}</p>}
              {shots.map((shot) => (
                <SceneCard
                  key={shot.number}
                  block={block}
                  shot={shot}
                  prompt={sceneClipInput(block, script, shot, []).prompt}
                  seconds={sceneClipInput(block, script, shot, []).durationSeconds}
                  refs={shown ? sceneRefs(block, shown.inputs, shot).map((r) => r.label) : []}
                  clips={clips.filter((c) => c.scene === shot.number)}
                  kept={shown?.result?.keep}
                  running={shown?.status === 'running'}
                />
              ))}
            </div>
          )}
        </div>
      </GridCanvas>
    </div>
  )
}

function SceneCard({ block, shot, prompt, seconds, refs, clips, kept, running }: {
  block: FlowBlock
  shot: SceneShot
  prompt: string
  seconds: number
  refs: string[]
  clips: ClipRef[]
  // The takes picked at review, when there was one: the rest are left out.
  kept?: string[]
  running: boolean
}) {
  const [open, setOpen] = useState(false)
  const overrun = sceneOverrun(block, shot)
  const takes = sceneTakes(block)
  const aspect = String(block.settings.aspectRatio ?? '9:16')
  return (
    <div className="flex gap-4 rounded-3xl border border-ink/[0.07] bg-surface-1/80 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink-100">{shot.label}</span>
          <span className="rounded-full bg-ink/[0.07] px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-ink-300">{seconds}s clip</span>
          {refs.length > 0 && <span className="truncate text-[10.5px] text-ink-500">With {refs.join(', ')}</span>}
        </div>
        {overrun && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-amber-300 light:text-amber-700">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            Its lines need about {Math.ceil(shot.seconds)}s and this model stops at {overrun}s, so they may rush. Split the scene in Scripts, or pick a model with longer clips.
          </p>
        )}
        {shot.spoken && <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">“{shot.spoken}”</p>}
        <button type="button" onClick={() => setOpen(!open)} className="mt-2 text-[11px] font-medium text-ink-500 transition-colors hover:text-ink-200">
          {open ? 'Hide the Prompt' : 'Show the Prompt It Sends'}
        </button>
        {open && <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-ink/[0.04] p-3 font-sans text-[11.5px] leading-relaxed text-ink-300">{prompt}</pre>}
      </div>
      <div className="flex shrink-0 gap-2">
        {Array.from({ length: takes }, (_, t) => {
          const clip = clips.find((c) => (c.take ?? 0) === t)
          return clip ? <ClipTile key={sceneKey(shot.number, t)} clip={clip} aspect={aspect} out={!!kept && !kept.includes(sceneKey(shot.number, t))} /> : (
            <span key={t} className="flex w-[72px] items-center justify-center rounded-xl border border-dashed border-ink/15 text-[10px] text-ink-500" style={{ aspectRatio: aspect.replace(':', ' / ') }}>
              {running ? 'Filming' : `Take ${t + 1}`}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function ClipTile({ clip, aspect, out }: { clip: ClipRef; aspect: string; out: boolean }) {
  const [open, setOpen] = useState(false)
  const thumb = useAssetThumb(clip.ref)
  const url = useAssetUrl(open ? clip.ref : undefined)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`relative w-[72px] overflow-hidden rounded-xl border border-ink/10 ${out ? 'opacity-40' : ''}`} style={{ aspectRatio: aspect.replace(':', ' / ') }} title={out ? 'Left out at review · play this take' : 'Play this take'}>
        {thumb.url ? <img src={thumb.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 bg-ink/10" />}
        <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white"><Play className="ml-0.5 h-3.5 w-3.5" /></span></span>
        {out && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[9.5px] font-medium text-white">Left Out</span>}
      </button>
      {open && url && <VideoLightbox videoUrl={url} prompt={clip.prompt} fileStem="scene-clip" aspectRatio={aspect} sourceApp="playground" accentClass="border-playground-500/40 bg-playground-500/20 text-playground-100 hover:bg-playground-500/30" onClose={() => setOpen(false)} />}
    </>
  )
}
