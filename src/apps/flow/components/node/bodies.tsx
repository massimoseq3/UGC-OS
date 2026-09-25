// What an app block shows under its ports: the thing it makes, as the app
// itself would show it at a glance — the hooks as lines, the faces, the
// voice and its takes, the stills and clips, the image, the analysis, the
// folders. Each reads the plan (what's made, what's planned) and the live
// run (what's running now), so a run is watched happening on the canvas.

import { Handle, Position } from '@xyflow/react'
import { Check, Download, Eye, EyeOff, Film, Image as ImageIcon, Music, Play, X } from 'lucide-react'
import type { FlowBlock, FlowValue } from '../../types'
import type { BlockPlan } from '../../engine/plan'
import { itemNoun, outsOf, sourceOf, TYPE_META } from '../../engine/catalog'
import { itemPort, liveItems, wiresInto, wiresOutOf } from '../../engine/graph'
import { brollVideoModel } from '../../engine/cost'
import { useFlowStore } from '../../store/flowStore'
import { useBankStore } from '../../../../stores/bankStore'
import { useSettingsStore } from '../../../../stores/settingsStore'
import { useAssetThumb } from '../../../../hooks/useAssetUrl'
import Spinner from '../../../../components/Spinner'
import { getModel } from '../../../../utils/models'
import { getVoiceById, sanitizeVoiceSettings, type VoiceSettings } from '../../../voice-studio/types'
import { seedColor } from '../../../voice-studio/components/seedColor'
import { resolveImageModelId } from '../../../broll-studio/services/generateBroll'
import { downloadEditPacks } from '../../run/editPack'
import { useCanvas } from '../canvasContext'
import { latestItems, madeValues } from './made'
import { scenesToFilm, sceneTakes } from '../../engine/sceneShots'
import { matchTextOf, scenesVideoModel, scriptTextOf } from '../../engine/sceneClips'
import { scenesAdvice } from '../scenesAdvice'

// ── Batches: hooks, faces, ads ─────────────────────────────────────────────

