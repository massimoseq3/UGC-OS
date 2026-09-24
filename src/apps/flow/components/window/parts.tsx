// The parts every block window shares, around the app's own panels: the run
// band at the foot of the input column (for the apps whose Generate is bound
// to their own draft), the strip of what's wired in, a card that stands in
// for an app field while a wire feeds it, and each run's status.

import { useState, type ElementType, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertCircle, Check, CircleDashed, Coins, Hand, Link2, Plus, X } from 'lucide-react'
import type { FlowBlock, FlowDoc, PortSpec } from '../../types'
import type { FlowPlan } from '../../engine/plan'
import { blockWidth, insOf, TYPE_META } from '../../engine/catalog'
import { acceptsLabel, blockById, outputLabel, wiresInto } from '../../engine/graph'
import { useFlowStore } from '../../store/flowStore'
import { blockStatusLine, type LiveRun } from '../../run/runtime'
import { creditsPill } from '../../hooks/useFlowPlan'
import { useAppStore } from '../../../../stores/appStore'
import Spinner from '../../../../components/Spinner'
import { MenuItem, MenuSurface } from '../../../../components/Menu'
import { StopButton } from '../panels/common'
import { optionsForInput } from '../whatNext'
import { kindFace } from '../blockMeta'
import { useHeldHere } from '../node/heldHere'
import { freeSpot } from '../../engine/layout'
import type { RunRequest } from '../Editor'
import { ACCENT_BG, type RunStatus } from './runs'


const STATUS_FACE: Record<RunStatus, { label: string; className: string; icon?: LucideIcon }> = {
  made: { label: 'Made', className: 'bg-emerald-500/12 text-emerald-300 light:text-emerald-700', icon: Check },
  changed: { label: 'Changed', className: 'bg-amber-500/15 text-amber-300 light:text-amber-700' },
  planned: { label: 'Not Made Yet', className: 'bg-ink/[0.06] text-ink-400', icon: CircleDashed },
  queued: { label: 'Queued', className: 'bg-ink/[0.06] text-ink-300' },
  running: { label: 'Making', className: 'bg-flow-500/15 text-flow-300' },
  failed: { label: 'Failed', className: 'bg-red-500/15 text-red-300 light:text-red-700', icon: AlertCircle },
  review: { label: 'Waiting for Review', className: 'bg-amber-500/15 text-amber-300 light:text-amber-700', icon: Hand },
}

export function RunChip({ status, note }: { status: RunStatus; note?: string }) {
  const face = STATUS_FACE[status]
  const Icon = face.icon
  return (
    <span className={`inline-flex h-[20px] shrink-0 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold ${face.className}`}>
      {status === 'running' ? <Spinner className="h-2.5 w-2.5" /> : Icon ? <Icon className="h-3 w-3" /> : null}
      {status === 'running' && note ? note : face.label}
    </span>
  )
}

// ── The run band ───────────────────────────────────────────────────────────

// The foot of an input column, in the app's own Generate shape: an optional
// row above (the model), then the button — named for what it makes, priced
// like every Generate — and Stop beside it while the flow runs. Like the
// app's own Generate it makes every run of the block afresh (Run Block), so
// the label counts them all and the price is `creditsAll`; Run Flow is what
// makes only what's missing.
export function RunBand({
  block,
  plan,
  run,
  onRun,
  icon: Icon,
  label,
  children,
  disabled,
}: {
  block: FlowBlock
  plan: FlowPlan | null
  run: LiveRun | undefined
  onRun: (req: RunRequest) => void
  icon: ElementType
  label: string
  children?: ReactNode
  disabled?: boolean
}) {
  const bp = plan?.blocks[block.id]
  const active = run?.status === 'running'
  const credits = bp?.creditsAll ?? 0
  return (
    <div className="shrink-0 px-5 pb-3 pt-2">
      {children && <div className="mb-2 flex flex-col gap-2">{children}</div>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onRun({ only: block.id })}
          disabled={disabled}
          className={`glass-fill glass-fill-soft flex min-w-0 flex-1 items-center justify-center gap-2.5 rounded-full border border-white/15 px-6 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(255,255,255,0.08)] btn-soft-shadow transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 ${ACCENT_BG[block.kind] ?? 'bg-flow-500'}`}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          <span className="truncate">{label}</span>
          {credits > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold tracking-tight">
              <Coins className="h-3 w-3" strokeWidth={2} />
              {creditsPill(credits, bp?.unpriced)}
            </span>
          )}
        </button>
        {active && run && <StopButton flowId={run.flowId} />}
      </div>
    </div>
  )
}

// ── The output pane's header band ──────────────────────────────────────────

