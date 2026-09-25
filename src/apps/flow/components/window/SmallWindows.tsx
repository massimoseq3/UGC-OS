// The Ad Analyzer, Outliers and Edit Pack, as blocks. Each keeps its app's
// own output — the Ad Analyzer's breakdown, Outliers' result cards, Edit's
// one-folder-per-ad — and a left column holding what the block runs on.

import { useState } from 'react'
import { Bookmark, Download, Eye, FolderOpen, Key, Radar, Scissors, Search, Sparkles } from 'lucide-react'
import type { FlowValue } from '../../types'
import { blockWidth, TYPE_META } from '../../engine/catalog'
import { itemPort, liveItems, wiresInto } from '../../engine/graph'
import { useFlowStore } from '../../store/flowStore'
import { useBankStore } from '../../../../stores/bankStore'
import { useSettingsStore } from '../../../../stores/settingsStore'
import { useAppStore } from '../../../../stores/appStore'
import { useAssetThumb, useAssetUrl } from '../../../../hooks/useAssetUrl'
import { humanizeError } from '../../../../utils/friendlyError'
import type { AdAnatomyHistoryItem } from '../../../../stores/types'
import ResultsView from '../../../ad-anatomy/components/ResultsView'
import type { AnalysisResult } from '../../../ad-anatomy/types'
import ResultCard from '../../../discover/components/ResultCard'
import type { DiscoverPlatform, DiscoverResult } from '../../../discover/types'
import { saveResultVideoToDisk, saveThumbnail } from '../../../discover/services/handoff'
import { downloadEditPacks } from '../../run/editPack'
import { freeSpot } from '../../engine/layout'
import SectionCard from '../../../../components/SectionCard'
import SegmentedToggle from '../../../../components/SegmentedToggle'
import Dropdown from '../../../../components/Dropdown'
import GridCanvas from '../../../../components/GridCanvas'
import Spinner from '../../../../components/Spinner'
import { SwipePicker } from '../panels/Picks'
import { InputsBand, NothingYet, RunBand, RunChip, WiredCard } from './parts'
import { blockRuns, type BlockRun, type WindowProps } from './runs'

// ── The Ad Analyzer ────────────────────────────────────────────────────────

