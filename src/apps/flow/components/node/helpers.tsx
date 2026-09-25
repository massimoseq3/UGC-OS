// The helper blocks, edited right on the canvas: a Bank pick (the Bank's own
// picker, opened from the block's pill; the pick fills the block as a square,
// face.tsx), an Image (drop one on it, or upload),
// Text and a Note (typed into the block), and a List (one row per item, each
// with its own output dot). None of them has an app to open, so none of them
// opens a window.
//
// `nodrag` keeps a press inside a field from dragging the block; `nowheel`
// lets a long text scroll without zooming the canvas.

import { useRef, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Eye, EyeOff, Image as ImageIcon, ImagePlus, Plus, X } from 'lucide-react'
import type { FlowBlock } from '../../types'
import { TYPE_META } from '../../engine/catalog'
import { itemPort, liveItems, wiresOutOf } from '../../engine/graph'
import { bankRowValue } from '../../engine/held'
import { useFlowStore } from '../../store/flowStore'
import { useBankStore } from '../../../../stores/bankStore'
import { BANK_CONFIG, type BankType } from '../../../../utils/constants'
import { saveAsset } from '../../../../utils/assetStore'
import BankPicker from '../../../../components/BankPicker'
import AutoGrowTextarea from '../../../../components/AutoGrowTextarea'
import { SwipePicker } from '../panels/Picks'
import { useCanvas } from '../canvasContext'
import { edgeOutput } from '../blockMeta'
import { EmptySquare, FaceFrame, FacePill, PictureSquare, ValueSquare } from './face'

const FIELD = 'nodrag nowheel w-full resize-none rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2 text-[12px] leading-relaxed text-ink-100 placeholder-ink-600 outline-none transition-colors focus:border-flow-500/40'

// Synthetic events from a portaled picker still bubble through the React
// tree — into the node, which would take a click in the picker for a click
// on the block, and an arrow key in it for a nudge. The picker's clicks and
// keys stop here.
function Contained({ children }: { children: React.ReactNode }) {
  return (
    <div
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="contents"
    >
      {children}
    </div>
  )
}

// ── Bank ───────────────────────────────────────────────────────────────────

export function BankBody({ block }: { block: FlowBlock }) {
  const patchBlock = useFlowStore((s) => s.patchBlock)
  const [open, setOpen] = useState(false)
  const bank = (block.settings.bank as BankType) ?? 'products'
  // Read through the selector and handed to the lookup, so a rename or a
  // delete in the Bank shows here straight away.
  const rows = useBankStore((s) => s[bank])
  const value = rows && block.pick ? bankRowValue(bank, block.pick) : null
  const noun = BANK_CONFIG[bank].label
  const pick = (id: string) => {
    patchBlock(block.id, { pick: id })
    setOpen(false)
  }
  return (
    <div>
      <FacePill
        label={value?.label}
        placeholder={`Choose From ${noun}`}
        title={value ? `Change · pick another from ${noun}` : `Choose from ${noun}`}
        onClick={() => setOpen(true)}
      />
      <FaceFrame block={block} port={edgeOutput(block)}>
        {value ? (
          <ValueSquare value={value} />
        ) : (
          <EmptySquare
            icon={BANK_CONFIG[bank].icon}
            title={`Pick From ${noun}`}
            hint={block.field ? 'Whoever runs it picks their own' : 'The one this flow uses'}
            portrait={bank === 'models'}
            onClick={() => setOpen(true)}
          />
        )}
      </FaceFrame>
      <Contained>
        {bank === 'swipes' ? (
          <SwipePicker open={open} onClose={() => setOpen(false)} onPick={pick} />
        ) : (
          <BankPicker bankType={bank} isOpen={open} onClose={() => setOpen(false)} onSelect={(item) => pick(item.id)} />
        )}
      </Contained>
    </div>
  )
}

// ── Image ──────────────────────────────────────────────────────────────────

export function ImageBody({ block }: { block: FlowBlock }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const fileRef = useRef<HTMLInputElement>(null)
  const ref = String(block.settings.ref ?? '')
  const upload = async (file: File | undefined) => {
    if (!file) return
    const saved = await saveAsset(file, file.type)
    patchSettings(block.id, { ref: saved, name: file.name.replace(/\.[^.]+$/, '') })
  }
  const choose = () => fileRef.current?.click()
  return (
    <div>
      <FacePill
        label={ref ? String(block.settings.name || 'Image') : undefined}
        placeholder="Upload an Image"
        title={ref ? 'Replace · or drop another image on it' : 'Upload an image · or drop one on it'}
        onClick={choose}
      />
      <FaceFrame block={block} port={edgeOutput(block)}>
        {ref ? <PictureSquare refId={ref} glyph={ImageIcon} /> : <EmptySquare icon={ImagePlus} title="Drop an Image" hint="or upload one" onClick={choose} />}
      </FaceFrame>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void upload(file)
        }}
      />
    </div>
  )
}

