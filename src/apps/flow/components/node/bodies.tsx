// What an app block shows under its ports: what it makes, as pictures where it
// can — the ad with its score and scenes, the hooks as cards, a script as a
// page, the voice and its takes to play, a filmstrip per ad, the scene clips
// as a timeline, the result big, the ads it found, the edit folders. (The
// Characters block's faces are in face.tsx.) Each reads the plan (what's
// made, what's planned) and the live run (what's running now); what isn't
// made yet stands in as the same shape, dashed, so the canvas shows what a
// run will make and fills in as it goes.

import { useRef, useState } from 'react'
import { Download, Eye, EyeOff, Film, Folder, Image as ImageIcon, Music, Package, Pause, Play, Radar, Upload } from 'lucide-react'
import type { FlowBlock, FlowGraph, FlowItem, FlowValue } from '../../types'
import type { BlockPlan, PlannedInstance } from '../../engine/plan'
import { inlineText, KINDS, outsOf, scriptsFormat, sourceOf, TYPE_META } from '../../engine/catalog'
import { itemPort, liveItems, wiresInto, wiresOutOf } from '../../engine/graph'
import { brollVideoModel, playgroundInput } from '../../engine/cost'
import { useBankStore } from '../../../../stores/bankStore'
import { useSettingsStore } from '../../../../stores/settingsStore'
import { useAssetPoster } from '../../../../hooks/useAssetUrl'
import { useAudioPlayback } from '../../../../hooks/useAudioPlayback'
import Spinner from '../../../../components/Spinner'
import AudioScrubber from '../../../../components/AudioScrubber'
import { getModel } from '../../../../utils/models'
import { getVoiceById, sanitizeVoiceSettings, type VoiceSettings } from '../../../voice-studio/types'
import { seedColor } from '../../../voice-studio/components/seedColor'
import { resolveImageModelId } from '../../../broll-studio/services/generateBroll'
import { wordCount } from '../../../broll-studio/services/clipDuration'
import { formatCount, formatMultiple } from '../../../discover/services/scoring'
import type { DiscoverResult } from '../../../discover/types'
import type { AnalysisResult } from '../../../ad-anatomy/types'
import { AD_ACCEPT_ATTR } from '../../../ad-anatomy/services/adUpload'
import { useAppStore } from '../../../../stores/appStore'
import { adFeedOf, giveAdTo, useAdReader, useFileDrag } from '../yourAd'
import { downloadEditPacks } from '../../run/editPack'
import type { LiveRun } from '../../run/runtime'
import { useCanvas } from '../canvasContext'
import { blockIcon, edgeOutput } from '../blockMeta'
import { EmptySquare, FaceFrame, FacePill, GridTile, ItemActions, ItemDot, TileImage, ValueSquare } from './face'
import { CHIP, CHIP_SHAPE, clock, PLATFORM } from './chips'
import { latestItems, madeValues } from './made'
import { readSceneScript, scenesToFilm, sceneTakes, secondsToSay } from '../../engine/sceneShots'
import { matchTextOf, scenesVideoModel, scriptTextOf } from '../../engine/sceneClips'
import { scenesAdvice } from '../scenesAdvice'

// A 9:16 tile: a still, a clip, an ad's cover.
const TILE = 'relative aspect-[9/16] overflow-hidden rounded-[9px]'
const DASHED = 'border border-dashed border-ink/15'
const CARD = 'rounded-xl border border-ink/[0.07] bg-ink/[0.03]'

function running(run: LiveRun | null | undefined, blockId: string): boolean {
  return run?.status === 'running' && run.blocks[blockId]?.status === 'running'
}

// A clip as its poster; a clip with none yet is a dark tile with a film glyph.
function ClipPoster({ refId, contain }: { refId: string | undefined; contain?: boolean }) {
  const poster = useAssetPoster(refId)
  return poster.url
    ? <img src={poster.url} alt="" draggable={false} className={`absolute inset-0 h-full w-full ${contain ? 'object-contain' : 'object-cover'}`} />
    : <span className="absolute inset-0 flex items-center justify-center bg-ink/10 text-ink-500"><Film className="h-4 w-4" /></span>
}

function PlayBadge() {
  return (
    <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white">
      <Play className="h-2.5 w-2.5" />
    </span>
  )
}

// Two faint lines: words not written yet.
function Unwritten({ busy }: { busy: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 pt-0.5">
      {busy && <Spinner className="h-3 w-3 shrink-0 text-ink-500" />}
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="h-[5px] w-full rounded-full bg-ink/[0.07]" />
        <span className="h-[5px] w-2/3 rounded-full bg-ink/[0.07]" />
      </span>
    </span>
  )
}

// The items a list shows: the first few, and any wired on their own wherever
// they sit — a wire needs its dot on the canvas.
function shownItems(doc: FlowGraph, block: FlowBlock, items: FlowItem[], first: number): FlowItem[] {
  const wired = new Set(wiresOutOf(doc, block.id).map((w) => w.fromPort))
  return items.filter((it, i) => i < first || wired.has(itemPort(it.id)))
}

