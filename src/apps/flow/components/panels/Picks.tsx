// Picking what a block reuses: a row from a bank, or a past result from its
// app's own history. Either is done the moment it's picked and costs nothing.

import { useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import type { FlowBlock } from '../../types'
import { useBankStore } from '../../../../stores/bankStore'
import { useFlowStore } from '../../store/flowStore'
import { bankRowValue } from '../../engine/held'
import { BANK_CONFIG, type BankType } from '../../../../utils/constants'
import BankPicker from '../../../../components/BankPicker'
import Modal from '../../../../components/Modal'
import DayPill from '../../../../components/DayPill'
import { useAssetThumb } from '../../../../hooks/useAssetUrl'
import { groupByDay, sectionLabel } from '../../../../utils/history'
import { useVisibleRows } from '../../../../stores/recordingStore'

// The picked bank row, and a button to change it.
export function BankPick({ block, bank }: { block: FlowBlock; bank: BankType }) {
  const patchBlock = useFlowStore((s) => s.patchBlock)
  const [open, setOpen] = useState(false)
  // The rows are read through the selector and handed to the lookup, so a
  // rename or a delete in the Bank shows here straight away.
  const rows = useBankStore((s) => s[bank])
  const productImage = useBankStore((s) => (bank === 'products' && block.pick ? s.products.find((p) => p.id === block.pick)?.productImage : undefined))
  const value = rows && block.pick ? bankRowValue(bank, block.pick) : null
  const thumbRef = value?.type === 'character' ? value.payload.imageRef
    : value?.type === 'image' ? value.payload.ref
    : value?.type === 'style' ? value.payload.thumbRefs?.[0]
    : value?.type === 'ad' ? value.payload.thumbUrl
    : value?.type === 'product' ? productImage
    : undefined
  const thumb = useAssetThumb(thumbRef)
  const noun = BANK_CONFIG[bank].label
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[58px] w-full items-center gap-3 rounded-2xl border border-ink/10 bg-ink/[0.03] px-4 text-left transition-colors hover:border-ink/20"
      >
        {thumbRef ? (
          thumb.url ? <img src={thumb.url} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" /> : <span className="h-9 w-9 shrink-0 rounded-xl bg-ink/10" />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink-100">{value?.label ?? `Choose From ${noun}`}</span>
          {value && <span className="block text-[11px] text-ink-500">From {noun}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />
      </button>
      {bank === 'swipes' ? (
        <SwipePicker open={open} onClose={() => setOpen(false)} onPick={(id) => { patchBlock(block.id, { pick: id }); setOpen(false) }} />
      ) : (
        <BankPicker
          bankType={bank}
          isOpen={open}
          onClose={() => setOpen(false)}
          onSelect={(item) => {
            patchBlock(block.id, { pick: item.id })
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

export function SwipePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const swipes = useBankStore((s) => s.swipes)
  return (
    <Modal open={open} onClose={onClose} title="Choose a Saved Ad" size="medium" fill>
      <div className="flex flex-col gap-1 p-3">
        {swipes.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink-500">Save ads from Outliers and they land here.</p>}
        {swipes.map((s) => (
          <SwipeRow key={s.id} caption={s.caption || `@${s.authorHandle}`} thumbRef={s.thumbRef} meta={`${s.platform} · @${s.authorHandle}`} onClick={() => onPick(s.id)} />
        ))}
      </div>
    </Modal>
  )
}

function SwipeRow({ caption, thumbRef, meta, onClick }: { caption: string; thumbRef?: string; meta: string; onClick: () => void }) {
  const thumb = useAssetThumb(thumbRef)
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-ink/[0.05]">
      {thumb.url ? <img src={thumb.url} alt="" className="h-12 w-9 shrink-0 rounded-lg object-cover" /> : <span className="h-12 w-9 shrink-0 rounded-lg bg-ink/10" />}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[12.5px] text-ink-100">{caption}</span>
        <span className="block text-[11px] capitalize text-ink-500">{meta}</span>
      </span>
    </button>
  )
}

// ── History ────────────────────────────────────────────────────────────────

interface HistoryRow {
  id: string
  createdAt: number
  title: string
  meta?: string
  thumb?: string
}

function useHistoryRows(block: FlowBlock): HistoryRow[] {
  const s = useBankStore()
  const at = (v: string | number) => (typeof v === 'number' ? v : Date.parse(v) || 0)
  switch (block.kind) {
    case 'scripts':
      return s.scriptHistory.map((r) => ({
        id: r.id,
        createdAt: at(r.createdAt),
        title: r.productName ? `${r.productName} · ${r.writeFormat === 'hooks' ? 'Hooks' : r.mode === 'remix' ? 'Remix' : 'Scripts'}` : r.inputSummary.slice(0, 60) || 'Scripts',
        meta: r.writeFormat === 'hooks' ? `${r.hookCount ?? 10} hooks` : `${r.variations.length} ${r.variations.length === 1 ? 'script' : 'scripts'}`,
      }))
    case 'characters':
      return s.characterHistory.map((r) => ({ id: r.id, createdAt: at(r.createdAt), title: r.kind === 'sheet' ? 'Character Sheet' : 'Portrait', meta: r.styleName, thumb: r.imageRef }))
    case 'voice':
      return s.voiceHistory.map((r) => ({ id: r.id, createdAt: at(r.createdAt), title: r.scriptPreview || 'Voiceover', meta: `${r.voiceName} · ${Math.round(r.duration)}s` }))
    case 'broll':
      return s.brollHistory.filter((r) => !r.storyboardStatus && (r.mode ?? 'line') === 'line').map((r) => ({ id: r.id, createdAt: at(r.createdAt), title: r.inputSummary || 'B-Roll Session', meta: r.styleName }))
    case 'playground': {
      const mode = block.settings.mode
      if (mode === 'video') return s.videoHistory.filter((r) => r.sourceApp !== 'broll-studio').map((r) => ({ id: r.id, createdAt: at(r.createdAt), title: r.prompt.slice(0, 70) || 'Clip', meta: `${r.durationSeconds ?? ''}s` }))
      if (mode === 'music') return s.musicHistory.map((r) => ({ id: r.id, createdAt: at(r.createdAt), title: r.title || r.prompt.slice(0, 60) || 'Track', thumb: r.coverImageRef }))
      return s.imageHistory.map((r) => ({ id: r.id, createdAt: at(r.createdAt), title: r.prompt.slice(0, 70) || 'Image', thumb: r.imageUrl }))
    }
    case 'analyzer':
      return s.adAnatomyHistory.filter((r) => r.status === 'complete').map((r) => ({ id: r.id, createdAt: at(r.createdAt), title: r.adTitle || r.fileName, thumb: r.thumbnailRef }))
    default:
      return []
  }
}

const HISTORY_PREFIX: Partial<Record<FlowBlock['kind'], string>> = {
  scripts: 'script',
  characters: 'character',
  voice: 'voice',
  broll: 'broll',
  analyzer: 'ad',
}

export function HistoryPick({ block }: { block: FlowBlock }) {
  const patchBlock = useFlowStore((s) => s.patchBlock)
  const rows = useHistoryRows(block)
  // Hidden rows stay hidden while recording, like every history surface.
  const visible = useVisibleRows(rows, HISTORY_PREFIX[block.kind] ?? String(block.settings.mode ?? 'image'))
  const groups = groupByDay(visible.slice(0, 80), (r) => r.createdAt)
  if (!visible.length) return <p className="px-1 py-4 text-center text-xs text-ink-500">Nothing in this app's history yet.</p>
  return (
    <div className="flex flex-col">
      {groups.map(([day, items]) => (
        <div key={day}>
          <DayPill label={sectionLabel(day)} />
          <div className="flex flex-col gap-1">
            {items.map((r) => (
              <HistoryRowButton key={r.id} row={r} picked={block.pick === r.id} onClick={() => patchBlock(block.id, { pick: r.id })} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function HistoryRowButton({ row, picked, onClick }: { row: HistoryRow; picked: boolean; onClick: () => void }) {
  const thumb = useAssetThumb(row.thumb)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors ${picked ? 'border-flow-500/50 bg-flow-500/10' : 'border-transparent hover:bg-ink/[0.04]'}`}
    >
      {row.thumb ? (thumb.url ? <img src={thumb.url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-xl bg-ink/10" />) : null}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[12.5px] text-ink-100">{row.title}</span>
        {row.meta && <span className="block text-[11px] text-ink-500">{row.meta}</span>}
      </span>
      {picked && <Check className="h-4 w-4 shrink-0 text-flow-300" />}
    </button>
  )
}

