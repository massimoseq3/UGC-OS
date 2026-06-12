import type { PromptVariation } from '../types'

// Tag-driven chip wording + palette. Top-left chip shows what the variation
// IS (Dialogue / Action / Emotional / Product shot); roll type (A-Roll /
// B-Roll) moves to the small bottom text so the face stays scannable.
// Lives in its own module (not VariationCard) so editing the card keeps
// React Fast Refresh working — a component file may only export components.
const TAG_LABELS: Record<PromptVariation['tag'], string> = {
  DIALOGUE: 'Dialogue',
  ACTION: 'Action',
  EMOTIONAL: 'Emotional',
  PRODUCT: 'Product shot',
}
// light: text variants because the chip also renders on light panel surfaces
// (modal header, empty card face) where the -100 tints are unreadable.
const TAG_CHIP_STYLES: Record<PromptVariation['tag'], string> = {
  DIALOGUE: 'bg-cyan-500/25 text-cyan-100 light:text-cyan-900 border-cyan-400/40',
  ACTION: 'bg-lime-500/25 text-lime-100 light:text-lime-900 border-lime-400/40',
  EMOTIONAL: 'bg-pink-500/25 text-pink-100 light:text-pink-900 border-pink-400/40',
  PRODUCT: 'bg-amber-500/25 text-amber-100 light:text-amber-900 border-amber-400/40',
}
export function rollTypeForTag(tag: PromptVariation['tag']): 'A-Roll' | 'B-Roll' {
  return tag === 'DIALOGUE' ? 'A-Roll' : 'B-Roll'
}
export function tagLabel(tag: PromptVariation['tag']): string {
  return TAG_LABELS[tag]
}
export function tagChipStyle(tag: PromptVariation['tag']): string {
  return TAG_CHIP_STYLES[tag]
}
