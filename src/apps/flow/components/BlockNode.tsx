// One block on the canvas. A header with its app's tile, its name, how many
// times it runs and where it stands — what it will cost, what it's doing, or
// Review; then its inputs down the left edge and outputs down the right, each
// by name with a dot in its type's colour; then what it makes, as its app
// would show it; then a line only when something needs saying.
//
// An app block opens in its app's own window (the ↗ in its header, a
// double-click, or Enter). The helpers are edited right here.

import { useState } from 'react'
import { Handle, Position, useConnection, type NodeProps, type Node } from '@xyflow/react'
import { AlertCircle, ArrowUpRight, Check, Hand, Plus } from 'lucide-react'
import type { FlowBlock, FlowValue, PortSpec } from '../types'
import { accepts, isBatch, insOf, outsOf, sourceOf, titleOf, TYPE_META, KINDS } from '../engine/catalog'
import { acceptsLabel, blockById, outputType, wiresInto, wiresOutOf, wouldCycle } from '../engine/graph'
import type { BlockPlan } from '../engine/plan'
import { type LiveRun } from '../run/runtime'
import { useCanvas } from './canvasContext'
import { useFlowStore } from '../store/flowStore'
import { blockAccent, blockIcon, blockWidth, opensWindow } from './blockMeta'
import { GlassTile } from '../../../components/AppGlassTile'
import Spinner from '../../../components/Spinner'
import { creditsShort } from '../hooks/useFlowPlan'
import { AnalyzerBody, BrollBody, EditBody, ItemRows, PlaygroundBody, ReusedBody, ScenesBody, VoiceBody } from './node/bodies'
import { useHeldHere } from './node/heldHere'
import { BankBody, ImageBody, ListBody, NoteBody, TextBody } from './node/helpers'

export type BlockNodeType = Node<{ blockId: string }, 'block'>

type LiveState = LiveRun['blocks'][string]