// What's wired into the block, one chip per input — where it comes from, a ×
// to cut it, or a + that adds a block to feed it — and, on the right, where
// the block's runs stand now.
export function InputsBand({ doc, block, plan, run, onReview, extra }: {
  doc: FlowDoc
  block: FlowBlock
  plan: FlowPlan | null
  run: LiveRun | undefined
  onReview: (blockId: string) => void
  extra?: ReactNode
}) {
  const ins = insOf(block)
  return (
    <div className="flex h-[57px] shrink-0 items-center gap-3 border-b border-ink/5 px-5">
      {ins.length > 0 && (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">Takes</span>
          {ins.map((p) => <InputChip key={p.key} doc={doc} block={block} port={p} />)}
        </div>
      )}
      {!ins.length && <div className="min-w-0 flex-1" />}
      {extra}
      <RunState block={block} plan={plan} run={run} onReview={onReview} />
    </div>
  )
}

function InputChip({ doc, block, port }: { doc: FlowDoc; block: FlowBlock; port: PortSpec }) {
  const removeWire = useFlowStore((s) => s.removeWire)
  // Where the menu opens: under the chip, in the viewport — the chip row
  // scrolls sideways, so a menu positioned inside it would be clipped.
  const [adding, setAdding] = useState<{ x: number; y: number } | null>(null)
  const wires = wiresInto(doc, block.id, port.key)
  const held = useHeldHere(block, port.key)
  const color = TYPE_META[port.type].color
  const missing = port.required && !wires.length && !held
  return (
    <span data-chip className={`relative flex h-7 shrink-0 items-center gap-1.5 rounded-full border pl-2.5 pr-1 text-[11.5px] ${missing ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-ink/10 bg-ink/[0.02]'}`}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: wires.length ? color : 'transparent', boxShadow: `inset 0 0 0 1.5px ${color}` }} />
      <span className="font-medium text-ink-200">{port.label}</span>
      {wires.map((w) => {
        const from = blockById(doc, w.from)
        return (
          <span key={w.id} className="flex items-center gap-0.5 text-ink-400">
            <Link2 className="h-3 w-3" />
            <span className="max-w-[160px] truncate">{from ? outputLabel(from, w.fromPort) : 'a block'}</span>
            <button type="button" onClick={() => removeWire(w.id)} title="Cut This Wire" className="flex h-5 w-5 items-center justify-center rounded-full text-ink-500 hover:bg-ink/10 hover:text-ink-100">
              <X className="h-3 w-3" />
            </button>
          </span>
        )
      })}
      {!wires.length && held && <span className="max-w-[140px] truncate pr-1.5 text-ink-400">· {held}</span>}
      {!wires.length && (
        <button
          type="button"
          onClick={(e) => {
            const rect = (e.currentTarget.closest('[data-chip]') ?? e.currentTarget).getBoundingClientRect()
            setAdding({ x: rect.left, y: rect.bottom + 6 })
          }}
          title={`Wire something in · takes ${acceptsLabel(port.type)}`}
          className={`flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11px] transition-colors ${missing ? 'text-red-300 hover:bg-red-500/10' : 'text-ink-500 hover:bg-ink/[0.08] hover:text-ink-100'}`}
        >
          <Plus className="h-3 w-3" />
          {!held && 'Wire In'}
        </button>
      )}
      {adding && <FeedMenu block={block} port={port} at={adding} onClose={() => setAdding(null)} />}
    </span>
  )
}

// The blocks that could feed an input: picking one lays it on the canvas to
// the block's left, already wired, and the window stays open.
function FeedMenu({ block, port, at, onClose }: { block: FlowBlock; port: PortSpec; at: { x: number; y: number }; onClose: () => void }) {
  const addBlock = useFlowStore((s) => s.addBlock)
  const connect = useFlowStore((s) => s.connect)
  const setSelection = useFlowStore((s) => s.setSelection)
  const addToast = useAppStore((s) => s.addToast)
  const options = optionsForInput(port.type)
  return (
    <>
      <div className="fixed inset-0 z-[62]" onClick={onClose} />
      <div className="fixed z-[63]" style={{ left: at.x, top: at.y }}>
        <MenuSurface className="w-64">
          <div className="border-b border-ink/5 px-3.5 py-2 text-[11px] font-medium text-ink-500">What Feeds {port.label}?</div>
          <div className="menu-scroll max-h-[300px] overflow-y-auto">
            {options.map((o) => {
              const face = kindFace(o.kind, o.bank)
              return (
                <MenuItem
                  key={`${o.kind}:${o.bank ?? ''}:${o.port}`}
                  icon={face.icon as LucideIcon}
                  trailing={<span className="text-[11px] text-ink-500">{o.detail}</span>}
                  onClick={() => {
                    const doc = useFlowStore.getState().docs[useFlowStore.getState().openId ?? '']
                    const at = { x: block.x - blockWidth(o.kind) - 96, y: block.y }
                    const id = addBlock(o.kind, doc ? freeSpot(doc, at, o.kind) : at, o.bank ? { settings: { bank: o.bank } } : undefined)
                    const check = connect({ from: id, fromPort: o.port, to: block.id, toPort: port.key })
                    // Adding selects the new block; the window's block stays the one selected.
                    setSelection([block.id])
                    addToast(check.ok ? `Added ${o.label}, wired into ${port.label}. It's on the canvas beside this block.` : check.reason, check.ok ? 'success' : 'error')
                    onClose()
                  }}
                >
                  {o.label}
                </MenuItem>
              )
            })}
          </div>
        </MenuSurface>
      </div>
    </>
  )
}