// ── The Ad Analyzer ────────────────────────────────────────────────────────

// The ad it read, its score and scorecard, the first words said, and its
// scenes as a timed strip — what the Ad Analyzer's own Breakdown leads with.
// Before it has an ad, the cover tile is where the member's own goes: dropped
// on the block, or picked with a click (yourAd.ts hands it to the ad block
// that feeds this one).
export function AnalyzerBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const { doc, run } = useCanvas()
  const addToast = useAppStore((s) => s.addToast)
  const fileRef = useRef<HTMLInputElement>(null)
  const reader = useAdReader((upload) => {
    const done = giveAdTo(block.id, upload)
    addToast(done.ok ? done.message : done.reason, done.ok ? 'success' : 'error')
  })
  const drag = useFileDrag(null)
  const made = madeValues(bp)
  const transcript = made.find((v) => v.type === 'transcript')
  const rowId = transcript?.lineage?.find((l) => l.bank === 'adAnatomyHistory')?.id
  const row = useBankStore((s) => (rowId ? s.adAnatomyHistory.find((r) => r.id === rowId) : undefined))
  const result = row?.status === 'complete' ? (row.result as AnalysisResult | undefined) : undefined
  const ad = bp?.instances[0]?.inputs.ad?.[0]
  const cover = row?.thumbnailRef ?? (ad?.type === 'ad' ? ad.payload.thumbUrl : undefined)
  const platform = ad?.type === 'ad' && ad.payload.platform ? PLATFORM[ad.payload.platform] : undefined
  const busy = running(run, block.id)
  const scores = result?.scorecard?.scores ?? []
  const overall = scores.find((s) => s.label === 'Overall Execution')
  const bars = scores.filter((s) => s !== overall).slice(0, 4)
  const headline = overall ? scoreOf(overall.score) : bars.length ? bars.reduce((sum, s) => sum + scoreOf(s.score), 0) / bars.length : null
  const scenes = result?.reverseEngineeredPrompt?.scenes ?? []
  const total = result?.reverseEngineeredPrompt?.totalDurationSeconds || scenes.reduce((sum, s) => sum + (s.durationSeconds || 0), 0)
  const quote = result?.transcript?.slice(0, 2).map((l) => l.text).join(' ').trim()
  const ads = new Set(made.filter((v) => v.type === 'transcript').map((v) => v.key)).size
  // Nothing coming in yet, and nothing but the member deciding what does.
  const open = !ad && !result && !busy && adFeedOf(doc, block).kind !== 'other'
  return (
    <div className="px-3 pb-3">
      <div className="flex gap-2.5">
        {open ? (
          <div {...drag.handlers} className="shrink-0">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Drop your ad on the block, or click to pick the file"
              className={`nodrag ${TILE} flex w-[72px] flex-col items-center justify-center gap-1 border border-dashed px-1 text-center transition-colors ${
                drag.active ? 'border-[#FF5257]/60 bg-[#FF5257]/[0.08]' : 'border-ink/20 hover:border-[#FF5257]/40 hover:bg-[#FF5257]/[0.04]'
              }`}
            >
              {reader.busy ? <Spinner className="h-4 w-4 text-ink-400" /> : <Upload className={`h-4 w-4 ${drag.active ? 'text-[#FF5257]' : 'text-ink-500'}`} />}
              <span className="text-[10px] font-medium leading-tight text-ink-300">Drop Your Ad</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={AD_ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                reader.take(file)
              }}
            />
          </div>
        ) : (
          <div className={`${TILE} w-[72px] shrink-0 ${cover ? 'bg-black' : DASHED}`}>
            {cover ? <TileImage refId={cover} /> : (
              <span className="absolute inset-0 flex items-center justify-center text-ink-500">{busy ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</span>
            )}
            {cover && platform && <span className={`${CHIP} left-1 top-1 h-4 px-1.5 text-[9.5px]`}>{platform}</span>}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {result ? (
            <>
              <p className="line-clamp-2 text-[12px] font-medium leading-snug text-ink-100">{result.adTitle || row?.fileName}</p>
              {headline !== null && (
                <p className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-[22px] font-semibold tabular-nums tracking-tight text-ink-100">{headline.toFixed(1)}</span>
                  <span className="text-[10.5px] text-ink-500">/ 10</span>
                </p>
              )}
              <div className="mt-0.5 flex flex-col gap-1">
                {bars.map((s) => (
                  <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-ink-400" title={`${s.label}: ${scoreOf(s.score).toFixed(1)} out of 10`}>
                    <span className="w-[62px] shrink-0 truncate">{s.label}</span>
                    <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
                      <i className="absolute inset-y-0 left-0 rounded-full bg-[#FF5257]" style={{ width: `${scoreOf(s.score) * 10}%` }} />
                    </span>
                    <span className="w-5 shrink-0 text-right tabular-nums text-ink-200">{scoreOf(s.score).toFixed(1)}</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className={`text-[11px] leading-snug ${reader.problem ? 'text-[#FF5257]/90' : 'text-ink-500'}`}>
                {busy ? 'Breaking the ad down…'
                  : reader.problem ? reader.problem
                  : open ? 'Drop your own ad here, or wire in a saved one or an Outliers search.'
                  : 'Scores the ad, then breaks it into its transcript and scene prompts.'}
              </p>
              <div className="mt-2.5 flex flex-col gap-2">
                {[92, 80, 68, 56].map((w) => <span key={w} className="h-1 rounded-full bg-ink/[0.07]" style={{ width: `${w}%` }} />)}
              </div>
            </>
          )}
        </div>
      </div>
      {/* The clamp is on the inner line: clamped text in a padded box shows
          the start of its third line in the padding. */}
      {quote && <p className={`${CARD} mt-2.5 px-2.5 py-2 text-[11px] leading-relaxed text-ink-300`}><span className="line-clamp-2">“{quote}”</span></p>}
      {scenes.length > 0 && (
        <div className="mt-2.5">
          <p className="mb-1.5 flex justify-between text-[10.5px] text-ink-500">
            <span>{scenes.length} {scenes.length === 1 ? 'Scene' : 'Scenes'}</span>
            <span className="tabular-nums">{clock(total)}</span>
          </p>
          <div className="flex h-1.5 gap-[2px]">
            {scenes.map((sc) => (
              <span key={sc.index} title={`${sc.label} · ${Math.round(sc.durationSeconds)}s`} className="rounded-full bg-[#FF5257]/70" style={{ flex: Math.max(1, sc.durationSeconds || 1) }} />
            ))}
          </div>
        </div>
      )}
      {ads > 1 && <p className="mt-2 text-[10.5px] text-ink-500">+{ads - 1} more {ads - 1 === 1 ? 'ad' : 'ads'}</p>}
    </div>
  )
}

// The Ad Analyzer scores to one decimal; rows from before that hold whole
// numbers. Anything else reads as 0 rather than breaking the bar.
function scoreOf(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 0
}

// ── Scripts ────────────────────────────────────────────────────────────────

// Hooks as cards; full scripts as pages. A run picked From History is read by
// what it holds: short lines are hooks.
export function ScriptsBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const made = latestItems(bp)
  const hooks = sourceOf(block) === 'history'
    ? Object.values(made).every((v) => v.type !== 'script' || v.payload.text.length <= 240)
    : scriptsFormat(block) === 'hooks'
  return hooks ? <HookCards block={block} bp={bp} /> : <TakePages block={block} bp={bp} />
}

function HookCards({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const { doc, run } = useCanvas()
  const items = liveItems(block)
  const made = latestItems(bp)
  const busy = running(run, block.id)
  const shown = shownItems(doc, block, items, 5)
  const hidden = items.length - shown.length
  return (
    <div className="flex flex-col gap-1.5 border-t border-ink/5 px-3 pb-3 pt-2.5">
      {shown.map((it) => {
        const i = items.indexOf(it)
        const value = made[it.id]
        const name = `Hook ${i + 1}`
        return (
          <div key={it.id} className={`group/item relative flex min-h-[42px] items-start gap-2 py-2 pl-2 pr-2.5 ${CARD}`}>
            <span className={`flex min-w-0 flex-1 items-start gap-2 ${it.off ? 'opacity-40' : ''}`}>
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#4C6FBF]/25 text-[10px] font-semibold tabular-nums text-ink-200">{i + 1}</span>
              {value ? <span className="line-clamp-2 min-w-0 flex-1 text-[11.5px] leading-snug text-ink-200">{value.label}</span> : <Unwritten busy={busy} />}
            </span>
            <ItemActions block={block} itemId={it.id} name={name} off={!!it.off} editable className="absolute right-1 top-1 rounded-full bg-surface-1" />
            <ItemDot block={block} itemId={it.id} name={name} color={TYPE_META.script.color} right={-12} />
          </div>
        )
      })}
      {hidden > 0 && <p className="px-0.5 text-[10.5px] text-ink-500">+{hidden} more hooks · all go out through {outsOf(block)[0]?.label}</p>}
    </div>
  )
}

// A stack of pages, one per take: a tab for each, the one picked on top with
// its scenes and when each lands. Each take's own dot stands down the page's
// edge in tab order, shown on hover or once wired — All Scripts carries them
// all, and a lone take's dot beside it said the same thing twice.
function TakePages({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const { run } = useCanvas()
  const items = liveItems(block)
  const made = latestItems(bp)
  const [tab, setTab] = useState(0)
  const at = Math.min(tab, Math.max(0, items.length - 1))
  const item = items[at]
  const several = items.length > 1
  return (
    <div className="border-t border-ink/5 px-3 pb-3 pt-2.5">
      {several && (
        <div className="mb-2 flex flex-wrap gap-1">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setTab(i)}
              className={`nodrag flex h-6 items-center gap-1 rounded-full px-2.5 text-[10.5px] font-medium transition-colors ${
                i === at ? 'bg-[#4C6FBF]/30 text-ink-100' : 'bg-ink/[0.06] text-ink-400 hover:text-ink-200'
              } ${it.off ? 'opacity-50' : ''}`}
            >
              {it.off && <EyeOff className="h-3 w-3" />}
              Take {i + 1}
            </button>
          ))}
        </div>
      )}
      <div className={`relative ${several ? 'pt-2' : ''}`}>
        {several && (
          <>
            <span className={`absolute inset-x-4 top-0 h-6 ${CARD}`} />
            <span className={`absolute inset-x-2 top-1 h-6 ${CARD}`} />
          </>
        )}
        {item && <TakePage block={block} item={item} index={at} value={made[item.id]} busy={running(run, block.id)} />}
        {items.map((it, i) => (
          <ItemDot key={it.id} block={block} itemId={it.id} name={`Take ${i + 1}`} color={TYPE_META.script.color} right={-12} top={(several ? 26 : 18) + i * 20} quiet />
        ))}
      </div>
    </div>
  )
}

function TakePage({ block, item, index, value, busy }: { block: FlowBlock; item: FlowItem; index: number; value: FlowValue | undefined; busy: boolean }) {
  const text = value?.type === 'script' ? value.payload.text : ''
  const script = text ? readSceneScript(text) : null
  const shots = script?.scenes ? script.shots : []
  const flat = text.replace(/\s+/g, ' ').trim()
  const spoken = shots.length ? shots.map((s) => s.spoken).join(' ') : flat
  const seconds = shots.length ? shots.reduce((sum, s) => sum + s.seconds, 0) : secondsToSay(flat)
  // When each scene lands: each one starts where the one before it ended.
  const starts = shots.map((_, i) => shots.slice(0, i).reduce((sum, s) => sum + s.seconds, 0))
  return (
    <div className="group/item relative rounded-xl border border-ink/[0.08] bg-surface-1 px-3 pb-2.5 pt-2.5">
      <div className={item.off ? 'opacity-40' : ''}>
        <p className="mb-1.5 text-[12px] font-medium text-ink-100">Take {index + 1}</p>
        {!value ? (
          <div className="flex flex-col gap-2 py-1">
            <Unwritten busy={busy} />
            <Unwritten busy={false} />
          </div>
        ) : shots.length ? (
          <div className="flex flex-col gap-1">
            {shots.slice(0, 5).map((shot, i) => (
              <span key={shot.number} className="flex items-baseline gap-1.5 text-[11px] leading-snug">
                <span className="shrink-0 rounded-full bg-[#4C6FBF]/25 px-1.5 text-[9.5px] font-medium tabular-nums text-ink-200">
                  {Math.round(starts[i])}–{Math.round(starts[i] + shot.seconds)}s
                </span>
                <span className="min-w-0 truncate text-ink-300">{shot.spoken || shot.body}</span>
              </span>
            ))}
            {shots.length > 5 && <span className="text-[10px] text-ink-500">+{shots.length - 5} more scenes</span>}
          </div>
        ) : (
          <p className="line-clamp-6 text-[11px] leading-relaxed text-ink-300">{flat}</p>
        )}
        {value && (
          <p className="mt-2 flex justify-between text-[10px] tabular-nums text-ink-500">
            <span>{shots.length ? `${shots.length} scenes · ` : ''}{wordCount(spoken)} words</span>
            <span>~{Math.round(seconds)}s</span>
          </p>
        )}
      </div>
      <ItemActions block={block} itemId={item.id} name={`Take ${index + 1}`} off={!!item.off} editable className="absolute right-1.5 top-1.5" />
    </div>
  )
}

// ── Outliers ───────────────────────────────────────────────────────────────

// What it searched for, and the ads it found as covers: how far each beat the
// account, and its views.
export function OutliersBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const { doc, run, openBlock } = useCanvas()
  const items = liveItems(block)
  const made = latestItems(bp)
  const busy = running(run, block.id)
  const searchWired = wiresInto(doc, block.id, 'query').length > 0
  const query = String(block.settings.query ?? '').trim()
  const platform = PLATFORM[String(block.settings.platform ?? 'tiktok')] ?? 'TikTok'
  const shown = shownItems(doc, block, items, 6)
  const hidden = items.length - shown.length
  return (
    <div className="border-t border-ink/5 pt-2.5">
      <FacePill
        label={searchWired ? `Search on Its Wire · ${platform}` : query ? `${query} · ${platform}` : undefined}
        placeholder="Type What to Search For"
        title="Open Outliers · change the search"
        onClick={() => openBlock(block.id)}
      />
      <div className="grid grid-cols-3 gap-2.5 px-3 pb-3">
        {shown.map((it, k) => {
          const i = items.indexOf(it)
          const value = made[it.id]
          const ad = value?.type === 'ad' ? value : undefined
          const result = ad?.payload.result as DiscoverResult | undefined
          const views = result?.stats?.views
          return (
            <GridTile
              key={it.id}
              block={block}
              itemId={it.id}
              name={`Ad ${i + 1}`}
              off={!!it.off}
              editable
              portrait
              picture={ad ? <TileImage refId={ad.payload.thumbUrl} /> : null}
              glyph={Radar}
              busy={busy}
              color={TYPE_META.ad.color}
              edge={k % 3 === 2 || k === shown.length - 1}
            >
              {result?.outlier && <span className={`${CHIP_SHAPE} bottom-7 left-1.5 h-[18px] bg-[#D9A404] px-1.5 text-[#2a1f00]`}>{formatMultiple(result.outlier.multiple)}</span>}
              {!!views && <span className={`${CHIP} bottom-1.5 left-1.5 h-[18px] px-1.5`}><Eye className="h-2.5 w-2.5" />{formatCount(views)}</span>}
            </GridTile>
          )
        })}
      </div>
      {hidden > 0 && <p className="-mt-1 px-3 pb-3 text-[10.5px] text-ink-500">+{hidden} more · all go out through {outsOf(block)[0]?.label}</p>}
    </div>
  )
}

