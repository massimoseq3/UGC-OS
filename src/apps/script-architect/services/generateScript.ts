import type { GenerateScriptInput, GeneratedScript, RemixAngle, EditableProductContext } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { kieChatCompletions, type ChatMessage } from '../../../utils/kie'
import { getChatEndpointPath } from '../../../utils/models'

const REMIX_SYSTEM = `You are an elite UGC ad script writer with the specialized skill of "Structural Adaptation".

Your task is taking a winning ad script and rewriting it for a completely new product while rigorously maintaining the original script's pacing, hook style, psychological triggers, and call-to-action placement.

CRITICAL FORMATING RULES:
1. ONLY return the spoken dialogue.
2. Do NOT include any stage directions, timestamps, headers, bracketed text, or visual cues.
3. Do NOT use quotation marks around the text.
4. Do NOT include any introductions or conclusions (e.g., "Here is the script:").
5. Return plain text only. EACH SENTENCE MUST BE ON ITS OWN LINE (Single spaced sentence-by-sentence format).`

const REMIX_ANGLE_INSTRUCTION: Record<RemixAngle, string> = {
  'hook-led':
    'ANGLE: Lead with a punchy, pattern-interrupting hook line that stops the scroll. The first sentence must be provocative or surprising — never set up context first.',
  'pain-point-led':
    'ANGLE: Lead with the customer\'s pain point in vivid, specific terms. Make the viewer feel the problem viscerally before the product appears.',
  'curiosity-led':
    'ANGLE: Lead with a curiosity gap or counter-intuitive claim that makes the viewer need to know more. Withhold the punchline until later in the script.',
}

const REVERSE_ENGINEER_SYSTEM = `You are an elite UGC ad creative director. You take a comprehensive scene-by-scene blueprint of a winning ad — where the original character and the original product are described in full identifying detail — and you rewrite it so the SAME ad structure can be regenerated for a NEW product with a NEW character.

You will receive:
- A comprehensive reverse-engineered prompt for a winning UGC video ad, broken into one or more scenes (separated by "--- Scene N: <label> (MM:SS-MM:SS) ---" headers). Each scene fully describes the original character (age / gender / hair / wardrobe / etc.), the original product (label / container / colour / etc.), embedded original dialogue lines, plus setting / framing / camera / lighting / mood.
- The user's product context (description, target market, pain points, USPs, benefits, offer, CTA).

YOUR TASK — apply these four transformations to every scene:

1. CHARACTER SWAP. Find every visual description of the original character and replace it with the literal token [CHARACTER]. Strip ALL identity markers: gender presentation, ethnicity cues, age, body type, hair (length / colour / styling), wardrobe (every garment / accessory / nails / etc.). Keep emotional state, gaze direction, body language, hand position, gesture, micro-expression — those are scene direction, not identity. Example: "a woman in her late 20s with shoulder-length auburn hair, wearing an oversized cream cable-knit sweater, looking into a bathroom mirror with a soft surprised smile" → "[CHARACTER] looks into a bathroom mirror with a soft surprised smile".

2. PRODUCT SWAP. Find every visual description AND every spoken mention of the original product and replace with the literal token [PRODUCT]. Includes: brand name, wordmark, container shape, container colour, label, packaging, "the bottle / jar / pump / sleeve / etc." Replace with [PRODUCT] both in the visual description and inside any dialogue line. Example: "she holds a clear glass dropper bottle with a soft pink label reading 'NUDE PERFECT' close to the lens" → "she holds [PRODUCT] close to the lens".

3. DIALOGUE REWRITE. The original spoken lines (embedded in each scene as "She says: '...'" or similar) describe the original product. Rewrite them so they describe the user's product instead — pull from the user's pain points / benefits / USPs / CTA. Keep the same number of dialogue lines per scene and the same emotional beat / hook style. In the rewritten dialogue, ALWAYS refer to the product as [PRODUCT] — never use the user's brand name in the spoken text. Keep the speaker attribution format identical (e.g. "She says: '...'", "Voiceover: '...'").

4. PRESERVE STRUCTURE. Keep the exact scene count, scene order, timestamps, durations, scene labels, camera/framing cues, lighting cues, and the "--- Scene N: <label> (MM:SS-MM:SS) ---" headers. The only fields that change are: the character description (→ [CHARACTER]), the product description (→ [PRODUCT]), and the dialogue text (→ rewritten for the user's product, with [PRODUCT] inline). Light-touch adaptation of a shot's prop description is allowed ONLY when the user's product is fundamentally a different physical form than the original (e.g. dropper bottle → compact case), and only for that one prop reference — don't restructure the scene.

OUTPUT FORMAT — CRITICAL:
- Reproduce each "--- Scene N: <label> (MM:SS-MM:SS) ---" header EXACTLY as given.
- Below each header, write the rewritten scene prompt as one self-contained block — visual direction first, then the rewritten dialogue line(s) embedded inline using the same "She says: '[PRODUCT]…'" pattern as the input.
- Separate scenes with a blank line.
- Do NOT include any introduction, conclusion, commentary, or markdown code fences. Plain text only.
- Do NOT use the user's brand name anywhere. Always use [PRODUCT].
- Do NOT describe the new character's appearance anywhere. Always use [CHARACTER].`

