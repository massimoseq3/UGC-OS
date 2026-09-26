// The palette: a rail down the canvas's left edge, in the dock's own order
// and groups — Bank | Outliers, Ad Analyzer | the Create line | Edit | the
// helpers. The real dock keeps meaning "go to this app"; this one means "put
// it on the canvas". Click to drop a block beside the selection, or drag one
// to where it should go.
//
// A rail, not a bar (September 2026, Massimo's call): it was a dock-shaped
// bar along the canvas's bottom edge, which sat directly on top of the app
// dock, and the two read as one tall dock. Down the side it can't be taken
// for the dock. It's narrow, so the tiles carry no labels: a tile's name, what
// the block is for and what it takes and makes show beside it on hover or
// focus.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { BlockKind } from '../types'
import { BANK_ORDER, KINDS } from '../engine/catalog'
import { BANK_CONFIG, type BankType } from '../../../utils/constants'
import { GlassTile } from '../../../components/AppGlassTile'
import { MenuItem, MenuSurface } from '../../../components/Menu'
import { BLOCK_BLURB, kindFace } from './blockMeta'

const GROUPS: BlockKind[][] = [
  ['bank'],
  ['outliers', 'analyzer'],
  ['characters', 'scripts', 'voice', 'broll', 'scenes', 'playground'],
  ['edit'],
  ['image', 'text', 'list', 'note'],
]

const LABEL: Partial<Record<BlockKind, string>> = { edit: 'Edit Pack' }

export const PALETTE_DRAG_TYPE = 'application/x-ugc-flow-block'

// How much of the canvas's left edge the rail takes: its 12px inset, its 46px
// width and a 12px gap. What else floats on the canvas — Ask Flow, the
// selection's toolbar, a block brought into view — keeps this far in, so
// nothing sits under the rail.
export const PALETTE_INSET = 70

// A card or menu level with the tile it belongs to, held inside the rail's
// column — which runs the canvas's height less a margin, so the first and
// last tiles' cards can't hang past an edge the canvas clips. Written straight
// onto the element before paint, like `keepInside.ts`, and on every render,
// since each block's card is its own height.
function useLevelWith<T extends HTMLElement>(y: number, align: 'middle' | 'top') {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const column = el?.offsetParent
    if (!el || !(column instanceof HTMLElement)) return
    const want = align === 'middle' ? y - el.offsetHeight / 2 : y
    el.style.top = `${Math.max(0, Math.min(want, column.clientHeight - el.offsetHeight))}px`
  })
  return ref
}