// ── A script of the member's own ───────────────────────────────────────────

// A block that reads a script, with nothing wired into Script: the member's
// own, typed or pasted in its window the way the app takes one, named here —
// so it's plain on the canvas that no Scripts block is needed in front of it.
function OwnScript({ block }: { block: FlowBlock }) {
  const { doc, openBlock } = useCanvas()
  if (wiresInto(doc, block.id, 'script').length) return null
  const typed = inlineText(block, 'script')
  const first = typed?.replace(/\s+/g, ' ').trim()
  return (
    <FacePill
      label={first ? `“${first.slice(0, 80)}”` : undefined}
      placeholder="Write or Paste Your Script"
      title={`Open ${KINDS[block.kind].title} · ${typed ? 'edit the script it reads' : 'type or paste the script it reads, or wire one in'}`}
      onClick={() => openBlock(block.id)}
    />
  )
}

// ── Voiceovers ─────────────────────────────────────────────────────────────

// The voice, and each take as a row to play right on the canvas — the app's
// one transport, so starting one stops whatever else was playing.
export function VoiceBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const { doc, run } = useCanvas()
  const settings = sanitizeVoiceSettings(block.settings as Partial<VoiceSettings>)
  const voice = getVoiceById(settings.voiceId)
  const presetWired = doc.wires.some((w) => w.to === block.id && w.toPort === 'preset')
  const takes = bp?.instances ?? []
  const live = run?.instances[block.id] ?? {}
  return (
    <>
      <OwnScript block={block} />
      <div className="px-3 pb-3">
        <div className={`flex items-center gap-2.5 px-2.5 py-2 ${CARD}`}>
          <span className="h-9 w-9 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]" style={{ background: seedColor(settings.voiceId) }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-ink-100">{presetWired ? 'From the Voice Preset' : settings.voiceName}</span>
            <span className="block truncate text-[10.5px] text-ink-500">{presetWired ? 'Wired in, for each run' : `${voice?.description ?? settings.style} · ${settings.pace}`}</span>
          </span>
        </div>
        {takes.length > 0 && (
          <div className="mt-1.5 flex flex-col">
            {takes.slice(0, 4).map((inst, i) => <TakeRow key={inst.key} inst={inst} index={i} status={live[inst.key]?.status} />)}
            {takes.length > 4 && <span className="pt-0.5 text-[10.5px] text-ink-500">+{takes.length - 4} more takes</span>}
          </div>
        )}
      </div>
    </>
  )
}

