import type { BrollInput, BrollResult, Scene, PromptVariation, ReferenceImage, VariationTag, VariationRefs, LinePosition } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import {
  kieChatCompletions,
  ensureHostedUrl,
  createTask,
  type ChatMessage,
} from '../../../utils/kie'
import { getDefaultModel, getChatEndpointPath, buildImageInput, getModel, type AspectRatio, type ImageResolution } from '../../../utils/models'
import { isAssetRef, getAsBase64 } from '../../../utils/assetStore'
import { finishImageAssetTask } from '../../../utils/imageTask'
import { useBankStore } from '../../../stores/bankStore'
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

/**
 * The six-field shape every B-Roll prompt takes. Shared by all four prompt
 * sites (scene generation, single-variation generation, and Enhance) so the
 * format can't drift between them — a card regenerated or enhanced has to come
 * back in the same shape it went out.
 *
 * Labelled fields beat one flowing paragraph here: image and video models weight
 * what they can find, and a named CAMERA / LIGHTING / AUDIO line is far harder
 * to skim past than the same words buried mid-sentence.
 *
 * Every clip is SILENT b-roll — no one speaks. A finished voiceover is laid over
 * these shots in the edit, so DIALOGUE is always "none" and AUDIO is diegetic
 * room sound only. Nothing lip-syncs, and no on-screen speech is ever written.
 */
const PROMPT_FORMAT = `Every prompt is six labelled lines, in this exact order, one line each:

SETTING: where we are and who is in frame — the room, the surfaces, the props actually visible, plus the character's exact body position and hand position. Name the place; don't gesture at it.
CAMERA: shot size, then the three geometry values (height relative to the eyeline, distance, angle), then how the frame itself moves. Then the quality register: modern iPhone camera quality, unedited photorealism, sharp focus across the frame, zero bokeh, no commercial gloss. NEVER name a filming device here.
LIGHTING: the actual source, its direction, and its warmth — "warm late-afternoon light from a window camera-left", "one overhead bathroom light", "flat grey daylight through the kitchen door". Natural and unstaged: no studio lighting, no colour grade.
ACTION: what moves across the take — the gesture, the gaze, the micro-expression, the shift of weight. Name the actual movement, never a mood word.
DIALOGUE: always the single word: none. No one speaks in any shot — a voiceover is added later, so the character never mouths words or addresses the viewer with speech.
AUDIO: the diegetic sound of the scene only (fabric, running water, a bag zip, room tone) — never dialogue, never music, never a voiceover. This footage is scored and voiced in the edit; here it carries only the natural sound of the room.

Format rules:
- All six labels appear in every prompt, in this order. DIALOGUE is always "none".
- One line per field. Aim for 130-200 words across all six — a prompt under 120 words is under-specified and will render as generic stock footage.
- Never repeat yourself across fields: the room belongs in SETTING, the light belongs in LIGHTING, the movement belongs in ACTION.
- Density over brevity. Every field earns its length: SETTING names real props, CAMERA gives all three geometry values plus the quality register, LIGHTING names the source and its warmth, ACTION names the actual movement beat by beat, AUDIO names the specific sounds. Never thin out the later scenes of an ad — scene 8 gets the same depth as scene 1.
- Banned words, everywhere: "beautiful", "stunning", "modern", "clean", "minimalist", "aesthetic", "high quality", "professional", "vibe". They describe nothing a model can draw. Name the thing instead.`