function productContextLines(ctx?: EditableProductContext | null): string {
  if (!ctx) return ''
  const lines: string[] = []
  if (ctx.productDescription) lines.push(`- Product: ${ctx.productDescription}`)
  if (ctx.targetMarket) lines.push(`- Target Market: ${ctx.targetMarket}`)
  if (ctx.painPoints) lines.push(`- Pain Points: ${ctx.painPoints}`)
  if (ctx.usps) lines.push(`- USPs: ${ctx.usps}`)
  if (ctx.benefits) lines.push(`- Benefits: ${ctx.benefits}`)
  if (ctx.offer) lines.push(`- Offer: ${ctx.offer}`)
  if (ctx.cta) lines.push(`- Call-to-Action: ${ctx.cta}`)
  return lines.join('\n')
}

async function runRemix(input: GenerateScriptInput, angle: RemixAngle, apiKey: string, endpoint: string): Promise<string> {
  let prompt = ''

  if (input.winningTranscript) {
    prompt += `Here is a winning ad transcript to use as inspiration for structure, pacing, and tone:\n\n${input.winningTranscript}\n\n`
  }

  const ctxLines = productContextLines(input.productContext)
  if (ctxLines) {
    prompt += `Write a UGC ad script for the following product. Base it on the provided product details below:\n${ctxLines}\n\n`
  } else if (input.productId) {
    prompt += `Write a UGC ad script for this product. Use the product details provided in the context.\n\n`
  } else {
    prompt += `Write a UGC ad script.\n\n`
  }

  if (input.additionalContext) {
    prompt += `Additional context and instructions:\n${input.additionalContext}\n\n`
  }

  prompt += `${REMIX_ANGLE_INSTRUCTION[angle]}\n\nGenerate the full script now.`

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: REMIX_SYSTEM }] },
    { role: 'user', content: [{ type: 'text', text: prompt }] },
  ]

  return kieChatCompletions(apiKey, endpoint, messages)
}

async function runReverseEngineer(input: GenerateScriptInput, apiKey: string, endpoint: string): Promise<string> {
  let prompt = `Original reverse-engineered ad blueprint:\n\n${input.reversePrompt.trim()}\n\n`

  const ctxLines = productContextLines(input.productContext)
  if (ctxLines) {
    prompt += `Rewrite this blueprint for the following NEW product. Replace only the product/brand references and the [CHARACTER]'s dialogue/voiceover. Keep camera, framing, scene count, durations, and the [CHARACTER] token unchanged.\n\n${ctxLines}\n\n`
  } else if (input.productId) {
    prompt += `Rewrite this blueprint for a new product using the product details provided.\n\n`
  } else {
    prompt += `Rewrite this blueprint for a new product.\n\n`
  }

  if (input.additionalContext) {
    prompt += `Additional context and instructions:\n${input.additionalContext}\n\n`
  }

  prompt += `Generate the rewritten scene blueprint now, preserving the "--- Scene N ---" headers exactly.`

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: REVERSE_ENGINEER_SYSTEM }] },
    { role: 'user', content: [{ type: 'text', text: prompt }] },
  ]

  return kieChatCompletions(apiKey, endpoint, messages)
}

export async function generateScript(input: GenerateScriptInput): Promise<GeneratedScript> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()

  if (input.mode === 'reverse-engineer') {
    const text = await runReverseEngineer(input, apiKey, endpoint)
    return { variations: [text] }
  }

  const angles: RemixAngle[] = ['hook-led', 'pain-point-led', 'curiosity-led']
  const variations = await Promise.all(angles.map((angle) => runRemix(input, angle, apiKey, endpoint)))
  return { variations }
}