// ── Text ───────────────────────────────────────────────────────────────────

export function TextBody({ block }: { block: FlowBlock }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  return (
    <div className="px-3 pb-2.5">
      <AutoGrowTextarea
        value={String(block.settings.text ?? '')}
        onChange={(e) => patchSettings(block.id, { text: e.target.value }, { coalesce: `text:${block.id}` })}
        placeholder="A brief, a prompt, a script — anything a text input takes."
        rows={3}
        maxHeight={176}
        className={FIELD}
      />
    </div>
  )
}

// ── Note ───────────────────────────────────────────────────────────────────

export function NoteBody({ block }: { block: FlowBlock }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  return (
    <AutoGrowTextarea
      value={String(block.settings.text ?? '')}
      onChange={(e) => patchSettings(block.id, { text: e.target.value }, { coalesce: `text:${block.id}` })}
      placeholder="A note for whoever opens this flow. It travels with the template."
      rows={2}
      maxHeight={240}
      className="nodrag nowheel block w-full resize-none bg-transparent px-3.5 pb-3 text-[12px] leading-relaxed text-[#E8C872] placeholder-[#E8C872]/40 outline-none light:text-[#8a6a10] light:placeholder-[#8a6a10]/40"
    />
  )
}

// ── List ───────────────────────────────────────────────────────────────────

const LIST_MAX = 20

export function ListBody({ block }: { block: FlowBlock }) {
  const { doc } = useCanvas()
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const toggleItem = useFlowStore((s) => s.toggleItem)
  const deleteItem = useFlowStore((s) => s.deleteItem)
  const entries = Array.isArray(block.settings.entries) ? (block.settings.entries as string[]) : []
  const items = liveItems(block)
  const color = TYPE_META.text.color
  const setEntry = (i: number, text: string) => {
    const next = [...entries]
    next[i] = text
    patchSettings(block.id, { entries: next }, { coalesce: `list:${block.id}:${i}` })
  }
  return (
    <div className="flex flex-col gap-px pb-2">
      {items.map((it, i) => {
        const used = wiresOutOf(doc, block.id).some((w) => w.fromPort === itemPort(it.id))
        return (
          <div key={it.id} className={`group/item relative flex h-[30px] items-center gap-1 pl-2 pr-3.5 ${it.off ? 'opacity-40' : ''}`}>
            <button
              type="button"
              onClick={() => toggleItem(block.id, it.id)}
              className="nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink/5 hover:text-ink-200"
              title={it.off ? `Turn Item ${i + 1} On` : `Turn Item ${i + 1} Off · nothing downstream runs for it`}
            >
              {it.off ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
            <input
              value={entries[i] ?? ''}
              onChange={(e) => setEntry(i, e.target.value)}
              placeholder={`Item ${i + 1}`}
              className="nodrag min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-1 text-[12px] text-ink-100 placeholder-ink-600 outline-none hover:bg-ink/[0.04] focus:bg-ink/[0.06]"
            />
            <button
              type="button"
              onClick={() => deleteItem(block.id, it.id)}
              className="nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-600 opacity-0 hover:bg-ink/5 hover:text-ink-200 group-hover/item:opacity-100 touch:opacity-100"
              title={`Delete Item ${i + 1}`}
            >
              <X className="h-3 w-3" />
            </button>
            <Handle
              type="source"
              position={Position.Right}
              id={itemPort(it.id)}
              className="flow-port flow-port-item"
              style={{ background: used ? color : 'var(--color-surface-1)', borderColor: color }}
              title={`Item ${i + 1} on its own`}
            />
          </div>
        )
      })}
      {entries.length < LIST_MAX && (
        <button
          type="button"
          onClick={() => patchSettings(block.id, { entries: [...entries, ''] })}
          className="nodrag mx-3 mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink/15 py-1.5 text-[11px] text-ink-400 transition-colors hover:border-flow-500/40 hover:text-flow-300"
        >
          <Plus className="h-3 w-3" />
          Add Item
        </button>
      )}
    </div>
  )
}
