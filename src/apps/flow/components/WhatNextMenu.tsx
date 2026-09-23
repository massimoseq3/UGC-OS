// What Next?: a wire dropped on empty canvas asks where it should go, listing
// only the blocks that could take it and which of their inputs it would feed.
// Picking one adds that block where the wire was dropped, already wired.

import type { LucideIcon } from 'lucide-react'
import type { PortType } from '../types'
import { TYPE_META } from '../engine/catalog'
import { MenuItem, MenuSurface } from '../../../components/Menu'
import { kindFace } from './blockMeta'
import type { WhatNextOption } from './whatNext'

export default function WhatNextMenu({
  x,
  y,
  type,
  options,
  onPick,
  onClose,
}: {
  x: number
  y: number
  type: PortType
  options: WhatNextOption[]
  onPick: (option: WhatNextOption) => void
  onClose: () => void
}) {
  return (
    <>
      <div className="absolute inset-0 z-30" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div className="absolute z-40" style={{ left: x, top: y }}>
        <MenuSurface className="w-60">
          <div className="border-b border-ink/5 px-3.5 py-2 text-[11px] font-medium text-ink-500">
            What Next? · <span style={{ color: TYPE_META[type].color }}>{TYPE_META[type].label}</span>
          </div>
          <div className="menu-scroll max-h-[320px] overflow-y-auto">
            {options.length === 0 && <p className="px-3.5 py-3 text-xs text-ink-500">Nothing takes that yet.</p>}
            {options.map((o) => {
              const face = kindFace(o.kind, o.bank)
              return (
                <MenuItem key={`${o.kind}:${o.bank ?? ''}:${o.port}`} icon={face.icon as LucideIcon} onClick={() => onPick(o)} trailing={<span className="text-[11px] text-ink-500">{o.detail}</span>}>
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
