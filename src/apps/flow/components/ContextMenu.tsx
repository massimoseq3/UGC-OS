// The canvas's right-click menu: on a block, on the empty canvas, or on a
// wire, the things that can be done THERE, each with its key beside it — so
// a member learns the shortcuts by using the menu, the way a node editor
// teaches them. One shape for all three; the canvas builds the rows.

import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import { MenuItem, MenuSeparator, MenuSurface } from '../../../components/Menu'
import { useKeepInside } from './keepInside'

export type ContextRow =
  | {
      label: string
      icon?: LucideIcon
      onClick: () => void
      // The key that does the same, shown on the right.
      keys?: string
      // A price or a count, shown on the right instead of keys.
      detail?: string
      // A toggle that's on: ticked.
      on?: boolean
      danger?: boolean
      disabled?: boolean
      title?: string
    }
  | 'separator'

export default function ContextMenu({
  x,
  y,
  title,
  rows,
  onClose,
}: {
  // Where it opens, in the canvas's own box.
  x: number
  y: number
  title?: string
  rows: ContextRow[]
  onClose: () => void
}) {
  const ref = useKeepInside<HTMLDivElement>(x, y)
  // Rows that would lead or trail with a rule, or stack two, collapse.
  const tidy = rows.filter((r, i) => r !== 'separator' || (i > 0 && i < rows.length - 1 && rows[i - 1] !== 'separator'))
  return (
    <>
      <div className="absolute inset-0 z-30" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div ref={ref} className="absolute z-40" style={{ left: x, top: y }}>
        <MenuSurface className="w-60">
          {title && <div className="truncate border-b border-ink/5 px-3.5 py-2 text-[11px] font-medium text-ink-500">{title}</div>}
          {tidy.map((r, i) => {
            if (r === 'separator') return <MenuSeparator key={`s${i}`} />
            return (
              <MenuItem
                key={r.label}
                icon={r.icon}
                title={r.title}
                iconClassName={r.danger ? 'text-red-400/80' : undefined}
                toneClassName={
                  r.disabled ? 'cursor-default text-ink-600'
                    : r.danger ? 'text-ink-300 hover:bg-red-500/15 hover:text-red-300'
                    : undefined
                }
                onClick={() => {
                  if (r.disabled) return
                  onClose()
                  r.onClick()
                }}
                trailing={
                  r.on ? <Check className="h-3.5 w-3.5 text-flow-300" />
                    : r.detail ? <span className="text-[11px] tabular-nums text-ink-500">{r.detail}</span>
                    : r.keys ? <kbd className="font-sans text-[11px] text-ink-500">{r.keys}</kbd>
                    : undefined
                }
              >
                {r.label}
              </MenuItem>
            )
          })}
        </MenuSurface>
      </div>
    </>
  )
}
