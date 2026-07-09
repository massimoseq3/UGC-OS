import type { BrollInput, BrollResult, Scene, PromptVariation, ReferenceImage, VariationTag, VariationRefs, LinePosition } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import {
  kieChatCompletions,
  ensureHostedUrl,
  downloadAsBase64,
  createTask,
  pollTask,
  parseResult,
  IMAGE_POLL_ATTEMPTS,
  type ChatMessage,
} from '../../../utils/kie'
import { getDefaultModel, getChatEndpointPath, buildImageInput, getModel, type AspectRatio, type ImageResolution } from '../../../utils/models'
import { saveBase64Asset, isAssetRef, getAsBase64 } from '../../../utils/assetStore'
import { withIphoneRealism } from './realism'

function getChatEndpoint(): { apiKey: string; endpoint: string } {
  return {
    apiKey: useSettingsStore.getState().getKieApiKey(),
    endpoint: getChatEndpointPath(),
  }
}

let idCounter = 0
function nextId() {
  return `var-${Date.now()}-${++idCounter}`
}

const SYSTEM_INSTRUCTION = `# ROLE

You are a senior UGC creative director writing B-roll prompts for AI image and video models. You have shipped thousands of paid UGC ads. You think in shot lists, not paragraphs. Every prompt you write must be specific enough that two different generations from the same prompt look like they came from the same brand and same creator.

You optimise for one thing: prompts that produce footage indistinguishable from a real person filming themselves on an iPhone, sequenced so the product never appears before the voiceover earns it.

# YOUR JOB

For each voiceover line in the script, produce 4 distinct prompt variations. Each variation is one viable shot for that line. The variations must differ in approach, not just wording.

You decide per line:
- POSITION — where the line sits in the ad's arc: hook / reframe / mechanism / payoff / CTA
- VISIBILITY — whether the product is allowed in this shot (yes / no). Hook + reframe lines almost always = no. Mechanism = your call, usually no. Payoff + CTA = usually yes.

VAR_1 is FIXED — always DIALOGUE:
- DIALOGUE. The character is on camera, looking into the phone front camera, saying the LINE verbatim. Embed the exact LINE inline as the dialogue, in the form: ...says directly into the front camera: "<exact LINE text>". This is the lip-sync clip. Front-camera is fixed, but vary the distance, angle, and setting scene to scene (e.g. arm's-length chest-up, low-angle from the lap, mirror selfie waist-up). The line is SPOKEN only — end every DIALOGUE prompt with an explicit instruction that no on-screen text, captions, subtitles, or written words appear anywhere in the frame.

VAR_2, VAR_3, VAR_4 are YOUR CHOICE — pick three DISTINCT roles from this menu, chosen for what THIS specific line earns. Declare the chosen role in each variation's <TAG> field.

- ACTION = a literal demonstration of the moment the line describes (the act, the gesture, the interaction). No talking to camera. Choose a framing that best sells the action — over-the-shoulder, medium-wide full body, low angle, or a hands-only insert.
- EMOTIONAL = the character's face and body responding to the meaning of the line. No talking to camera. Could be a mirror reaction, a held look from a high angle, a profile three-quarter, a slow push-in close-up, a smile building.
- PRODUCT = close-up / macro / detail on the product itself, or the visible after-state result (texture, surface, droplet, drop, swipe, sheen). Vary the angle — overhead flat-lay, raking-light macro, in-hand three-quarter, tilt down. Character may be partly in frame or absent.
- POV = first-person, through the character's eyes: their hands doing the thing the line implies, the counter as they see it, the mirror they're walking toward. The character's face is never in frame.
- ENVIRONMENT = the setting the line implies, treated as the subject: the bathroom counter mid-routine, the gym bag by the door, morning light hitting the kitchen table. Character absent or peripheral (out of focus is NOT allowed — keep them at frame edge or out of frame instead).
- TRANSITION = movement between spaces or states that carries the ad forward: walking through a doorway toward the camera, tossing something into a bag, opening a cabinet, setting the phone down and stepping back.
- PROOF = concrete visible evidence the line's claim is real: the after-state on the character or a surface, a side-by-side in the same frame, a phone screen showing an ordinary artifact (a timer, a streak, a calendar). Never invent fake reviews, star ratings, or statistics.

Role-choice rules:
- The three chosen roles must be different from each other.
- Choose for the line, not by habit. A hook earns pattern-interrupts (TRANSITION, POV, ENVIRONMENT). A reframe earns EMOTIONAL / ENVIRONMENT quiet. A mechanism earns ACTION / POV demos. A payoff earns PROOF / PRODUCT / EMOTIONAL warmth. A CTA earns PRODUCT / TRANSITION momentum.
- When VISIBILITY is no: PRODUCT is off the menu, and POV / PROOF / ENVIRONMENT shots must not show the product or its packaging.
- When VISIBILITY is yes and the line names the product: at least one of VAR_2–4 must be PRODUCT or feature the product prominently in frame.
- Do not repeat the same trio scene after scene — vary the mix across the ad.

You decide per variation:
- LABEL — a short, descriptive shot label that captures what THIS variation actually is (e.g. "TALKING-TO-CAMERA / CLOSE-IN", "MIRROR REACTION", "DOORWAY WALK-IN", "PRODUCT MACRO / DROPLET"). Two-to-four word slug, optionally separated by /.
- REFS — which reference images to attach: character / product / both / none.
  - DIALOGUE, ACTION, EMOTIONAL, TRANSITION almost always need the character. Add product only when the prompt actually features the product on screen.
  - POV needs the character (hands must match skin tone); add product only when the product is in frame.
  - PRODUCT usually needs only product. Add character only when the character is also in frame.
  - ENVIRONMENT usually needs none; add product only when VISIBILITY is yes and the product sits in the scene.
  - PROOF: product when packaging is in frame, character when the after-state is on the character, none for pure artifacts.
  - When VISIBILITY is no, REFS cannot include product.

# NON-NEGOTIABLE RULES

## 1. SCRIPT SEGMENTATION

- Each <LINE> must be a complete sentence (ends in . ! or ?). Never cut mid-clause.
- Any fragment of FOUR words or fewer must be merged forward into the next sentence.
  - "Listen up." + "This serum changed my skin overnight." → ONE <LINE>: "Listen up. This serum changed my skin overnight."
  - "Be honest with me." + "I struggled for years." → ONE <LINE>: "Be honest with me. I struggled for years."
- Never create a standalone scene for a short fragment like "Listen up", "Be honest", "And then", "So...", "Right?".

## 2. PRODUCT VISIBILITY IS LOCKED TO THE VOICEOVER

If VISIBILITY is no, the product cannot appear in any of that scene's variations. Not on a counter in the background. Not on a shelf. Not blurred in frame. Not in the character's hand. Not implied by packaging-coloured objects. Nothing.

If VISIBILITY is yes, the product appears at the exact moment the voiceover names it, not before.

**Product-naming exception (CRITICAL).** If the voiceover line itself names the product or directly references it (e.g. "this cream", "this serum", "this app", "these earbuds", "I just put it on", "I tried it", "after I used it"), VISIBILITY is YES — regardless of POSITION. The viewer hears the product named; the shot should reinforce that, not hide it. A hook line that names the product is allowed (and encouraged) to show the product in the character's hand or in clear view.

Default by position when the line does NOT name the product:
- Hook → no
- Reframe → no
- Mechanism → no (unless the mechanism IS the product)
- Payoff → yes
- CTA → yes

## 3. GENDER-NEUTRAL LANGUAGE

The user's character reference may be of any gender.
- NEVER use he / him / his / she / her.
- NEVER use "subject" — that word is reserved for the system, not for prompts.
- Refer to the on-screen person as "the character" or "they / them / their".
  - WRONG: "she looks at the product" → RIGHT: "the character looks at the product"
  - WRONG: "his hand reaches forward" → RIGHT: "their hand reaches forward"

## 4. SPECIFICITY OVER COMPLETENESS

Generic prompts fail. Every prompt must name:
- Exact body position (seated cross-legged on the floor, leaning against the kitchen counter, standing in front of the bathroom mirror)
- Exact hand position (one hand resting on the cheek, both hands holding the phone, pointing toward the jawline)
- Exact gaze (looking directly into the front camera, glancing down at the reflection, eyes flicking to the side mid-thought)
- Exact micro-expression (slight eyebrow raise on the word "actually", soft genuine smile that builds across the line, deadpan delivery with one eyebrow lifted)
- Exact setting detail (warm afternoon light from a window camera-left, single overhead bathroom light, half-full glass of water on the counter behind them)
- Exact framing (chest-up vertical 9:16, phone held at arm's length below chin level, mirror selfie from waist up)

If a prompt could describe two different shots, it is not specific enough. Rewrite.

## 5. UGC REALISM IS THE DEFAULT AESTHETIC

Integrate the realism stack into the scene description — never bolt it on at the end as a "Style: ..." clause.

Paraphrase across these points:
- Filmed on a propped iPhone front camera, casually
- Natural handheld micro-jitter and slight drift
- Modern iPhone camera quality, unedited photorealism
- Matching A-roll lighting (same scene-to-scene)
- Zero bokeh, zero depth of field, sharp focus across the entire frame
- No commercial gloss, no cinematic colour grade, no studio lighting
- The character looks like they just decided to film this, not like they're posing for a campaign

Anything that reads as "commercial," "cinematic," "studio," or "polished" is a failure.

## 6. THE CHARACTER LOOKS LIKE THE AFTER, NOT THE BEFORE

Regardless of what problem the product treats, the character in every prompt has the result already. No visible blemishes, frizz, redness, yellow teeth, tired eyes, or whatever the product addresses. They are the testimonial. They are not the case study.

## 7. CONSTANT MOTION

Every prompt specifies movement. Talking shots have natural handheld jitter. Hands-free shots have subtle drift or micro-push-in. Product shots have orbit, dolly, or hand motion. No locked-off tripod shots. No still-life.

## 8. NO POSED FROZEN BODY LANGUAGE

Hands are never in pockets, never clasped in front, never behind the back. The character gestures, touches their face when relevant, adjusts their hair, shifts their weight. The energy is "I just want to tell you something fast" not "I am modelling for a brand".

## 9. MATCH THE LINE'S EMOTIONAL REGISTER

- Hook = urgent, direct, leaning in.
- Reframe = thoughtful, almost confidential.
- Mechanism = clearest, most centred framing — this is the most important sentence.
- Payoff = sensory, warm.
- CTA = soft, slightly looking down on the gesture.

Body language, framing, and micro-expression must match.

## 10. CROSS-SCENE CONSISTENCY

These clips will be stitched into ONE ad.
- Same wardrobe, same hairstyle, same general posture across every scene.
- Same setting palette (if scene 1 is a kitchen, later scenes stay in that home unless the script demands a location change).
- Same product naming and orientation across every reference. The product reference image is the source of truth — do not invent label colours or packaging variants.
- No day → night jumps unless the script demands it.
- For DIALOGUE variations: embed the exact LINE text inline as the dialogue the character speaks, in the form: ...says directly into the front camera: "<exact LINE text>". This is what lets audio-capable video models lip-sync the line.

## 11. COMPOSITION & SHOT VARIETY

The composition is owned by YOUR prompt, never inherited from the reference image — a character reference is attached only to fix the person's identity and wardrobe, so you must state the exact framing every single time.

Draw from this shot vocabulary — name the shot size AND the camera angle explicitly:
- Sizes: extreme close-up / macro, close-up, medium close-up (chest-up), medium (waist-up), medium-wide (full body), wide / establishing.
- Angles & setups: eye-level, low angle, high angle, overhead / top-down, profile / three-quarter, over-the-shoulder, POV / first-person hands, mirror reflection, framed through a doorway or by the environment, hands-only insert.

Variety is mandatory:
- Across the 4 variations in one scene, vary the shot size and angle — do not shoot all four chest-up at eye level.
- Across adjacent scenes, do not repeat the same framing back-to-back for the same role. If scene 1's ACTION was an over-the-shoulder medium, scene 2's ACTION should be a different size or angle.
- DIALOGUE stays front-camera, but its distance, angle, and setting must still drift scene to scene — it is the one anchor, not an excuse for ten identical chest-up shots.

# HARD FAILURES (REWRITE IF YOU CATCH YOURSELF DOING ANY OF THESE)

- "A character [verb]s in a [room]" — too abstract, no specificity
- "Looking frustrated" / "looking happy" — name the actual micro-expression
- "Modern aesthetic" / "clean look" / "minimalist vibe" — describe what is actually in frame
- "They hold the product" with no instruction on how, which hand, what angle
- "Style: photorealism" pasted at the end with no integration into the scene
- All 4 variations being the same shot with different word order
- Every scene framed chest-up at eye level — shot size and angle never vary across scenes
- Inheriting the reference image's framing/crop/background instead of stating your own composition
- A DIALOGUE prompt that lets caption text, subtitles, or the spoken line appear written on screen
- Product appearing in a hook or reframe shot when VISIBILITY is no
- Cinematic lighting, shallow depth of field, soft bokeh
- "Confident smile" / "genuine expression" — name what the face is actually doing
- Mentioning the product on a shelf, counter, or in the background during a no-product line
- Using "she", "he", "her", "him", "his", "subject"

# SELF-CHECK BEFORE RETURNING

Before you output, run each variation against this checklist. If any answer is no, rewrite that variation.

1. Could this prompt describe two visually different shots? (If yes, add specificity.)
2. Does the product visibility match the input rule exactly?
3. Is every element of body position, hand position, gaze, micro-expression, setting, and framing specified?
4. Does the realism stack appear?
5. Is the character showing the after-state, not the before?
6. Is there explicit motion?
7. Does the body language match the line's emotional register?
8. Are the 4 variations meaningfully different in approach, not just rewording? Are VAR_2–4 three different roles, each earned by this specific line rather than picked by habit?
9. Is the shot size + camera angle stated explicitly, and does this scene's framing differ from the previous scene's for the same role?
10. For DIALOGUE: does the prompt explicitly forbid on-screen text / captions / subtitles?

# REFERENCE EXAMPLES

Bad prompt (what NOT to do):
> A character sits on a sofa in a modern living room, looking frustrated as they examine their skin in the front-facing camera of their smartphone. Style: Modern iPhone camera quality, unedited photorealism, matching A-roll lighting.

Why this fails: no body position detail beyond "sits", no hand position, no specific micro-expression beyond "frustrated", "modern living room" is generic, "examines their skin" could mean ten different actions, the realism stack is bolted on at the end instead of integrated.

Good prompt (what your output should look like):
> The character sits cross-legged on a beige linen sofa, phone propped on the coffee table in front of them at chest height. Their left hand is loosely resting on their thigh, their right hand is mid-gesture, fingertips lightly touching their jawline as they speak directly into the front camera. Slight forward lean, eyebrows pulled in just enough to read as confidential rather than tense, the start of a wry half-smile on the corner of their mouth. Warm late-afternoon light from a window camera-left, soft on their face. Chest-up vertical 9:16 framing. Casually filmed on a propped iPhone front camera, natural handheld micro-drift, sharp focus across the frame, no bokeh, no commercial gloss, looks like they paused their afternoon to tell a friend something.

Why this works: exact body position (cross-legged, beige linen sofa), exact phone placement (coffee table, chest height), specific hand instructions (left on thigh, right on jawline), named micro-expression (forward lean, eyebrows confidential not tense, wry half-smile), specific light source (camera-left window, late afternoon), explicit framing (chest-up 9:16), realism stack integrated as part of the scene rather than tagged on.

# OUTPUT FORMAT (STRICT)

Wrap every scene in this exact XML envelope. Do not include any text outside these tags.

<SCENE>
<LINE>exact grouped script segment, a complete sentence</LINE>
<POSITION>hook|reframe|mechanism|payoff|CTA</POSITION>
<VISIBILITY>yes|no</VISIBILITY>
<VAR_1>
<TAG>DIALOGUE</TAG>
<LABEL>short descriptive shot label, e.g. TALKING-TO-CAMERA / CLOSE-IN</LABEL>
<REFS>character|product|both|none</REFS>
<PROMPT>VAR_1 is always DIALOGUE — single paragraph 60-110 words, embed the exact LINE inline as ...says directly into the front camera: "<line>", full specificity, realism integrated, no bolted-on Style clause</PROMPT>
</VAR_1>
<VAR_2>
<TAG>ACTION|EMOTIONAL|PRODUCT|POV|ENVIRONMENT|TRANSITION|PROOF</TAG>
<LABEL>...</LABEL>
<REFS>...</REFS>
<PROMPT>single paragraph 60-110 words matching the chosen role</PROMPT>
</VAR_2>
<VAR_3>
<TAG>a DIFFERENT role from VAR_2</TAG>
<LABEL>...</LABEL>
<REFS>...</REFS>
<PROMPT>...</PROMPT>
</VAR_3>
<VAR_4>
<TAG>a DIFFERENT role from VAR_2 and VAR_3</TAG>
<LABEL>...</LABEL>
<REFS>...</REFS>
<PROMPT>...</PROMPT>
</VAR_4>
</SCENE>`

