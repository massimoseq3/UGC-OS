// Add Block: every block there is, searchable, each with a sentence on what
// it's for and what it takes and makes — the palette's tiles, for a member
// who doesn't know yet which tile they want. Opened with Tab, from the
// canvas's right-click menu, or from the + in the empty canvas; the block
// lands where it was asked for.

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { BlockKind } from '../types'
import { BANK_ORDER, BANK_TYPE, KINDS, TYPE_META } from '../engine/catalog'
import { BANK_CONFIG, type BankType } from '../../../utils/constants'
import { GlassTile } from '../../../components/AppGlassTile'
import { BLOCK_BLURB, BLOCK_GROUPS, kindFace } from './blockMeta'

export interface AddOption {
  kind: BlockKind
  bank?: BankType
  title: string
  blurb: string
  takes: string[]
  makes: string[]
}

const LABEL: Partial<Record<BlockKind, string>> = { edit: 'Edit Pack' }

function optionsFor(kind: BlockKind): AddOption[] {
  const spec = KINDS[kind]
  const takes = spec.ins.map((p) => p.label)
  if (kind === 'bank') {
    return BANK_ORDER.map((bank) => ({
      kind,
      bank,
      title: BANK_TYPE[bank].one,
      blurb: `One from your ${BANK_CONFIG[bank].label} bank. Costs nothing.`,
      takes: [],
      makes: [TYPE_META[BANK_TYPE[bank].type].label],
    }))
  }
  const makes = kind === 'scripts' ? ['Hooks or Scripts'] : kind === 'playground' ? ['Image, Clip or Music'] : spec.outs.map((p) => p.label)
  return [{ kind, title: LABEL[kind] ?? spec.title, blurb: BLOCK_BLURB[kind], takes, makes }]
}

const ADD_GROUPS = BLOCK_GROUPS.map((g) => ({ title: g.title, options: g.kinds.flatMap(optionsFor) }))

function matches(o: AddOption, q: string): boolean {
  if (!q) return true
  const hay = `${o.title} ${o.blurb} ${o.takes.join(' ')} ${o.makes.join(' ')} ${KINDS[o.kind].title}`.toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))
}

export default function AddBlockMenu({
  x,
  y,
  onPick,
  onClose,
}: {
  // Where it opens, in the canvas's own box.
  x: number
  y: number
  onPick: (option: AddOption) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const groups = ADD_GROUPS.map((g) => ({ ...g, options: g.options.filter((o) => matches(o, q)) })).filter((g) => g.options.length)
  const flat = groups.flatMap((g) => g.options)
  const at = Math.min(cursor, Math.max(0, flat.length - 1))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${at}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(Math.min(at + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(Math.max(at - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flat[at]) onPick(flat[at])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <>
      <div className="absolute inset-0 z-30" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div className="absolute z-40 w-[340px]" style={{ left: x, top: y }} onKeyDown={onKey}>
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-surface-2 shadow-xl shadow-black/30">
          <div className="flex items-center gap-2 border-b border-ink/5 px-3.5 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-ink-500" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setCursor(0) }}
              placeholder="Add a block… try “voice” or “hooks”"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink-100 outline-none placeholder:text-ink-500"
              aria-label="Search Blocks"
            />
          </div>
          <div ref={listRef} className="menu-scroll max-h-[380px] overflow-y-auto py-1">
            {groups.length === 0 && <p className="px-4 py-4 text-[12px] text-ink-500">No block matches that. Try another word.</p>}
            {groups.map((g) => (
              <div key={g.title}>
                <p className="px-4 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">{g.title}</p>
                {g.options.map((o) => {
                  const i = flat.indexOf(o)
                  const face = kindFace(o.kind, o.bank)
                  return (
                    <button
                      key={`${o.kind}:${o.bank ?? ''}`}
                      type="button"
                      data-index={i}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => onPick(o)}
                      className={`flex w-full items-start gap-3 px-3.5 py-2 text-left transition-colors ${i === at ? 'bg-ink/[0.07]' : ''}`}
                    >
                      <GlassTile icon={face.icon} accent={face.accent} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink-100">{o.title}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-ink-400">{o.blurb}</span>
                        {(o.takes.length > 0 || o.makes.length > 0) && (
                          <span className="mt-1 block truncate text-[10.5px] text-ink-500">
                            {o.takes.length > 0 && <>Takes {o.takes.join(', ')}</>}
                            {o.takes.length > 0 && o.makes.length > 0 && ' · '}
                            {o.makes.length > 0 && <>Makes {o.makes.join(', ')}</>}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <p className="border-t border-ink/5 px-4 py-2 text-[10.5px] text-ink-500">↑↓ to move · Enter to add · Esc to close</p>
        </div>
      </div>
    </>
  )
}