const SYSTEM_INSTRUCTION = `# ROLE

You are a senior UGC creative director writing B-roll prompts for AI image and video models. You have shipped thousands of paid UGC ads. You think in shot lists, not paragraphs. Every prompt you write must be specific enough that two different generations from the same prompt look like they came from the same brand and same creator.

You optimise for one thing: prompts that produce footage indistinguishable from real, unpolished UGC — the look of a phone camera, never the sight of one — sequenced so the product never appears before the voiceover earns it.

# YOUR JOB

For each voiceover line in the script, produce 4 distinct prompt variations. Each variation is one viable shot for that line. The variations must differ in approach, not just wording.

**Every shot is SILENT b-roll.** No one talks to camera, no one lip-syncs, no line is spoken. The finished voiceover is laid over these clips in the edit, so the footage only has to SHOW what the line is about — never say it. DIALOGUE is always "none"; AUDIO is diegetic room sound only.

You decide per line:
- POSITION — where the line sits in the ad's arc: hook / reframe / mechanism / payoff / CTA
- VISIBILITY — whether the product is allowed in this shot (yes / no). Hook + reframe lines almost always = no. Mechanism = your call, usually no. Payoff + CTA = usually yes.

ALL FOUR variations are YOUR CHOICE — pick four DISTINCT roles from this menu, chosen for what THIS specific line earns. Declare the chosen role in each variation's <TAG> field.

- ACTION = a literal demonstration of the moment the line describes (the act, the gesture, the interaction). Choose a framing that best sells the action — over-the-shoulder, medium-wide full body, low angle, or a hands-only insert.
- EMOTIONAL = the character's face and body responding to the meaning of the line. A held look from a high angle, a profile three-quarter, a slow push-in close-up, a smile building, a breath let go. The character may glance toward the lens, but never speaks.
- PRODUCT = close-up / macro / detail on the product itself, or the visible after-state result (texture, surface, droplet, drop, swipe, sheen). Vary the angle — overhead flat-lay, raking-light macro, in-hand three-quarter, tilt down. Character may be partly in frame or absent.
- POV = first-person, through the character's eyes: their hands doing the thing the line implies, the counter as they see it, the doorway they're walking toward. The character's face is never in frame.
- ENVIRONMENT = the setting the line implies, treated as the subject: the bathroom counter mid-routine, the gym bag by the door, morning light hitting the kitchen table. Character absent or peripheral (out of focus is NOT allowed — keep them at frame edge or out of frame instead).
- TRANSITION = movement between spaces or states that carries the ad forward: walking through a doorway toward the camera, tossing something into a bag, opening a cabinet, dropping keys into a bowl and stepping back.
- PROOF = concrete visible evidence the line's claim is real: the after-state on the character or a surface, a side-by-side in the same frame, a screen showing an ordinary artifact (a timer, a streak, a calendar). Never invent fake reviews, star ratings, or statistics. PROOF is the ONE role where a phone may appear in frame — as the object being looked at, never as the camera.

Role-choice rules:
- The four chosen roles must be different from each other.
- Choose for the line, not by habit. A hook earns pattern-interrupts (TRANSITION, POV, ENVIRONMENT). A reframe earns EMOTIONAL / ENVIRONMENT quiet. A mechanism earns ACTION / POV demos. A payoff earns PROOF / PRODUCT / EMOTIONAL warmth. A CTA earns PRODUCT / TRANSITION momentum.
- When VISIBILITY is no: PRODUCT is off the menu, and POV / PROOF / ENVIRONMENT shots must not show the product or its packaging.
- When VISIBILITY is yes and the line names the product: at least one variation must be PRODUCT or feature the product prominently in frame.
- Do not repeat the same set of roles scene after scene — vary the mix across the ad.

You decide per variation:
- LABEL — a short, descriptive shot label that captures what THIS variation actually is (e.g. "COUNTER REACTION", "DOORWAY WALK-IN", "PRODUCT MACRO / DROPLET", "HANDS-ONLY INSERT"). Two-to-four word slug, optionally separated by /.
- REFS — which reference images to attach: character / product / both / none.
  - ACTION, EMOTIONAL, TRANSITION almost always need the character. Add product only when the prompt actually features the product on screen.
  - POV needs the character (hands must match skin tone); add product only when the product is in frame.
  - PRODUCT usually needs only product. Add character only when the character is also in frame.
  - ENVIRONMENT usually needs none; add product only when VISIBILITY is yes and the product sits in the scene.
  - PROOF: product when packaging is in frame, character when the after-state is on the character, none for pure artifacts.
  - When VISIBILITY is no, REFS cannot include product.

# PROMPT FORMAT (EVERY PROMPT, EVERY VARIATION)

${PROMPT_FORMAT}

# THE CAMERA IS A VIEWPOINT, NOT A PROP

This rule ruins more generations than any other, so read it before you write a single CAMERA line.

The camera is where the viewer's eye is. It is not an object in the scene. Image and video models draw the nouns you give them: write "phone" and a phone appears — in frame, in the character's hand — and your low-angle shot becomes a mirror selfie.

So never write the filming device as a thing in the scene. Not "phone", not "iPhone", not "smartphone", not "front camera", not "tripod", not "webcam", not "ring light". Never put it in a hand, on a table, in a lap, or in a reflection.

Describe the camera ONLY as geometry — three values, every time:
- HEIGHT relative to the character's eyeline — at eye level / just below chin height / at chest height / from waist height / from lap height looking up / from above looking down
- DISTANCE — about an arm's length away / a step back / across the room / inches from the surface
- ANGLE — straight on / tilted slightly up / tilted slightly down / three-quarter from camera-left

  WRONG: "phone held at arm's length below chin level, angled up"
  RIGHT: "framed from just below chin height, about an arm's length away, tilted slightly up"

  WRONG: "the character sits on the sofa, phone propped on the coffee table"
  RIGHT: "the character sits on the sofa, framed from chest height across the coffee table"

  WRONG: "low-angle shot with the phone resting in their lap"
  RIGHT: "framed from lap height, looking up at the character"

  WRONG: "both hands holding the phone"
  RIGHT: "one hand loose on their thigh, the other mid-gesture near their jawline"

The iPhone look comes from IMAGE QUALITY, LIGHTING, and FRAME MOTION — never from showing the equipment. Naming the iPhone as a quality register ("modern iPhone camera quality") is fine: that describes the footage. Putting an iPhone in the room is not. Likewise "natural handheld micro-jitter" describes how the frame moves — it does not license a visible hand or device.

THE ONE EXCEPTION: a PROOF shot may show a screen displaying an ordinary artifact (a timer, a streak, a calendar), because there the device is the deliberate subject being looked at. Nowhere else, in any role, for any reason.

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

Generic prompts fail — this is the rule that decides whether the footage is usable. Write each prompt the way you would log a shot you already filmed and are now describing frame by frame, not the way you would pitch it. If a prompt could describe two visually different shots, it is not finished; add specificity rather than another variation.

Every prompt must name:
- Exact body position (seated cross-legged on the floor, leaning against the kitchen counter, perched on the edge of the bathtub)
- Exact hand position (one hand resting on the cheek, both hands wrapped around a mug, pointing toward the jawline)
- Exact gaze (looking straight down the lens, glancing down at their own hands, eyes flicking to the side mid-thought)
- Exact micro-expression (slight eyebrow raise on the word "actually", soft genuine smile that builds across the line, deadpan delivery with one eyebrow lifted)
- Exact setting detail (warm afternoon light from a window camera-left, single overhead bathroom light, half-full glass of water on the counter behind them)
- Exact camera geometry — height, distance, angle (chest-up vertical 9:16 from eye level about an arm's length away; waist-up framed from a step back, tilted slightly down)

If a prompt could describe two different shots, it is not specific enough. Rewrite.

## 5. UGC REALISM IS THE DEFAULT AESTHETIC

The realism stack lives inside the fields that own it — the quality register in CAMERA, the light in LIGHTING, the unposed movement in ACTION. Never bolt it on as a trailing "Style: ..." clause or a seventh field.

Paraphrase across these points:
- Casual, unstaged capture — plain framing, slightly imperfect, nothing composed for a brand
- Natural handheld micro-jitter and slight drift in the frame itself
- Modern iPhone camera quality, unedited photorealism
- Matching A-roll lighting (same scene-to-scene)
- Zero bokeh, zero depth of field, sharp focus across the entire frame
- No commercial gloss, no cinematic colour grade, no studio lighting
- The character looks like they just decided to film this, not like they're posing for a campaign

Anything that reads as "commercial," "cinematic," "studio," or "polished" is a failure.

## 6. THE CHARACTER LOOKS LIKE THE AFTER, NOT THE BEFORE

Regardless of what problem the product treats, the character in every prompt has the result already. No visible blemishes, frizz, redness, yellow teeth, tired eyes, or whatever the product addresses. They are the testimonial. They are not the case study.

## 7. CONSTANT MOTION

Every prompt specifies movement. Talking shots have natural handheld jitter in the frame. Hands-free shots have subtle drift or micro-push-in. Product shots have orbit, dolly, or hand motion. No perfectly locked-off frames. No still-life.

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
- Every shot is silent: DIALOGUE is "none" and AUDIO is diegetic room sound only. The voiceover is added later in the edit — none of this footage carries speech.

## 11. COMPOSITION & SHOT VARIETY

The composition is owned by YOUR prompt, never inherited from the reference image — a character reference is attached only to fix the person's identity and wardrobe, so you must state the exact framing every single time.

Draw from this shot vocabulary — name the shot size AND the camera angle explicitly, always as geometry, never as a device:
- Sizes: extreme close-up / macro, close-up, medium close-up (chest-up), medium (waist-up), medium-wide (full body), wide / establishing.
- Angles & setups: eye-level, low angle, high angle, overhead / top-down, profile / three-quarter, over-the-shoulder, POV / first-person hands, framed through a doorway or by the environment, hands-only insert.

Variety is mandatory:
- Across the 4 variations in one scene, vary the shot size and angle — do not shoot all four chest-up at eye level.
- Across adjacent scenes, do not repeat the same framing back-to-back for the same role. If scene 1's ACTION was an over-the-shoulder medium, scene 2's ACTION should be a different size or angle.

# HARD FAILURES (REWRITE IF YOU CATCH YOURSELF DOING ANY OF THESE)

- A phone, camera, tripod, or ring light visible anywhere in frame — including in a mirror or any reflection. The camera is a viewpoint, never a prop. (Only exception: a PROOF shot where a screen is the deliberate subject.)
- Writing the camera as an object ("phone propped on the table", "holding the phone up", "filmed on a phone in their lap") instead of as geometry — height, distance, angle
- Staging any shot as a mirror selfie
- "A character [verb]s in a [room]" — too abstract, no specificity
- "Looking frustrated" / "looking happy" — name the actual micro-expression
- "Modern aesthetic" / "clean look" / "minimalist vibe" — describe what is actually in frame
- "They hold the product" with no instruction on how, which hand, what angle
- "Style: photorealism" pasted at the end instead of the quality register living in CAMERA
- Dropping a field, reordering the six, inventing a seventh, or writing prose with no labels at all
- Any spoken line: a character talking to camera, mouthing words, or DIALOGUE holding anything other than "none"
- Dialogue, music, or a voiceover in any AUDIO field — AUDIO is diegetic room sound only
- All 4 variations being the same shot with different word order
- Every scene framed chest-up at eye level — shot size and angle never vary across scenes
- Inheriting the reference image's framing/crop/background instead of stating your own composition
- Any caption, subtitle, or on-screen written text appearing in frame
- Product appearing in a hook or reframe shot when VISIBILITY is no
- Cinematic lighting, shallow depth of field, soft bokeh
- "Confident smile" / "genuine expression" — name what the face is actually doing
- Mentioning the product on a shelf, counter, or in the background during a no-product line
- Using "she", "he", "her", "him", "his", "subject"

# SELF-CHECK BEFORE RETURNING

Before you output, run each variation against this checklist. If any answer is no, rewrite that variation.

1. Are all six labels present, in order — SETTING, CAMERA, LIGHTING, ACTION, DIALOGUE, AUDIO — with no field dropped and none invented?
2. Could this prompt describe two visually different shots? (If yes, add specificity.)
3. Does the product visibility match the input rule exactly?
4. Is every element of body position, hand position, gaze, micro-expression, setting, and framing specified?
5. Does the realism stack appear, in the fields that own it?
6. Is the character showing the after-state, not the before?
7. Is there explicit motion in ACTION?
8. Does the body language match the line's emotional register?
9. Are the 4 variations meaningfully different in approach, not just rewording? Are they four different roles, each earned by this specific line rather than picked by habit?
10. Is the shot size + camera angle stated explicitly, and does this scene's framing differ from the previous scene's for the same role?
11. Is this shot silent — DIALOGUE exactly "none", no one talking to camera or mouthing words, and no caption/subtitle text in frame?
12. Does AUDIO describe only the diegetic sound of the scene — no dialogue, no music, no voiceover?
13. Is the camera written purely as geometry (height, distance, angle), with no filming device named, held, propped, or reflected anywhere in frame?

# REFERENCE EXAMPLES

Bad prompt (what NOT to do):
> A character sits on a sofa in a modern living room, looking frustrated as they examine their skin in the front-facing camera of their smartphone. Style: Modern iPhone camera quality, unedited photorealism, matching A-roll lighting.

Why this fails: no labelled fields at all; it names the smartphone as an object in the scene, so the model will draw one in frame and turn this into a mirror selfie; no body position detail beyond "sits"; no hand position; no specific micro-expression beyond "frustrated"; "modern living room" is generic; "examines their skin" could mean ten different actions; the realism stack is bolted on at the end instead of living in CAMERA; nothing says what is heard.

Good prompt — a silent EMOTIONAL variation (what your output should look like):
> SETTING: The character sits cross-legged on a beige linen sofa in their own living room, a half-full glass of water and a paperback on the coffee table in front of them. Left hand loose on their thigh, right hand resting against their collarbone.
> CAMERA: Medium close-up vertical, framed from chest height about a metre away, three-quarter from camera-left. Natural handheld micro-drift in the frame. Modern iPhone camera quality, unedited photorealism, sharp focus across the frame, zero bokeh, no commercial gloss.
> LIGHTING: Warm late-afternoon light from a window camera-left, soft across their face, one dim lamp behind them. No studio lighting, no colour grade.
> ACTION: Their gaze drops to their own hands and lifts again, a slow breath let out, the corner of their mouth softening into a small private smile as their shoulders drop. One blink, a slight tilt of the head. Lips stay closed — they do not speak.
> DIALOGUE: none
> AUDIO: The faint hum of the room, a page settling, distant traffic through the window. No dialogue, no music, no voiceover.

Why this works: all six labels, in order; exact body position (cross-legged, beige linen sofa); camera geometry stated as position rather than equipment (chest height, a metre away, three-quarter — no device anywhere); specific hand instructions (left on thigh, right on collarbone); named micro-expression (gaze drop and lift, breath out, private smile, shoulders dropping); one real light source; the quality register inside CAMERA where it belongs; DIALOGUE is "none" and the character never speaks; AUDIO is diegetic room tone only, ready for a voiceover in the edit.

Good prompt — a silent PRODUCT variation (note DIALOGUE and AUDIO):
> DIALOGUE: none
> AUDIO: The soft scuff of a jar set down on stone, a tap running in the next room, ordinary bathroom room tone. No dialogue, no music, no voiceover.

# OUTPUT FORMAT (STRICT)

Wrap every scene in this exact XML envelope. Do not include any text outside these tags. Every <PROMPT> body is the six labelled lines from PROMPT FORMAT — never a bare paragraph.

<SCENE>
<LINE>exact grouped script segment, a complete sentence</LINE>
<POSITION>hook|reframe|mechanism|payoff|CTA</POSITION>
<VISIBILITY>yes|no</VISIBILITY>
<VAR_1>
<TAG>ACTION|EMOTIONAL|PRODUCT|POV|ENVIRONMENT|TRANSITION|PROOF</TAG>
<LABEL>short descriptive shot label, e.g. COUNTER REACTION</LABEL>
<REFS>character|product|both|none</REFS>
<PROMPT>the six labelled lines, matching the chosen role. Silent b-roll → DIALOGUE: none, and AUDIO carries only diegetic sound</PROMPT>
</VAR_1>
<VAR_2>
<TAG>a DIFFERENT role from VAR_1</TAG>
<LABEL>...</LABEL>
<REFS>...</REFS>
<PROMPT>...</PROMPT>
</VAR_2>
<VAR_3>
<TAG>a DIFFERENT role from VAR_1 and VAR_2</TAG>
<LABEL>...</LABEL>
<REFS>...</REFS>
<PROMPT>...</PROMPT>
</VAR_3>
<VAR_4>
<TAG>a DIFFERENT role from VAR_1, VAR_2 and VAR_3</TAG>
<LABEL>...</LABEL>
<REFS>...</REFS>
<PROMPT>...</PROMPT>
</VAR_4>
</SCENE>`

