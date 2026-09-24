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
import { kindFace } from './blockMeta'

const GROUPS: BlockKind[][] = [
  ['bank'],
  ['outliers', 'analyzer'],
  ['characters', 'scripts', 'voice', 'broll', 'playground'],
  ['edit'],
  ['image', 'text', 'list', 'note'],
]

const LABEL: Partial<Record<BlockKind, string>> = { edit: 'Edit Pack' }

export const PALETTE_DRAG_TYPE = 'application/x-ugc-flow-block'

export default function Palette({ onAdd }: { onAdd: (kind: BlockKind, bank?: BankType) => void }) {
  const [bankOpen, setBankOpen] = useState(false)
  return (
    <div className="relative">
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
        <span className="mb-[22px] self-center px-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500">Add</span>
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
                  className="flex w-[54px] flex-col items-center gap-1 rounded-xl px-0.5 py-1 transition-colors hover:bg-ink/[0.05]"
                  title={kind === 'bank' ? 'Add something from a bank' : `Add ${label}`}
                >
                  <GlassTile icon={face.icon} accent={face.accent} size={30} />
                  <span className="max-w-full truncate text-[9.5px] font-medium text-ink-400">{label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
