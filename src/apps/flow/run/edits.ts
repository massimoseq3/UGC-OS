// A script rewritten by hand inside a flow. Every script on the channel gets
// a human pass before it's voiced or filmed — "take a minute to quickly edit
// them myself" — so a Scripts block's takes can be edited where they're
// reviewed: in its window, and in Pause for Review.
//
// The edit lands on the block's RESULT, not on the Scripts history row (which
// keeps what the model wrote, the way Scripts' own History does), and every
// item cut from an edited take gets a new identity — so whatever was already
// made from the old words (a voiceover, clips) is planned again, and nothing
// made from the untouched takes is.

import type { FlowValue, InstanceResult } from '../types'
import { useFlowStore } from '../store/flowStore'
import { useBankStore } from '../../../stores/bankStore'
import { liveItems } from '../engine/graph'
import { fingerprint } from '../engine/hash'
import { scriptItems } from './executors/simple'

// The takes a Scripts run shows, with the member's edits laid over them.
export function editedTakes(result: InstanceResult | undefined, variations: string[]): string[] {
  const edits = result?.edits ?? {}
  return variations.map((v, i) => edits[String(i)] ?? v)
}

export function editTake(flowId: string, blockId: string, instKey: string, index: number, text: string): boolean {
  const store = useFlowStore.getState()
  const doc = store.ensureDoc(flowId)
  const block = doc?.blocks.find((b) => b.id === blockId)
  const result = doc?.outputs[blockId]?.instances[instKey]
  const rowId = result?.rows?.find((r) => r.bank === 'scriptHistory')?.id
  const row = rowId ? useBankStore.getState().scriptHistory.find((h) => h.id === rowId) : undefined
  if (!doc || !block || !result || !row) return false
  const edits = { ...(result.edits ?? {}) }
  if (text === row.variations[index]) delete edits[String(index)]
  else edits[String(index)] = text
  const slots = result.slots ?? liveItems(block).map((it) => it.id)
  const staging = Object.values(result.items ?? {}).find((v) => v.type === 'script')
  const stagingText = staging?.type === 'script' ? staging.payload.staging : undefined
  const original = scriptItems(row, slots, stagingText)
  const edited = scriptItems({ ...row, variations: editedTakes({ ...result, edits }, row.variations) }, slots, stagingText)
  const items: Record<string, FlowValue> = {}
  for (const [slot, v] of Object.entries(edited)) {
    const was = original[slot]
    const changed = v.type === 'script' && was?.type === 'script' && v.payload.text !== was.payload.text
    const trace = result.items?.[slot]?.trace ?? {}
    items[slot] = { ...v, key: changed ? `${v.key}~${fingerprint(v.type === 'script' ? v.payload.text : '')}` : v.key, trace } as FlowValue
  }
  store.setResults(flowId, blockId, (prev) => ({
    ...prev,
    [instKey]: { ...result, edits: Object.keys(edits).length ? edits : undefined, items },
  }))
  return true
}

// One hook or take, edited where it's listed on its own (Pause for Review):
// a take is its own variation; a hook is one line of the single variation a
// hooks run writes, so that line is swapped in place.
export function editItem(flowId: string, blockId: string, slot: string, text: string): boolean {
  const doc = useFlowStore.getState().ensureDoc(flowId)
  const block = doc?.blocks.find((b) => b.id === blockId)
  const entry = Object.entries(doc?.outputs[blockId]?.instances ?? {}).find(([, r]) => r.items?.[slot])
  if (!doc || !block || !entry) return false
  const [instKey, result] = entry
  const rowId = result.rows?.find((r) => r.bank === 'scriptHistory')?.id
  const row = rowId ? useBankStore.getState().scriptHistory.find((h) => h.id === rowId) : undefined
  if (!row) return false
  const slots = result.slots ?? liveItems(block).map((it) => it.id)
  const index = slots.indexOf(slot)
  if (index < 0) return false
  const takes = editedTakes(result, row.variations)
  if (row.mode === 'write' && row.writeFormat === 'hooks') {
    const was = result.items?.[slot]
    const old = was?.type === 'script' ? was.payload.text : ''
    const lines = takes[0] ?? ''
    if (!old || !lines.includes(old)) return false
    return editTake(flowId, blockId, instKey, 0, lines.replace(old, text.replace(/\n+/g, ' ').trim()))
  }
  return editTake(flowId, blockId, instKey, index, text)
}
