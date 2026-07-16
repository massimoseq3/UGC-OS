// Deterministic iPhone-realism trailer for every B-Roll generation.
//
// The LLM system prompt already asks for the realism stack to be woven into
// the prose, but that's probabilistic — and users can hand-edit prompts.
// Appending here (at generation time, in startImageTask / startVideoTask)
// guarantees every image and video request ends with the stack without
// polluting the editable prompt text shown on the card.
export const IPHONE_REALISM_SUFFIX =
  'Modern iPhone camera quality, unedited photorealism, matching A-roll lighting, zero bokeh, zero depth of field, sharp focus across entire frame.'

// Generic deterministic trailer — the Video Style picker swaps in a
// different suffix per style (services/style.ts); UGC realism is the default.
export function withPromptSuffix(prompt: string, suffix: string): string {
  const trimmed = prompt.trim()
  if (!trimmed || !suffix) return trimmed
  // Don't double-append if the exact stack is already present (e.g. a retry
  // of a prompt that was persisted post-suffix).
  if (trimmed.toLowerCase().includes(suffix.toLowerCase())) return trimmed
  const sep = /[.!?]$/.test(trimmed) ? ' ' : '. '
  return `${trimmed}${sep}${suffix}`
}

export function withIphoneRealism(prompt: string): string {
  return withPromptSuffix(prompt, IPHONE_REALISM_SUFFIX)
}
