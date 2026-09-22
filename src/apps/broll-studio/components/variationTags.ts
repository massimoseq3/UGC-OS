import type { PromptVariation } from '../types'

// Tag-driven chip wording + palette. The top-left chip shows what the variation
// IS (Dialogue / Action / Emotional / Product Shot). It used to have a
// companion, `rollTypeForTag`, printing A-Roll / B-Roll in the caption under the
// card; that caption names the card's POSITION now ("Option 2"), so the helper
// went with it — see VariationCard.
// Lives in its own module (not VariationCard) so editing the card keeps
// React Fast Refresh working — a component file may only export components.
const TAG_LABELS: Record<PromptVariation['tag'], string> = {
  DIALOGUE: 'Dialogue',
  STATIC: 'Static',
  ACTION: 'Action',
  EMOTIONAL: 'Emotional',
  PRODUCT: 'Product Shot',
  POV: 'POV',
  ENVIRONMENT: 'Environment',
  TRANSITION: 'Transition',
  PROOF: 'Proof',
}
// light: text variants because the chip also renders on light panel surfaces
// (modal header, empty card face) where the -100 tints are unreadable.
const TAG_CHIP_STYLES: Record<PromptVariation['tag'], string> = {
  DIALOGUE: 'bg-cyan-500/25 text-cyan-100 light:text-cyan-900 border-cyan-400/40',
  STATIC: 'bg-emerald-500/25 text-emerald-100 light:text-emerald-900 border-emerald-400/40',
  ACTION: 'bg-lime-500/25 text-lime-100 light:text-lime-900 border-lime-400/40',
  EMOTIONAL: 'bg-pink-500/25 text-pink-100 light:text-pink-900 border-pink-400/40',
  PRODUCT: 'bg-amber-500/25 text-amber-100 light:text-amber-900 border-amber-400/40',
  POV: 'bg-violet-500/25 text-violet-100 light:text-violet-900 border-violet-400/40',
  ENVIRONMENT: 'bg-teal-500/25 text-teal-100 light:text-teal-900 border-teal-400/40',
  TRANSITION: 'bg-sky-500/25 text-sky-100 light:text-sky-900 border-sky-400/40',
  PROOF: 'bg-orange-500/25 text-orange-100 light:text-orange-900 border-orange-400/40',
}
export function tagLabel(tag: PromptVariation['tag']): string {
  return TAG_LABELS[tag]
}
export function tagChipStyle(tag: PromptVariation['tag']): string {
  return TAG_CHIP_STYLES[tag]
}