function TakeRow({ inst, index, status }: { inst: PlannedInstance; index: number; status: string | undefined }) {
  const audio = inst.cached?.outputs.audio?.[0]
  const ref = audio?.type === 'audio' ? audio.payload.ref : null
  const seconds = audio?.type === 'audio' ? audio.payload.durationSeconds : 0
  const player = useAudioPlayback(ref, seconds)
  const label = inst.inputs.script?.[0]?.label || `Script ${index + 1}`
  const shown = player.isPlaying || player.position > 0 ? player.position : player.duration || seconds
  return (
    <div className="flex h-[30px] items-center gap-2 text-[11px] text-ink-300">
      {ref ? (
        <button
          type="button"
          onClick={player.toggle}
          className="nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-voice-500/20 text-voice-400 transition-colors hover:bg-voice-500/30"
          aria-label={player.isPlaying ? `Pause ${label}` : `Play ${label}`}
          title={player.isPlaying ? 'Pause' : 'Play'}
        >
          {player.isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </button>
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] text-ink-500">
          {status === 'running' ? <Spinner className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-ink/20" />}
        </span>
      )}
      <span className="w-[64px] shrink-0 truncate">{label}</span>
      <AudioScrubber
        progress={player.duration ? player.position / player.duration : 0}
        onSeek={player.isLoaded ? (f) => player.seekTo(f * player.duration) : undefined}
        className="nodrag flex-1"
      />
      <span className="w-8 shrink-0 text-right tabular-nums text-ink-500">{ref ? clock(shown) : ''}</span>
    </div>
  )
}

// ── B-Roll ─────────────────────────────────────────────────────────────────

// A filmstrip per ad: its stills, a play mark on each one animated.
export function BrollBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const { run } = useCanvas()
  const pickedStill = useSettingsStore((s) => s.getAppModel('broll-studio:image:text-to-image'))
  const insts = bp?.instances ?? []
  const live = run?.instances[block.id] ?? {}
  const animate = block.settings.animate !== false
  const takes = Math.min(3, Math.max(1, Number(block.settings.takes) || 1))
  const stillModel = getModel(resolveImageModelId(true, pickedStill) ?? '')?.displayName
  const clipModel = animate ? getModel(brollVideoModel(block) ?? '')?.displayName : undefined
  const plan = `${takes > 1 ? `${takes} takes of ` : ''}a still per line${animate ? ', then a clip' : ''}`
  return (
    <>
      <OwnScript block={block} />
      <div className="px-3 pb-3">
        {insts.length ? (
          insts.slice(0, 2).map((inst, i) => <Filmstrip key={inst.key} inst={inst} index={i} busy={live[inst.key]?.status === 'running'} plan={plan} />)
        ) : (
          <Filmstrip index={0} busy={false} plan={`${plan}, per ad`} />
        )}
        {insts.length > 2 && <p className="-mt-1 text-[10.5px] text-ink-500">+{insts.length - 2} more ads</p>}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {stillModel && <ModelTag label={stillModel} />}
          {clipModel && <ModelTag label={clipModel} />}
        </div>
      </div>
    </>
  )
}