export async function generateBroll(input: BrollInput): Promise<BrollResult> {
  const { apiKey, endpoint } = getChatEndpoint()

  let prompt = `Break this script into B-Roll scenes following the system rules. For EACH scene emit four variations: four DISTINCT silent b-roll roles you pick from the system menu (ACTION / EMOTIONAL / PRODUCT / POV / ENVIRONMENT / TRANSITION / PROOF), chosen for what this specific line earns. Every shot is silent — no one speaks, DIALOGUE is always "none", AUDIO is diegetic room sound only (a voiceover is added later). Declare each pick in the <TAG> field. Decide POSITION + VISIBILITY per scene — if the line names or references the product, VISIBILITY must be yes regardless of POSITION. Pick REFS per variation honouring the VISIBILITY rule.\n\nScript:\n${input.scriptText}`

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

  // All four variations carry the LLM's per-line role pick in <TAG>; these
  // defaults only apply when the tag is missing or unrecognised. No talking
  // heads any more — every role is silent b-roll.
  const FALLBACK_TAGS: VariationTag[] = ['ACTION', 'EMOTIONAL', 'PRODUCT', 'POV']

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

      // Every variation honours its emitted role, falling back to the
      // positional default when the tag is missing or unrecognised.
      const tag = parseTag(tagRaw) ?? FALLBACK_TAGS[i - 1]
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
    // working. A PRODUCT-led first variation marks the scene product-led;
    // everything else is treated as character-led.
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

// The roles the LLM may choose from — all silent b-roll. DIALOGUE and STATIC
// are deliberately absent: every clip is now voiceless (a voiceover is added in
// the edit), so no talking-head or lip-sync role is offered. Both tags survive
// in the VariationTag union so legacy persisted cards still render.
const ALL_TAGS: VariationTag[] = ['ACTION', 'EMOTIONAL', 'PRODUCT', 'POV', 'ENVIRONMENT', 'TRANSITION', 'PROOF']

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
  // Legacy STATIC anchor cards are sourced entirely from the character
  // reference — the product never belongs in them, whatever VISIBILITY says.
  if (tag === 'STATIC') return 'character'
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
    case 'STATIC': return 'Same shot every scene'
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
// or character-only gen reads cleanly. Exported for One Shot mode, which
// prepends the same directive to its reference-to-video prompts.
export function buildReferencePreamble(refs: ReferenceImage[]): string {
  const hasCharacter = refs.some((r) => r.label === 'character')
  const hasProduct = refs.some((r) => r.label === 'product')
  const matchParts: string[] = []
  if (hasCharacter) matchParts.push("the character's face, hair, skin tone, and wardrobe exactly to the character reference")
  if (hasProduct) matchParts.push("the product's shape, label text, and colours exactly to the product reference")
  const matchClause = matchParts.length ? `Match ${matchParts.join(', and ')}. ` : ''
  return `REFERENCE USAGE — The attached image(s) are appearance references only. ${matchClause}Do NOT copy the reference's framing, crop, pose, camera angle, distance, or background — the composition is defined entirely by the scene description below. Build a new shot from scratch.`
}

// The STATIC anchor card is the one shot that SHOULD inherit the reference: its
// job is "the character, exactly as they already are, just talking". So it gets
// the inverse of the identity-only preamble above. Falls back to the normal one
// when no character ref is attached — with nothing to inherit, "keep the
// reference's setting" would be an instruction about nothing.
function buildStaticReferencePreamble(refs: ReferenceImage[]): string {
  const hasCharacter = refs.some((r) => r.label === 'character')
  if (!hasCharacter) return buildReferencePreamble(refs)
  return `REFERENCE USAGE — Recreate the attached character reference as closely as you can: same face, hair, skin tone, wardrobe, background, setting, and lighting. Keep the reference's location and camera position. The ONLY change is that the character is now talking to the viewer as described below. Do not relocate them, do not redress them, do not restage the shot.`
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
  // STATIC anchor cards want the reference's setting and framing carried over
  // rather than stripped — flips which preamble scopes the refs.
  // Continuous mode passes noRealism (the stylized-3D aesthetic is the opposite
  // of the iPhone stack) and its own chain-continuity preamble.
  opts?: { inheritReference?: boolean; noRealism?: boolean; preambleOverride?: string },
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
  const scenePrompt = opts?.noRealism ? prompt.trim() : withIphoneRealism(prompt)
  const preamble = opts?.inheritReference ? buildStaticReferencePreamble : buildReferencePreamble
  const preambleText = opts?.preambleOverride ?? (inputUrls.length > 0 ? preamble(referenceImages!) : '')
  const finalPrompt = inputUrls.length > 0 && preambleText
    ? `${preambleText}\n\nSCENE:\n${scenePrompt}`
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
 * `resolution` only feeds the usage ledger's credit estimate (callers persist
 * it on the in-flight entry); omitted → base-tier estimate.
 */
export async function finishImageTask(taskId: string, modelId: string, resolution?: string): Promise<string> {
  const assetRef = await finishImageAssetTask(taskId, modelId)
  // B-Roll stills don't push an imageHistory row (card state lives in the
  // session snapshot), so this is their usage-ledger hook.
  useBankStore.getState().recordUsage({ kind: 'image', modelId, params: { resolution, imageCount: 1 } })
  return assetRef
}

// One-line role brief per tag, shared by the regenerate + free-form variation
// prompts so a forced tag always carries its definition.
const TAG_BRIEFS: Record<VariationTag, string> = {
  // Legacy roles — no longer offered (every shot is silent b-roll now), but a
  // forced regen of an old card could still pass one, so keep them voiceless.
  DIALOGUE: 'A silent shot of the character on camera, present and natural but NOT speaking — lips closed, no words mouthed. DIALOGUE is "none". A voiceover is added later.',
  STATIC: 'A silent shot of the character in their own space, present and natural but NOT speaking — lips closed, no words mouthed. DIALOGUE is "none". A voiceover is added later.',
  ACTION: 'A literal demonstration of the moment the line describes — silent, no talking to camera.',
  EMOTIONAL: "The character's face/body responding to the meaning of the line — silent, no talking to camera.",
  PRODUCT: 'Close-up / macro / detail on the product or visible after-state result.',
  POV: "First-person through the character's eyes — their hands doing the thing the line implies; the character's face never in frame.",
  ENVIRONMENT: 'The setting the line implies, treated as the subject — character absent or peripheral.',
  TRANSITION: 'Movement between spaces or states that carries the ad forward — a doorway walk, tossing something into a bag, dropping keys into a bowl.',
  PROOF: "Concrete visible evidence the line's claim is real — after-state, same-frame comparison, or an ordinary screen artifact like a timer or a streak. This is the one role where a phone may be in frame, as the object being looked at rather than the camera. Never fake reviews, ratings, or statistics.",
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
    : `Pick the shot role yourself from this menu — choose what this specific line earns:\n${ALL_TAGS.map((t) => `- ${t}: ${TAG_BRIEFS[t]}`).join('\n')}`

  const prompt = `Generate a single new creative image generation prompt for this B-Roll scene:

Scene ${sceneNumber}: ${sceneType}
Script line: "${scriptLine}"
${tagInstruction ? `\n${tagInstruction}\n` : ''}
${productContext ? `\n${productContext}\n` : ''}${modelContext ? `\n${modelContext}\nIMPORTANT: never describe the character's physical appearance in detail. Refer to them as "the character" — a visual reference image will be attached.\n` : ''}
# PROMPT FORMAT

${PROMPT_FORMAT}

This is SILENT b-roll — no one speaks. DIALOGUE is always "none" and AUDIO is diegetic room sound only (a voiceover is laid over the footage later). The character never talks to camera or mouths words.

Provide a fresh creative angle. Follow the senior UGC creative director rules:
1. Specificity over completeness — name exact body position, hand position, gaze, micro-expression, setting detail, framing.
2. NEVER use he / him / his / she / her / "subject". Refer to the on-screen person as "the character" or "they / them / their".
3. The realism stack lives in the fields that own it — the quality register in CAMERA, the light in LIGHTING, the unposed movement in ACTION (casual unstaged capture, natural handheld jitter in the frame, modern iPhone camera quality, unedited photorealism, matching A-roll lighting, zero bokeh, zero DoF, sharp focus, no commercial gloss). Do NOT bolt on a "Style: ..." sentence at the end.
4. DO NOT mention aspect ratio, resolution, or framing dimensions in numbers — those are set separately.
5. The character looks like the after-state, never the before.
6. Constant motion: name the movement in ACTION.
7. Pick a deliberate, distinctive shot — name the shot size AND camera angle (e.g. low-angle medium-wide, over-the-shoulder, overhead macro, POV hands-only). The composition is owned by this prompt, not by any attached reference image; don't default to a chest-up eye-level shot.
8. THE CAMERA IS A VIEWPOINT, NOT A PROP. Never write the filming device as an object in the scene — no "phone", "iPhone", "smartphone", "front camera", "tripod", "ring light"; never in a hand, on a table, in a lap, or in a reflection; never stage a mirror selfie. Write the camera only as geometry: height relative to the eyeline, distance, angle. WRONG: "phone held at arm's length below chin level". RIGHT: "framed from just below chin height, about an arm's length away, tilted slightly up". Naming the iPhone as a quality register ("modern iPhone camera quality") is fine — that describes the footage, not a thing in the room. Only a PROOF shot may show a screen, as the subject being looked at.

Respond with ONLY this envelope. No markdown, no commentary, nothing outside the tags:

<VARIATION>
<LABEL>short descriptive shot label, e.g. COUNTER REACTION</LABEL>
<TAG>${forceTag ?? 'ACTION|EMOTIONAL|PRODUCT|POV|ENVIRONMENT|TRANSITION|PROOF'}</TAG>
<REFS>character|product|both|none</REFS>
<PROMPT>
the six labelled lines
</PROMPT>
</VARIATION>`

  const messages: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: prompt }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)

  // Tag envelope rather than JSON: the six-field prompt is multi-line, and a
  // raw newline inside a JSON string is a parse error — which used to surface
  // as "Regenerate failed" on a response that was otherwise perfectly good.
  // Same shape (and same helpers) as the scene parser above.
  const labelRaw = responseText.match(/<LABEL>([\s\S]*?)<\/LABEL>/)?.[1]?.trim()
  const tagRaw = responseText.match(/<TAG>([\s\S]*?)<\/TAG>/)?.[1]?.trim()
  const refsRaw = responseText.match(/<REFS>([\s\S]*?)<\/REFS>/)?.[1]?.trim().toLowerCase()
  const promptRaw = responseText.match(/<PROMPT>([\s\S]*?)<\/PROMPT>/)?.[1]?.trim()
  if (!promptRaw) {
    throw new Error(`No <PROMPT> in the variation response — body: ${responseText.slice(0, 400)}`)
  }

  // Honour the forced tag even if the LLM ignores the instruction; validate
  // a free-choice tag against the known union so a made-up role can't leak
  // into persisted state.
  const finalTag: VariationTag = forceTag ?? parseTag(tagRaw) ?? 'ACTION'
  return {
    id: nextId(),
    label: labelRaw || defaultLabelFor(finalTag),
    tag: finalTag,
    refs: parseRefs(refsRaw) ?? defaultRefsFor(finalTag, undefined),
    prompt: promptRaw,
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

  const userMessage = `Rewrite the draft below for the ${variation.tag} variation of this scene. Keep the user's intent; tighten the language; obey the framework.

Scene ${scene.number} — LINE: "${scene.scriptLine}"
Variation tag: ${variation.tag}${variation.label ? `\nShot label: ${variation.label}` : ''}
${productContext ? `\n${productContext}\n` : ''}${modelContext ? `\n${modelContext}\nIMPORTANT: never describe the character's physical appearance in detail. Refer to them as "the character".\n` : ''}
Rules:
- Return the six labelled lines from PROMPT FORMAT — SETTING, CAMERA, LIGHTING, ACTION, DIALOGUE, AUDIO — in that order, 130-200 words total. If the draft is one unlabelled paragraph, that is exactly what you are here to fix: sort its content into the right fields and fill any the draft never covered.
- Enhance means ADD DETAIL, not rephrase. Every field should come back richer than it went in — more specific props, exact body and hand position, the real light source, precise micro-expressions, the actual sounds. Never return a prompt shorter than the draft.
- Specificity over completeness — body position, hand position, gaze, micro-expression, setting detail, framing.
- Never "he/him/she/her/subject" — use "the character" or "they/them/their".
- The realism stack goes in the fields that own it: quality register in CAMERA, light in LIGHTING, unposed movement in ACTION. No "Style: ..." trailer.
- DO NOT mention aspect ratio, resolution, or framing in numbers.
- State the shot size + camera angle explicitly; the composition is owned by the prompt, not by any attached reference image. Keep the user's chosen framing if they named one, otherwise pick a distinctive, non-default shot.
- THE CAMERA IS A VIEWPOINT, NOT A PROP. Strip every mention of the filming device — no phone, iPhone, smartphone, front camera, tripod, or ring light as an object in the scene; nothing held, propped, or reflected; no mirror selfie. Rewrite any such phrasing as pure geometry (height relative to the eyeline, distance, angle): "phone held at arm's length below chin level" becomes "framed from just below chin height, about an arm's length away". If the user's draft names a device, that is exactly what you are here to fix — keep their intended shot, drop the equipment. "Modern iPhone camera quality" as a quality register is fine.
- Honour the shot role: ${TAG_BRIEFS[variation.tag]}
- This is SILENT b-roll: no one speaks, no words are mouthed, DIALOGUE is exactly "none", and AUDIO describes only the diegetic sound of the scene (no dialogue, no music, no voiceover). If the draft has the character talking to camera or speaking a line, that is exactly what you are here to fix — keep the shot, drop the speech.

Draft:
"""
${draft}
"""

Respond with ONLY this envelope. No markdown, no commentary, nothing outside the tags:

<PROMPT>
the six labelled lines
</PROMPT>`

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: SYSTEM_INSTRUCTION }] },
    { role: 'user', content: [{ type: 'text', text: userMessage }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)
  const tagged = responseText.match(/<PROMPT>([\s\S]*?)<\/PROMPT>/)?.[1]?.trim()
  if (tagged) return tagged
  // No envelope — the model answered with the bare rewrite. Strip any code
  // fence and use it as-is rather than failing an otherwise good response.
  return responseText
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/<\/?PROMPT>/g, '')
    .trim()
}
