// What Next?'s options: the blocks a dragged wire could land on, and which
// of their ports it would feed.

import type { BlockKind, PortType } from '../types'
import { accepts, BANK_ORDER, BANK_TYPE, KINDS, PRODUCTION_ORDER } from '../engine/catalog'
import { BANK_CONFIG, type BankType } from '../../../utils/constants'

export interface WhatNextOption {
  kind: BlockKind
  bank?: BankType
  // The port on the NEW block the wire lands on.
  port: string
  label: string
  detail: string
}

// Blocks a dragged OUTPUT of `type` could go into.
export function optionsForOutput(type: PortType): WhatNextOption[] {
  const out: WhatNextOption[] = []
  for (const kind of PRODUCTION_ORDER) {
    const port = KINDS[kind].ins.find((p) => accepts(p.type, type))
    if (port) out.push({ kind, port: port.key, label: KINDS[kind].title, detail: port.label })
  }
  return out
}

// Blocks that could feed a dragged INPUT of `type`.
export function optionsForInput(type: PortType): WhatNextOption[] {
  const out: WhatNextOption[] = []
  for (const kind of PRODUCTION_ORDER) {
    if (kind === 'bank') {
      for (const bank of BANK_ORDER) {
        if (accepts(type, BANK_TYPE[bank].type)) out.push({ kind, bank, port: 'out', label: BANK_TYPE[bank].one, detail: `From ${BANK_CONFIG[bank].label}` })
      }
      continue
    }
    const port = KINDS[kind].outs.find((p) => accepts(type, p.type))
    if (port) out.push({ kind, port: port.key, label: KINDS[kind].title, detail: port.label })
  }
  return out
}

// A block that can sit in the middle of a wire: it takes what the wire
// carries and makes something the wire's far end takes. Insert on a wire
// lists these.
export interface InsertOption extends WhatNextOption {
  // The port on the new block the far end is fed from.
  outPort: string
}

export function optionsForInsert(carried: PortType, farEnd: PortType): InsertOption[] {
  const out: InsertOption[] = []
  for (const kind of PRODUCTION_ORDER) {
    const port = KINDS[kind].ins.find((p) => accepts(p.type, carried))
    const outPort = KINDS[kind].outs.find((p) => accepts(farEnd, p.type))
    if (port && outPort) out.push({ kind, port: port.key, outPort: outPort.key, label: KINDS[kind].title, detail: `${port.label} → ${outPort.label}` })
  }
  return out
}
