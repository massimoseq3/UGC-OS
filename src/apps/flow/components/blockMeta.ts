// A block's face: the glyph and colour it wears on the canvas and in the
// palette — its app's own dock icon and accent, so a Voiceovers block is
// recognisably Voiceovers.

import type { ElementType } from 'react'
import { Image as ImageIcon, List, StickyNote, Type } from 'lucide-react'
import type { BlockKind, FlowBlock } from '../types'
import { BANK_CONFIG, getAppConfig, type BankType } from '../../../utils/constants'
import { KINDS } from '../engine/catalog'

const HELPER_ICONS: Partial<Record<BlockKind, ElementType>> = {
  image: ImageIcon,
  text: Type,
  list: List,
  note: StickyNote,
}

export function blockIcon(block: Pick<FlowBlock, 'kind' | 'settings'>): ElementType {
  if (block.kind === 'bank') {
    const bank = (block.settings.bank as BankType) ?? 'products'
    return (BANK_CONFIG[bank] ?? BANK_CONFIG.products).icon
  }
  const helper = HELPER_ICONS[block.kind]
  if (helper) return helper
  const app = KINDS[block.kind].appId ? getAppConfig(KINDS[block.kind].appId!) : undefined
  return app?.icon ?? ImageIcon
}

export function blockAccent(block: Pick<FlowBlock, 'kind' | 'settings'>): string {
  if (block.kind === 'bank') {
    const bank = (block.settings.bank as BankType) ?? 'products'
    return (BANK_CONFIG[bank] ?? BANK_CONFIG.products).accent
  }
  const app = KINDS[block.kind].appId ? getAppConfig(KINDS[block.kind].appId!) : undefined
  // Scripts and Playground are near-black on a dark canvas; the lifted tint
  // their own admin charts use keeps a small glyph legible.
  if (block.kind === 'scripts') return '#4C6FBF'
  if (block.kind === 'playground') return '#12A594'
  return app?.accent ?? KINDS[block.kind].accent
}

// Kind icon + accent without a block, for the palette.
export function kindFace(kind: BlockKind, bank?: BankType): { icon: ElementType; accent: string } {
  const probe = { kind, settings: bank ? { bank } : {} }
  return { icon: blockIcon(probe), accent: blockAccent(probe) }
}

export { blockWidth } from '../engine/catalog'