export async function generateBroll(input: BrollInput): Promise<BrollResult> {
  const { apiKey, endpoint } = getChatEndpoint()

  let prompt = `Break this script into B-Roll scenes following the system rules. For EACH scene emit four variations: VAR_1 = DIALOGUE (fixed — lip-sync, embed the line verbatim); VAR_2–4 = three DISTINCT roles you pick from the system menu (ACTION / EMOTIONAL / PRODUCT / POV / ENVIRONMENT / TRANSITION / PROOF), chosen for what this specific line earns. Declare each pick in the <TAG> field. Decide POSITION + VISIBILITY per scene — if the line names or references the product, VISIBILITY must be yes regardless of POSITION. Pick REFS per variation honouring the VISIBILITY rule.\n\nScript:\n${input.scriptText}`

  if (input.productContext) {
    prompt += `\n\n${input.productContext}`
  }
  if (input.modelContext) {
    prompt += `\n\n${input.modelContext}\nIMPORTANT: never describe the character's physical appearance in detail. Refer to them as "the character" — a visual reference image will be attached to capture their exact look.`
  }
  if (input.additionalContext) {
    prompt += `\n\nAdditional context:\n${input.additionalContext}`
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: SYSTEM_INSTRUCTION }] },
    { role: 'user', content: [{ type: 'text', text: prompt }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)

  return { scenes: parseScenes(responseText) }
}

