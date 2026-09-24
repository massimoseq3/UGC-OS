// What an input holds from inside its block when nothing is wired there —
// the product picked in its panel, a typed script, a written brief — for the
// line beside its dot on the canvas and its chip in the block's window.

import type { FlowBlock } from '../../types'
import { inlineText, takesTyped } from '../../engine/catalog'
import { useBankStore } from '../../../../stores/bankStore'

export function useHeldHere(block: FlowBlock, portKey: string): string | null {
  const s = block.settings
  const productName = useBankStore((st) => (portKey === 'product' && typeof s.productId === 'string' ? st.products.find((p) => p.id === s.productId)?.productName : undefined))
  const characterName = useBankStore((st) => (portKey === 'character' && typeof s.characterId === 'string' ? st.models.find((m) => m.id === s.characterId)?.name : undefined))
  if (productName) return productName
  if (characterName) return characterName
  if (takesTyped(block, portKey)) return inlineText(block, portKey) ? 'Typed' : null
  const text = (key: string) => String(s[key] ?? '').trim()
  if (block.kind === 'scripts' && portKey === 'brief' && text('brief')) return 'Written'
  if (block.kind === 'scripts' && portKey === 'source' && text('source')) return 'Pasted'
  if (block.kind === 'playground' && portKey === 'prompt' && text('prompt')) return 'Written'
  if (block.kind === 'broll' && portKey === 'instructions' && text('context')) return 'Written'
  if (block.kind === 'outliers' && portKey === 'query' && text('query')) return `“${text('query')}”`
  return null
}

