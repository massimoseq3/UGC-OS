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
  | 'pov'
  | 'day-in-life'
  | 'grwm'
  | 'tutorial'
  | 'whats-in-bag'
  | 'tiktok-made-me'

// 'script' → spoken words only (→ Voiceovers). 'scenes' → scene-by-scene
// visual blueprint with the dialogue embedded ([CHARACTER]/[PRODUCT] tokens,
// same format the Remix Scenes pipeline emits → B-Roll / Playground).
// 'prompt' → ONE structured cinematic master prompt for a single premium AI
// commercial (STYLE/ENVIRONMENT/CHARACTER/.../TIMELINE), with @INFLUENCER /
// @PRODUCT reference tokens → Playground video mode (Seedance-led).
export type WriteFormat = 'script' | 'scenes' | 'prompt'

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
  pov: { label: 'POV', hint: '"POV: you finally found the one"' },
  'day-in-life': { label: 'Day in My Life', hint: 'Routine vlog, product slots into the day' },
  grwm: { label: 'GRWM (Get Ready With Me)', hint: 'Talk to camera while you get ready' },
  tutorial: { label: 'How-To / Tutorial', hint: '"How I got X" — teach it in steps' },
  'whats-in-bag': { label: "What's In My Bag", hint: 'Roundup of faves, product as the standout' },
  'tiktok-made-me': { label: 'TikTok Made Me Buy It', hint: '"Okay I finally caved" — hype verdict' },
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
  // The product's display name — fed into the cinematic 'prompt' format so the
  // VOICEOVER sign-off can name the brand. Other formats keep the brand name
  // out of the spoken copy, so they ignore this.
  productName?: string
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
