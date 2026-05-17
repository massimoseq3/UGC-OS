export type ScriptMode = 'remix' | 'reverse-engineer'

export type RemixAngle = 'hook-led' | 'pain-point-led' | 'curiosity-led'

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
