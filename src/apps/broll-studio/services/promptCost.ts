// Credit estimate for the three "write me prompts" LLM calls behind B-Roll's
// Generate button (Line-by-Line, One-Shot, Continuous).
//
// These are chat completions, billed per 1k tokens rather than per call, so
// there is no exact number to show before the model answers. The estimate below
// is deliberately rough and rounded UP: it exists so the button never fires an
// unpriced call, not to be an invoice. All three land under a credit or two —
// which is the honest, useful signal (prompt writing is cheap; the image and
// video generations that follow are where the credits actually go).

import type { BrollMode } from '../types'
import { estimateCredits, getDefaultModel } from '../../../utils/models'
import { MAX_SEGMENTS } from './generateOneShot'
import { CONCEPTS_PER_FRAME } from './generateContinuous'

// Rough chars-per-token for English prose.
const CHARS_PER_TOKEN = 4

// Measured input overhead of each mode's system prompt, in tokens, rounded up
// to the nearest 500. Re-measure if a system prompt changes materially — being
// out by a few hundred tokens moves the estimate by hundredths of a credit.
const SYSTEM_TOKENS: Record<BrollMode, number> = {
  line: 5000,
  oneshot: 3000,
  continuous: 4000,
}

// Typical output size of one unit of work, in tokens.
const TOKENS_PER_VARIATION = 130   // one b-roll prompt paragraph
const TOKENS_PER_CONCEPT = 150     // one keyframe prompt paragraph
const TOKENS_PER_MOTION = 90       // one motion prompt paragraph
const TOKENS_PER_CLIP = 900        // one One-Shot scene blueprint
const TOKENS_PER_STYLE_BLOCK = 200

// Sentence count is how every mode segments a script, so it drives all three
// output estimates. Floors at 1 so an unpunctuated script still costs something.
function sentenceCount(scriptText: string): number {
  const sentences = scriptText.trim().split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0)
  return Math.max(1, sentences.length)
}

// Estimated credits for the prompt-writing call(s) behind a mode's Generate
// button. Null when the chat model has no pricing entry (never in practice).
export function estimatePromptCredits(mode: BrollMode, scriptText: string): number | null {
  const chatModelId = getDefaultModel('broll-studio', 'chat')?.id
  if (!chatModelId) return null
  const scriptTokens = Math.ceil(scriptText.length / CHARS_PER_TOKEN)
  const scenes = sentenceCount(scriptText)

  let inputTokens: number
  let outputTokens: number

  switch (mode) {
    case 'line':
      // One call: every scene gets 4 variations.
      inputTokens = SYSTEM_TOKENS.line + scriptTokens
      outputTokens = scenes * 4 * TOKENS_PER_VARIATION
      break
    case 'oneshot': {
      // Four parallel calls, each writing the whole ad as 1-MAX_SEGMENTS clips.
      const clips = Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(scenes / 3)))
      inputTokens = (SYSTEM_TOKENS.oneshot + scriptTokens) * 4
      outputTokens = 4 * clips * TOKENS_PER_CLIP
      break
    }
    case 'continuous':
      // One call: N+1 frames × concepts, plus a motion block per scene.
      inputTokens = SYSTEM_TOKENS.continuous + scriptTokens
      outputTokens =
        TOKENS_PER_STYLE_BLOCK +
        (scenes + 1) * CONCEPTS_PER_FRAME * TOKENS_PER_CONCEPT +
        scenes * TOKENS_PER_MOTION
      break
  }

  return estimateCredits(chatModelId, { tokenCount: inputTokens + outputTokens })
}