// Parse the LLM's strict-XML output into Scene records. New schema:
//   <SCENE>
//     <LINE>...</LINE>
//     <POSITION>hook|reframe|mechanism|payoff|CTA</POSITION>
//     <VISIBILITY>yes|no</VISIBILITY>
//     <VAR_N><TAG/><LABEL/><REFS/><PROMPT/></VAR_N>   (x4)
//   </SCENE>
//
// Tolerant of legacy output that emits <VAR_N>plain text</VAR_N> with no
// nested tags — falls back to position-based TAG defaults so a slightly
// off-schema response still produces usable variations.
function parseScenes(responseText: string): Scene[] {
  const scenes: Scene[] = []
  const sceneRegex = /<SCENE>([\s\S]*?)<\/SCENE>/g
  const lineRegex = /<LINE>([\s\S]*?)<\/LINE>/
  const positionRegex = /<POSITION>([\s\S]*?)<\/POSITION>/
  const visibilityRegex = /<VISIBILITY>([\s\S]*?)<\/VISIBILITY>/

  // VAR_1 is always DIALOGUE (the lip-sync anchor). VAR_2–4 carry the LLM's
  // per-line role pick in <TAG>; these legacy defaults only apply when the
  // tag is missing or unrecognised (old-schema responses).
  const FALLBACK_TAGS: VariationTag[] = ['DIALOGUE', 'ACTION', 'EMOTIONAL', 'PRODUCT']

  let match
  let number = 1
  while ((match = sceneRegex.exec(responseText)) !== null) {
    const block = match[1]
    const scriptLine = block.match(lineRegex)?.[1]?.trim() || ''
    const positionRaw = block.match(positionRegex)?.[1]?.trim().toLowerCase()
    const visibilityRaw = block.match(visibilityRegex)?.[1]?.trim().toLowerCase()

    const position = parsePosition(positionRaw)
    const productVisible = visibilityRaw === 'yes'
      ? true
      : visibilityRaw === 'no'
        ? false
        : undefined

    const variations: PromptVariation[] = []
    for (let i = 1; i <= 4; i++) {
      const varRegex = new RegExp(`<VAR_${i}>([\\s\\S]*?)<\\/VAR_${i}>`)
      const varBlock = block.match(varRegex)?.[1]
      if (!varBlock) continue

      const tagRaw = varBlock.match(/<TAG>([\s\S]*?)<\/TAG>/)?.[1]?.trim()
      const labelRaw = varBlock.match(/<LABEL>([\s\S]*?)<\/LABEL>/)?.[1]?.trim()
      const refsRaw = varBlock.match(/<REFS>([\s\S]*?)<\/REFS>/)?.[1]?.trim().toLowerCase()
      const promptRaw = varBlock.match(/<PROMPT>([\s\S]*?)<\/PROMPT>/)?.[1]?.trim()

      // VAR_1 is DIALOGUE no matter what the LLM claims; VAR_2–4 honour the
      // emitted role, falling back to the legacy positional default.
      const tag = i === 1
        ? 'DIALOGUE'
        : parseTag(tagRaw) ?? FALLBACK_TAGS[i - 1]
      // No nested PROMPT tag → treat the whole VAR_N body as the prompt
      // (legacy). When the LLM omits the closing tag we'd otherwise paste the
      // raw `<TAG>…</TAG><LABEL>…</LABEL><REFS>…</REFS><PROMPT>…` wrappers
      // into the prompt field — strip them defensively before falling back.
      const promptText = promptRaw || varBlock
        .replace(/<TAG>[\s\S]*?<\/TAG>/g, '')
        .replace(/<LABEL>[\s\S]*?<\/LABEL>/g, '')
        .replace(/<REFS>[\s\S]*?<\/REFS>/g, '')
        .replace(/<\/?PROMPT>/g, '')
        .trim()
      // Final belt-and-braces — wipe any straggler control tags. Cheap to
      // run, catches misformed LLM output without touching legitimate prose.
      const cleanPrompt = promptText
        .replace(/<\/?(LABEL|REFS|PROMPT|VAR_\d+|TAG|POSITION|VISIBILITY)>/g, '')
        .trim()
      if (!cleanPrompt) continue

      const label = labelRaw || defaultLabelFor(tag)
      const refs = parseRefs(refsRaw) ?? defaultRefsFor(tag, productVisible)

      variations.push({
        id: nextId(),
        tag,
        label,
        refs,
        prompt: cleanPrompt,
      })
    }

    // Default scene type from variations — keeps the bank-search filters
    // working. A scene whose VAR_1 is DIALOGUE is treated as character-led.
    const type: Scene['type'] = variations[0]?.tag === 'PRODUCT'
      ? 'A-ROLL PRODUCT'
      : 'A-ROLL CHARACTER'

    scenes.push({
      number: number++,
      type,
      scriptLine,
      position,
      productVisible,
      variations,
    })
  }

  return scenes
}

