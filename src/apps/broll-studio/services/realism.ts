// Deterministic iPhone-realism trailer for every B-Roll generation.
//
// The LLM system prompt already asks for the realism stack to be woven into
// the prose, but that's probabilistic — and users can hand-edit prompts.
// Appending here (at generation time, in startImageTask / startVideoTask)
// guarantees every image and video request ends with the stack without
// polluting the editable prompt text shown on the card.
export const IPHONE_REALISM_SUFFIX =
  'Modern iPhone camera quality, unedited photorealism, matching A-roll lighting, zero bokeh, zero depth of field, sharp focus across entire frame.'

// The CAMERA line of a structured prompt (SETTING / CAMERA / LIGHTING / ACTION
// / DIALOGUE / AUDIO). That field owns the quality register, so the stack lands
// there rather than after the final field.
const CAMERA_FIELD = /^CAMERA:.*$/m

function append(text: string): string {
  const sep = /[.!?]$/.test(text.trim()) ? ' ' : '. '
  return `${text.trim()}${sep}${IPHONE_REALISM_SUFFIX}`
}

export function withIphoneRealism(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return trimmed
  // Don't double-append if the exact stack is already present (e.g. a retry
  // of a prompt that was persisted post-suffix).
  if (trimmed.toLowerCase().includes(IPHONE_REALISM_SUFFIX.toLowerCase())) return trimmed
  // Structured prompts end on AUDIO, so appending to the whole string would file
  // "zero bokeh, sharp focus" under what the clip SOUNDS like. Put it in CAMERA,
  // the field that owns the quality register, and fall back to a plain trailing
  // sentence for unlabelled prompts (hand-written or pre-format sessions).
  if (CAMERA_FIELD.test(trimmed)) return trimmed.replace(CAMERA_FIELD, (line) => append(line))
  return append(trimmed)
}
