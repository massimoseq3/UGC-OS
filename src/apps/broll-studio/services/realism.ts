// Deterministic iPhone-realism trailer for every B-Roll generation.
//
// The LLM system prompt already asks for the realism stack to be woven into
// the prose, but that's probabilistic — and users can hand-edit prompts.
// Appending here (at generation time, in startImageTask / startVideoTask)
// guarantees every image and video request ends with the stack without
// polluting the editable prompt text shown on the card.
export const IPHONE_REALISM_SUFFIX =
  'Modern iPhone camera quality, unedited photorealism, matching A-roll lighting, zero bokeh, zero depth of field, sharp focus across entire frame.'

export function withIphoneRealism(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return trimmed
  // Don't double-append if the exact stack is already present (e.g. a retry
  // of a prompt that was persisted post-suffix).
  if (trimmed.toLowerCase().includes(IPHONE_REALISM_SUFFIX.toLowerCase())) return trimmed
  const sep = /[.!?]$/.test(trimmed) ? ' ' : '. '
  return `${trimmed}${sep}${IPHONE_REALISM_SUFFIX}`
}