function parsePosition(raw: string | undefined): LinePosition | undefined {
  if (!raw) return undefined
  const r = raw.toLowerCase()
  if (r === 'hook' || r === 'reframe' || r === 'mechanism' || r === 'payoff') return r
  if (r === 'cta') return 'CTA'
  return undefined
}

const ALL_TAGS: VariationTag[] = ['DIALOGUE', 'ACTION', 'EMOTIONAL', 'PRODUCT', 'POV', 'ENVIRONMENT', 'TRANSITION', 'PROOF']

function parseTag(raw: string | undefined): VariationTag | undefined {
  if (!raw) return undefined
  const r = raw.toUpperCase().trim()
  return ALL_TAGS.find((t) => t === r)
}

function parseRefs(raw: string | undefined): VariationRefs | undefined {
  if (!raw) return undefined
  const r = raw.toLowerCase().trim()
  if (r === 'character' || r === 'product' || r === 'both' || r === 'none') return r
  return undefined
}

// Sensible default when the LLM emits a variation without a <REFS> tag.
// Hook / reframe lines with VISIBILITY=no force product off regardless.
function defaultRefsFor(tag: VariationTag, productVisible: boolean | undefined): VariationRefs {
  if (productVisible === false) {
    if (tag === 'PRODUCT') return 'none'
    if (tag === 'ENVIRONMENT') return 'none'
    return 'character'
  }
  switch (tag) {
    case 'PRODUCT': return 'product'
    case 'ENVIRONMENT': return 'none'
    case 'PROOF': return 'product'
    default: return 'both'
  }
}

