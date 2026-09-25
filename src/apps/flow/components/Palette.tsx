// The palette: a dock-shaped bar inside the canvas, in the dock's own order
// and groups — Bank | Outliers, Ad Analyzer | the Create line | Edit | the
// helpers. The real dock keeps meaning "go to this app"; this one means "put
// it on the canvas". Click to drop a block beside the selection, or drag one
// to where it should go.

import { useState } from 'react'
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

export default function Palette({ onAdd }: { onAdd: (kind: BlockKind, bank?: BankType) => void }) {
  const [bankOpen, setBankOpen] = useState(false)
  // The tile under the pointer, described above the bar: what the block is
  // for, what it takes and what it makes — a tile's name alone doesn't tell a
  // Batch from a Text.
  const [hover, setHover] = useState<BlockKind | null>(null)
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      {hover && !bankOpen && <HoverCard kind={hover} />}
      {bankOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setBankOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-2">
            <MenuSurface>
              {BANK_ORDER.map((bank) => (
                <MenuItem
                  key={bank}
                  icon={BANK_CONFIG[bank].icon as LucideIcon}
                  iconClassName="text-ink-400"
                  onClick={() => { setBankOpen(false); onAdd('bank', bank) }}
                >
                  {BANK_CONFIG[bank].label}
                </MenuItem>
              ))}
            </MenuSurface>
          </div>
        </>
      )}
      <div className="flex items-end gap-0.5 rounded-[22px] border border-ink/10 bg-surface-1 px-2 pb-1 pt-1.5 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.55)]">
        {GROUPS.map((group, i) => (
          <div key={group.join()} className="flex items-end gap-0.5">
            {i > 0 && <span className="mx-1 mb-6 h-7 w-px self-center bg-ink/10" />}
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
                  onClick={() => (kind === 'bank' ? setBankOpen(!bankOpen) : onAdd(kind))}
                  onMouseEnter={() => setHover(kind)}
                  onFocus={() => setHover(kind)}
                  onBlur={() => setHover(null)}
                  className="group flex w-[60px] flex-col items-center gap-1 rounded-xl px-0.5 py-1 transition-colors hover:bg-ink/[0.05]"
                  aria-label={kind === 'bank' ? 'Add something from a bank' : `Add ${label}`}
                >
                  <GlassTile icon={face.icon} accent={face.accent} size={30} />
                  {/* The dock's own label: 10px, regular weight. */}
                  <span className="max-w-full truncate text-[10px] leading-tight text-ink-400 transition-colors duration-200 group-hover:text-ink-200">{label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function HoverCard({ kind }: { kind: BlockKind }) {
  const face = kindFace(kind)
  const spec = KINDS[kind]
  const takes = spec.ins.map((p) => p.label)
  const makes = kind === 'bank' ? ['A product, character, script, voice, still, style or saved ad']
    : kind === 'scripts' ? ['Hooks or Scripts']
    : kind === 'playground' ? ['Image, Clip or Music']
    : spec.outs.map((p) => p.label)
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-[360px] -translate-x-1/2 rounded-2xl border border-ink/10 bg-surface-2 px-4 py-3 shadow-xl shadow-black/30">
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