export function AnalyzerWindow({ doc, block, plan, run, onRun, onReview }: WindowProps) {
  const addBlock = useFlowStore((s) => s.addBlock)
  const connect = useFlowStore((s) => s.connect)
  const setSelection = useFlowStore((s) => s.setSelection)
  const addToast = useAppStore((s) => s.addToast)
  const [swipeOpen, setSwipeOpen] = useState(false)
  const bp = plan?.blocks[block.id]
  const runs = blockRuns(block, bp, run)
  const adWired = wiresInto(doc, block.id, 'ad').length > 0
  const count = runs.length || 1
  const ads: FlowValue[] = []
  for (const r of runs) for (const v of r.inputs.ad ?? []) if (!ads.some((a) => a.key === v.key)) ads.push(v)

  const feed = (make: () => string, fromPort: string, what: string) => {
    const id = make()
    const check = connect({ from: id, fromPort, to: block.id, toPort: 'ad' })
    setSelection([block.id])
    addToast(check.ok ? `${what} is on the canvas, wired in.` : check.reason, check.ok ? 'success' : 'error')
  }
  const at = freeSpot(doc, { x: block.x - blockWidth('outliers') - 96, y: block.y }, 'outliers')

  return (
    <>
      <div className="flex w-[440px] shrink-0 flex-col border-r border-ink/5">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 px-5 pb-2 pt-4">
            <SectionCard icon={Eye} title="The Ad" contentClassName="flex flex-col gap-2">
              {adWired ? (
                <WiredCard doc={doc} block={block} port="ad" hint="Each ad that comes in is broken down once, the way the Ad Analyzer does it, and lands in its history.">
                  {ads.length > 0 && (
                    <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
                      {ads.slice(0, 12).map((a) => <AdRow key={a.key} value={a} />)}
                    </div>
                  )}
                </WiredCard>
              ) : (
                <>
                  <p className="px-1 text-[12px] leading-relaxed text-ink-400">Wire in an ad: one from your Swipe File, or the winners an Outliers search finds.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setSwipeOpen(true)} className="flex items-center justify-center gap-1.5 rounded-full border border-ink/10 px-3 py-2.5 text-[12px] font-medium text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100">
                      <Bookmark className="h-3.5 w-3.5" />
                      A Saved Ad
                    </button>
                    <button
                      type="button"
                      onClick={() => feed(() => addBlock('outliers', at), 'all', 'An Outliers search')}
                      className="flex items-center justify-center gap-1.5 rounded-full border border-ink/10 px-3 py-2.5 text-[12px] font-medium text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
                    >
                      <Radar className="h-3.5 w-3.5" />
                      An Outliers Search
                    </button>
                  </div>
                </>
              )}
            </SectionCard>
            <SectionCard icon={Sparkles} title="What Comes Out" contentClassName="flex flex-col gap-1.5">
              <OutRow color={TYPE_META.transcript.color} label="Transcript" goes="Scripts' Winning Ad to remix it, or B-Roll's script to shoot it on the same beats" />
              <OutRow color={TYPE_META.text.color} label="Scene Prompts" goes="any prompt or brief: the full recreation, as text" />
            </SectionCard>
          </div>
        </div>
        <RunBand block={block} plan={plan} run={run} onRun={onRun} icon={Eye} label={count > 1 ? `Analyze ${count} Ads` : 'Analyze the Ad'} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <InputsBand doc={doc} block={block} plan={plan} run={run} onReview={onReview} />
        <AnalysisOutput runs={runs} />
      </div>

      <SwipePicker
        open={swipeOpen}
        onClose={() => setSwipeOpen(false)}
        onPick={(id) => {
          setSwipeOpen(false)
          feed(() => addBlock('bank', at, { settings: { bank: 'swipes' }, pick: id }), 'out', 'The saved ad')
        }}
      />
    </>
  )
}

function OutRow({ color, label, goes }: { color: string; label: string; goes: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-ink/5 bg-ink/[0.02] px-3 py-2.5">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-ink-200">{label}</span>
        <span className="block text-[11px] leading-relaxed text-ink-500">Feeds {goes}</span>
      </span>
    </div>
  )
}

function AdRow({ value }: { value: FlowValue }) {
  const thumbRef = value.type === 'ad' ? value.payload.thumbUrl : undefined
  const thumb = useAssetThumb(thumbRef)
  const meta = value.type === 'ad' ? [value.payload.platform, value.payload.author ? `@${value.payload.author}` : ''].filter(Boolean).join(' · ') : ''
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-ink/[0.04] px-2 py-1.5">
      {thumb.url ? <img src={thumb.url} alt="" className="h-11 w-8 shrink-0 rounded-md object-cover" /> : <span className="h-11 w-8 shrink-0 rounded-md bg-ink/10" />}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[11.5px] leading-snug text-ink-200">{value.pending ? 'Waiting on the search' : value.label}</span>
        {meta && <span className="block truncate text-[10.5px] capitalize text-ink-500">{meta}</span>}
      </span>
    </div>
  )
}

