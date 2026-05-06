import type { GenerateScriptInput, GeneratedScript } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { kieChatCompletions, type ChatMessage } from '../../../utils/kie'
import { getChatEndpointPath } from '../../../utils/models'

const SYSTEM_INSTRUCTION = `You are an elite UGC ad script writer with the specialized skill of "Structural Adaptation".

Your task is taking a winning ad script and rewriting it for a completely new product while rigorously maintaining the original script's pacing, hook style, psychological triggers, and call-to-action placement.

CRITICAL FORMATING RULES:
1. ONLY return the spoken dialogue.
2. Do NOT include any stage directions, timestamps, headers, bracketed text, or visual cues.
3. Do NOT use quotation marks around the text.
4. Do NOT include any introductions or conclusions (e.g., "Here is the script:").
5. Return plain text only. EACH SENTENCE MUST BE ON ITS OWN LINE (Single spaced sentence-by-sentence format).`

export async function generateScript(input: GenerateScriptInput): Promise<GeneratedScript> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()

  let prompt = ''

  if (input.winningTranscript) {
    prompt += `Here is a winning ad transcript to use as inspiration for structure, pacing, and tone:\n\n${input.winningTranscript}\n\n`
  }

  if (input.productContext) {
    prompt += `Write a UGC ad script for the following product. Base it on the provided product details below:\n`
    if (input.productContext.productDescription) prompt += `- Product: ${input.productContext.productDescription}\n`
    if (input.productContext.targetMarket) prompt += `- Target Market: ${input.productContext.targetMarket}\n`
    if (input.productContext.painPoints) prompt += `- Pain Points: ${input.productContext.painPoints}\n`
    if (input.productContext.usps) prompt += `- USPs: ${input.productContext.usps}\n`
    if (input.productContext.benefits) prompt += `- Benefits: ${input.productContext.benefits}\n`
    if (input.productContext.offer) prompt += `- Offer: ${input.productContext.offer}\n`
    if (input.productContext.cta) prompt += `- Call-to-Action: ${input.productContext.cta}\n\n`
  } else if (input.productId) {
    prompt += `Write a UGC ad script for this product. Use the product details provided in the context.\n\n`
  } else {
    prompt += `Write a UGC ad script.\n\n`
  }

  if (input.additionalContext) {
    prompt += `Additional context and instructions:\n${input.additionalContext}\n\n`
  }

  prompt += `Generate the full script now.`

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: SYSTEM_INSTRUCTION }] },
    { role: 'user', content: [{ type: 'text', text: prompt }] },
  ]

  const scriptText = await kieChatCompletions(apiKey, endpoint, messages)
  return { scriptText }
}
