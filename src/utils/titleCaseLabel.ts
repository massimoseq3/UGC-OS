// Title Case for a heading a model wrote, shared by Scripts' scene cards and
// the Ad Analyzer's. Scene headers arrive in capitals ("SCENE 1: STREET STOP &
// ROUTINE REALIZATION") and speaker cues in whatever case the prose used
// ("[INTERVIEWER]", "interviewer asks:"). Display only — the text itself keeps
// the model's casing, since the parsers find headers by it. A label already in
// mixed case is left as written.
const KEEP_CAPS = new Set(['CTA', 'POV', 'UGC', 'ASMR', 'GRWM', 'ECU', 'CU', 'MCU', 'OTS', 'VO', 'UI', 'TV', 'USP', 'DM', 'FAQ'])
const MINOR_WORDS = new Set(['a', 'an', 'and', 'or', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'vs', 'by'])
// The canonical header, "--- Scene 1: THE HOOK (00:00-00:04) ---", writes its
// own prefix in Title Case and only the label in capitals — so the mixed-case
// test has to read what FOLLOWS the prefix, or that shape (the one Scripts'
// prompts ask for) was left half in capitals.
const SCENE_PREFIX = /^scene\s*\d+\s*[—:–-]\s*/i
export function titleCaseLabel(label: string): string {
  const body = label.replace(SCENE_PREFIX, '')
  if (body !== body.toUpperCase() && body !== body.toLowerCase()) return label
  let first = true
  let prevEnd = 0
  return label.replace(/[A-Za-z0-9'’]+(?:[-/][A-Za-z0-9'’]+)*/g, (word, at: number) => {
    // A colon or a dash opens a new phrase, so its first word is capitalised
    // too: "Scene 1: The Hook", never "Scene 1: the Hook".
    const isFirst = first || /[:—–-]/.test(label.slice(prevEnd, at))
    first = false
    prevEnd = at + word.length
    if (KEEP_CAPS.has(word.toUpperCase())) return word.toUpperCase()
    const lower = word.toLowerCase()
    if (!isFirst && MINOR_WORDS.has(lower)) return lower
    return lower.replace(/(^|[-/])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
  })
}