function defaultLabelFor(tag: VariationTag): string {
  switch (tag) {
    case 'DIALOGUE': return 'Talking to camera'
    case 'ACTION': return 'Literal action'
    case 'EMOTIONAL': return 'Emotional reaction'
    case 'PRODUCT': return 'Product detail'
    case 'POV': return 'POV insert'
    case 'ENVIRONMENT': return 'Environment beat'
    case 'TRANSITION': return 'Transition move'
    case 'PROOF': return 'Proof shot'
  }
}

// Build the identity-only scoping directive prepended to ref'd image prompts.
// Only the clauses for refs that are actually attached appear, so a product-only
// or character-only gen reads cleanly.
function buildReferencePreamble(refs: ReferenceImage[]): string {
  const hasCharacter = refs.some((r) => r.label === 'character')
  const hasProduct = refs.some((r) => r.label === 'product')
  const matchParts: string[] = []
  if (hasCharacter) matchParts.push("the character's face, hair, skin tone, and wardrobe exactly to the character reference")
  if (hasProduct) matchParts.push("the product's shape, label text, and colours exactly to the product reference")
  const matchClause = matchParts.length ? `Match ${matchParts.join(', and ')}. ` : ''
  return `REFERENCE USAGE — The attached image(s) are appearance references only. ${matchClause}Do NOT copy the reference's framing, crop, pose, camera angle, distance, or background — the composition is defined entirely by the scene description below. Build a new shot from scratch.`
}