export function ItemRows({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const toggleItem = useFlowStore((s) => s.toggleItem)
  const deleteItem = useFlowStore((s) => s.deleteItem)
  const { doc, run } = useCanvas()
  const items = liveItems(block)
  const noun = itemNoun(block)
  const made = latestItems(bp)
  const outType = outsOf(block)[0]?.type ?? 'text'
  const color = TYPE_META[outType].color
  const editable = sourceOf(block) !== 'history' || block.kind === 'scripts'
  const writing = run?.status === 'running' && run.blocks[block.id]?.status === 'running'
  const shown = items.slice(0, 12)
  return (
    <div className="flex flex-col gap-px border-t border-ink/5 py-1">
      {shown.map((it, i) => {
        const value = made[it.id]
        const used = wiresOutOf(doc, block.id).some((w) => w.fromPort === itemPort(it.id))
        return (
          <div key={it.id} className={`group/item relative flex h-[26px] items-center gap-1.5 pl-2 pr-3.5 ${it.off ? 'opacity-40' : ''}`}>
            <button
              type="button"
              onClick={() => toggleItem(block.id, it.id)}
              className="nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-ink-500 opacity-0 transition-opacity hover:bg-ink/5 hover:text-ink-200 group-hover/item:opacity-100 touch:opacity-100"
              style={it.off ? { opacity: 1 } : undefined}
              title={it.off ? `Turn ${noun} ${i + 1} On` : `Turn ${noun} ${i + 1} Off · nothing downstream runs for it`}
            >
              {it.off ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
            <ItemFace value={value} noun={noun} index={i} writing={writing && !value} />
            {editable && (
              <button
                type="button"
                onClick={() => deleteItem(block.id, it.id)}
                className="nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-ink-600 opacity-0 hover:bg-ink/5 hover:text-ink-200 group-hover/item:opacity-100 touch:opacity-100"
                title={`Delete ${noun} ${i + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <Handle
              type="source"
              position={Position.Right}
              id={itemPort(it.id)}
              className="flow-port flow-port-item"
              style={{ background: used ? color : 'var(--color-surface-1)', borderColor: color }}
              title={`${noun} ${i + 1} on its own`}
            />
          </div>
        )
      })}
      {items.length > shown.length && (
        <span className="px-3 py-1 text-[10px] text-ink-500">+{items.length - shown.length} more · all go out through {outsOf(block)[0]?.label}</span>
      )}
    </div>
  )
}

function ItemFace({ value, noun, index, writing }: { value: FlowValue | undefined; noun: string; index: number; writing: boolean }) {
  const ref = value?.type === 'character' ? value.payload.imageRef : value?.type === 'image' ? value.payload.ref : undefined
  const thumb = useAssetThumb(ref)
  const adThumb = value?.type === 'ad' && value.payload.thumbUrl && !value.payload.thumbUrl.startsWith('asset') ? value.payload.thumbUrl : undefined
  // Not written yet: the line it will be, as two faint bars.
  if (!value) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {writing ? <Spinner className="h-2.5 w-2.5 text-ink-500" /> : null}
        <span className="shrink-0 text-[10.5px] text-ink-500">{noun} {index + 1}</span>
        <span className="h-[6px] flex-1 rounded-full bg-ink/[0.07]" />
        <span className="h-[6px] w-6 rounded-full bg-ink/[0.07]" />
      </span>
    )
  }
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      {adThumb ? <img src={adThumb} alt="" className="h-5 w-4 shrink-0 rounded object-cover" /> : null}
      {ref ? (thumb.url ? <img src={thumb.url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" /> : <span className="h-5 w-5 shrink-0 rounded-full bg-ink/10" />) : null}
      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-200">
        {value.type === 'character' ? `${noun} ${index + 1}` : value.label}
      </span>
    </span>
  )
}

// ── Voiceovers ─────────────────────────────────────────────────────────────

export function VoiceBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const { doc, run } = useCanvas()
  const settings = sanitizeVoiceSettings(block.settings as Partial<VoiceSettings>)
  const voice = getVoiceById(settings.voiceId)
  const presetWired = doc.wires.some((w) => w.to === block.id && w.toPort === 'preset')
  const takes = bp?.instances ?? []
  const live = run?.instances[block.id] ?? {}
  return (
    <div className="px-3 pb-2.5">
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-8 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]" style={{ background: seedColor(settings.voiceId) }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-ink-100">{presetWired ? 'From the Voice Preset' : settings.voiceName}</span>
          <span className="block truncate text-[10.5px] text-ink-500">{presetWired ? 'Wired in, for each run' : `${voice?.description ?? settings.style} · ${settings.pace}`}</span>
        </span>
      </div>
      {takes.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {takes.slice(0, 4).map((inst, i) => {
            const audio = inst.cached?.outputs.audio?.[0]
            const seconds = audio?.type === 'audio' ? audio.payload.durationSeconds : 0
            const status = live[inst.key]?.status
            const done = !!audio && !inst.run
            const label = inst.inputs.script?.[0]?.label || `Script ${i + 1}`
            return (
              <span key={inst.key} className="flex h-[18px] items-center gap-2 text-[10.5px] text-ink-300">
                <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                  {status === 'running' ? <Spinner className="h-2.5 w-2.5" /> : done ? <Check className="h-3 w-3 text-emerald-400" /> : <span className="h-1.5 w-1.5 rounded-full bg-ink/20" />}
                </span>
                <span className="w-[72px] shrink-0 truncate">{label}</span>
                <span className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-ink/10">
                  {done && <i className="absolute inset-y-0 left-0 w-full rounded-full bg-voice-400/80" />}
                </span>
                <span className="w-7 shrink-0 text-right tabular-nums text-ink-500">{done ? clock(seconds) : ''}</span>
              </span>
            )
          })}
          {takes.length > 4 && <span className="text-[10px] text-ink-500">+{takes.length - 4} more</span>}
        </div>
      )}
    </div>
  )
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ── B-Roll ─────────────────────────────────────────────────────────────────

export function BrollBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const pickedStill = useSettingsStore((s) => s.getAppModel('broll-studio:image:text-to-image'))
  const made = madeValues(bp)
  const refs: string[] = []
  for (const v of made) {
    if (v.type === 'image') refs.push(v.payload.ref)
    else if (v.type === 'video' && v.payload.cover) refs.push(v.payload.cover)
  }
  const unique = [...new Set(refs)]
  const clips = made.filter((v) => v.type === 'video').reduce((n, v) => n + (v.type === 'video' ? v.payload.clips.length : 0), 0)
  const animate = block.settings.animate !== false
  const takes = Math.min(3, Math.max(1, Number(block.settings.takes) || 1))
  const planned = bp?.instances.length ?? 0
  const empty = Math.max(0, Math.min(5, planned * 4) - unique.length)
  const stillModel = getModel(resolveImageModelId(true, pickedStill) ?? '')?.displayName
  const clipModel = animate ? getModel(brollVideoModel(block) ?? '')?.displayName : undefined
  return (
    <div className="px-3 pb-2.5">
      <div className="flex gap-1">
        {unique.slice(0, 5).map((ref) => <Tile key={ref} refId={ref} />)}
        {Array.from({ length: Math.min(empty, 5 - Math.min(5, unique.length)) }, (_, i) => (
          <span key={`e${i}`} className="h-[53px] w-[30px] shrink-0 rounded-[7px] border border-dashed border-ink/15" />
        ))}
        {unique.length > 5 && <span className="flex h-[53px] w-[30px] items-center justify-center rounded-[7px] bg-ink/5 text-[10px] text-ink-400">+{unique.length - 5}</span>}
      </div>
      <p className="mt-1.5 text-[10.5px] text-ink-400">
        {unique.length
          ? `${unique.length} ${unique.length === 1 ? 'still' : 'stills'}${clips ? ` · ${clips} ${clips === 1 ? 'clip' : 'clips'}` : ''}`
          : `${takes > 1 ? `${takes} takes of ` : ''}a still per line${animate ? ', then a clip' : ''}, per ad`}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {stillModel && <ModelTag label={stillModel} />}
        {clipModel && <ModelTag label={clipModel} />}
      </div>
    </div>
  )
}

function ModelTag({ label }: { label: string }) {
  return <span className="inline-flex h-[17px] max-w-full items-center truncate rounded-full bg-ink/[0.07] px-2 text-[9.5px] font-medium text-ink-300">{label}</span>
}

function Tile({ refId }: { refId: string }) {
  const thumb = useAssetThumb(refId)
  return thumb.url ? <img src={thumb.url} alt="" className="h-[53px] w-[30px] shrink-0 rounded-[7px] object-cover" /> : <span className="h-[53px] w-[30px] shrink-0 rounded-[7px] bg-ink/10" />
}

// ── Playground ─────────────────────────────────────────────────────────────

export function PlaygroundBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const { doc, run } = useCanvas()
  const made = madeValues(bp)
  const mode = block.settings.mode === 'video' || block.settings.mode === 'music' ? block.settings.mode : 'image'
  const latest = made[0]
  const ref = latest?.type === 'image' ? latest.payload.ref : undefined
  const thumb = useAssetThumb(ref)
  const promptWired = wiresInto(doc, block.id, 'prompt').length > 0
  const prompt = String(block.settings.prompt ?? '').trim()
  const busy = run?.status === 'running' && run.blocks[block.id]?.status === 'running'
  const Icon = mode === 'video' ? Film : mode === 'music' ? Music : ImageIcon
  return (
    <div className="flex items-start gap-2.5 px-3 pb-2.5">
      <span className="relative flex h-[53px] w-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-ink/10 bg-ink/[0.03] text-ink-500">
        {ref && thumb.url ? <img src={thumb.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon className="h-4 w-4" />}
        {latest && latest.type === 'video' && <Play className="relative h-3.5 w-3.5 text-white drop-shadow" />}
      </span>
      <span className="line-clamp-3 min-w-0 flex-1 text-[11.5px] leading-snug text-ink-300">
        {promptWired ? <span className="text-ink-500">The prompt comes in on its wire.</span> : prompt || <span className="text-ink-500">Open it to write the prompt.</span>}
      </span>
    </div>
  )
}

// ── Scene Clips ────────────────────────────────────────────────────────────

// The script's scenes as rows — how long each runs and whether it's filmed —
// so a talking-head flow reads on the canvas the way it reads in Scripts.
export function ScenesBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const inst = bp?.instances[0]
  const text = inst ? scriptTextOf(inst.inputs) : ''
  const waiting = !!inst?.inputs.script?.[0]?.pending
  const shots = text && !waiting ? scenesToFilm(block, text, false, inst ? matchTextOf(inst.inputs) : undefined).shots : []
  const made = madeValues(bp).flatMap((v) => (v.type === 'video' ? v.payload.clips : []))
  const filmed = new Set(made.map((c) => c.scene))
  const { doc, run } = useCanvas()
  const busy = run?.status === 'running' && run.blocks[block.id]?.status === 'running'
  const takes = sceneTakes(block)
  const ads = bp?.instances.length ?? 0
  const model = getModel(scenesVideoModel(block) ?? '')?.displayName
  const advice = scenesAdvice(doc, block)
  return (
    <div className="px-3 pb-2.5">
      {advice && (
        <div className="mb-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-2 text-[10.5px] leading-snug text-amber-200 light:text-amber-800">
          {advice.text}
          <button type="button" onClick={advice.apply} className="nodrag mt-1.5 flex h-6 items-center rounded-full bg-amber-400 px-2.5 text-[10.5px] font-bold text-[#1c1204] transition-all hover:brightness-110">
            {advice.fix}
          </button>
        </div>
      )}
      {shots.length ? (
        <div className="flex flex-col gap-0.5">
          {shots.slice(0, 6).map((shot) => (
            <span key={shot.number} className="flex h-[18px] items-center gap-2 text-[10.5px] text-ink-300">
              <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                {filmed.has(shot.number) ? <Check className="h-3 w-3 text-emerald-400" /> : busy ? <Spinner className="h-2.5 w-2.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-ink/20" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{shot.label}</span>
              {shot.showsProduct && block.settings.productWhenShown !== false && block.settings.shape !== 'one' && <span className="shrink-0 text-[9.5px] text-gold-300/80" title="The product is in this shot">Product</span>}
              <span className="w-7 shrink-0 text-right tabular-nums text-ink-500">{Math.round(shot.seconds)}s</span>
            </span>
          ))}
          {shots.length > 6 && <span className="text-[10px] text-ink-500">+{shots.length - 6} more scenes</span>}
        </div>
      ) : (
        <p className="text-[11px] leading-snug text-ink-500">
          {waiting ? 'Films each scene once the script is written.' : block.settings.shape === 'one' ? 'Films the whole script as one clip.' : 'Films the script wired in, one clip per scene.'}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {model && <ModelTag label={model} />}
        {takes > 1 && <ModelTag label={`${takes} takes each`} />}
        {block.settings.shape === 'one' ? <ModelTag label="One Clip" /> : block.settings.continuity !== false && shots.length !== 1 && <ModelTag label="Continuity" />}
        {ads > 1 && <ModelTag label={`${ads} ads`} />}
      </div>
    </div>
  )
}

// ── The Ad Analyzer ────────────────────────────────────────────────────────

export function AnalyzerBody({ bp }: { bp: BlockPlan | undefined }) {
  const made = madeValues(bp)
  const transcript = made.find((v) => v.type === 'transcript')
  const count = new Set(made.filter((v) => v.type === 'transcript').map((v) => v.key)).size
  if (!transcript) return <p className="px-3 pb-2.5 text-[11px] text-ink-500">Each ad wired in is broken down once, into its transcript and its scene prompts.</p>
  return (
    <div className="px-3 pb-2.5">
      <p className="line-clamp-2 text-[11.5px] leading-snug text-ink-200">{transcript.label}</p>
      {count > 1 && <p className="mt-0.5 text-[10.5px] text-ink-500">+{count - 1} more {count - 1 === 1 ? 'ad' : 'ads'}</p>}
    </div>
  )
}

// ── Edit Pack ──────────────────────────────────────────────────────────────

export function EditBody({ bp }: { bp: BlockPlan | undefined }) {
  const { doc } = useCanvas()
  const packs = (bp?.instances ?? []).map((i) => i.cached?.pack).filter((p): p is NonNullable<typeof p> => !!p)
  return (
    <div className="px-3 pb-2.5">
      <div className="flex flex-col gap-0.5 font-mono text-[10px] text-ink-500">
        <span>input/script.txt</span>
        <span>input/voiceover.mp3</span>
        <span>input/broll/ · clips</span>
      </div>
      {packs.length > 0 && (
        <button
          type="button"
          onClick={() => void downloadEditPacks(doc.name, packs)}
          className="nodrag mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-[#F77646]/40 bg-[#F77646]/10 px-3 py-1.5 text-[11px] font-semibold text-[#F77646] transition-colors hover:bg-[#F77646]/20"
        >
          <Download className="h-3 w-3" />
          Download {packs.length} {packs.length === 1 ? 'Pack' : 'Packs'}
        </button>
      )}
    </div>
  )
}

// ── Reused (From Bank / From History) ──────────────────────────────────────

export function ReusedBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const values = Object.values(bp?.values ?? {}).flat().filter((v) => !v.pending)
  const value = values[0]
  const productImage = useBankStore((st) => (value?.type === 'product' ? st.products.find((p) => p.id === value.payload.productId)?.productImage : undefined))
  const ref = value?.type === 'character' ? value.payload.imageRef
    : value?.type === 'image' ? value.payload.ref
    : value?.type === 'video' ? value.payload.cover ?? value.payload.stills?.[0]
    : value?.type === 'product' ? productImage
    : undefined
  const thumb = useAssetThumb(ref)
  if (!value) return <p className="px-3 pb-2.5 text-[11px] text-ink-500">Open it to pick {sourceOf(block) === 'bank' ? 'one from the bank' : 'a past result'}.</p>
  return (
    <div className="flex items-center gap-2.5 px-3 pb-2.5">
      {ref ? (thumb.url ? <img src={thumb.url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-xl bg-ink/10" />) : null}
      <span className="line-clamp-2 min-w-0 text-[11.5px] leading-snug text-ink-200">{value.label}{values.length > 1 ? ` · +${values.length - 1}` : ''}</span>
    </div>
  )
}