function RunState({ block, plan, run, onReview }: { block: FlowBlock; plan: FlowPlan | null; run: LiveRun | undefined; onReview: (blockId: string) => void }) {
  const bp = plan?.blocks[block.id]
  const live = run?.status === 'running' || run?.blocks[block.id]?.status === 'review' ? run.blocks[block.id] : undefined
  if (live?.status === 'review') {
    return (
      <button
        type="button"
        onClick={() => onReview(block.id)}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-amber-400 px-3.5 text-xs font-bold text-[#1c1204] transition-all hover:brightness-110"
      >
        <Hand className="h-3.5 w-3.5" />
        Open Review
      </button>
    )
  }
  if (live && (live.status === 'running' || live.status === 'queued')) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-flow-300">
        {live.status === 'running' && <Spinner className="h-3.5 w-3.5" />}
        {blockStatusLine(live)}
      </span>
    )
  }
  if (live?.status === 'error') {
    return <span className="flex max-w-[280px] shrink-0 items-center gap-1.5 truncate text-[12px] text-red-400" title={live.reason}><AlertCircle className="h-3.5 w-3.5 shrink-0" />{live.reason ?? 'Failed'}</span>
  }
  if (block.off) return <span className="shrink-0 text-[12px] text-ink-500">Turned off · skipped on the next run</span>
  if (bp?.blocked) return <span className="flex max-w-[320px] shrink-0 items-center gap-1.5 text-[12px] text-amber-400/90 light:text-amber-700"><AlertCircle className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{bp.blocked}</span></span>
  if (!bp?.instances.length) return null
  const made = bp.instances.filter((i) => i.cached && !i.run).length
  return (
    <span className="shrink-0 text-[12px] tabular-nums text-ink-400">
      {made ? `${made} made` : ''}{made && bp.runs ? ' · ' : ''}{bp.runs ? `${bp.runs} to make` : ''}
    </span>
  )
}

// ── Wired fields ───────────────────────────────────────────────────────────

// Stands in for an app field while a wire feeds it: where the value comes
// from, what's arriving on it now, and a way to cut the wire and use the
// field instead.
export function WiredCard({ doc, block, port, hint, children }: {
  doc: FlowDoc
  block: FlowBlock
  port: string
  hint?: string
  children?: ReactNode
}) {
  const removeWire = useFlowStore((s) => s.removeWire)
  const wires = wiresInto(doc, block.id, port)
  const spec = insOf(block).find((p) => p.key === port)
  const color = spec ? TYPE_META[spec.type].color : '#71717a'
  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-dashed border-ink/15 bg-ink/[0.02] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
          <Link2 className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-ink-100">{spec?.label ?? 'Input'} · Wired In</span>
          <span className="block truncate text-[11px] text-ink-500">
            From {wires.map((w) => { const b = blockById(doc, w.from); return b ? outputLabel(b, w.fromPort) : 'a block' }).join(', ')}
          </span>
        </span>
        <button
          type="button"
          onClick={() => wires.forEach((w) => removeWire(w.id))}
          title="Cut the wire and fill this in here instead"
          className="shrink-0 rounded-full border border-ink/10 px-2.5 py-1 text-[11px] text-ink-400 transition-colors hover:border-ink/20 hover:text-ink-100"
        >
          Unwire
        </button>
      </div>
      {hint && <p className="text-[11.5px] leading-relaxed text-ink-500">{hint}</p>}
      {children}
    </div>
  )
}

// The empty state of an output pane before the block has made anything.
export function NothingYet({ icon: Icon, title, hint }: { icon: ElementType; title: string; hint: string }) {
  return (
    <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-ink-800" strokeWidth={1.5} />
      <p className="text-sm text-ink-400">{title}</p>
      <p className="max-w-[340px] text-balance text-xs leading-relaxed text-ink-600">{hint}</p>
    </div>
  )
}
