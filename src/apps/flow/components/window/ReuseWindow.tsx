// An app block set to From Bank or From History: it reuses something already
// made — a character or script from the bank, a past result from the app's
// own history — so it costs nothing and is done the moment it's picked. The
// left column picks it; the right shows what the block hands on.

import { FileText, History, Pause, Play, UserRound } from 'lucide-react'
import type { FlowValue } from '../../types'
import { sourceOf } from '../../engine/catalog'
import { useAssetThumb } from '../../../../hooks/useAssetUrl'
import { useAudioPlayback } from '../../../../hooks/useAudioPlayback'
import GridCanvas from '../../../../components/GridCanvas'
import SectionCard from '../../../../components/SectionCard'
import { BankPick, HistoryPick } from '../panels/Picks'
import { InputsBand, NothingYet } from './parts'
import type { WindowProps } from './runs'

export default function ReuseWindow({ doc, block, plan, run, onReview }: WindowProps) {
  const source = sourceOf(block)
  const bp = plan?.blocks[block.id]
  const values = Object.values(bp?.values ?? {}).flat().filter((v) => !v.pending)
  // One value per thing handed on: a batch's items also come out one by one.
  const shown = values.filter((v, i) => values.findIndex((x) => x.key === v.key) === i)
  return (
    <>
      <div className="flex w-[440px] shrink-0 flex-col border-r border-ink/5">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 px-5 pb-4 pt-4">
            {source === 'bank' ? (
              <SectionCard icon={block.kind === 'characters' ? UserRound : FileText} title={block.kind === 'characters' ? 'Your Character' : 'Your Script'} contentClassName="flex flex-col gap-2">
                <BankPick block={block} bank={block.kind === 'characters' ? 'models' : 'scripts'} />
                <p className="px-1 text-[11.5px] leading-relaxed text-ink-500">Straight from your bank: nothing is made, so it costs nothing. Turn on Run Field above and whoever runs the flow picks their own.</p>
              </SectionCard>
            ) : (
              <SectionCard icon={History} title="From History" contentClassName="flex flex-col gap-2">
                <p className="px-1 text-[11.5px] leading-relaxed text-ink-500">A past result from this app's own history. It's already paid for, so this block costs nothing and hands it on at once.</p>
                <HistoryPick block={block} />
              </SectionCard>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <InputsBand doc={doc} block={block} plan={plan} run={run} onReview={onReview} />
        <GridCanvas>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <NothingYet icon={source === 'bank' ? UserRound : History} title="Nothing picked yet" hint={bp?.blocked ?? 'Pick one on the left, and it shows here as the block hands it on.'} />
            ) : (
              <div className="grid grid-cols-2 gap-3 px-6 py-6 md:grid-cols-3 xl:grid-cols-4">
                {shown.map((v) => <HeldTile key={v.key} value={v} />)}
              </div>
            )}
          </div>
        </GridCanvas>
      </div>
    </>
  )
}

// What the block hands on, as its own kind of thing: a picture, a clip's
// cover, a voiceover you can play, or the words.
function HeldTile({ value }: { value: FlowValue }) {
  const picture = value.type === 'character' ? value.payload.imageRef
    : value.type === 'image' ? value.payload.ref
    : value.type === 'video' ? value.payload.cover ?? value.payload.stills?.[0]
    : undefined
  const thumb = useAssetThumb(picture)
  const audio = value.type === 'audio' ? value.payload : null
  const player = useAudioPlayback(audio?.ref ?? null, audio?.durationSeconds ?? 0)
  if (picture) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-ink/10">
          {thumb.url ? <img src={thumb.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 bg-ink/10" />}
        </div>
        <span className="line-clamp-2 text-[11.5px] text-ink-400">{value.label}</span>
      </div>
    )
  }
  if (audio) {
    return (
      <button type="button" onClick={player.toggle} className="col-span-2 flex items-center gap-3 rounded-2xl border border-ink/5 bg-surface-1/80 px-4 py-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-voice-500 text-white">{player.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-200">{value.label}</span>
      </button>
    )
  }
  const text = (value.payload as { text?: string }).text ?? value.label
  return (
    <div className="col-span-2 rounded-2xl border border-ink/5 bg-surface-1/80 p-4">
      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-200">{text}</p>
    </div>
  )
}