export default function BlockNode({ data, selected }: NodeProps<BlockNodeType>) {
  const { doc, plan, run, suggestion, acceptSuggestion } = useCanvas()
  const block = suggestion?.id === data.blockId ? suggestion : doc.blocks.find((b) => b.id === data.blockId)
  if (!block) return null
  if (block.suggested) return <SuggestedNode block={block} onAccept={acceptSuggestion} />
  if (!KINDS[block.kind]) return <UnknownNode />
  if (block.kind === 'note') return <NoteNode block={block} selected={selected} />
  const bp = plan?.blocks[block.id]
  const live = run?.status === 'running' || run?.blocks[block.id]?.status === 'review' ? run.blocks[block.id] : undefined
  const reviewing = live?.status === 'review'

  return (
    <div
      className={`flow-node group relative rounded-[18px] border bg-surface-1 shadow-[0_10px_28px_-14px_rgba(0,0,0,0.55)] transition-colors ${
        reviewing ? 'border-amber-500/55'
          : selected ? 'border-flow-400/70 ring-1 ring-flow-400/40'
          : 'border-ink/10 hover:border-ink/20'
      } ${block.off ? 'flow-node-off' : ''} ${live?.status === 'running' ? 'flow-node-live' : ''}`}
      style={{ width: blockWidth(block.kind) }}
    >
      <NodeHeader block={block} bp={bp} live={live} selected={selected} />
      <Ports block={block} bp={bp} />
      <Body block={block} bp={bp} />
      <Tags block={block} />
      <Footer block={block} bp={bp} live={live} />
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────

function NodeHeader({ block, bp, live, selected }: { block: FlowBlock; bp: BlockPlan | undefined; live: LiveState | undefined; selected: boolean }) {
  const { openBlock, renaming, setRenaming } = useCanvas()
  const runs = bp?.instances.length ?? 0
  const makes = !!KINDS[block.kind].runnable && sourceOf(block) === 'generate'
  return (
    <header className="flow-drag flex h-[44px] cursor-grab items-center gap-2 pl-3 pr-2 active:cursor-grabbing">
      <GlassTile icon={blockIcon(block)} accent={blockAccent(block)} size={24} />
      {renaming === block.id ? (
        <RenameField block={block} onDone={() => setRenaming(null)} />
      ) : (
        <span className="min-w-[3.5rem] truncate text-[13px] font-semibold tracking-tight text-ink-100" title={titleOf(block)}>{titleOf(block)}</span>
      )}
      {makes && runs > 1 && (
        <span className="shrink-0 rounded-full bg-ink/[0.08] px-1.5 py-px text-[10px] font-semibold tabular-nums text-ink-200" title={`Runs ${runs} times, once per combination of what's wired in`}>
          ×{runs}
        </span>
      )}
      {makes && block.review && (
        <span className="shrink-0 text-amber-400" title="Pauses for your review before anything after it runs">
          <Hand className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
        <Status block={block} bp={bp} live={live} />
        {opensWindow(block) && (
          <button
            type="button"
            onClick={() => openBlock(block.id)}
            title={`Open ${KINDS[block.kind].title}`}
            aria-label={`Open ${KINDS[block.kind].title}`}
            className={`nodrag flex h-6 w-6 items-center justify-center rounded-lg text-ink-400 transition-all hover:bg-ink/[0.08] hover:text-ink-100 ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 touch:opacity-100'}`}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </header>
  )
}

// The block's name, typed on the canvas: Enter or a click away keeps it,
// Escape leaves it as it was, and an empty name goes back to the kind's.
function RenameField({ block, onDone }: { block: FlowBlock; onDone: () => void }) {
  const patchBlock = useFlowStore((s) => s.patchBlock)
  const [text, setText] = useState(titleOf(block))
  const commit = () => {
    const next = text.trim()
    const fallback = titleOf({ ...block, label: undefined })
    if (next !== titleOf(block)) patchBlock(block.id, { label: next && next !== fallback ? next : undefined })
    onDone()
  }
  return (
    <input
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') onDone()
      }}
      aria-label="Block Name"
      className="nodrag min-w-0 flex-1 rounded-md bg-ink/[0.07] px-1.5 py-0.5 text-[13px] font-semibold tracking-tight text-ink-100 outline-none ring-1 ring-flow-400/50"
    />
  )
}

function Status({ block, bp, live }: { block: FlowBlock; bp: BlockPlan | undefined; live: LiveState | undefined }) {
  const { doc, openReview } = useCanvas()
  if (block.off) return <span className="rounded-full bg-ink/10 px-1.5 py-px text-[10px] font-semibold text-ink-300">Off</span>
  if (live?.status === 'review') {
    return (
      <button
        type="button"
        onClick={() => openReview(block.id)}
        className="nodrag flex h-5 items-center gap-1 rounded-full bg-amber-400 px-2 text-[10.5px] font-bold text-[#1c1204] transition-all hover:brightness-110"
      >
        Review
      </button>
    )
  }
  if (live?.status === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-[10.5px] font-semibold tabular-nums text-flow-300">
        <Spinner className="h-3 w-3" />
        {live.total > 1 ? `${live.finished} of ${live.total}` : 'Running'}
      </span>
    )
  }
  if (live?.status === 'queued') return <span className="text-[10.5px] text-ink-400">Queued</span>
  if (live?.status === 'error') {
    return <span className="flex items-center gap-1 text-[10.5px] font-medium text-red-400" title={live.reason}><AlertCircle className="h-3 w-3" />Failed</span>
  }
  if (!KINDS[block.kind].runnable || sourceOf(block) !== 'generate' || !bp || !bp.instances.length) return null
  if (bp.runs === 0) return <Check className="h-3.5 w-3.5 text-emerald-400" aria-label="Done" />
  const madeBefore = Object.keys(doc.outputs[block.id]?.instances ?? {}).length > 0
  return (
    <span className="flex items-center gap-1.5">
      {/* Changed: a dot and an amber price, not a word — a word pushed the
          block's own name down to "Voi…" in the width a block has. */}
      {madeBefore && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />}
      <span
        className={`text-[10.5px] tabular-nums ${madeBefore ? 'text-amber-300 light:text-amber-700' : 'text-ink-400'}`}
        title={madeBefore ? `Changed: something it reads is different. ${bp.runs} of its ${bp.instances.length} runs make again.` : undefined}
      >
        {bp.unpriced ? '—' : creditsShort(bp.credits)}
      </span>
    </span>
  )
}

// ── Ports ──────────────────────────────────────────────────────────────────

function Ports({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const ins = insOf(block)
  const outs = isBatch(block) ? outsOf(block).slice(0, 1) : outsOf(block)
  const rows = Math.max(ins.length, outs.length)
  if (!rows) return null
  return (
    <div className="flex flex-col pb-1.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="relative flex h-[22px] items-center justify-between gap-2">
          {ins[i] ? <InputPort block={block} port={ins[i]} /> : <span />}
          {outs[i] ? <OutputPort block={block} port={outs[i]} bp={bp} /> : <span />}
        </div>
      ))}
    </div>
  )
}

function InputPort({ block, port }: { block: FlowBlock; port: PortSpec }) {
  const { doc, askAtPort } = useCanvas()
  const connection = useConnection()
  const wired = wiresInto(doc, block.id, port.key).length > 0
  const held = useHeldHere(block, port.key)
  // While a wire is being dragged, the inputs that could take it light up and
  // the rest fade.
  let tone: 'idle' | 'fit' | 'fade' = 'idle'
  if (connection.inProgress && connection.fromHandle.type === 'source') {
    const from = blockById(doc, connection.fromNode.id)
    const type = from ? outputType(from, connection.fromHandle.id ?? '') : null
    tone = type && accepts(port.type, type) && !wouldCycle(doc, connection.fromNode.id, block.id) ? 'fit' : 'fade'
  }
  const color = TYPE_META[port.type].color
  const missing = port.required && !wired && !held
  return (
    <div className={`relative flex min-w-0 items-center pl-3.5 transition-opacity ${tone === 'fade' ? 'opacity-30' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        id={port.key}
        className={`flow-port ${missing ? 'flow-port-missing' : ''} ${tone === 'fit' ? 'flow-port-fit' : ''}`}
        style={{ background: wired ? color : 'var(--color-surface-1)', borderColor: color }}
        onClick={(e) => askAtPort(block.id, port.key, 'in', e.clientX, e.clientY)}
        title={`${port.label} · takes ${acceptsLabel(port.type)}${port.required ? ' · required' : ''}${port.many ? ' · takes several at once' : ''}. Click it to add what feeds it.`}
      />
      <span className="truncate text-[11px] text-ink-400">
        {port.label}
        {missing && <span className="ml-1 text-[10px] font-semibold text-red-400/90">Required</span>}
        {!wired && held && <span className="ml-1 text-ink-500">· {held}</span>}
      </span>
    </div>
  )
}

function OutputPort({ block, port, bp }: { block: FlowBlock; port: PortSpec; bp: BlockPlan | undefined }) {
  const { doc, askAtPort } = useCanvas()
  const used = wiresOutOf(doc, block.id).some((w) => w.fromPort === port.key)
  const count = bp?.values[port.key]?.length ?? 0
  const color = TYPE_META[port.type].color
  return (
    <div className="relative flex min-w-0 items-center justify-end pr-3.5">
      <span className="truncate text-[11px] text-ink-300">
        {count > 1 && <span className="mr-1 rounded-full bg-ink/[0.08] px-1 text-[9.5px] font-semibold tabular-nums text-ink-200">{count}</span>}
        {port.label}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id={port.key}
        className="flow-port"
        style={{ background: used ? color : 'var(--color-surface-1)', borderColor: color }}
        onClick={(e) => askAtPort(block.id, port.key, 'out', e.clientX, e.clientY)}
        title={`${port.label} · goes to ${goesTo(port.type)}. Click it to add what comes next.`}
      />
      {/* An output nothing reads yet ends in a + : the next step is one click
          away, without finding the dot. */}
      {!used && (
        <button
          type="button"
          onClick={(e) => askAtPort(block.id, port.key, 'out', e.clientX, e.clientY)}
          title={`Add what comes after ${port.label}`}
          aria-label={`Add what comes after ${port.label}`}
          className="flow-next nodrag nopan absolute -right-[34px] top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-md border border-ink/15 bg-surface-1 text-ink-400 transition-colors hover:border-flow-400/60 hover:text-flow-300"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

function goesTo(type: FlowValue['type']): string {
  const names = Object.values(KINDS)
    .filter((k) => k.ins.some((p) => accepts(p.type, type)))
    .map((k) => k.title)
  return names.length ? names.join(', ') : 'nothing yet'
}

// ── Body ───────────────────────────────────────────────────────────────────

function Body({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const source = sourceOf(block)
  switch (block.kind) {
    case 'bank': return <BankBody block={block} />
    case 'image': return <ImageBody block={block} />
    case 'text': return <TextBody block={block} />
    case 'list': return <ListBody block={block} />
  }
  if (KINDS[block.kind].runnable && source !== 'generate') {
    // A Scripts run picked from history hands on its hooks one by one.
    return isBatch(block) ? <ItemRows block={block} bp={bp} /> : <ReusedBody block={block} bp={bp} />
  }
  if (isBatch(block)) return <ItemRows block={block} bp={bp} />
  switch (block.kind) {
    case 'voice': return <VoiceBody block={block} bp={bp} />
    case 'broll': return <BrollBody block={block} bp={bp} />
    case 'playground': return <PlaygroundBody block={block} bp={bp} />
    case 'scenes': return <ScenesBody block={block} bp={bp} />
    case 'analyzer': return <AnalyzerBody bp={bp} />
    case 'edit': return <EditBody bp={bp} />
    default: return null
  }
}

// ── Tags and the footer line ───────────────────────────────────────────────

function Tags({ block }: { block: FlowBlock }) {
  const source = sourceOf(block)
  const reused = !!KINDS[block.kind].runnable && source !== 'generate'
  if (!block.field && !reused) return null
  return (
    <div className="flex flex-wrap gap-1 px-3 pb-2.5">
      {block.field && <span className="inline-flex h-[18px] items-center rounded-full bg-flow-500/15 px-2 text-[10px] font-medium text-flow-300">Run Field</span>}
      {reused && <span className="inline-flex h-[18px] items-center rounded-full bg-ink/[0.07] px-2 text-[10px] font-medium text-ink-300">{source === 'bank' ? 'From Bank' : 'From History'}</span>}
    </div>
  )
}

function Footer({ block, bp, live }: { block: FlowBlock; bp: BlockPlan | undefined; live: LiveState | undefined }) {
  const { run } = useCanvas()
  if (live?.status === 'error' && live.reason) {
    return (
      <p className="flex items-start gap-1.5 border-t border-ink/5 px-3 py-2 text-[10.5px] leading-snug text-red-400">
        <AlertCircle className="mt-px h-3 w-3 shrink-0" />
        <span className="line-clamp-3">{live.reason}</span>
      </p>
    )
  }
  if (live?.status === 'running') {
    const note = Object.values(run?.instances[block.id] ?? {}).map((i) => i.note).find(Boolean)
    if (!note) return null
    return <p className="truncate border-t border-ink/5 px-3 py-2 text-[10.5px] text-flow-300">{note}</p>
  }
  if (bp?.blocked && bp.blocked !== 'Turned off') {
    return (
      <p className="flex items-start gap-1.5 border-t border-ink/5 px-3 py-2 text-[10.5px] leading-snug text-amber-400/90 light:text-amber-700">
        <AlertCircle className="mt-px h-3 w-3 shrink-0" />
        <span>{bp.blocked}</span>
      </p>
    )
  }
  return null
}

// ── Special faces ──────────────────────────────────────────────────────────

function NoteNode({ block, selected }: { block: FlowBlock; selected: boolean }) {
  return (
    <div
      className={`flow-node group relative rounded-[18px] border bg-[#1f1a0e] shadow-[0_10px_28px_-14px_rgba(0,0,0,0.55)] light:bg-[#fbf3dc] ${
        selected ? 'border-[#E8C872]/70 ring-1 ring-[#E8C872]/40' : 'border-[#E8C872]/30'
      } ${block.off ? 'flow-node-off' : ''}`}
      style={{ width: blockWidth('note') }}
    >
      <header className="flow-drag flex h-[36px] cursor-grab items-center gap-2 px-3.5 text-[11px] font-semibold uppercase tracking-wide text-[#E8C872]/80 active:cursor-grabbing light:text-[#8a6a10]">
        {titleOf(block)}
      </header>
      <NoteBody block={block} />
    </div>
  )
}

function SuggestedNode({ block, onAccept }: { block: FlowBlock; onAccept: () => void }) {
  const Icon = blockIcon(block)
  return (
    <button
      type="button"
      onClick={onAccept}
      className="flow-ghost flex flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-ink/20 bg-ink/[0.015] px-4 py-5 text-center transition-colors hover:border-[#F77646]/50 hover:bg-[#F77646]/[0.05]"
      style={{ width: blockWidth(block.kind) }}
      title="Add it, already wired"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/15 text-ink-300">
        <Plus className="h-3.5 w-3.5" />
      </span>
      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-200">
        <GlassTile icon={Icon} accent={blockAccent(block)} size={18} />
        Add {titleOf(block)}
      </span>
      <span className="text-[10.5px] text-ink-500">Suggested next step, wired in for you</span>
    </button>
  )
}

function UnknownNode() {
  return (
    <div className="w-56 rounded-[18px] border border-amber-500/30 bg-surface-1 px-3.5 py-3 text-[11.5px] text-amber-300">
      Update UGC OS to use this block.
    </div>
  )
}
