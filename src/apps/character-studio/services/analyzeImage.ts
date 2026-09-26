import { TABS, getTabFields, type VisualDNA } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { kieChatCompletions, fileToDataUri, type ChatMessage } from '../../../utils/kie'
import { CHAT_MODEL_DEFAULT, estimateCredits, getChatTarget } from '../../../utils/models'
import { makeVisionImage } from '../utils/thumbnail'

// kie's gateway buffers the SSE stream rather than forwarding it, so this bounds
// the WHOLE analysis, not time-to-first-token. This call was the last vision
// surface left on kieChatCompletions' 120s default while its siblings (product
// auto-fill, visual style) had long since moved to 180s — and a forensic read of
// ~30 fields off a multi-megabyte phone photo runs past two minutes often enough
// that members were seeing "the request was dropped" on a call kie had completed
// and billed. Raising the ceiling is half the fix; the downscale below is the
// other half, since the upload itself was inside the window.
const ANALYZE_TIMEOUT_MS = 180_000

// Chip vocabulary for the truly categorical form fields, pulled from the form
// config itself so the extractor's allowed values never drift from what the
// chips offer. Free-text fields (skin texture, hair style, clothing…) are
// deliberately NOT anchored — those want forensic description, not a preset.
const FIELD_CHIPS: Record<string, string[]> = Object.fromEntries(
  TABS.flatMap(getTabFields).map((f) => [f.key, f.chips]),
)
const oneOf = (key: string): string => FIELD_CHIPS[key]?.join(' / ') ?? ''

// The answer's shape and the per-field rules are SHARED with the Describe line
// (`describeCharacter` below), which fills the same form from a sentence
// instead of a photo. One copy is what makes a described character land in
// exactly the fields, the vocabulary and the level of detail an extracted one
// does — two hand-kept schemas drift the moment either gains a field.
const DNA_JSON_SHAPE = `You must respond with ONLY valid JSON matching this exact structure (no markdown, no code fences):

{
  "model": {
    "gender": "<gender>",
    "age": "<tight age range, e.g. 24-28>",
    "ethnicity": "<specific ethnicity or mix>",
    "bodyType": "<body type>",
    "skinTone": "<skin tone>",
    "skinTexture": "<forensic skin description>",
    "eyeColor": "<precise eye shade>",
    "eyeShape": "<eye shape>",
    "hairColor": "<exact hair shade>",
    "hairStyle": "<cut, length, part, how it falls>",
    "hairTexture": "<hair texture>",
    "facialFeatures": "<face geometry description>",
    "facialHair": "<facial hair or None>",
    "distinguishingMarks": "<marks with exact placement, or None>"
  },
  "style": {
    "clothingStyle": "<each visible garment, described exactly>",
    "accessories": "<each item with material and placement, or None>",
    "makeup": "<visible makeup, specifically>"
  },
  "pose": {
    "pose": "<body position, weight, hands>",
    "action": "<what they're doing>",
    "expression": "<precise expression — mouth, eyes, gaze>"
  },
  "location": {
    "location": "<the room or place>",
    "background": "<object-by-object description>",
    "lighting": "<source, direction, quality, color temperature>",
    "weather": "<weather or Indoor (N/A)>",
    "timeOfDay": "<time of day>"
  },
  "camera": {
    "shotType": "<shot type>",
    "cameraAngle": "<camera angle>",
    "cameraDevice": "<likely camera device>"
  }
}`

