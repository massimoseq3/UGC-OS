// One block on the canvas. Inputs down the left edge and outputs down the
// right, each by name with a dot in its type's colour; a batch lists its
// items, each with its own output, an eye to turn it off and an × to delete
// it; then what the block has made; then one status line — what it will cost,
// what it's doing, or why it can't run.

import { Handle, Position, useConnection, type NodeProps, type Node } from '@xyflow/react'
import { AlertCircle, Download, Eye, EyeOff, Play, Plus, X } from 'lucide-react'
import type { FlowBlock, FlowValue, PortSpec } from '../types'
import { accepts, isBatch, itemNoun, insOf, outsOf, sourceOf, titleOf, TYPE_META, KINDS } from '../engine/catalog'
import { acceptsLabel, blockById, liveItems, outputType, wiresInto, wiresOutOf, wouldCycle, itemPort } from '../engine/graph'
import type { BlockPlan } from '../engine/plan'
import { useFlowStore } from '../store/flowStore'
import { useBankStore } from '../../../stores/bankStore'
import { blockStatusLine, type LiveRun } from '../run/runtime'
import { useCanvas } from './canvasContext'
import { blockAccent, blockIcon, blockWidth } from './blockMeta'
import { GlassTile } from '../../../components/AppGlassTile'
import { useAssetThumb } from '../../../hooks/useAssetUrl'
import Spinner from '../../../components/Spinner'
import { creditsShort } from '../hooks/useFlowPlan'
import { downloadEditPacks } from '../run/editPack'

export type BlockNodeType = Node<{ blockId: string }, 'block'>

export default function BlockNode({ data, selected }: NodeProps<BlockNodeType>) {
  const { doc, plan, run, suggestion, openReview, acceptSuggestion } = useCanvas()
  const block = suggestion?.id === data.blockId ? suggestion : doc.blocks.find((b) => b.id === data.blockId)
  if (!block) return null
  if (block.suggested) return <SuggestedNode block={block} onAccept={acceptSuggestion} />
  if (!KINDS[block.kind]) return <UnknownNode />
  const bp = plan?.blocks[block.id]
  const state = run?.status === 'running' || run?.blocks[block.id]?.status === 'review' ? run.blocks[block.id] : undefined
  const accent = blockAccent(block)
  const Icon = blockIcon(block)

  return (
    <div
      className={`flow-node group relative rounded-2xl border bg-surface-1 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] transition-colors ${
        selected ? 'border-flow-400/70 ring-1 ring-flow-400/40' : 'border-ink/10 hover:border-ink/20'
      } ${block.off ? 'opacity-45' : ''} ${state?.status === 'running' ? 'flow-node-live' : ''}`}
      style={{ width: blockWidth(block.kind) }}
    >
      <header className="flow-drag flex cursor-grab items-center gap-2 px-3 pb-2 pt-2.5 active:cursor-grabbing">
        <GlassTile icon={Icon} accent={accent} size={22} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold tracking-tight text-ink-100">{titleOf(block)}</span>
        <RunsBadge block={block} bp={bp} />
      </header>

      {block.kind === 'note' ? (
        <NoteBody block={block} />
      ) : (
        <>
          <Ports block={block} />
          {isBatch(block) && <Items block={block} bp={bp} />}
          <Preview block={block} bp={bp} />
        </>
      )}

      {block.kind !== 'note' && (
        <StatusLine block={block} bp={bp} run={run} state={state} onReview={() => openReview(block.id)} />
      )}
    </div>
  )
}

