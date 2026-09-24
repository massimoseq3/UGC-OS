// Make a Flow From Your Work, on Flow Home: the latest things made in any
// app, each one a press away from How It Was Made and Save as Flow. The same
// two open from a tile in the app itself; this is where they're found.
//
// Recording Mode hides history rows per app, and this list reads each bank
// through the same filter, so filming Flow Home never shows what's hidden.

import type { Lineage } from '../../../stores/types'
import { useBankStore } from '../../../stores/bankStore'
import { toMs, useVisibleRows } from '../../../stores/recordingStore'
import { useAssetThumb } from '../../../hooks/useAssetUrl'
import { formatRelative } from '../../../utils/history'
import { GlassTile } from '../../../components/AppGlassTile'
import { useFlowStore } from '../store/flowStore'
import { findRow, type LineageBanks, type MadeBank, type TracedRow } from '../lineage/trace'
import { faceOf } from '../lineage/faces'

const SHOWN = 6

interface Made {
  ref: Lineage & { bank: MadeBank }
  at: number
}

export default function FromYourWork() {
  const banks = useBankStore((s) => s) as unknown as LineageBanks
  const voice = useVisibleRows(useBankStore((s) => s.voiceHistory), 'voice')
  const broll = useVisibleRows(useBankStore((s) => s.brollHistory), 'broll')
  const video = useVisibleRows(useBankStore((s) => s.videoHistory), 'video')
  const image = useVisibleRows(useBankStore((s) => s.imageHistory), 'image')
  const music = useVisibleRows(useBankStore((s) => s.musicHistory), 'music')
  const script = useVisibleRows(useBankStore((s) => s.scriptHistory), 'script')
  const character = useVisibleRows(useBankStore((s) => s.characterHistory), 'character')
  const ad = useVisibleRows(useBankStore((s) => s.adAnatomyHistory), 'ad')
  const openLineage = useFlowStore((s) => s.openLineage)

  const made: Made[] = [
    ...voice.map((r) => ({ ref: { bank: 'voiceHistory' as const, id: r.id }, at: toMs(r.createdAt) })),
    // A session still writing its storyboard (or that failed to) has nothing to trace yet.
    ...broll.filter((r) => !r.storyboardStatus).map((r) => ({ ref: { bank: 'brollHistory' as const, id: r.id }, at: toMs(r.createdAt) })),
    // A B-Roll clip is one card of its session, which is listed already.
    ...video.filter((r) => r.sourceApp !== 'broll-studio').map((r) => ({ ref: { bank: 'videoHistory' as const, id: r.id }, at: toMs(r.createdAt) })),
    ...image.map((r) => ({ ref: { bank: 'imageHistory' as const, id: r.id }, at: toMs(r.createdAt) })),
    ...music.map((r) => ({ ref: { bank: 'musicHistory' as const, id: r.id }, at: toMs(r.createdAt) })),
    ...script.map((r) => ({ ref: { bank: 'scriptHistory' as const, id: r.id }, at: toMs(r.createdAt) })),
    ...character.map((r) => ({ ref: { bank: 'characterHistory' as const, id: r.id }, at: toMs(r.createdAt) })),
    ...ad.filter((r) => r.status === 'complete').map((r) => ({ ref: { bank: 'adAnatomyHistory' as const, id: r.id }, at: toMs(r.createdAt) })),
  ]
  const latest = made.sort((a, b) => b.at - a.at).slice(0, SHOWN)

  if (!latest.length) {
    return <p className="text-center text-sm text-ink-500">Make something in any app, and it shows up here to turn into a flow.</p>
  }

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {latest.map((m) => {
        const node = { bank: m.ref.bank, id: m.ref.id, row: findRow(banks, m.ref.bank, m.ref.id) } as TracedRow
        return <WorkCard key={`${m.ref.bank}:${m.ref.id}`} node={node} at={m.at} onHow={() => openLineage(m.ref, 'how')} onSave={() => openLineage(m.ref, 'save')} />
      })}
    </div>
  )
}

function WorkCard({ node, at, onHow, onSave }: { node: TracedRow; at: number; onHow: () => void; onSave: () => void }) {
  const face = faceOf(node)
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink/5 bg-ink/[0.02] px-3 py-3">
      {face.thumb ? <Thumb refId={face.thumb} /> : <GlassTile icon={face.icon} accent={face.accent} size={40} />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-ink-500">{face.source} · {formatRelative(at)}</p>
        <p className="truncate text-[13px] text-ink-100">{face.title}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onHow}
            className="rounded-full border border-ink/10 px-2.5 py-1 text-[11px] font-medium text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
          >
            How It Was Made
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-full border border-flow-500/30 bg-flow-500/10 px-2.5 py-1 text-[11px] font-semibold text-flow-300 transition-colors hover:bg-flow-500/20"
          >
            Save as Flow
          </button>
        </div>
      </div>
    </div>
  )
}

function Thumb({ refId }: { refId: string }) {
  const thumb = useAssetThumb(refId)
  return thumb.url
    ? <img src={thumb.url} alt="" className="h-14 w-11 shrink-0 rounded-lg object-cover" />
    : <div className="h-14 w-11 shrink-0 rounded-lg bg-ink/5" />
}
