import { useSettingsStore } from '../../../stores/settingsStore'
import { kieChatCompletions, fileToDataUri, type ChatMessage } from '../../../utils/kie'
import { getChatEndpointPath } from '../../../utils/models'

export interface ProductExtraction {
  productName: string
  productDescription: string
  targetMarket: string
  painPoints: string
  usps: string
  benefits: string
  offer: string
  cta: string
}

const SYSTEM_INSTRUCTION = `You are a UGC ad copywriter filling out a product profile from a product photo. The user will paste your output straight into a form, so the copy must be ready-to-use, never explanatory.

You must respond with ONLY valid JSON matching this exact structure (no markdown, no code fences, no commentary before or after):

{
  "productName": "<short, exactly as it's sold; use [brand name] placeholder if not visible>",
  "productDescription": "<1-3 sentences. What it is and what it does.>",
  "targetMarket": "<1-2 sentences naming a specific audience. Push past 'everyone' — get an actual person.>",
  "painPoints": "<3-5 short lines, newline-separated. The frustration the customer feels BEFORE buying, from the customer's POV.>",
  "usps": "<3-5 short lines, newline-separated. What's unique about THIS product vs. alternatives. Features and differentiators, not feelings.>",
  "benefits": "<3-5 short lines, newline-separated. The outcome/transformation the customer GETS. The payoff of the USPs, in the customer's life.>",
  "offer": "<1-2 lines stating the commercial deal: price, bundle, discount, bonus, guarantee, shipping.>",
  "cta": "<one short imperative line, e.g. 'Shop now', 'Claim 20% off today'.>"
}

Field discipline — these overlap in ways that trip people up. Keep them distinct:
- Pain Points = the problem/frustration the customer feels BEFORE buying.
- USPs = "ours has X" — features and differentiators.
- Benefits = "so you get Y" — the outcome in the customer's life.
- Offer = the commercial deal (price/bundle/guarantee). NOT the same as the CTA.
- CTA = the single action you want them to take, as an imperative.

Look at the image carefully before writing. Infer: product category, materials/finish, form factor, likely use case, premium vs. budget positioning, and any text or branding visible on the packaging or device.

Tone matches positioning: a premium product gets elevated, confident, sensory language; a budget utility gets plain, practical language. Default to punchy UGC-friendly phrasing rather than corporate filler.

HONESTY RULE — this is non-negotiable. Do NOT invent specific claims you can't support from the image:
- No clinical percentages, "FDA approved", award names, certifications, or fake reviews.
- No specific prices unless visibly printed on packaging.
- No specific guarantees, bundles, or shipping terms.

When a strong claim or fact would help but you don't actually have it, write a bracketed placeholder the user will fill in, e.g.:
- "[insert your X-day money-back guarantee]"
- "[insert price]"
- "[confirm any clinical or dermatologist-endorsement claims before publishing]"

Output ONLY the JSON object. No preamble, no markdown fences, no trailing notes.`

export async function extractProductInfo(imageFile: File): Promise<ProductExtraction> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()

  const dataUri = await fileToDataUri(imageFile)

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: SYSTEM_INSTRUCTION }] },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract the product profile from this image. Return as JSON.' },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    },
  ]

  const responseText = await kieChatCompletions(apiKey, endpoint, messages, { timeoutMs: 180_000 })

  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned) as Partial<ProductExtraction>
    return {
      productName: parsed.productName ?? '',
      productDescription: parsed.productDescription ?? '',
      targetMarket: parsed.targetMarket ?? '',
      painPoints: parsed.painPoints ?? '',
      usps: parsed.usps ?? '',
      benefits: parsed.benefits ?? '',
      offer: parsed.offer ?? '',
      cta: parsed.cta ?? '',
    }
  } catch (err) {
    const tail = cleaned.slice(-400)
    throw new Error(`Failed to parse product extraction JSON: ${err instanceof Error ? err.message : String(err)} — response tail: ${tail}`)
  }
}