function RunsBadge({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const count = bp?.instances.length ?? 0
  if (!KINDS[block.kind].runnable || sourceOf(block) !== 'generate' || count <= 1) return null
  return (
    <span className="shrink-0 rounded-full bg-flow-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-flow-300" title={`Runs ${count} times, once per combination of what's wired in`}>
      ×{count}
    </span>
  )
}

// ── Ports ──────────────────────────────────────────────────────────────────

function Ports({ block }: { block: FlowBlock }) {
  const ins = insOf(block)
  const outs = isBatch(block) ? outsOf(block).slice(0, 1) : outsOf(block)
  const rows = Math.max(ins.length, outs.length)
  if (!rows) return null
  return (
    <div className="flex flex-col pb-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="relative flex h-[22px] items-center justify-between gap-2">
          {ins[i] ? <InputPort block={block} port={ins[i]} /> : <span />}
          {outs[i] ? <OutputPort block={block} port={outs[i]} /> : <span />}
        </div>
      ))}
    </div>
  )
}

function InputPort({ block, port }: { block: FlowBlock; port: PortSpec }) {
  const { doc } = useCanvas()
  const connection = useConnection()
  const wired = wiresInto(doc, block.id, port.key).length > 0
  const inline = !wired ? inlineValue(block, port) : null
  // While a wire is being dragged, the inputs that could take it light up and
  // the rest fade.
  let tone: 'idle' | 'fit' | 'fade' = 'idle'
  if (connection.inProgress && connection.fromHandle.type === 'source') {
    const from = blockById(doc, connection.fromNode.id)
    const type = from ? outputType(from, connection.fromHandle.id ?? '') : null
    tone = type && accepts(port.type, type) && !wouldCycle(doc, connection.fromNode.id, block.id) ? 'fit' : 'fade'
  }
  const color = TYPE_META[port.type].color
  const missing = port.required && !wired
  return (
    <div className={`relative flex min-w-0 items-center pl-3.5 transition-opacity ${tone === 'fade' ? 'opacity-30' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        id={port.key}
        className={`flow-port ${missing ? 'flow-port-missing' : ''} ${tone === 'fit' ? 'flow-port-fit' : ''}`}
        style={{ background: wired ? color : 'var(--color-surface-1)', borderColor: color }}
        title={`Takes ${acceptsLabel(port.type)}${port.required ? ' · required' : ''}${port.many ? ' · takes several at once' : ''}`}
      />
      <span className="truncate text-[11px] text-ink-400">
        {port.label}
        {missing && <span className="ml-1 text-red-400/90">· Required</span>}
        {inline && <span className="ml-1 text-ink-500">· {inline}</span>}
      </span>
    </div>
  )
}

// What an unwired input falls back to, set in the block's panel.
function inlineValue(block: FlowBlock, port: PortSpec): string | null {
  const s = block.settings
  if (block.kind === 'scripts' && port.key === 'brief' && String(s.brief ?? '').trim()) return 'Written'
  if (block.kind === 'scripts' && port.key === 'source' && String(s.source ?? '').trim()) return 'Pasted'
  if (block.kind === 'playground' && port.key === 'prompt' && String(s.prompt ?? '').trim()) return 'Written'
  return null
}

function OutputPort({ block, port }: { block: FlowBlock; port: PortSpec }) {
  const { doc, plan } = useCanvas()
  const used = wiresOutOf(doc, block.id).some((w) => w.fromPort === port.key)
  const count = plan?.blocks[block.id]?.values[port.key]?.length ?? 0
  const color = TYPE_META[port.type].color
  return (
    <div className="relative flex min-w-0 items-center justify-end pr-3.5">
      <span className="truncate text-[11px] text-ink-300">
        {port.label}
        {count > 1 && <span className="ml-1 tabular-nums text-ink-500">×{count}</span>}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id={port.key}
        className="flow-port"
        style={{ background: used ? color : 'var(--color-surface-1)', borderColor: color }}
        title={`Goes to ${goesTo(port.type)}`}
      />
    </div>
  )
}

function goesTo(type: FlowValue['type']): string {
  const names = Object.values(KINDS)
    .filter((k) => k.ins.some((p) => accepts(p.type, type)))
    .map((k) => k.title)
  return names.length ? names.join(', ') : 'nothing yet'
}

// ── Batch items ────────────────────────────────────────────────────────────

function Items({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const toggleItem = useFlowStore((s) => s.toggleItem)
  const deleteItem = useFlowStore((s) => s.deleteItem)
  const { doc } = useCanvas()
  const items = liveItems(block)
  const noun = itemNoun(block)
  const made = latestItems(bp)
  const outType = outsOf(block)[0]?.type ?? 'text'
  const color = TYPE_META[outType].color
  const editable = sourceOf(block) !== 'history' || block.kind === 'scripts'
  const shown = items.slice(0, 12)
  return (
    <div className="flex flex-col gap-px border-t border-ink/5 py-1">
      {shown.map((it, i) => {
        const value = made[it.id]
        const used = wiresOutOf(doc, block.id).some((w) => w.fromPort === itemPort(it.id))
        return (
          <div key={it.id} className={`group/item relative flex h-[26px] items-center gap-1.5 pl-2.5 pr-3.5 ${it.off ? 'opacity-40' : ''}`}>
            <button
              type="button"
              onClick={() => toggleItem(block.id, it.id)}
              className="nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink/5 hover:text-ink-200"
              title={it.off ? `Turn ${noun} ${i + 1} On` : `Turn ${noun} ${i + 1} Off · nothing downstream runs for it`}
            >
              {it.off ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
            <ItemFace value={value} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-300">
              <span className="text-ink-500">{noun} {i + 1}</span>
              {value?.label && value.type !== 'character' ? <span className="text-ink-300"> · {value.label}</span> : null}
            </span>
            {editable && (
              <button
                type="button"
                onClick={() => deleteItem(block.id, it.id)}
                className="nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-600 opacity-0 hover:bg-ink/5 hover:text-ink-200 group-hover/item:opacity-100 touch:opacity-100"
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

// The newest made value per slot, across the block's runs.
function latestItems(bp: BlockPlan | undefined): Record<string, FlowValue> {
  const out: Record<string, FlowValue> = {}
  for (const inst of bp?.instances ?? []) {
    for (const [slot, v] of Object.entries(inst.cached?.items ?? {})) if (!out[slot]) out[slot] = v
  }
  return out
}

function ItemFace({ value }: { value: FlowValue | undefined }) {
  const ref = value?.type === 'character' ? value.payload.imageRef : value?.type === 'image' ? value.payload.ref : undefined
  const thumb = useAssetThumb(ref)
  if (value?.type === 'ad' && value.payload.thumbUrl && !value.payload.thumbUrl.startsWith('asset')) {
    return <img src={value.payload.thumbUrl} alt="" className="h-5 w-4 shrink-0 rounded object-cover" />
  }
  if (!ref) return null
  return thumb.url ? <img src={thumb.url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" /> : <span className="h-5 w-5 shrink-0 rounded-full bg-ink/10" />
}

// ── What it made ───────────────────────────────────────────────────────────

function Preview({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const values = Object.values(bp?.values ?? {}).flat().filter((v) => !v.pending)
  switch (block.kind) {
    case 'bank':
    case 'image':
      return <HeldFace block={block} value={values[0]} />
    case 'text':
      return <TextFace text={String(block.settings.text ?? '')} placeholder="Type the text in the panel" />
    case 'list':
      return null
    case 'voice':
      return <CountFace values={values} noun="voiceover" />
    case 'broll':
    case 'playground':
      return <MediaStrip values={values} />
    case 'analyzer':
      return values.length ? <TextFace text={values[0].label} /> : null
    case 'edit':
      return <PackFace bp={bp} />
    case 'characters':
      return sourceOf(block) !== 'generate' ? <HeldFace block={block} value={values[0]} /> : null
    case 'scripts':
      return sourceOf(block) === 'bank' ? <TextFace text={values[0]?.label ?? ''} placeholder="Pick a script in the panel" /> : null
    default:
      return null
  }
}

function HeldFace({ block, value }: { block: FlowBlock; value: FlowValue | undefined }) {
  const productImage = useBankStore((st) =>
    value?.type === 'product' ? st.products.find((p) => p.id === value.payload.productId)?.productImage : undefined)
  const ref = value?.type === 'character' ? value.payload.imageRef
    : value?.type === 'image' ? value.payload.ref
    : value?.type === 'product' ? productImage
    : value?.type === 'style' ? value.payload.thumbRefs?.[0]
    : value?.type === 'ad' ? value.payload.thumbUrl
    : undefined
  const thumb = useAssetThumb(ref)
  if (!value) return <p className="px-3 pb-2 text-[11px] text-ink-500">{block.kind === 'image' ? 'Drop an image here' : 'Pick one in the panel'}</p>
  return (
    <div className="flex items-center gap-2.5 px-3 pb-2.5">
      {ref ? (
        thumb.url ? <img src={thumb.url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" /> : <span className="h-11 w-11 shrink-0 rounded-xl bg-ink/10" />
      ) : null}
      <span className="line-clamp-2 min-w-0 text-[11.5px] leading-snug text-ink-200">{value.label}</span>
    </div>
  )
}

function TextFace({ text, placeholder }: { text: string; placeholder?: string }) {
  if (!text.trim()) return placeholder ? <p className="px-3 pb-2 text-[11px] text-ink-500">{placeholder}</p> : null
  return <p className="line-clamp-3 px-3 pb-2.5 text-[11.5px] leading-snug text-ink-300">{text}</p>
}

function CountFace({ values, noun }: { values: FlowValue[]; noun: string }) {
  if (!values.length) return null
  return (
    <div className="flex flex-col gap-0.5 px-3 pb-2">
      {values.slice(0, 3).map((v) => (
        <span key={v.key} className="flex items-center gap-1.5 truncate text-[11px] text-ink-300">
          <Play className="h-2.5 w-2.5 shrink-0 text-voice-300" />
          <span className="truncate">{v.label}</span>
        </span>
      ))}
      {values.length > 3 && <span className="text-[10px] text-ink-500">+{values.length - 3} more {noun}s</span>}
    </div>
  )
}

function MediaStrip({ values }: { values: FlowValue[] }) {
  const refs: string[] = []
  for (const v of values) {
    if (v.type === 'image') refs.push(v.payload.ref)
    else if (v.type === 'video' && v.payload.cover) refs.push(v.payload.cover)
  }
  if (!refs.length) return null
  return (
    <div className="flex gap-1 px-3 pb-2.5">
      {refs.slice(0, 5).map((ref, i) => <Thumb key={`${ref}:${i}`} refId={ref} />)}
      {refs.length > 5 && <span className="flex h-12 w-8 items-center justify-center rounded-lg bg-ink/5 text-[10px] text-ink-400">+{refs.length - 5}</span>}
    </div>
  )
}

function Thumb({ refId }: { refId: string }) {
  const thumb = useAssetThumb(refId)
  return thumb.url ? <img src={thumb.url} alt="" className="h-12 w-8 rounded-lg object-cover" /> : <span className="h-12 w-8 rounded-lg bg-ink/10" />
}

function PackFace({ bp }: { bp: BlockPlan | undefined }) {
  const { doc } = useCanvas()
  const packs = (bp?.instances ?? []).map((i) => i.cached?.pack).filter((p): p is NonNullable<typeof p> => !!p)
  if (!packs.length) return <p className="px-3 pb-2 text-[11px] text-ink-500">One folder per ad, laid out for the /video-editor skill</p>
  return (
    <div className="px-3 pb-2.5">
      <button
        type="button"
        onClick={() => void downloadEditPacks(doc.name, packs)}
        className="nodrag flex w-full items-center justify-center gap-1.5 rounded-full border border-[#F77646]/40 bg-[#F77646]/10 px-3 py-1.5 text-[11px] font-semibold text-[#F77646] transition-colors hover:bg-[#F77646]/20"
      >
        <Download className="h-3 w-3" />
        Download {packs.length} {packs.length === 1 ? 'Pack' : 'Packs'}
      </button>
    </div>
  )
}

function NoteBody({ block }: { block: FlowBlock }) {
  const text = String(block.settings.text ?? '')
  return <p className="whitespace-pre-wrap px-3 pb-3 text-[12px] leading-relaxed text-[#E8C872]/90">{text || 'A note for whoever opens this flow.'}</p>
}

// ── Status ─────────────────────────────────────────────────────────────────

function StatusLine({
  block,
  bp,
  run,
  state,
  onReview,
}: {
  block: FlowBlock
  bp: BlockPlan | undefined
  run: LiveRun | undefined
  state: LiveRun['blocks'][string] | undefined
  onReview: () => void
}) {
  const live = state ? blockStatusLine(state) : null
  const notes = run && state?.status === 'running'
    ? Object.values(run.instances[block.id] ?? {}).map((i) => i.note).filter(Boolean)
    : []
  if (state?.status === 'review') {
    return (
      <div className="border-t border-ink/5 px-3 py-2">
        <button
          type="button"
          onClick={onReview}
          className="nodrag flex w-full items-center justify-center gap-1.5 rounded-full bg-flow-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-all hover:brightness-110"
        >
          Review
        </button>
      </div>
    )
  }
  if (live) {
    const failed = state?.status === 'error'
    return (
      <div className={`flex items-center gap-1.5 border-t border-ink/5 px-3 py-2 text-[10.5px] ${failed ? 'text-red-400' : 'text-flow-300'}`}>
        {state?.status === 'running' && <Spinner className="h-3 w-3" />}
        {failed && <AlertCircle className="h-3 w-3 shrink-0" />}
        <span className="truncate">{live}{notes[0] ? ` · ${notes[0]}` : ''}</span>
      </div>
    )
  }
  if (bp?.blocked) {
    const quiet = bp.blocked === 'Turned off'
    return (
      <div className={`flex items-center gap-1.5 border-t border-ink/5 px-3 py-2 text-[10.5px] ${quiet ? 'text-ink-500' : 'text-amber-400/90'}`}>
        {!quiet && <AlertCircle className="h-3 w-3 shrink-0" />}
        <span className="truncate">{bp.blocked}</span>
      </div>
    )
  }
  if (!KINDS[block.kind].runnable || sourceOf(block) !== 'generate') return null
  if (!bp || !bp.instances.length) return null
  const toRun = bp.runs
  return (
    <div className="flex items-center justify-between gap-2 border-t border-ink/5 px-3 py-2 text-[10.5px]">
      <span className={toRun ? 'text-ink-400' : 'text-emerald-400/90'}>
        {toRun ? (toRun === bp.instances.length ? 'Not run yet' : `${toRun} of ${bp.instances.length} to run`) : 'Done'}
      </span>
      {toRun > 0 && <span className="tabular-nums text-ink-500">{bp.unpriced ? '—' : creditsShort(bp.credits)}</span>}
    </div>
  )
}

// ── Special faces ──────────────────────────────────────────────────────────

function SuggestedNode({ block, onAccept }: { block: FlowBlock; onAccept: () => void }) {
  const Icon = blockIcon(block)
  return (
    <button
      type="button"
      onClick={onAccept}
      className="flow-ghost flex items-center gap-2 rounded-2xl border border-dashed border-ink/20 bg-surface-1/40 px-3.5 py-3 text-left transition-colors hover:border-flow-400/60"
      style={{ width: blockWidth(block.kind) }}
      title="Add it, already wired"
    >
      <Plus className="h-3.5 w-3.5 text-ink-400" />
      <GlassTile icon={Icon} accent={blockAccent(block)} size={20} />
      <span className="text-[12px] font-medium text-ink-300">{titleOf(block)}</span>
      <span className="ml-auto text-[10px] text-ink-500">Suggested</span>
    </button>
  )
}

function UnknownNode() {
  return (
    <div className="w-56 rounded-2xl border border-amber-500/30 bg-surface-1 px-3.5 py-3 text-[11.5px] text-amber-300">
      Update UGC OS to use this block.
    </div>
  )
}
