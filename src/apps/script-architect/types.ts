// The pipeline discriminator. Persisted in scriptHistory rows and dispatched
// on by the service, so all three values stay — but the UI only exposes two
// modes ('remix' | 'write'); the remix source's format picks between the
// 'remix' and 'reverse-engineer' pipelines at generate time.
export type ScriptMode = 'write' | 'remix' | 'reverse-engineer'

// What the left-panel mode toggle actually offers.
export type ScriptUiMode = 'remix' | 'write'

// A scene blueprint (Ad Analyzer output / a Scenes bank item) is machine-
// written with rigid "--- Scene N: <label> (MM:SS-MM:SS) ---" headers, so the
// remix source's format is detectable: blueprint → scene-rewrite pipeline,
// plain text → 3 remixed script variations. Also matches the looser
// hand-written shape (a line starting "SCENE 1 —" / "Scene 2:") so pasted
// blueprints that skip the divider dashes still route correctly; a spoken
// transcript never opens a line with a numbered scene header.
export function detectSceneBlueprint(source: string): boolean {
  return /^(?:---\s*)?scene\s*\d+\s*[—:–-]/im.test(source)
}

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
}

// Guards persisted / handed-off style slugs: styles get trimmed over time
// (see #211), so a value read from localStorage or history may no longer be a
// live key. Callers coerce misses back to a default rather than dereferencing
// WRITE_STYLE_META[missing] and crashing.
export const isWriteStyle = (value: unknown): value is WriteStyle =>
  typeof value === 'string' && value in WRITE_STYLE_META

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