const DNA_FIELD_RULES = `MODEL
- gender: one of ${oneOf('gender')}.
- age: a tight range of about 4-5 years ("24-28"), not a decade.
- ethnicity: name the likely nationality or specific mix ("Colombian", "half Japanese, half British") — never just a broad bucket like "Asian" or "Caucasian" unless nothing more specific is plausible.
- bodyType: closest of ${oneOf('bodyType')}.
- skinTone: closest of ${oneOf('skinTone')} — add an undertone qualifier when visible ("Golden, warm undertone").
- skinTexture: forensic detail — pore visibility, freckles (where and how dense), T-zone shine, blemishes, under-eye texture, fine lines, peach fuzz. This field is what makes the render read as a real photo; never answer just "smooth" or "clear".
- eyeColor: the precise shade ("dark chocolate brown", "gray-blue with a darker limbal ring"), not just the color family.
- eyeShape: closest of ${oneOf('eyeShape')} — read the eye before you label it. Check three things: the crease (clearly visible / partly hidden under the upper lid / absent), the corner tilt (outer corner sitting above, level with, or below the inner corner), and how the eye sits in the socket (set deep, or wide apart). Name the option those observations point to. "Almond" is the safe generic answer and is the one to distrust — choose it only when the crease is clearly visible, the corners sit level, and the shape tapers to a point at both ends. If a hooded lid, a monolid, or a corner tilt is visible, that option wins over Almond.
- hairColor: exact shade including roots, highlights, or dimension ("ash blonde with darker roots and face-framing money pieces").
- hairStyle: the cut, a length landmark (chin / shoulder / collarbone / mid-back), the part (middle / left / right), and how it falls (tucked behind ears, over one shoulder, curtain bangs) — plus flyaways or baby hairs if visible.
- hairTexture: closest of ${oneOf('hairTexture')}.
- facialFeatures: face geometry in 2-4 short phrases — face shape (oval / round / square / heart / oblong), eyebrow shape and thickness, nose bridge and tip, lip fullness and shape, cheekbones, jawline, chin.
- facialHair: closest of ${oneOf('facialHair')} — if a beard, add length and grooming ("Short beard, ~1cm, neatly edged").
- distinguishingMarks: each mark with exact placement ("small beauty mark below the left corner of the mouth", "faint scar through the right eyebrow"), or "None".

STYLE
- clothingStyle: describe the actual garments, never a vibe label. For each visible piece: color, fabric or knit, fit, neckline, sleeve length, notable details. "Oversized cream cable-knit sweater, relaxed crew neck, sleeves pushed to the elbows" — not "cozy casual".
- accessories: every item with material, size, and placement ("thin gold chain necklace with a small round pendant; small gold hoop earrings; Apple Watch with white band, left wrist"), or "None".
- makeup: what is actually visible ("natural makeup — filled brows, subtle bronzer, glossy nude lip"), or "No makeup".

POSE
- pose: body position including weight distribution and what the hands are doing.
- action: what they are doing in the frame.
- expression: precise — mouth (open / closed, smile type), eyes, and gaze direction ("soft closed-mouth smile, relaxed eyes looking directly into the lens").

LOCATION
- location: the specific room or place.
- background: object by object with colors and placement, near to far ("white paneled wall, tall fiddle-leaf fig in a woven basket to the left, framed line-art print upper right, soft daylight from a window off-frame right").
- lighting: source, direction, quality (soft / hard), color temperature (warm / neutral / cool), and where highlights and shadows fall on the face.
- weather: closest of ${oneOf('weather')}.
- timeOfDay: closest of ${oneOf('timeOfDay')}.

CAMERA
- shotType: closest of ${oneOf('shotType')}.
- cameraAngle: closest of ${oneOf('cameraAngle')}.
- cameraDevice: the likely device ("iPhone front camera", "mirrorless with a 50mm lens").`

const SYSTEM_INSTRUCTION = `You are a forensic visual analyst for UGC ad production. You study a reference photo of a person and produce a description so precise that an artist who has never seen the photo could recreate a near-identical look from your words alone. Broad category labels are useless to you — every answer names specifics you can actually see: exact shades, lengths, shapes, materials, and placements.

${DNA_JSON_SHAPE}

Field rules — follow these exactly:

${DNA_FIELD_RULES}

Describe only what is visible. When something is hidden (eyes behind sunglasses, hair under a cap), give your single best assessment without hedging words. Every field must have a value.`

const EXTRACT_PROMPT = `Extract the complete visual DNA from this photo with forensic precision — exact shades, lengths, shapes, materials, and placements for the person's appearance, garments, pose, setting, and camera. Return as JSON.`

export async function analyzeImage(imageFile: File): Promise<VisualDNA> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatTarget()

  // Re-encoded small enough to upload quickly; the original only if that fails.
  const dataUri = (await makeVisionImage(imageFile)) ?? (await fileToDataUri(imageFile))

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: SYSTEM_INSTRUCTION }] },
    {
      role: 'user',
      content: [
        { type: 'text', text: EXTRACT_PROMPT },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    },
  ]

  const responseText = await kieChatCompletions(apiKey, endpoint, messages, {
    timeoutMs: ANALYZE_TIMEOUT_MS,
  })
  return parseDnaJson(responseText, 'DNA extraction')
}

