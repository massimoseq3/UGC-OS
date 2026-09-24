import { useState } from 'react'
import { Route, Workflow } from 'lucide-react'
import type { Lineage } from '../stores/types'
import { useAppStore } from '../stores/appStore'
import { useAppVisible } from '../stores/appVisibilityStore'
import { TileMenuButton, TileMenuItem } from './tileActions'

// How It Was Made and Save as Flow, on a finished result's tile. Both open in
// Flow (apps/flow/components/LineageModal), which walks the row's recorded
// parents; the app only names the row. Nothing renders while Flow is switched
// off in Settings, so an app's menu is unchanged for a member without it.
//
// `FlowLineageItems` is two rows for a ⋮ menu a tile already has (count them
// in its flip-above estimate: `useAppVisible('flow') ? 2 : 0`).
// `FlowLineageMenu` is a ⋮ of its own, for a panel row that has none — it
// holds its own open state, which is fine for a `chrome` row: it is always
// on screen, so nothing has to be held visible while its menu is open.

export default function FlowLineageItems({ row, onClose }: { row: Lineage; onClose: () => void }) {
  const visible = useAppVisible('flow')
  const sendToApp = useAppStore((s) => s.sendToApp)
  if (!visible) return null
  const open = (view: 'how' | 'save') => sendToApp({ targetApp: 'flow', targetField: 'lineage', data: { bank: row.bank, id: row.id, view } })
  return (
    <>
      <TileMenuItem icon={Route} label="How It Was Made" onClick={() => open('how')} onClose={onClose} />
      <TileMenuItem icon={Workflow} label="Save as Flow" onClick={() => open('save')} onClose={onClose} />
    </>
  )
}

export function FlowLineageMenu({ row }: { row: Lineage }) {
  const visible = useAppVisible('flow')
  const [open, setOpen] = useState(false)
  if (!visible) return null
  return (
    <TileMenuButton chrome open={open} onToggle={() => setOpen((v) => !v)} onClose={() => setOpen(false)} count={2} title="More Actions">
      <FlowLineageItems row={row} onClose={() => setOpen(false)} />
    </TileMenuButton>
  )
}