// One analysis at a time, on the Ad Analyzer's own breakdown.
function AnalysisOutput({ runs }: { runs: BlockRun[] }) {
  const [picked, setPicked] = useState<string | null>(null)
  const history = useBankStore((st) => st.adAnatomyHistory)
  const shown = runs.find((r) => r.key === picked) ?? runs.find((r) => r.result) ?? runs[0]
  const rowId = shown?.result?.rows?.find((r) => r.bank === 'adAnatomyHistory')?.id
  const row = rowId ? history.find((h) => h.id === rowId) : undefined
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {runs.length > 1 && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-ink/5 px-5 py-2.5 [scrollbar-width:none]">
          {runs.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setPicked(r.key)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${r.key === shown?.key ? 'border-analyzer-500/40 bg-analyzer-500/10 text-ink-100' : 'border-ink/10 text-ink-400 hover:border-ink/20 hover:text-ink-200'}`}
            >
              <span className="max-w-[180px] truncate">{r.label}</span>
              <RunChip status={r.status} note={r.note} />
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {row?.status === 'complete' && row.result ? (
          <Breakdown row={row} />
        ) : shown && (shown.status === 'running' || shown.status === 'queued' || row?.status === 'analyzing') ? (
          <GridCanvas>
            <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 text-center">
              <Spinner className="h-6 w-6 text-analyzer-400" />
              <p className="text-sm text-ink-400">{shown.note ?? 'Analyzing'}…</p>
            </div>
          </GridCanvas>
        ) : (
          <GridCanvas>
            <NothingYet icon={Eye} title={shown?.status === 'failed' ? 'That analysis failed' : 'No breakdown yet'} hint={shown?.error ?? 'The scorecard, the breakdown, the transcript and the scene prompts land here, the way the Ad Analyzer shows them.'} />
          </GridCanvas>
        )}
      </div>
    </div>
  )
}

function Breakdown({ row }: { row: AdAnatomyHistoryItem }) {
  const sourceUrl = useAssetUrl(row.uploadedRef ?? null) ?? null
  const thumbUrl = useAssetUrl(row.thumbnailRef ?? null) ?? null
  return (
    <ResultsView
      result={row.result as AnalysisResult}
      videoSrc={sourceUrl}
      restoredThumbUrl={thumbUrl}
      fileName={row.fileName}
      mediaKind={row.mediaKind}
      analysisId={row.id}
    />
  )
}

// ── Outliers ───────────────────────────────────────────────────────────────

const PLATFORMS: Array<{ value: DiscoverPlatform; label: string }> = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'meta', label: 'Meta Ads' },
]

export function OutliersWindow({ doc, block, plan, run, onRun, onReview }: WindowProps) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const hasKey = useSettingsStore((s) => !!s.scrapeCreatorsKey)
  const s = block.settings
  const set = (patch: Record<string, unknown>, coalesce?: string) => patchSettings(block.id, patch, coalesce ? { coalesce: `${coalesce}:${block.id}` } : undefined)
  const bp = plan?.blocks[block.id]
  const runs = blockRuns(block, bp, run)
  const queryWired = wiresInto(doc, block.id, 'query').length > 0
  const platform = (PLATFORMS.find((p) => p.value === s.platform)?.value ?? 'tiktok') as DiscoverPlatform
  const count = runs.length || 1

  return (
    <>
      <div className="flex w-[440px] shrink-0 flex-col border-r border-ink/5">
        <div className="flex h-[57px] shrink-0 items-center border-b border-ink/5 px-5">
          <SegmentedToggle<DiscoverPlatform> className="h-10 !p-1" dense value={platform} onChange={(v) => set({ platform: v })} options={PLATFORMS} accent="outliers" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 px-5 pb-2 pt-4">
            {queryWired ? (
              <WiredCard doc={doc} block={block} port="query" hint="The search comes in on its wire. A Batch wired here runs one search per item." />
            ) : (
              <label className="flex h-12 items-center gap-2.5 rounded-full border border-ink/10 bg-ink/[0.02] px-4 transition-colors focus-within:border-[#D9A404]/40">
                <Search className="h-4 w-4 shrink-0 text-ink-500" />
                <input
                  value={String(s.query ?? '')}
                  onChange={(e) => set({ query: e.target.value }, 'query')}
                  placeholder="What to search for, e.g. vitamin c serum"
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink-100 placeholder-ink-600 outline-none"
                  aria-label="Search"
                />
              </label>
            )}
            <Dropdown label="Ads to Keep" accent="neutral" value={String(s.count ?? 5)} options={['1', '3', '5', '10', '20']} onChange={(v) => set({ count: Number(v) })} />
            <p className={`flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[11.5px] leading-relaxed ${hasKey ? 'text-ink-500' : 'border border-[#D9A404]/25 bg-[#D9A404]/[0.07] text-ink-300'}`}>
              <Key className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {hasKey
                ? 'Searches with your ScrapeCreators key, one search per run. It costs no kie.ai credits. Only video ads are kept, each with its own dot on the block.'
                : 'Outliers searches with a ScrapeCreators key. Add one in Settings before running this block.'}
            </p>
          </div>
        </div>
        <RunBand block={block} plan={plan} run={run} onRun={onRun} icon={Radar} label={count > 1 ? `Run ${count} Searches` : `Search ${PLATFORMS.find((p) => p.value === platform)?.label}`} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <InputsBand doc={doc} block={block} plan={plan} run={run} onReview={onReview} />
        <GridCanvas>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {runs.every((r) => !r.result?.items || !Object.keys(r.result.items).length) ? (
              runs.some((r) => r.status === 'running') ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-3"><Spinner className="h-6 w-6 text-[#D9A404]" /><p className="text-sm text-ink-400">Searching…</p></div>
              ) : (
                <NothingYet icon={Radar} title="No ads found yet" hint="The outliers a search finds land here as cards. Each one also has its own dot on the block, so one winner can go to the Ad Analyzer on its own." />
              )
            ) : (
              <div className="flex flex-col gap-6 px-6 py-6">
                {runs.map((r) => <FoundAds key={r.key} run={r} blockId={block.id} slots={liveItems(block).map((it) => it.id)} several={runs.length > 1} />)}
              </div>
            )}
          </div>
        </GridCanvas>
      </div>
    </>
  )
}

// One search's ads, on Outliers' own cards. Analyze and Remix answer in the
// flow — an Ad Analyzer (and a Scripts remix after it) lands on the canvas
// wired to that ad — and Save, Download and Open do what they do in Outliers.
function FoundAds({ run, blockId, slots, several }: { run: BlockRun; blockId: string; slots: string[]; several: boolean }) {
  const doc = useFlowStore((s) => (s.openId ? s.docs[s.openId] : undefined))
  const addBlock = useFlowStore((s) => s.addBlock)
  const connect = useFlowStore((s) => s.connect)
  const setSelection = useFlowStore((s) => s.setSelection)
  const addToast = useAppStore((s) => s.addToast)
  const swipes = useBankStore((s) => s.swipes)
  const [busy, setBusy] = useState<string | null>(null)
  const found = slots
    .map((slot) => ({ slot, value: run.result?.items?.[slot] }))
    .filter((f): f is { slot: string; value: FlowValue } => f.value?.type === 'ad' && !!f.value.payload.result)
  if (!found.length) return null
  const host = doc?.blocks.find((b) => b.id === blockId)
  const graphNow = () => useFlowStore.getState().docs[useFlowStore.getState().openId ?? ''] ?? { blocks: [], wires: [] }

  // Wires that one ad into a new Ad Analyzer (and a Scripts remix after it).
  // With one search, the ad's own item output is that ad. With several — a
  // List feeding Search — the same slot holds that position from EVERY
  // search, so wiring it would analyze each of them; the ad goes to the
  // Swipe File instead and a Bank block holding just it feeds the analyzer.
  const analyze = async (slot: string, result: DiscoverResult, remix: boolean) => {
    if (!host) return
    let from = { block: blockId, port: itemPort(slot) }
    let x = host.x + blockWidth('outliers') + 96
    if (several) {
      setBusy(result.id)
      const saved = useBankStore.getState().getSwipeBySource(result.platform, result.id)?.id
        ?? await saveSwipe(result).catch((err: unknown) => {
          addToast(humanizeError(err, "Couldn't save that ad to your swipe file, so it wasn't wired."), 'error')
          return null
        })
      setBusy(null)
      if (!saved) return
      const bank = addBlock('bank', freeSpot(graphNow(), { x, y: host.y }, 'bank'), { settings: { bank: 'swipes' }, pick: saved })
      from = { block: bank, port: 'out' }
      x += blockWidth('bank') + 96
    }
    const an = addBlock('analyzer', freeSpot(graphNow(), { x, y: host.y }, 'analyzer'))
    connect({ from: from.block, fromPort: from.port, to: an, toPort: 'ad' })
    if (remix) {
      const placed = graphNow().blocks.find((b) => b.id === an)
      const sc = addBlock('scripts', freeSpot(graphNow(), { x: (placed?.x ?? x) + blockWidth('analyzer') + 96, y: placed?.y ?? host.y }, 'scripts'), { settings: { mode: 'remix', writeFormat: 'script' } })
      connect({ from: an, fromPort: 'transcript', to: sc, toPort: 'source' })
    }
    setSelection([blockId])
    const added = remix ? 'An Ad Analyzer and a Scripts remix are on the canvas, wired to that ad.' : 'An Ad Analyzer is on the canvas, wired to that ad.'
    addToast(several ? `${added} It's saved to your Swipe File, so only that ad is analyzed.` : added, 'success')
  }

  const save = async (result: DiscoverResult) => {
    const existing = useBankStore.getState().getSwipeBySource(result.platform, result.id)
    if (existing) {
      await useBankStore.getState().deleteSwipe(existing.id)
      return
    }
    setBusy(result.id)
    await saveSwipe(result).catch((err: unknown) => addToast(humanizeError(err, "Couldn't save that to your swipe file."), 'error'))
    setBusy(null)
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="truncate text-[12px] font-medium text-ink-300">{run.label}</span>
        <RunChip status={run.status} note={run.note} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
        {found.map(({ slot, value }) => {
          const result = (value.type === 'ad' ? value.payload.result : undefined) as DiscoverResult
          return (
            <ResultCard
              key={slot}
              result={result}
              onAnalyze={(r) => void analyze(slot, r, false)}
              onRemix={(r) => void analyze(slot, r, true)}
              onSave={(r) => void save(r)}
              onDownload={(r) => void saveResultVideoToDisk(r, () => undefined).catch((err: unknown) => addToast(humanizeError(err, "Couldn't download that video. Try opening the original instead."), 'error'))}
              onOpen={(r) => window.open(r.postUrl, '_blank', 'noopener')}
              saved={swipes.some((sw) => sw.platform === result.platform && sw.sourceId === result.id)}
              busy={busy === result.id ? 'save' : null}
            />
          )
        })}
      </div>
    </section>
  )
}

// Files an ad in the Swipe File the way Outliers' own Save does: its numbers
// as they are today, its thumbnail copied into our storage.
async function saveSwipe(result: DiscoverResult): Promise<string> {
  const thumbRef = await saveThumbnail(result)
  return useBankStore.getState().addSwipe({
    platform: result.platform,
    sourceId: result.id,
    postUrl: result.postUrl,
    thumbRef,
    mediaUrl: result.videoUrl,
    authorHandle: result.author.handle,
    authorName: result.author.name,
    caption: result.caption,
    views: result.stats?.views,
    likes: result.stats?.likes,
    comments: result.stats?.comments,
    shares: result.stats?.shares,
    saves: result.stats?.saves,
    followerCount: result.author.followerCount,
    outlierMultiple: result.outlier?.multiple,
    daysRunning: result.ad?.daysRunning ?? undefined,
  })
}

// ── Edit Pack ──────────────────────────────────────────────────────────────

const INCLUDES: Array<{ port: string; label: string; path: string }> = [
  { port: 'script', label: 'Script', path: 'input/script.txt' },
  { port: 'audio', label: 'Voiceover', path: 'input/voiceover.mp3' },
  { port: 'clips', label: 'B-Roll Clips', path: 'input/broll/' },
  { port: 'music', label: 'Music', path: 'input/music/' },
]

export function EditWindow({ doc, block, plan, run, onRun, onReview }: WindowProps) {
  const bp = plan?.blocks[block.id]
  const runs = blockRuns(block, bp, run)
  const packs = runs.map((r) => r.result?.pack).filter((p): p is NonNullable<typeof p> => !!p)
  const count = runs.length || 1
  return (
    <>
      <div className="flex w-[440px] shrink-0 flex-col border-r border-ink/5">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 px-5 pb-2 pt-4">
            <SectionCard icon={FolderOpen} title="Includes" contentClassName="flex flex-col gap-1.5">
              {INCLUDES.map((inc) => {
                const wired = wiresInto(doc, block.id, inc.port).length > 0
                return (
                  <div key={inc.port} className="flex items-center gap-2.5 rounded-2xl border border-ink/5 bg-ink/[0.02] px-3 py-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${wired ? 'bg-[#F77646]' : 'bg-ink/15'}`} />
                    <span className="min-w-0 flex-1 text-[12.5px] font-medium text-ink-200">{inc.label}</span>
                    <code className="shrink-0 text-[10.5px] text-ink-500">{inc.path}</code>
                  </div>
                )
              })}
            </SectionCard>
            <SectionCard icon={FolderOpen} title="One Folder Per Ad" contentClassName="flex flex-col gap-2">
              <pre className="overflow-hidden rounded-2xl bg-ink/[0.03] px-4 py-3 font-mono text-[11px] leading-relaxed text-ink-300">{`${slugOf(doc.name)}/
  ad-01/input/script.txt
  ad-01/input/voiceover.mp3
  ad-01/input/broll/clip-01.mp4 …
  ad-02/ …`}</pre>
              <p className="px-1 text-[11.5px] leading-relaxed text-ink-500">Folders match what the /video-editor skill reads, so each ad edits with one command. Nothing is generated here: it gathers what the blocks before it made.</p>
            </SectionCard>
          </div>
        </div>
        <RunBand block={block} plan={plan} run={run} onRun={onRun} icon={Scissors} label={count > 1 ? `Gather ${count} Packs` : 'Gather the Pack'} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <InputsBand
          doc={doc}
          block={block}
          plan={plan}
          run={run}
          onReview={onReview}
          extra={packs.length > 0 ? (
            <button
              type="button"
              onClick={() => void downloadEditPacks(doc.name, packs)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#F77646]/40 bg-[#F77646]/10 px-3.5 text-xs font-semibold text-[#F77646] transition-colors hover:bg-[#F77646]/20"
            >
              <Download className="h-3.5 w-3.5" />
              Download {packs.length} {packs.length === 1 ? 'Pack' : 'Packs'}
            </button>
          ) : undefined}
        />
        <GridCanvas>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {runs.length === 0 ? (
              <NothingYet icon={Scissors} title="No packs yet" hint="One folder per ad lands here: the script, the voiceover and the clips in scene order." />
            ) : (
              <div className="grid grid-cols-1 gap-3 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
                {runs.map((r) => <PackCard key={r.key} run={r} flowName={doc.name} />)}
              </div>
            )}
          </div>
        </GridCanvas>
      </div>
    </>
  )
}

function PackCard({ run, flowName }: { run: BlockRun; flowName: string }) {
  const pack = run.result?.pack
  const cover = pack?.cover ?? pack?.stills[0]
  const thumb = useAssetThumb(cover)
  return (
    <div className="flex gap-3 rounded-2xl border border-ink/5 bg-surface-1/80 p-3">
      {thumb.url ? <img src={thumb.url} alt="" className="h-28 w-16 shrink-0 rounded-xl object-cover" /> : <span className="flex h-28 w-16 shrink-0 items-center justify-center rounded-xl bg-[#F77646]/10 text-[#F77646]"><Scissors className="h-4 w-4" /></span>}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="line-clamp-2 text-[12.5px] font-medium leading-snug text-ink-100">{pack?.title ?? run.label}</span>
        {pack ? (
          <span className="text-[11px] text-ink-500">
            {pack.clips.length} {pack.clips.length === 1 ? 'clip' : 'clips'}{pack.voiceover ? ' · voiceover' : ''}{pack.script ? ' · script' : ''}{pack.music ? ' · music' : ''}
          </span>
        ) : (
          <RunChip status={run.status} note={run.note} />
        )}
        {pack && (
          <button
            type="button"
            onClick={() => void downloadEditPacks(`${flowName}-${pack.title}`, [pack])}
            className="mt-auto flex w-fit items-center gap-1.5 rounded-full border border-[#F77646]/40 bg-[#F77646]/10 px-3 py-1.5 text-[11px] font-semibold text-[#F77646] transition-colors hover:bg-[#F77646]/20"
          >
            <Download className="h-3 w-3" />
            Download
          </button>
        )}
      </div>
    </div>
  )
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flow'
}
