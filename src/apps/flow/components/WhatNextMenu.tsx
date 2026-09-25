// What Next?: a wire dropped on empty canvas — or a dot clicked — asks where
// it should go, listing only the blocks that could take it and which of their
// inputs it would feed. From an input it's the other way round: the blocks
// that could feed it. Picking one adds that block there, already wired.
// Dropped on a block's body where more than one of its inputs could take the
// wire, it lists those inputs instead (`into`).

import type { LucideIcon } from 'lucide-react'
import type { PortType } from '../types'
import { TYPE_META } from '../engine/catalog'
import { MenuItem, MenuSurface } from '../../../components/Menu'
import { kindFace } from './blockMeta'
import type { WhatNextOption } from './whatNext'
import { useKeepInside } from './keepInside'

export default function WhatNextMenu({
  x,
  y,
  type,
  side = 'out',
  into = false,
  heading,
  options,
  onPick,
  onClose,
}: {
  x: number
  y: number
  type: PortType
  side?: 'out' | 'in'
  into?: boolean
  // Replaces the question the menu opens with (Insert on a wire asks its own).
  heading?: string
  options: WhatNextOption[]
  onPick: (option: WhatNextOption) => void
  onClose: () => void
}) {
  const ref = useKeepInside<HTMLDivElement>(x, y)
  return (
    <>
      <div className="absolute inset-0 z-30" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div ref={ref} className="absolute z-40" style={{ left: x, top: y }}>
        <MenuSurface className="w-60">
          <div className="border-b border-ink/5 px-3.5 py-2 text-[11px] font-medium text-ink-500">
            {heading ?? (into ? 'Which Input?' : side === 'out' ? 'What Next?' : 'What Feeds This?')} · <span style={{ color: TYPE_META[type].color }}>{TYPE_META[type].label}</span>
          </div>
          <div className="menu-scroll max-h-[320px] overflow-y-auto">
            {options.length === 0 && <p className="px-3.5 py-3 text-xs text-ink-500">Nothing takes that yet.</p>}
            {options.map((o) => {
              const face = kindFace(o.kind, o.bank)
              return (
                <MenuItem key={`${o.kind}:${o.bank ?? ''}:${o.port}`} icon={into ? undefined : face.icon as LucideIcon} onClick={() => onPick(o)} trailing={<span className="text-[11px] text-ink-500">{o.detail}</span>}>
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