// The model is asked for pure JSON, but occasionally wraps it in a sentence
// ("Here is the analysis: {...}"). Parse directly first, then fall back to the
// outermost { … } slice so a bit of surrounding prose doesn't drop the whole
// answer and leave the member's photo — or description — doing nothing.
function parseDnaJson(responseText: string, what: string): VisualDNA {
  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(cleaned) as VisualDNA
  } catch {
    const first = cleaned.indexOf('{')
    const last = cleaned.lastIndexOf('}')
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1)) as VisualDNA
      } catch { /* fall through to the descriptive throw below */ }
    }
    throw new Error(`Bad JSON from ${what} model — body: ${cleaned.slice(0, 400)}`)
  }
}

// ── Describe Them ──────────────────────────────────────────────────────────
//
// The same form, filled from one line of text ("28-year-old Latina skincare
// girl, messy bun, bathroom mirror") rather than a photo. It answers in the DNA
// shape above, under the DNA field rules, and goes through the same
// `flattenDna` → `profileFromFlat` sanitiser, so a described character lands in
// exactly the fields an extracted one does. What differs is the job: nothing
// is visible, so everything the line leaves open is DECIDED — one concrete,
// photographable answer per field — rather than read.
const DESCRIBE_INSTRUCTION = `You are a casting director and stylist for UGC ad production. A creator gives you one short line about the person they want on camera. You turn it into a complete character — so specific that an artist could render a photo of this exact person from your words alone.

Everything the line says is binding: never contradict it, never soften it. Everything it leaves open, you decide — one concrete answer per field that fits the rest of the character and the kind of ad the line implies. Never hedge, never offer alternatives, never leave a field generic because the line didn't mention it.

${DNA_JSON_SHAPE}

Field rules — follow these exactly. They were written for reading a photo; here there is no photo, so wherever a rule says to read, see or describe what is visible, decide it instead, at the level of detail a real photo of this person would show:

${DNA_FIELD_RULES}

Every field must have a value.`

// Text in, text out — well inside kie's default window, unlike the vision read.
const DESCRIBE_TIMEOUT_MS = 90_000

export async function describeCharacter(description: string): Promise<VisualDNA> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  // The default chat role, exactly as the photo read uses — the two fill the
  // same form, so they are written by the same model.
  const endpoint = getChatTarget()

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: DESCRIBE_INSTRUCTION }] },
    {
      role: 'user',
      content: [{ type: 'text', text: `The creator's line:\n\n"""\n${description.trim()}\n"""\n\nBuild the complete character now. Return as JSON.` }],
    },
  ]

  const responseText = await kieChatCompletions(apiKey, endpoint, messages, {
    timeoutMs: DESCRIBE_TIMEOUT_MS,
  })
  return parseDnaJson(responseText, 'Describe')
}

// ── Cost ───────────────────────────────────────────────────────────────────
//
// What one photo read costs, shown where the member starts one. The call is
// billed per 1k tokens, so there is no exact figure before the model answers:
// this is deliberately rough and rounded UP, the same posture as B-Roll's
// prompt-cost pill — it exists so a paid call is never started unpriced. The
// three constants are measured, not derived; re-measure if the prompt or the
// downscale changes materially.
const CHARS_PER_TOKEN = 4
// One downscaled photo (`makeVisionImage`) in the vision model's tiles.
const IMAGE_TOKENS = 1100
// ~30 fields of forensic JSON.
const OUTPUT_TOKENS = 1000

export function estimateDnaCredits(): number | null {
  const inputTokens = Math.ceil((SYSTEM_INSTRUCTION.length + EXTRACT_PROMPT.length) / CHARS_PER_TOKEN) + IMAGE_TOKENS
  return estimateCredits(CHAT_MODEL_DEFAULT, { tokenCount: inputTokens + OUTPUT_TOKENS })
}

// The Describe line's twin: the same answer, no photo in, a line of text.
export function estimateDescribeCredits(): number | null {
  const inputTokens = Math.ceil(DESCRIBE_INSTRUCTION.length / CHARS_PER_TOKEN) + 100
  return estimateCredits(CHAT_MODEL_DEFAULT, { tokenCount: inputTokens + OUTPUT_TOKENS })
}