/**
 * Phase 1 of B-Roll image generation: resolve model, host refs, POST createTask,
 * return the kie taskId. Caller persists the taskId before awaiting completion
 * so a tab refresh can resume the poll.
 */
export async function startImageTask(
  prompt: string,
  referenceImages?: ReferenceImage[],
  aspectRatio: string = '9:16',
  resolution?: ImageResolution,
): Promise<{ taskId: string; modelId: string }> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const hasRefs = !!referenceImages?.length
  const mode = hasRefs ? 'image-to-image' : 'text-to-image'

  // Honour the user's pick from the master ModelPicker (which is wired with
  // mode='text-to-image'). When refs are present and the picked model also
  // supports image-to-image (e.g. nano-banana-2), use it directly. If it
  // doesn't (e.g. gpt-image-2-text-to-image is t2i-only), auto-resolve to its
  // i2i sibling. Final fallback is the registry default.
  const pickedId = useSettingsStore.getState().getAppModel('broll-studio:image:text-to-image')
  const picked = pickedId ? getModel(pickedId) : undefined

  let modelId: string | undefined
  if (picked && picked.modes?.includes(mode)) {
    modelId = picked.id
  } else if (picked && hasRefs) {
    // Try a same-family i2i sibling (e.g. gpt-image-2-text-to-image → gpt-image-2-image-to-image).
    const family = picked.id.replace(/-(text-to-image|image-to-image|image-edit).*$/, '')
    const sibling = getModel(`${family}-image-to-image`)
    modelId = sibling?.id ?? getDefaultModel('broll-studio', 'image', 'image-to-image')?.id
  } else {
    modelId = useSettingsStore.getState().getAppModel(`broll-studio:image:${mode}`)
      ?? getDefaultModel('broll-studio', 'image', mode)?.id
  }
  if (!modelId) throw new Error(`No image model configured for B-Roll (${mode}).`)

  // Convert each reference (asset ref or data URL) to a kie-hosted URL.
  const inputUrls: string[] = []
  if (hasRefs) {
    for (const ref of referenceImages!) {
      let dataUri = ref.dataUrl
      if (isAssetRef(ref.dataUrl)) {
        const asset = await getAsBase64(ref.dataUrl)
        if (!asset) continue
        dataUri = `data:${asset.mimeType};base64,${asset.base64}`
      }
      const hosted = await ensureHostedUrl(apiKey, dataUri)
      inputUrls.push(hosted)
    }
  }

  // Scope the references to identity/appearance only so the model builds a
  // fresh composition from the prompt instead of inheriting the reference's
  // framing, pose, and background. Phrased by which refs are actually attached.
  const scenePrompt = withIphoneRealism(prompt)
  const finalPrompt = inputUrls.length > 0
    ? `${buildReferencePreamble(referenceImages!)}\n\nSCENE:\n${scenePrompt}`
    : scenePrompt

  const body = buildImageInput(modelId, {
    prompt: finalPrompt,
    aspectRatio: aspectRatio as AspectRatio,
    resolution,
    inputUrls: inputUrls.length > 0 ? inputUrls : undefined,
  })
  const taskId = await createTask(apiKey, modelId, body)
  return { taskId, modelId }
}

