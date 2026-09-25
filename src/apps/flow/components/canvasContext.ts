// What every block on the canvas reads besides its own row: the flow's plan
// (counts, estimates, why a block can't run), the live run, and the editor's
// few actions a node can start. React Flow hands a node only its own props,
// so these ride in a context.

import { createContext, useContext } from 'react'
import type { FlowBlock, FlowDoc } from '../types'
import type { FlowPlan } from '../engine/plan'
import type { LiveRun } from '../run/runtime'

export interface CanvasContextValue {
  flowId: string
  doc: FlowDoc
  plan: FlowPlan | null
  run: LiveRun | undefined
  // The faint block that suggests what comes next — derived, never stored.
  suggestion: FlowBlock | null
  openReview: (blockId: string) => void
  runBlock: (blockId: string) => void
  acceptSuggestion: () => void
  // Open a block in its app's own window.
  openBlock: (blockId: string) => void
  // A dot clicked: what could go into it (an input) or come out of it (an
  // output), as the What Next? menu at the pointer.
  askAtPort: (blockId: string, port: string, side: 'in' | 'out', clientX: number, clientY: number) => void
  // The block whose name is being typed on the canvas (F2, or Rename).
  renaming: string | null
  setRenaming: (blockId: string | null) => void
  // A wire's + at its middle: the blocks that could sit between its ends.
  openInsert: (wireId: string, clientX: number, clientY: number) => void
  // A wire's eye: every value it carries, made or still to be made.
  openPeek: (wireId: string, clientX: number, clientY: number) => void
  // The wire under the pointer (null: let go of it, a moment late).
  pointWire: (wireId: string | null) => void
}

export const CanvasContext = createContext<CanvasContextValue | null>(null)

export function useCanvas(): CanvasContextValue {
  const value = useContext(CanvasContext)
  if (!value) throw new Error('useCanvas outside the Flow canvas')
  return value
}
