// Deterministic voice trailer for B-Roll DIALOGUE video generations.
//
// Same philosophy as realism.ts: the thing that must be identical across
// every take is appended at request time, not woven in by the LLM. Every
// DIALOGUE card in a session gets the exact same voice directive, so
// audio-capable models (Gemini Omni, Veo, Seedance) render the character
// with one consistent voice even when clips are generated in separate
// takes days apart. The editable prompt shown on the card stays clean.

// Quick-pick accents surfaced as chips in the left input panel. The free-text
// notes field covers anything not listed (regional accents, pitch, age, pace).
export const VOICE_ACCENTS = [
  'American',
  'British',
  'Australian',
  'Canadian',
  'Irish',
  'Indian',
] as const

// Compose the session-wide voice directive from the two left-panel fields.
// Returns null when both are empty — no directive is appended at all.
export function buildVoiceDirective(accent: string, notes: string): string | null {
  const a = accent.trim()
  const n = notes.trim()
  if (!a && !n) return null
  const desc = [n, a ? `${a} accent` : ''].filter(Boolean).join(', ')
  return `VOICE — ${desc}. The character's speaking voice matches this description exactly, and stays identical in every clip: same tone, same pitch, same accent, same pacing, so separate takes cut together seamlessly.`
}

// Append the directive to a dialogue prompt at request time. Mirrors
// withIphoneRealism: skip when already present (persisted retries), keep
// sentence punctuation tidy.
export function withDialogueVoice(prompt: string, directive: string | null | undefined): string {
  const trimmed = prompt.trim()
  if (!trimmed || !directive) return trimmed
  if (trimmed.toLowerCase().includes(directive.toLowerCase())) return trimmed
  const sep = /[.!?]$/.test(trimmed) ? ' ' : '. '
  return `${trimmed}${sep}${directive}`
}