function Filmstrip({ inst, index, busy, plan }: { inst?: PlannedInstance; index: number; busy: boolean; plan: string }) {
  const stills = (inst?.cached?.outputs.stills ?? []).flatMap((v) => (v.type === 'image' ? [v.payload.ref] : []))
  const video = inst?.cached?.outputs.clips?.[0]
  const clips = video?.type === 'video' ? video.payload.clips.length : 0
  // A still no clip was made from is an insert; every other one was animated.
  const inserts = new Set(video?.type === 'video' ? video.payload.stills ?? [] : [])
  const label = inst?.inputs.script?.[0]?.label || (inst ? `Ad ${index + 1}` : '')
  const summary = stills.length
    ? `${stills.length} ${stills.length === 1 ? 'still' : 'stills'}${clips ? ` · ${clips} ${clips === 1 ? 'clip' : 'clips'}` : ''}`
    : busy ? 'making stills…' : plan
  return (
    <div className="mb-2.5">
      <p className="mb-1.5 flex min-w-0 gap-1 text-[10.5px] text-ink-500">
        {label && <span className="min-w-0 truncate text-ink-300">{label}</span>}
        <span className="shrink-0">{label ? '· ' : ''}{summary}</span>
      </p>
      <div className="grid grid-cols-5 gap-1">
        {stills.length
          ? stills.slice(0, 5).map((ref, i) => (
              <span key={ref} className={`${TILE} bg-black`}>
                <TileImage refId={ref} />
                {clips > 0 && !inserts.has(ref) && <PlayBadge />}
                {i === 4 && stills.length > 5 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[12px] font-semibold text-white">+{stills.length - 5}</span>}
              </span>
            ))
          : Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={`${TILE} ${DASHED} flex items-center justify-center text-ink-500`}>
                {busy && i === 0 && <Spinner className="h-3 w-3" />}
              </span>
            ))}
      </div>
    </div>
  )
}

