// Make a Flow From Your Work, on Flow Home: the latest things made in any
// app, each a poster with Save as Flow under it — and How It Was Made a
// press on the poster itself. The same two open from a tile in the app; this
// is where they're found.
//
// Recording Mode hides history rows per app, and this list reads each bank
// through the same filter, so filming Flow Home never shows what's hidden.

import { Play, Workflow } from 'lucide-react'
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
    return <p className="text-sm text-ink-500">Make something in any app, and it shows up here to turn into a flow.</p>
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
      {latest.map((m) => {
        const node = { bank: m.ref.bank, id: m.ref.id, row: findRow(banks, m.ref.bank, m.ref.id) } as TracedRow
        return <WorkPoster key={`${m.ref.bank}:${m.ref.id}`} node={node} at={m.at} onHow={() => openLineage(m.ref, 'how')} onSave={() => openLineage(m.ref, 'save')} />
      })}
    </div>
  )
}

function WorkPoster({ node, at, onHow, onSave }: { node: TracedRow; at: number; onHow: () => void; onSave: () => void }) {
  const face = faceOf(node)
  const thumb = useAssetThumb(face.thumb)
  const isClip = node.bank === 'videoHistory' || node.bank === 'brollHistory'
  return (
    <div className="flex w-[128px] shrink-0 flex-col gap-1.5">
      <button
        type="button"
        onClick={onHow}
        title="How It Was Made"
        className="relative h-[190px] overflow-hidden rounded-[14px] border border-ink/[0.08] bg-ink/[0.03] text-left"
      >
        {thumb.url ? (
          <img src={thumb.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
            <GlassTile icon={face.icon} accent={face.accent} size={36} />
            <span className="line-clamp-3 text-[11px] leading-snug text-ink-300">{face.title}</span>
          </span>
        )}
        {isClip && thumb.url && (
          <span className="absolute left-1/2 top-[44%] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]">
            <Play className="ml-0.5 h-4 w-4" />
          </span>
        )}
      </button>
      <span className="truncate text-[11.5px] text-ink-400">{face.source} · {formatRelative(at)}</span>
      <button
        type="button"
        onClick={onSave}
        className="flex h-7 items-center justify-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.03] px-2.5 text-[12px] font-medium text-ink-200 transition-colors hover:bg-ink/[0.08] hover:text-ink-100"
      >
        <Workflow className="h-3.5 w-3.5" />
        Save as Flow
      </button>
    </div>
  )
}