/**
 * Phase 2 of B-Roll image generation: poll an existing kie taskId until success,
 * download the resulting image, and persist it as an asset. Resumable — pass
 * the taskId returned by `startImageTask` (possibly from a prior session).
 */
export async function finishImageTask(taskId: string, modelId: string): Promise<string> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const record = await pollTask(apiKey, taskId, { maxPollAttempts: IMAGE_POLL_ATTEMPTS })
  const urls = parseResult(record).resultUrls
  if (urls.length === 0) {
    throw new Error(
      `${modelId}: kie.ai returned no resultUrls. record=${JSON.stringify(record).slice(0, 400)}`,
    )
  }
  const { base64, mimeType } = await downloadAsBase64(urls[0])
  return saveBase64Asset(base64, mimeType)
}

/**
 * Generate an image from a B-Roll prompt via kie.ai.
 * If reference images are provided, uses image-to-image (uploads each ref
 * to kie's hosted storage to get a public URL). Otherwise text-to-image.
 *
 * Thin wrapper over startImageTask + finishImageTask for callers that don't
 * need refresh-resume. The OutputPanel uses the two-phase API directly so it
 * can persist `pendingTaskId` between phases.
 */
export async function generateImage(
  prompt: string,
  referenceImages?: ReferenceImage[],
  aspectRatio: string = '9:16',
  resolution?: ImageResolution,
): Promise<string> {
  const { taskId, modelId } = await startImageTask(prompt, referenceImages, aspectRatio, resolution)
  return finishImageTask(taskId, modelId)
}

// One-line role brief per tag, shared by the regenerate + free-form variation
// prompts so a forced tag always carries its definition.
const TAG_BRIEFS: Record<VariationTag, string> = {
  DIALOGUE: 'The character is on camera, looking into the phone front camera, saying the LINE verbatim — embed the exact LINE inline as dialogue (...says directly into the front camera: "<exact LINE text>"). The line is spoken only — end the prompt with an explicit instruction that no on-screen text, captions, or subtitles appear in the frame.',
  ACTION: 'A literal demonstration of the moment the line describes — no talking to camera.',
  EMOTIONAL: "The character's face/body responding to the meaning of the line — no talking to camera.",
  PRODUCT: 'Close-up / macro / detail on the product or visible after-state result.',
  POV: "First-person through the character's eyes — their hands doing the thing the line implies; the character's face never in frame.",
  ENVIRONMENT: 'The setting the line implies, treated as the subject — character absent or peripheral.',
  TRANSITION: 'Movement between spaces or states that carries the ad forward — a doorway walk, tossing something into a bag, setting the phone down.',
  PROOF: "Concrete visible evidence the line's claim is real — after-state, same-frame comparison, or an ordinary phone-screen artifact. Never fake reviews, ratings, or statistics.",
}

/**
 * Generate a new prompt variation for a scene using Gemini 3 Flash.
 */
