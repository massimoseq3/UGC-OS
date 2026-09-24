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
}

export const CanvasContext = createContext<CanvasContextValue | null>(null)

export function useCanvas(): CanvasContextValue {
  const value = useContext(CanvasContext)
  if (!value) throw new Error('useCanvas outside the Flow canvas')
  return value
}