function ModelTag({ label }: { label: string }) {
  return <span className="inline-flex h-[17px] max-w-full items-center truncate rounded-full bg-ink/[0.07] px-2 text-[9.5px] font-medium text-ink-300">{label}</span>
}

// ── Playground ─────────────────────────────────────────────────────────────

// The result big, whole on black, with what it is and what made it; the
// prompt under it.
export function PlaygroundBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const { doc, run } = useCanvas()
  const made = madeValues(bp)
  const mode = block.settings.mode === 'video' || block.settings.mode === 'music' ? block.settings.mode : 'image'
  const latest = made[0]
  const promptWired = wiresInto(doc, block.id, 'prompt').length > 0
  const prompt = String(block.settings.prompt ?? '').trim()
  const busy = running(run, block.id)
  const model = getModel(playgroundInput(block, bp?.instances[0]?.inputs ?? {}).modelId)?.displayName
  const Icon = mode === 'video' ? Film : mode === 'music' ? Music : ImageIcon
  const noun = mode === 'video' ? 'Clip' : mode === 'music' ? 'Music' : 'Image'
  const dark = !!latest && latest.type !== 'music'
  return (
    <div className="px-3 pb-3">
      <div className={`relative aspect-square w-full overflow-hidden rounded-2xl ${dark ? 'bg-black' : latest ? CARD : DASHED}`}>
        {latest?.type === 'image' && <TileImage refId={latest.payload.ref} contain />}
        {latest?.type === 'video' && (
          <>
            <ClipPoster refId={latest.payload.clips[0]?.ref} contain />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"><Play className="h-4 w-4" /></span>
            </span>
          </>
        )}
        {latest?.type === 'music' && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-300">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink/[0.07]"><Music className="h-6 w-6" /></span>
            {!!latest.payload.durationSeconds && <span className="text-[11px] tabular-nums text-ink-500">{clock(latest.payload.durationSeconds)}</span>}
          </span>
        )}
        {!latest && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center text-ink-500">
            {busy ? <Spinner className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
            <span className="text-[11.5px] text-ink-400">{busy ? `Making the ${noun === 'Music' ? 'track' : noun.toLowerCase()}…` : `Makes one ${noun === 'Music' ? 'track' : noun.toLowerCase()}`}</span>
            {model && <span className="text-[10.5px]">{model}</span>}
          </span>
        )}
        {latest && (
          <>
            <span className={`${CHIP} left-2 top-2`}><Icon className="h-3 w-3" />{noun}</span>
            {model && <span className={`${CHIP} bottom-2 left-2`}>{model}</span>}
            {made.length > 1 && <span className={`${CHIP} right-2 top-2`}>+{made.length - 1}</span>}
          </>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[11.5px] leading-snug text-ink-400">
        {promptWired ? <span className="text-ink-500">The prompt comes in on its wire.</span> : prompt || <span className="text-ink-500">Open it to write the prompt.</span>}
      </p>
    </div>
  )
}

