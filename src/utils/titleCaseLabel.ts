// Title Case for a heading a model wrote, shared by Scripts' scene cards and
// the Ad Analyzer's. Scene headers arrive in capitals ("SCENE 1: STREET STOP &
// ROUTINE REALIZATION") and speaker cues in whatever case the prose used
// ("[INTERVIEWER]", "interviewer asks:"). Display only — the text itself keeps
// the model's casing, since the parsers find headers by it. A label already in
// mixed case is left as written.
const KEEP_CAPS = new Set(['CTA', 'POV', 'UGC', 'ASMR', 'GRWM', 'ECU', 'CU', 'MCU', 'OTS', 'VO', 'UI', 'TV', 'USP', 'DM', 'FAQ'])
const MINOR_WORDS = new Set(['a', 'an', 'and', 'or', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'vs', 'by'])
export function titleCaseLabel(label: string): string {
  if (label !== label.toUpperCase() && label !== label.toLowerCase()) return label
  let first = true
  return label.replace(/[A-Za-z0-9'’]+(?:[-/][A-Za-z0-9'’]+)*/g, (word) => {
    const isFirst = first
    first = false
    if (KEEP_CAPS.has(word.toUpperCase())) return word.toUpperCase()
    const lower = word.toLowerCase()
    if (!isFirst && MINOR_WORDS.has(lower)) return lower
    return lower.replace(/(^|[-/])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
  })
}
