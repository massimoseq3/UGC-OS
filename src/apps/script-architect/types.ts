export type ScriptMode = 'write' | 'remix' | 'reverse-engineer'

export type RemixAngle = 'hook-led' | 'pain-point-led' | 'curiosity-led'

// ── Write New (from-scratch) mode ──
export type WriteStyle =
  | 'pas'
  | 'story'
  | 'listicle'
  | 'callout'
  | 'curiosity'
  | 'before-after'
  | 'demo'
  | 'comparison'

// 'script' → spoken words only (→ Voiceovers). 'scenes' → scene-by-scene
// visual blueprint with the dialogue embedded ([CHARACTER]/[PRODUCT] tokens,
// same format the Remix Scenes pipeline emits → B-Roll / Playground).
export type WriteFormat = 'script' | 'scenes'

export type WriteLength = 10 | 15 | 30 | 60
export const WRITE_LENGTHS: WriteLength[] = [10, 15, 30, 60]

export const WRITE_STYLE_META: Record<WriteStyle, { label: string; hint: string }> = {
  pas: { label: 'Problem–Agitate–Solution', hint: 'Name the pain, twist it, product as relief' },
  story: { label: 'Story / Testimonial', hint: '"I almost returned this..." storytime' },
  listicle: { label: '3 Reasons', hint: 'Fast numbered list, strongest reason last' },
  callout: { label: 'Negative / Callout', hint: '"Stop buying X" pattern interrupt' },
  curiosity: { label: 'Curiosity Hook', hint: '"Why is nobody talking about this"' },
  'before-after': { label: 'Before & After', hint: 'Transformation with a real timeframe' },
  demo: { label: 'Unboxing / Demo', hint: 'First-impressions reaction energy' },
  comparison: { label: 'Us vs Them', hint: 'The usual stuff vs this one' },
}

export interface EditableProductContext {
  productDescription: string
  targetMarket: string
  painPoints: string
  usps: string
  benefits: string
  offer: string
  cta: string
}

export interface GenerateScriptInput {
  mode: ScriptMode
  winningTranscript: string
  reversePrompt: string
  // Write New mode inputs
  brief: string
  writeStyle?: WriteStyle
  writeFormat?: WriteFormat
  writeLength?: WriteLength
  productId: string | null
  productContext?: EditableProductContext | null
  additionalContext: string
}

export interface GeneratedScript {
  variations: string[]
}

export const REMIX_ANGLE_LABEL: Record<RemixAngle, string> = {
  'hook-led': 'Hook-led',
  'pain-point-led': 'Pain-point-led',
  'curiosity-led': 'Curiosity-led',
}