// ── Scene Clips ────────────────────────────────────────────────────────────

// The ad as a timeline: a 9:16 tile per scene, filled with its clip once
// filmed, its length and whether the product is in it; and a strip under
// them, each scene as long as it runs.
export function ScenesBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const inst = bp?.instances[0]
  const text = inst ? scriptTextOf(inst.inputs) : ''
  const waiting = !!inst?.inputs.script?.[0]?.pending
  const shots = text && !waiting ? scenesToFilm(block, text, false, inst ? matchTextOf(inst.inputs) : undefined).shots : []
  const made = (inst?.cached?.outputs.clips ?? []).flatMap((v) => (v.type === 'video' ? v.payload.clips : []))
  // A scene's first take, for its tile.
  const clipOf = new Map<number, string>()
  for (const c of [...made].sort((a, b) => (a.take ?? 1) - (b.take ?? 1))) if (c.scene !== undefined && !clipOf.has(c.scene)) clipOf.set(c.scene, c.ref)
  const { doc, run } = useCanvas()
  const busy = running(run, block.id)
  const next = shots.find((s) => !clipOf.has(s.number))?.number
  const takes = sceneTakes(block)
  const ads = bp?.instances.length ?? 0
  const appPick = useSettingsStore((s) => s.getAppModel('playground:video'))
  const model = getModel(scenesVideoModel(block, appPick) ?? '')?.displayName
  const advice = scenesAdvice(doc, block)
  const total = shots.reduce((sum, s) => sum + s.seconds, 0)
  const filmed = shots.filter((s) => clipOf.has(s.number)).length
  const productShown = block.settings.productWhenShown !== false && block.settings.shape !== 'one'
  return (
    <>
      <OwnScript block={block} />
      <div className="px-3 pb-3">
        {advice && (
          <div className="mb-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-2 text-[10.5px] leading-snug text-amber-200 light:text-amber-800">
            {advice.text}
            <button type="button" onClick={advice.apply} className="nodrag mt-1.5 flex h-6 items-center rounded-full bg-amber-400 px-2.5 text-[10.5px] font-bold text-[#1c1204] transition-all hover:brightness-110">
              {advice.fix}
            </button>
          </div>
        )}
        {shots.length ? (
          <>
            {/* Five across fits a whole ad; a short one gets bigger tiles. */}
            <div className={`grid gap-1.5 ${shots.length <= 3 ? 'grid-cols-3' : shots.length === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
              {shots.slice(0, 10).map((shot) => {
                const clip = clipOf.get(shot.number)
                return (
                  <div key={shot.number} className="min-w-0">
                    <div className={`${TILE} ${clip ? 'bg-black' : `${DASHED} flex items-center justify-center text-ink-500`}`}>
                      {clip ? <ClipPoster refId={clip} /> : busy && shot.number === next ? <Spinner className="h-3 w-3" /> : null}
                      <span className={`${CHIP} bottom-1 left-1 h-4 px-1.5 text-[9.5px] tabular-nums`}>{Math.round(shot.seconds)}s</span>
                      {shot.showsProduct && productShown && (
                        <span className={`${CHIP} right-1 top-1 h-4 px-1`} title="The product is in this shot"><Package className="h-2.5 w-2.5" /></span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[10px] text-ink-400" title={shot.label}>{shot.label.split(' · ').slice(1).join(' · ') || `Scene ${shot.number}`}</p>
                  </div>
                )
              })}
            </div>
            {shots.length > 10 && <p className="mt-1 text-[10px] text-ink-500">+{shots.length - 10} more scenes</p>}
            <div className="mt-2 flex h-1.5 gap-[2px]">
              {shots.map((shot) => (
                <span
                  key={shot.number}
                  className={`rounded-full ${clipOf.has(shot.number) ? 'bg-[#12A594]' : busy && shot.number === next ? 'bg-[#12A594]/35' : 'bg-ink/10'}`}
                  style={{ flex: Math.max(1, shot.seconds) }}
                />
              ))}
            </div>
            <p className="mt-1.5 flex justify-between text-[10.5px] tabular-nums text-ink-500">
              <span>{filmed} of {shots.length} filmed</span>
              <span>{clock(total)}</span>
            </p>
          </>
        ) : (
          <p className="text-[11px] leading-snug text-ink-500">
            {waiting ? 'Films each scene once the script is written.' : block.settings.shape === 'one' ? 'Films the whole script as one clip.' : 'Films the script, one clip per scene.'}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {model && <ModelTag label={model} />}
          {takes > 1 && <ModelTag label={`${takes} takes each`} />}
          {block.settings.shape === 'one' ? <ModelTag label="One Clip" /> : block.settings.continuity !== false && shots.length !== 1 && <ModelTag label="Continuity" />}
          {ads > 1 && <ModelTag label={`${ads} ads`} />}
        </div>
      </div>
    </>
  )
}

// ── Edit Pack ──────────────────────────────────────────────────────────────

// A folder per ad, with what's in it; the download once they're gathered.
export function EditBody({ bp }: { bp: BlockPlan | undefined }) {
  const { doc } = useCanvas()
  const insts = bp?.instances ?? []
  const packs = insts.map((i) => i.cached?.pack).filter((p): p is NonNullable<typeof p> => !!p)
  const shown = insts.slice(0, insts.length > 4 ? 3 : 4)
  return (
    <div className="px-3 pb-3">
      {insts.length ? (
        <div className="grid grid-cols-2 gap-1.5">
          {shown.map((inst, i) => {
            const pack = inst.cached?.pack
            const parts = pack
              ? [
                  pack.voiceover && 'VO',
                  pack.clips.length && `${pack.clips.length} ${pack.clips.length === 1 ? 'clip' : 'clips'}`,
                  pack.stills.length && `${pack.stills.length} ${pack.stills.length === 1 ? 'still' : 'stills'}`,
                  pack.script && 'script',
                ].filter(Boolean).join(' · ')
              : 'Waiting on its parts'
            return (
              <div key={inst.key} className={`px-2.5 py-2 ${pack ? CARD : `rounded-xl ${DASHED}`}`}>
                <Folder className={`h-4 w-4 ${pack ? 'text-[#F77646]' : 'text-ink-500'}`} />
                <p className="mt-1 truncate text-[11.5px] font-medium text-ink-100">{pack?.title || `Ad ${i + 1}`}</p>
                <p className="truncate text-[10px] text-ink-500">{parts}</p>
              </div>
            )
          })}
          {insts.length > 4 && <div className={`flex items-center justify-center text-[11px] text-ink-400 ${CARD}`}>+{insts.length - 3} more</div>}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 font-mono text-[10px] text-ink-500">
          <span>input/script.txt</span>
          <span>input/voiceover.mp3</span>
          <span>input/broll/ · clips</span>
        </div>
      )}
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

// What it reuses, as a square face (face.tsx). Picking happens in the block's
// own window, so the pill and the empty square both open it.
export function ReusedBody({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const { openBlock } = useCanvas()
  const values = Object.values(bp?.values ?? {}).flat().filter((v) => !v.pending)
  const value = values[0]
  const fromBank = sourceOf(block) === 'bank'
  const open = () => openBlock(block.id)
  return (
    <div>
      <FacePill
        label={value?.label}
        placeholder={fromBank ? 'Choose From Bank' : 'Choose From History'}
        title={value ? 'Change · pick another' : fromBank ? 'Pick one from the bank' : 'Pick a past result'}
        onClick={open}
      />
      <FaceFrame block={block} port={edgeOutput(block)}>
        {value ? (
          <ValueSquare value={value} more={values.length - 1} />
        ) : (
          <EmptySquare icon={blockIcon(block)} title={fromBank ? 'Pick From the Bank' : 'Pick a Past Result'} hint="Opens the block to choose" portrait={block.kind === 'characters'} onClick={open} />
        )}
      </FaceFrame>
    </div>
  )
}