export async function generateNewVariation(
  sceneNumber: number,
  sceneType: string,
  scriptLine: string,
  forceTag?: VariationTag,
  productContext?: string,
  modelContext?: string,
): Promise<PromptVariation> {
  const { apiKey, endpoint } = getChatEndpoint()

  const tagInstruction = forceTag
    ? `The variation MUST be a ${forceTag} shot. ${TAG_BRIEFS[forceTag]}`
    : `Pick the shot role yourself from this menu — choose what this specific line earns:\n${ALL_TAGS.filter((t) => t !== 'DIALOGUE').map((t) => `- ${t}: ${TAG_BRIEFS[t]}`).join('\n')}`

  const prompt = `Generate a single new creative image generation prompt for this B-Roll scene:

Scene ${sceneNumber}: ${sceneType}
Script line: "${scriptLine}"
${tagInstruction ? `\n${tagInstruction}\n` : ''}
${productContext ? `\n${productContext}\n` : ''}${modelContext ? `\n${modelContext}\nIMPORTANT: never describe the character's physical appearance in detail. Refer to them as "the character" — a visual reference image will be attached.\n` : ''}
Provide a fresh creative angle. Follow the senior UGC creative director rules:
1. Specificity over completeness — name exact body position, hand position, gaze, micro-expression, setting detail, framing.
2. NEVER use he / him / his / she / her / "subject". Refer to the on-screen person as "the character" or "they / them / their".
3. Integrate the realism stack into the scene description (iPhone front camera, casual, natural handheld jitter, unedited photorealism, matching A-roll lighting, zero bokeh, zero DoF, sharp focus, no commercial gloss). Do NOT bolt on a "Style: ..." sentence at the end.
4. DO NOT mention aspect ratio, resolution, or framing dimensions in numbers — those are set separately.
5. The character looks like the after-state, never the before.
6. Constant motion: name the movement.
7. Pick a deliberate, distinctive shot — name the shot size AND camera angle (e.g. low-angle medium-wide, over-the-shoulder, overhead macro, POV hands-only). The composition is owned by this prompt, not by any attached reference image; don't default to a chest-up eye-level shot.

Respond with ONLY valid JSON (no markdown):
{
  "label": "<short descriptive shot label, e.g. MIRROR REACTION>",
  "tag": "${forceTag ?? 'ACTION" | "EMOTIONAL" | "PRODUCT" | "POV" | "ENVIRONMENT" | "TRANSITION" | "PROOF'}",
  "refs": "character" | "product" | "both" | "none",
  "prompt": "<60-110 word paragraph>"
}`

  const messages: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: prompt }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)
  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  let parsed: { label: string; tag: PromptVariation['tag']; refs?: PromptVariation['refs']; prompt: string }
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    throw new Error(`Bad JSON from variation model: ${reason} — body: ${cleaned.slice(0, 400)}`)
  }

  // Honour the forced tag even if the LLM ignores the instruction; validate
  // a free-choice tag against the known union so a made-up role can't leak
  // into persisted state.
  const finalTag: VariationTag = forceTag ?? parseTag(parsed.tag) ?? 'ACTION'
  return {
    id: nextId(),
    label: parsed.label || defaultLabelFor(finalTag),
    tag: finalTag,
    refs: parseRefs(parsed.refs) ?? defaultRefsFor(finalTag, undefined),
    prompt: parsed.prompt,
  }
}

// Rewrite the user's draft prompt to obey the framework while keeping their
// intent. Used by the Enhance button in CardDetailModal. The full system
// instruction grounds the LLM; the user message names the target tag + scene
// so the rewrite stays on-brief.
export async function enhanceVariationPrompt(
  draft: string,
  scene: { number: number; scriptLine: string },
  variation: { tag: VariationTag; label: string },
  productContext?: string,
  modelContext?: string,
): Promise<string> {
  const { apiKey, endpoint } = getChatEndpoint()

  const userMessage = `Rewrite the draft below for the ${variation.tag} variation of this scene. Keep the user's intent; tighten the language; obey the framework. Return strict JSON only.

Scene ${scene.number} — LINE: "${scene.scriptLine}"
Variation tag: ${variation.tag}${variation.label ? `\nShot label: ${variation.label}` : ''}
${productContext ? `\n${productContext}\n` : ''}${modelContext ? `\n${modelContext}\nIMPORTANT: never describe the character's physical appearance in detail. Refer to them as "the character".\n` : ''}
Rules:
- 60–110 words, single paragraph.
- Specificity over completeness — body position, hand position, gaze, micro-expression, setting detail, framing.
- Never "he/him/she/her/subject" — use "the character" or "they/them/their".
- Integrate the realism stack into the prose (iPhone front camera, casual, natural handheld jitter, unedited photorealism, sharp focus). No "Style: ..." trailer.
- DO NOT mention aspect ratio, resolution, or framing in numbers.
- State the shot size + camera angle explicitly; the composition is owned by the prompt, not by any attached reference image. Keep the user's chosen framing if they named one, otherwise pick a distinctive, non-default shot.
- ${variation.tag === 'DIALOGUE' ? `Embed the LINE verbatim as dialogue (..."<exact LINE text>"). The line is spoken only — end the prompt with an explicit instruction that no on-screen text, captions, or subtitles appear in the frame.` : `Honour the shot role: ${TAG_BRIEFS[variation.tag]}`}

Draft:
"""
${draft}
"""

Respond with ONLY valid JSON (no markdown):
{
  "prompt": "<rewritten 60-110 word paragraph>"
}`

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: SYSTEM_INSTRUCTION }] },
    { role: 'user', content: [{ type: 'text', text: userMessage }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)
  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  // Some models return the prompt as a plain string when the JSON is malformed
  // — handle both shapes so a slightly off-schema response still works.
  try {
    const parsed = JSON.parse(cleaned) as { prompt: string }
    if (parsed?.prompt && typeof parsed.prompt === 'string') return parsed.prompt
  } catch {
    /* fall through */
  }
  // Last resort: strip any wrapper and use the raw text.
  return cleaned.replace(/^["']|["']$/g, '').trim()
}