export default function Palette({ onAdd }: { onAdd: (kind: BlockKind, bank?: BankType) => void }) {
  const columnRef = useRef<HTMLDivElement>(null)
  // The Bank tile's top, where its menu opens.
  const [bankOpen, setBankOpen] = useState<number | null>(null)
  // The tile under the pointer, and its middle down the column: the card
  // beside it is the tile's label as well as what the block is for, what it
  // takes and what it makes — a tile's glyph alone doesn't tell a Batch from
  // a Text.
  const [hover, setHover] = useState<{ kind: BlockKind; y: number } | null>(null)

  // The Bank menu closes on a press anywhere else, or Escape, like every
  // chip menu on the canvas (Ask Flow, How a Flow Works). A click-catcher
  // can't do it from here: the rail's panel is its own stacking context, so a
  // catcher inside it sits under the header and the zoom pill.
  useEffect(() => {
    if (bankOpen === null) return
    const onDown = (e: PointerEvent) => {
      if (columnRef.current && !columnRef.current.contains(e.target as Node)) setBankOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBankOpen(null)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [bankOpen])

  // Where a tile sits down the column, for what opens beside it.
  const placeOf = (el: HTMLElement) => {
    const column = columnRef.current?.getBoundingClientRect()
    const tile = el.getBoundingClientRect()
    const top = tile.top - (column?.top ?? 0)
    return { top, middle: top + tile.height / 2 }
  }

  return (
    // The column the rail is centred in, as tall as the canvas allows. It
    // takes no pointer events itself — only the rail and what opens beside it
    // do — so the canvas above and below the rail still pans and selects. (The
    // panel it sits in has to opt out too, or its own box takes the press.)
    <div ref={columnRef} className="pointer-events-none relative flex h-full flex-col justify-center">
      {hover && bankOpen === null && <HoverCard kind={hover.kind} y={hover.y} />}
      {bankOpen !== null && (
        <BankMenu
          top={bankOpen}
          onPick={(bank) => {
            setBankOpen(null)
            onAdd('bank', bank)
          }}
        />
      )}
      {/* Scrolls rather than overflowing on a short window: fifteen tiles
          stand about 530px, and on a laptop the canvas can be less. */}
      <div
        className="scrollbar-hide pointer-events-auto flex max-h-full flex-col items-center overflow-y-auto rounded-[22px] border border-ink/10 bg-surface-1 p-1.5 shadow-lg shadow-black/20"
        onMouseLeave={() => setHover(null)}
      >
        {GROUPS.map((group, i) => (
          <div key={group.join()} className="flex flex-col items-center">
            {i > 0 && <span className="my-1 h-px w-6 shrink-0 bg-ink/10" />}
            {group.map((kind) => {
              const face = kindFace(kind)
              const label = LABEL[kind] ?? KINDS[kind].title
              return (
                <button
                  key={kind}
                  type="button"
                  draggable={kind !== 'bank'}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(PALETTE_DRAG_TYPE, kind)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={(e) => {
                    if (kind !== 'bank') onAdd(kind)
                    else setBankOpen(bankOpen === null ? placeOf(e.currentTarget).top : null)
                  }}
                  onMouseEnter={(e) => setHover({ kind, y: placeOf(e.currentTarget).middle })}
                  onFocus={(e) => setHover({ kind, y: placeOf(e.currentTarget).middle })}
                  onBlur={() => setHover(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-ink/[0.06]"
                  aria-label={kind === 'bank' ? 'Add something from a bank' : `Add ${label}`}
                  aria-expanded={kind === 'bank' ? bankOpen !== null : undefined}
                >
                  <GlassTile icon={face.icon} accent={face.accent} size={26} />
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function BankMenu({ top, onPick }: { top: number; onPick: (bank: BankType) => void }) {
  const ref = useLevelWith<HTMLDivElement>(top, 'top')
  return (
    <div ref={ref} className="pointer-events-auto absolute left-full z-20 ml-2.5">
      <MenuSurface>
        {BANK_ORDER.map((bank) => (
          <MenuItem
            key={bank}
            icon={BANK_CONFIG[bank].icon as LucideIcon}
            iconClassName="text-ink-400"
            onClick={() => onPick(bank)}
          >
            {BANK_CONFIG[bank].label}
          </MenuItem>
        ))}
      </MenuSurface>
    </div>
  )
}

function HoverCard({ kind, y }: { kind: BlockKind; y: number }) {
  const ref = useLevelWith<HTMLDivElement>(y, 'middle')
  const face = kindFace(kind)
  const spec = KINDS[kind]
  const takes = spec.ins.map((p) => p.label)
  const makes = kind === 'bank' ? ['A product, character, script, voice, still, style or saved ad']
    : kind === 'scripts' ? ['Hooks or Scripts']
    : kind === 'playground' ? ['Image, Clip or Music']
    : spec.outs.map((p) => p.label)
  return (
    <div ref={ref} className="pointer-events-none absolute left-full z-20 ml-2.5 w-[340px] rounded-2xl border border-ink/10 bg-surface-2 px-4 py-3 shadow-xl shadow-black/30">
      <div className="flex items-center gap-2">
        <GlassTile icon={face.icon} accent={face.accent} size={22} />
        <span className="text-[13px] font-semibold text-ink-100">{LABEL[kind] ?? spec.title}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">{BLOCK_BLURB[kind]}</p>
      {(takes.length > 0 || makes.length > 0) && (
        <p className="mt-1.5 text-[11px] text-ink-500">
          {takes.length > 0 && <>Takes {takes.join(', ')}</>}
          {takes.length > 0 && makes.length > 0 && ' · '}
          {makes.length > 0 && <>Makes {makes.join(', ')}</>}
        </p>
      )}
      <p className="mt-1.5 text-[10.5px] text-ink-600">{kind === 'bank' ? 'Click to pick which bank' : 'Click to add it, or drag it where it goes'}</p>
    </div>
  )
}
