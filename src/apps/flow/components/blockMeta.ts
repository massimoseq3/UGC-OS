// A block's face: the glyph and colour it wears on the canvas and in the
// palette — its app's own dock icon and accent, so a Voiceovers block is
// recognisably Voiceovers. The dock's exact tile, not a tint of it: Scripts
// and Playground wore lifted blues and teals here until September 2026, and
// beside the dock a member read them as different apps.

import type { ElementType } from 'react'
import { Clapperboard, Image as ImageIcon, List, StickyNote, Type } from 'lucide-react'
import type { BlockKind, FlowBlock, PortSpec } from '../types'
import { BANK_CONFIG, getAppConfig, type BankType } from '../../../utils/constants'
import { insOf, KINDS, outsOf, sourceOf, wearsSquare } from '../engine/catalog'

const HELPER_ICONS: Partial<Record<BlockKind, ElementType>> = {
  image: ImageIcon,
  text: Type,
  list: List,
  note: StickyNote,
  // Scene Clips runs Playground, but a clapperboard says "one clip per
  // scene" where Playground's own glyph would read as a second Playground.
  scenes: Clapperboard,
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
  return app?.accent ?? KINDS[block.kind].accent
}

// Kind icon + accent without a block, for the palette. A Bank that hasn't
// picked its bank yet is the Bank app itself, in its dock tile; once it has,
// it wears that bank's own tab icon, as it does in the Bank.
export function kindFace(kind: BlockKind, bank?: BankType): { icon: ElementType; accent: string } {
  if (kind === 'bank' && !bank) {
    const app = getAppConfig('finder')!
    return { icon: app.icon, accent: app.accent }
  }
  const probe = { kind, settings: bank ? { bank } : {} }
  return { icon: blockIcon(probe), accent: blockAccent(probe) }
}

// An app block opens in its app's own window; the helpers are edited on the
// canvas itself.
export function opensWindow(block: Pick<FlowBlock, 'kind' | 'suggested'>): boolean {
  return !!KINDS[block.kind]?.runnable && !block.suggested
}

// The output a square face carries on its own edge, beside the picture, in
// place of a ports row that would only repeat the block's name: only when
// there is exactly one, and nothing to wire in.
export function edgeOutput(block: FlowBlock): PortSpec | null {
  if (!wearsSquare(block) || insOf(block).length) return null
  const outs = outsOf(block)
  return outs.length === 1 ? outs[0] : null
}

// A block whoever runs the flow can fill in themselves, in Run.
export function isFieldable(block: FlowBlock): boolean {
  return block.kind === 'bank' || block.kind === 'image' || block.kind === 'text' || (!!KINDS[block.kind]?.runnable && sourceOf(block) === 'bank')
}

export { blockWidth } from '../engine/catalog'

// What each block is for, in a sentence — the palette's hover card and the
// Add Block picker read it, so a member who has never opened a node editor
// can tell a Batch from a Text without trying both.
export const BLOCK_BLURB: Record<BlockKind, string> = {
  bank: 'Something you already saved: a product, a character, a script, a voice, a still, a style or a saved ad. Costs nothing.',
  image: 'A picture you drop in. Feeds anything that takes a picture: a reference, a frame, a photo to build a face from.',
  text: 'A line or a paragraph you type once: a brief, a prompt, instructions.',
  list: 'Several lines, one per item. Wired in, the next block runs once for each.',
  note: 'A sticky note for whoever opens this flow. It never runs.',
  outliers: 'Finds ads on TikTok, Instagram or Meta that beat their account\'s usual views. Spends ScrapeCreators credits.',
  analyzer: 'Tears an ad down: its transcript, its scenes and shot craft, and what made it work.',
  characters: 'Makes the faces for your ads, one per slot, from a description or a reference photo.',
  scripts: 'Writes hooks or full scripts for your product, or remixes a winning ad in your product\'s words.',
  voice: 'Reads each script aloud in the voice you pick.',
  broll: 'Storyboards each script, makes a still per scene, then animates the stills into clips.',
  playground: 'Makes one image, clip or music track from a prompt and the pictures you wire in.',
  scenes: 'Films a scene script one clip per scene: your character, the voice profile in every prompt, each clip as long as its scene, the product only where it\'s shown.',
  edit: 'Packs each ad\'s voiceover, clips, stills and script into a folder for the /video-editor skill.',
}

// Where each kind sits in the Add Block picker, in production order.
export const BLOCK_GROUPS: Array<{ title: string; kinds: BlockKind[] }> = [
  { title: 'Start With', kinds: ['bank', 'image', 'text', 'list'] },
  { title: 'Research', kinds: ['outliers', 'analyzer'] },
  { title: 'Create', kinds: ['characters', 'scripts', 'voice', 'broll', 'scenes', 'playground'] },
  { title: 'Deliver', kinds: ['edit'] },
  { title: 'Explain', kinds: ['note'] },
]
