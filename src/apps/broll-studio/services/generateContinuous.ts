// Continuous mode: keyframe-chain ads (the Zack D Films register). One LLM call
// turns the script into a STORYBOARD — N narration scenes plus N+1 keyframes,
// where keyframe N+1 is simultaneously scene N's end state and scene N+1's start
// state. Each keyframe ships as several distinct visual CONCEPTS the user picks
// from (images are cheap; video credits only burn once the chain is locked).
// Clips are frames-to-video generations: first frame = chosen keyframe N, last
// frame = chosen keyframe N+1, prompt = the scene's motion + SFX.
//
// Style is storyboard-wide and rides OUTSIDE the editable prompts (appended at
// fire time by buildContinuousPrompt) so it can't drift frame to frame. Every
// style except UGC Realism bypasses the app's deterministic iPhone-realism
// stack — "unedited photorealism, zero bokeh" actively fights a 3D render.

import type { ContinuousConcept, ContinuousFrame, ContinuousResult, ContinuousScene } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { kieChatCompletions, type ChatMessage } from '../../../utils/kie'
import { getChatEndpointPath, getModel, snapVideoDurationUp } from '../../../utils/models'

// Models allowed in the Continuous picker — frames-to-video capable only (the
// whole mode is first/last-frame interpolation). Gemini Omni is out: it has no
// frame-conditioned mode at all. Seedance 2.0 is the default — cheap,
// first/last-frame native, and it generates the transitional SFX this style
// leans on. The picker lives in the CLIP modal, not the left panel: the model
// only matters once there are keyframes to animate.
export const CONTINUOUS_MODEL_IDS = [
  'bytedance/seedance-2',
  'bytedance/seedance-2-fast',
  'bytedance/seedance-2-mini',
  'bytedance/seedance-1.5-pro',
  'kling-3.0/video',
]

export const CONTINUOUS_DEFAULT_MODEL_ID = 'bytedance/seedance-2'

// How many visual concepts each keyframe fans out into. More live in the
// per-frame "Add concept" button.
export const CONCEPTS_PER_FRAME = 3

// ~2.4 words/sec narration pace — same assumption as Scripts / One-Shot.
const WORDS_PER_SECOND = 2.4

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// Clip length for one scene's narration slice. These clips are quick, punchy
// beats — floor at 3s so a five-word line still gets a real transition.
export function sceneDuration(scriptLine: string, modelId: string): number {
  const durations = getModel(modelId)?.videoConstraints?.durations ?? []
  const raw = Math.max(3, Math.ceil(wordCount(scriptLine) / WORDS_PER_SECOND))
  return durations.length > 0 ? snapVideoDurationUp(raw, durations) : raw
}

// ── Visual styles ──────────────────────────────────────────────
// The preset seeds the LLM's STYLE block; the LLM adapts it to the product and
// script. The chain mechanic works for any aesthetic — 3D is just the default.

export interface ContinuousStyle {
  id: string
  label: string
  hint: string
  // True only for the live-action UGC style: it KEEPS the app's deterministic
  // iPhone-realism stack switched on. Every stylized style bypasses it.
  realism?: boolean
}

export const CONTINUOUS_STYLES: ContinuousStyle[] = [
  {
    id: 'zack-3d',
    label: '3D Animated',
    hint: 'Glossy stylized 3D render in the viral explainer register: soft rounded character shapes with slightly exaggerated proportions, vivid saturated colors, clean smooth surfaces, soft volumetric lighting with gentle rim light, high-detail render like a premium animated short. Never photoreal, never live-action.',
  },
  {
    id: 'clay',
    label: 'Claymation',
    hint: 'Handcrafted stop-motion claymation: visible fingerprints and tool marks in the clay, slightly imperfect handmade shapes, miniature-set depth, warm practical lighting on a physical diorama.',
  },
  {
    id: 'paper',
    label: 'Papercraft',
    hint: 'Layered paper-cutout diorama: crisp cut edges, subtle drop shadows between paper layers, flat colors with visible paper texture, everything staged like a handmade pop-up book scene.',
  },
  {
    id: 'anime',
    label: 'Anime',
    hint: 'Clean 2D anime cel style: bold linework, flat cel shading with two-tone shadows, expressive faces, painterly backgrounds with soft light bloom.',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    hint: 'Photoreal cinematic live-action: filmic color grade, shallow-but-controlled depth, deliberate camera language, commercial-grade art direction. Polished on purpose — the one style where gloss is the goal.',
  },
  {
    id: 'ugc',
    label: 'UGC Realism',
    hint: 'Real, unpolished creator footage shot on a modern phone: casual unstaged framing, natural available light from a real source, zero bokeh and sharp focus across the frame, no colour grade and no commercial gloss. The look of a phone camera, never the sight of one — never name or show a phone, camera, tripod, or ring light anywhere in frame, and never stage a mirror selfie. People look like they just decided to film this.',
    realism: true,
  },
]

export function getContinuousStyle(id: string): ContinuousStyle {
  return CONTINUOUS_STYLES.find((s) => s.id === id) ?? CONTINUOUS_STYLES[0]
}

// Whether this storyboard keeps the app-wide iPhone-realism suffix. A style
// analysed from reference images is stylized by assumption — the user picks
// UGC Realism explicitly when they want the live-action stack.
export function styleUsesRealism(styleId: string, hasCustomBrief: boolean): boolean {
  if (hasCustomBrief) return false
  return getContinuousStyle(styleId).realism === true
}

// ── Style from reference images ────────────────────────────────
// The user drops in frames of an ad whose look they want. A vision pass distils
// the AESTHETIC ONLY — never the subjects, products, or scenes in them — into a
// STYLE paragraph that then drives every keyframe and clip.

const STYLE_ANALYSIS_SYSTEM = `You are an art director reverse-engineering a visual style from reference frames.

Your ONLY job is to describe HOW these images look, never WHAT is in them. Your output is appended to unrelated image and video prompts for a completely different script, so any subject matter you carry over is a bug: no characters, no products, no locations, no story, no specific objects from these references.

Describe, in ONE dense paragraph of 90-150 words:
- MEDIUM & RENDER: the technique (3D render, 2D cel animation, claymation, papercraft, live-action photography, mixed media), how stylized vs photoreal it is, surface quality (glossy, matte, grainy, painterly), and the apparent render engine or film-stock character.
- FORMS: how shapes and figures are treated — proportions (realistic vs exaggerated), edge quality (hard linework, soft rounded, cut-paper crisp), geometric detail level, texture density.
- PALETTE: the actual dominant colours and their relationships (name the colours; never just "vibrant"), saturation, contrast, and any consistent grade or tint.
- LIGHT: the lighting register — sources, softness, direction tendencies, rim and volumetric effects, shadow depth, bloom or haze.
- CAMERA & FINISH: typical framing and lens character, depth-of-field behaviour, grain or noise, and any post treatment (vignette, chromatic aberration, halation).

Write it as direct style direction an image model can act on, present tense, one flowing paragraph. Name concrete visual qualities, never vague praise ("beautiful", "high quality", "professional"). If the references disagree, describe the dominant look and ignore the outlier.

Output ONLY the paragraph. No preamble, no headings, no bullets, no markdown.`

// `images` are data URIs (the uploader converts on attach). Returns the style
// paragraph, which replaces the preset hint for this storyboard.
export async function analyzeStyleReferences(images: string[]): Promise<string> {
  if (images.length === 0) throw new Error('Attach at least one reference image first.')
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: STYLE_ANALYSIS_SYSTEM }] },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Describe the visual STYLE shared by ${images.length === 1 ? 'this reference frame' : `these ${images.length} reference frames`}. Style only — carry over no subjects, products, locations, or story from the images.`,
        },
        ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      ],
    },
  ]

  const responseText = await kieChatCompletions(apiKey, endpoint, messages, {
    timeoutMs: 180_000,
    reasoningEffort: 'high',
  })
  const cleaned = responseText.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim()
  if (!cleaned) throw new Error('The style analysis came back empty. Try again.')
  return cleaned
}

// ── Prompt assembly at fire time ───────────────────────────────

// Final image/video prompt: the editable scene text plus the storyboard-wide
// style block. The style rides OUTSIDE the editable prompt so the cards stay
// readable and the style can't drift per-frame.
export function buildContinuousPrompt(editable: string, style: string): string {
  const trimmed = editable.trim()
  if (!style.trim()) return trimmed
  return `${trimmed}\n\nSTYLE: ${style.trim()}`
}

// Reference preamble for keyframe image generation. The chain reference (the
// previous frame's chosen keyframe) is the character-lock protocol: it fixes
// style/character/environment continuity without inheriting composition.
export function buildContinuousPreamble(opts: { chain: boolean; character: boolean; product: boolean; extras: number }): string {
  const parts: string[] = []
  if (opts.chain) {
    parts.push(
      'The FIRST attached image is the previous keyframe of this same sequence. Maintain its exact art style, rendering technique, character design, colour palette, material language, and environment continuity — this new frame must look like the very next moment of the same film. Do NOT copy its composition, camera angle, or framing: build the new shot entirely from the scene description below.',
    )
  }
  if (opts.character) {
    parts.push("Match the character's face, hair, and wardrobe to the character reference image, translated faithfully into the sequence's art style.")
  }
  if (opts.product) {
    parts.push("Match the product's shape, label text, and colours exactly to the product reference image, translated into the sequence's art style.")
  }
  if (opts.extras > 0) {
    parts.push('Any remaining attached images are additional appearance references — use them for identity and detail only, never for composition.')
  }
  if (parts.length === 0) return ''
  return `REFERENCE USAGE — ${parts.join(' ')}`
}

// ── Prompt formats ─────────────────────────────────────────────
//
// Both formats are labelled-field, not prose. Image and video models weight
// what they can find, and a named COMPOSITION / LIGHTING line is far harder to
// skim past than the same words buried mid-sentence. The word floors matter:
// under-specified prompts are the biggest single cause of generic output, and
// a frame that could describe two different images will render as neither.

const KEYFRAME_FORMAT = `Every keyframe prompt is five labelled lines, in this exact order, one line each:

SUBJECT: exactly who or what is in frame and in what state — the pose, the body position, the hand position, the gaze direction, and the expression as a specific muscle action ("brows drawn together, jaw set"), plus whatever they are physically holding or touching. If the frame has no character, name the hero object and its exact orientation.
SETTING: the place and the moment, named concretely — the actual space, the surfaces, and the two or three specific props that sell it, plus the depth cues (what is close, what is mid, what fills the background). Never "a modern room" — say what is in it.
COMPOSITION: the shot size (extreme close-up / macro / close-up / medium / medium-wide / wide / aerial), the camera height relative to the subject, the angle (straight on, low, high, overhead, three-quarter), and where the subject sits in the vertical 9:16 frame. State the safe-zone margin explicitly: the subject is centred with comfortable headroom and side margin so nothing crucial touches the frame edge.
LIGHTING: the real light source or sources, their direction and colour temperature, the quality (hard or soft), where the shadows fall, and any rim, glow, or volumetric effect. Name the dominant colour of the light.
DETAIL: the texture and material specifics that make it feel rendered rather than sketched — surface finishes, micro-detail, particles, atmosphere, reflections. Close with the emotional register of the image in three or four words.

Format rules:
- All five labels appear in every prompt, in this order. One line per field.
- Aim for 110-170 words across the five fields. A frame described in under 100 words is under-specified and will render as generic stock.
- Never repeat yourself across fields: the pose belongs in SUBJECT, the space in SETTING, the framing in COMPOSITION, the light in LIGHTING.
- Never name the art style, medium, or render technique — the style block is appended separately to every prompt.
- No captions, subtitles, watermarks, on-screen text, logos, or UI of any kind.`

const MOTION_FORMAT = `Every motion prompt is three labelled lines, in this exact order, one line each:

MOTION: the physical movement carrying the start frame into the end frame — what moves, and in which direction, described as a vector ("lifts up and back", "rotates clockwise as it opens", "collapses inward"). Name the transformation when one state becomes another. One or two sentences.
CAMERA: how the frame itself moves across the clip — push in, pull back, orbit left, tilt down, track alongside, or hold steady — plus the speed (slow, steady, quick) and whether it eases at the end.
SFX: one transitional sound direction only — e.g. a soft sci-fi whoosh, a low building rumble, a gentle pop, a soft chime, or silence.

Format rules:
- The motion must plausibly connect ANY staging of the start frame to ANY staging of the end frame, so describe it in terms of the story state, never one specific composition.
- Keep it physical and simple: this is interpolation direction, not a new scene. 45-80 words total.
- Never write dialogue, narration, or music — a voiceover and a music bed are added later in the edit.`

// ── The storyboard system prompt ───────────────────────────────

const CONTINUOUS_SYSTEM = `# ROLE

You are the creative director of viral explainer ads — the Zack D Films register: short vertical videos that feel like ONE continuous, morphing shot. You storyboard in keyframes: every narration line gets a start image, the next line's image is simultaneously this line's end state, and a video model interpolates the motion between each pair. Because clip N literally ends on clip N+1's first frame, the cuts are invisible.

# YOUR JOB

Turn the user's script into a STORYBOARD:

1. Split the script into narration SCENES (complete sentences — never cut mid-clause; merge any fragment of four words or fewer forward into the next sentence).
2. For every scene, design its START keyframe. After the last scene, design one FINAL keyframe (the end state the last clip lands on). So there is always exactly ONE more frame than there are scenes.
3. For every scene, write the MOTION that carries its keyframe into the NEXT keyframe, plus one transitional SFX.
4. Give every keyframe ${CONCEPTS_PER_FRAME} distinct visual CONCEPTS.

# SHOW, NOT TELL

Every line of narration is represented by a concrete visual action or metaphor — never a static talking head, never text on screen. "Your liver filters toxins" is a glowing factory inside a translucent body, conveyor belts sorting particles — not a person explaining. When the script names the product, the product IS the visual.

# SPECIFICITY IS THE WHOLE JOB

Vague direction renders as generic footage. Every frame names the exact prop, the exact body and hand position, the exact expression, the exact light source, and the exact material. Write each keyframe the way you would describe a still you are looking at right now and logging in detail — not the way you would pitch it. If a prompt could describe two visually different images, it is not finished. When in doubt, add specificity, never another scene.

Banned everywhere: "beautiful", "stunning", "modern", "clean", "minimalist", "high quality", "professional", "cinematic vibe", "looking happy/sad/frustrated" (name what the face is actually doing), "using the product" (name the actual action).

# KEYFRAME RULES

- Each keyframe is a single striking image: one clear subject, one readable idea. If a frame needs a sentence of explanation to work, simplify the idea — then describe the simpler idea in full detail.
- SAFE FRAMING: vertical 9:16 with platform UI overlaying the edges — keep the subject centred with comfortable margins, never so zoomed that crucial elements touch the frame edge.
- CONTINUITY IS EVERYTHING: consecutive keyframes must read as two moments of the same world. Same character design, same palette, same environment unless the story moves. Frame N+1 must be a state that frame N can physically morph or move into.
- Refer to the on-screen person as "the character" and the product as "the product" — reference images fix their exact look. Never describe the character's identity (gender, age, ethnicity, hair colour, skin tone); pose, expression, gesture, and body language ARE required.
- Gender-neutral language only: never he/him/his/she/her, never "subject". Use "the character" or "they/them/their".
- Never mention the art style, medium, or render technique inside a frame prompt — the style is appended separately.

# KEYFRAME PROMPT FORMAT (EVERY CONCEPT)

${KEYFRAME_FORMAT}

# CONCEPT VARIATIONS

The ${CONCEPTS_PER_FRAME} concepts for one keyframe vary the COMPOSITION, CAMERA ANGLE, and VISUAL METAPHOR — never the story state. Whichever concept the user picks, the sequence must still connect: every concept of frame N must work as the end of scene N-1's motion and the start of scene N's motion. Make them genuinely different stagings — a macro close-up, a wide aerial, an inside-the-object view — not three crops of the same image. Each concept gets the full five-field treatment; a thinner alternative concept is a failure.

# MOTION PROMPT FORMAT (EVERY SCENE)

${MOTION_FORMAT}

# OUTPUT FORMAT (STRICT)

Wrap your answer in this exact XML envelope. No text outside the tags, no markdown fences.

<STORYBOARD>
<STYLE>One dense paragraph of 90-150 words locking the visual style for the whole sequence — medium and rendering technique, how forms and figures are treated, the named colour palette, the lighting register, and the camera/finish character. Adapt the style brief you are given to this specific script and product. This paragraph is appended verbatim to every image and video prompt, so it must be pure style direction with no subject matter in it.</STYLE>
<SCENE_1>
<LINE>exact narration slice, a complete sentence</LINE>
<MOTION>
MOTION: ...
CAMERA: ...
SFX: ...
</MOTION>
<FRAME>
<CONCEPT_1>
<LABEL>2-4 word slug naming this staging, e.g. INSIDE THE BOTTLE</LABEL>
<PROMPT>
SUBJECT: ...
SETTING: ...
COMPOSITION: ...
LIGHTING: ...
DETAIL: ...
</PROMPT>
</CONCEPT_1>
<CONCEPT_2>a DIFFERENT staging, same story state, same five-field depth</CONCEPT_2>
<CONCEPT_3>a DIFFERENT staging again, same five-field depth</CONCEPT_3>
</FRAME>
</SCENE_1>
(repeat <SCENE_N> for every scene, in script order)
<FINAL_FRAME>
<CONCEPT_1>...</CONCEPT_1>
<CONCEPT_2>...</CONCEPT_2>
<CONCEPT_3>...</CONCEPT_3>
</FINAL_FRAME>
</STORYBOARD>`

export interface ContinuousInput {
  scriptText: string
  styleId: string
  // Style paragraph distilled from the user's reference images. When present it
  // replaces the preset hint entirely.
  styleBrief?: string
  modelId: string
  productContext: string
  modelContext: string
  additionalContext: string
}

function styleBriefFor(input: Pick<ContinuousInput, 'styleId' | 'styleBrief'>): string {
  return input.styleBrief?.trim() || getContinuousStyle(input.styleId).hint
}

function buildUserPrompt(input: ContinuousInput): string {
  let prompt = `Storyboard this script as a keyframe-chain ad.\n\nScript:\n${input.scriptText}\n\nSTYLE BRIEF (adapt into the <STYLE> block): ${styleBriefFor(input)}\n`
  if (input.styleBrief?.trim()) {
    prompt += `\nThat style brief was reverse-engineered from reference frames the user supplied. Honour it exactly — it outranks any default look you would otherwise reach for.\n`
  }
  if (input.productContext) prompt += `\n${input.productContext}\n`
  if (input.modelContext) {
    prompt += `\n${input.modelContext}\nIMPORTANT: never describe the character's physical appearance — say "the character"; a reference image fixes their look.\n`
  }
  if (input.additionalContext) prompt += `\nAdditional context and instructions:\n${input.additionalContext}\n`
  prompt += `\nWrite the full <STORYBOARD> now. Every keyframe concept gets all five labelled fields at full depth — no thinning out on the later scenes.`
  return prompt
}

// ── Parser ─────────────────────────────────────────────────────

function extractTag(source: string, tag: string): string | null {
  const m = source.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1].trim() : null
}

// Strip straggler control tags from a prompt body so a misformed response never
// pastes raw XML into an editable field.
function cleanPromptBody(text: string): string {
  return text
    .replace(/<LABEL>[\s\S]*?<\/LABEL>/gi, '')
    .replace(/<\/?(STORYBOARD|SCENE_\d+|CONCEPT_\d+|FINAL_FRAME|FRAME|PROMPT|LABEL|LINE|MOTION|STYLE)>/gi, '')
    .trim()
}

let idCounter = 0
function nextConceptId(): string {
  return `cont-${Date.now()}-${++idCounter}`
}

const MAX_SCENES = 40

function parseConcepts(frameBlock: string): ContinuousConcept[] {
  const concepts: ContinuousConcept[] = []
  for (let j = 1; j <= CONCEPTS_PER_FRAME + 2; j++) {
    const block = extractTag(frameBlock, `CONCEPT_${j}`)
    if (!block) continue
    const prompt = cleanPromptBody(extractTag(block, 'PROMPT') ?? block)
    if (!prompt) continue
    concepts.push({
      id: nextConceptId(),
      label: extractTag(block, 'LABEL') ?? `Option ${concepts.length + 1}`,
      prompt,
    })
  }
  return concepts
}

// Tolerant parse of the storyboard response. Returns null only when nothing
// usable came back.
export function parseContinuousResult(responseText: string, input: ContinuousInput): ContinuousResult | null {
  const body = extractTag(responseText, 'STORYBOARD') ?? responseText
  const style = extractTag(body, 'STYLE') ?? styleBriefFor(input)

  const scenes: ContinuousScene[] = []
  const frames: ContinuousFrame[] = []
  for (let i = 1; i <= MAX_SCENES; i++) {
    const sceneBlock = extractTag(body, `SCENE_${i}`)
    if (!sceneBlock) break
    const line = extractTag(sceneBlock, 'LINE') ?? ''
    const frameBlock = extractTag(sceneBlock, 'FRAME') ?? sceneBlock
    const concepts = parseConcepts(frameBlock)
    if (concepts.length === 0) continue
    frames.push({ index: frames.length + 1, concepts })
    // MOTION now carries its own labelled lines (MOTION / CAMERA / SFX). The
    // separate <SFX> tag is still read for tolerance — older/looser responses
    // put it outside the motion block.
    scenes.push({
      index: scenes.length + 1,
      scriptLine: line,
      motionPrompt: cleanPromptBody(extractTag(sceneBlock, 'MOTION') ?? ''),
      sfx: extractTag(sceneBlock, 'SFX') ?? '',
      durationSeconds: sceneDuration(line || input.scriptText, input.modelId),
    })
  }
  if (scenes.length === 0) return null

  // Final frame — the end state the last clip lands on. If the model dropped
  // it, reuse the last scene frame's concepts (fresh ids) so the chain still
  // has an end anchor rather than a broken last clip.
  const finalBlock = extractTag(body, 'FINAL_FRAME')
  const finalConcepts = finalBlock ? parseConcepts(finalBlock) : []
  frames.push({
    index: frames.length + 1,
    concepts: finalConcepts.length > 0
      ? finalConcepts
      : frames[frames.length - 1].concepts.map((c) => ({ ...c, id: nextConceptId() })),
  })

  return {
    style,
    styleId: input.styleId,
    realism: styleUsesRealism(input.styleId, !!input.styleBrief?.trim()),
    scenes,
    frames,
    modelId: input.modelId,
  }
}

// ── Entry points ───────────────────────────────────────────────

export async function generateContinuous(input: ContinuousInput): Promise<ContinuousResult> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()
  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: CONTINUOUS_SYSTEM }] },
    { role: 'user', content: [{ type: 'text', text: buildUserPrompt(input) }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)
  const result = parseContinuousResult(responseText, input)
  if (!result) throw new Error('The storyboard came back empty. Try again.')
  return result
}

// Shared context for the per-frame prompt tools (Add concept / Enhance /
// Regenerate) — everything the LLM needs to write a frame that still chains.
export interface FrameContext {
  style: string
  conceptLabel?: string
  scriptLine: string
  inboundMotion?: string
  outboundMotion?: string
  isFinal: boolean
  isOpening: boolean
  existingLabels: string[]
  productContext?: string
  modelContext?: string
}

export function frameContextFor(
  result: ContinuousResult,
  frameIndex: number,
  ctx: { productContext?: string; modelContext?: string; conceptLabel?: string },
): FrameContext {
  const frame = result.frames.find((f) => f.index === frameIndex)
  const inbound = result.scenes.find((s) => s.index === frameIndex - 1)
  const outbound = result.scenes.find((s) => s.index === frameIndex)
  return {
    style: result.style,
    conceptLabel: ctx.conceptLabel,
    scriptLine: outbound?.scriptLine ?? '',
    inboundMotion: inbound?.motionPrompt,
    outboundMotion: outbound?.motionPrompt,
    isFinal: !outbound,
    isOpening: frameIndex === 1,
    existingLabels: frame?.concepts.map((c) => c.label) ?? [],
    productContext: ctx.productContext,
    modelContext: ctx.modelContext,
  }
}

function frameBriefBlock(ctx: FrameContext, frameIndex: number): string {
  let out = `STYLE (fixed for the sequence — never restate it inside the prompt): ${ctx.style}\n`
  out += ctx.isOpening
    ? '\nThis is the OPENING keyframe of the ad.\n'
    : `\nThe motion ARRIVING at this frame (from the previous keyframe):\n${ctx.inboundMotion || '(not specified)'}\n`
  out += ctx.isFinal
    ? 'This is the FINAL keyframe — the end state the last clip lands on.\n'
    : `The narration line this frame opens: "${ctx.scriptLine}"\nThe motion LEAVING this frame (into the next keyframe):\n${ctx.outboundMotion || '(not specified)'}\n`
  if (ctx.productContext) out += `\n${ctx.productContext}\n`
  if (ctx.modelContext) out += `\n${ctx.modelContext}\nNever describe the character's appearance — say "the character".\n`
  out += `\nThis is keyframe ${frameIndex} of the sequence, and it must still connect with the motions above whichever way the neighbouring frames are staged.`
  return out
}

const FRAME_ENVELOPE_NOTE =
  'Respond with ONLY this envelope — no markdown, no commentary, nothing outside the tags:'

// One more concept for a single keyframe (the frame row's "Add concept" card).
export async function generateContinuousConcept(
  result: ContinuousResult,
  frameIndex: number,
  input: { productContext?: string; modelContext?: string },
): Promise<ContinuousConcept> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()
  const ctx = frameContextFor(result, frameIndex, input)

  const user = `Write ONE fresh visual concept for this keyframe — a genuinely different staging from the existing ones, same story state.

${frameBriefBlock(ctx, frameIndex)}

Existing concepts to differ from: ${ctx.existingLabels.join(' · ') || '(none yet)'}

Use a different shot size, camera angle, and visual metaphor from all of them.

${FRAME_ENVELOPE_NOTE}
<CONCEPT>
<LABEL>2-4 word slug</LABEL>
<PROMPT>
the five labelled lines
</PROMPT>
</CONCEPT>`

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: CONTINUOUS_SYSTEM }] },
    { role: 'user', content: [{ type: 'text', text: user }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)
  const block = extractTag(responseText, 'CONCEPT') ?? responseText
  const prompt = cleanPromptBody(extractTag(block, 'PROMPT') ?? block)
  if (!prompt) throw new Error('Could not generate another concept')
  return {
    id: nextConceptId(),
    label: extractTag(block, 'LABEL') ?? 'Fresh staging',
    prompt,
  }
}

// Rewrite the user's draft keyframe prompt richer, same staging.
export async function enhanceContinuousFrame(draft: string, ctx: FrameContext, frameIndex: number): Promise<string> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()
  const user = `Rewrite the keyframe prompt below to be MORE detailed and specific while keeping the SAME staging, shot size, camera angle, and story state. Sharpen every field — the exact pose and hand position, the named props, the real light source and its colour, the material textures — and fill any of the five fields the draft never covered. Do not change what the image is of.

${frameBriefBlock(ctx, frameIndex)}
${ctx.conceptLabel ? `\nThis concept's staging: ${ctx.conceptLabel}\n` : ''}
Current prompt:
"""
${draft}
"""

Return the five labelled lines (SUBJECT / SETTING / COMPOSITION / LIGHTING / DETAIL), 110-170 words. If the draft is one unlabelled paragraph, that is exactly what you are here to fix: sort its content into the right fields and fill the gaps.

${FRAME_ENVELOPE_NOTE}
<PROMPT>
the five labelled lines
</PROMPT>`

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: CONTINUOUS_SYSTEM }] },
    { role: 'user', content: [{ type: 'text', text: user }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)
  return cleanPromptBody(extractTag(responseText, 'PROMPT') ?? responseText)
}

// Fresh take on the same keyframe slot — a different staging entirely.
export async function regenerateContinuousFrame(ctx: FrameContext, frameIndex: number): Promise<string> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()
  const user = `Write a FRESH prompt for this keyframe — a genuinely different staging from any previous version, same story state.

${frameBriefBlock(ctx, frameIndex)}
${ctx.existingLabels.length ? `\nStagings already used on this frame: ${ctx.existingLabels.join(' · ')}\n` : ''}
Return the five labelled lines (SUBJECT / SETTING / COMPOSITION / LIGHTING / DETAIL), 110-170 words.

${FRAME_ENVELOPE_NOTE}
<PROMPT>
the five labelled lines
</PROMPT>`

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: CONTINUOUS_SYSTEM }] },
    { role: 'user', content: [{ type: 'text', text: user }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)
  return cleanPromptBody(extractTag(responseText, 'PROMPT') ?? responseText)
}

// ── Demo / preview data ────────────────────────────────────────
// Shown when no kie.ai key is set so a member can see what the storyboard
// produces before wiring billing. Written in the real five-field format at the
// real depth, so the preview doesn't undersell the output.

interface DemoFrameSpec {
  concepts: { label: string; prompt: string }[]
}

const DEMO_STYLE =
  'Glossy stylized 3D render in the viral explainer register: soft rounded characters with gently exaggerated proportions and smooth subsurface-scattering skin, forms built from clean bevelled geometry with no hard edges, a palette of deep midnight blue and slate grey lit by warm amber and honey-gold accents, soft volumetric lighting with a gentle rim light separating every subject from its background, shallow atmospheric haze in the deep field, and a high-detail premium-animated-short finish with subtle bloom around light sources. Never photoreal, never live-action, no film grain.'

const DEMO_SCENES = [
  {
    line: 'Your brain never actually switches off at night.',
    motion: `MOTION: The bedroom wall dissolves away as the view travels inward toward the sleeping character, the amber glow at their temple swelling and blooming outward until it fills the frame and becomes the interior space.
CAMERA: A slow, steady push in from outside the window, easing to a stop as the glow takes over.
SFX: a soft airy whoosh building into a low hum`,
    sfx: 'a soft airy whoosh',
  },
  {
    line: 'While you sleep, it runs a full cleanup cycle, flushing out the waste that builds up all day.',
    motion: `MOTION: Glowing amber orbs stream along the pathways and converge into one bright channel that drains downward, the grey dust motes carried away with them as the whole space brightens and clears.
CAMERA: A slow orbit to the left around the central channel, drifting gently downward to follow the flow.
SFX: a shimmering hum with a soft rushing undertone`,
    sfx: 'a gentle shimmering hum',
  },
  {
    line: 'One scoop of this before bed gives that cycle everything it needs.',
    motion: `MOTION: The product rises up into frame as a scoop of powder tips and dissolves into a spiral of light, the spiral flowing upward and outward until it settles into a calm, even glow surrounding the sleeping figure.
CAMERA: A steady pull back with a slight tilt up, easing to a hold on the wide final composition.
SFX: a soft magical pop followed by a warm settling chime`,
    sfx: 'a soft magical pop',
  },
]

const DEMO_FRAMES: DemoFrameSpec[] = [
  {
    concepts: [
      {
        label: 'MOONLIT BEDROOM',
        prompt: `SUBJECT: The character lies asleep on their side under a thick quilted duvet, one arm folded up beside the pillow and the other tucked under it, lips slightly parted, brow completely smooth and still. A single warm point of light glows steadily at their temple.
SETTING: A small lived-in bedroom at night, seen from just outside the window. A paperback lies face-down on the nightstand beside a half-full glass of water and a folded pair of glasses; a knitted throw spills off the end of the bed. The window frame edges the foreground, the bed sits mid-depth, and a wardrobe stands in soft shadow behind.
COMPOSITION: Medium-wide shot from just above the sleeping figure's height, angled slightly down through the window. The character is centred in the vertical 9:16 frame with generous headroom above the pillow and clear side margin so nothing crucial touches the edge.
LIGHTING: Cool blue moonlight falls from the upper left across the duvet, its shadows soft and long; the amber temple glow is the only warm source, casting a small pool of gold onto the pillow beneath.
DETAIL: Fine quilted stitching and soft fabric nap on the duvet, faint dust in the moonbeam, a gentle bloom around the temple light, condensation beading on the water glass. Hushed, safe, quietly mysterious.`,
      },
      {
        label: 'OVERHEAD SLEEPER',
        prompt: `SUBJECT: The character lies flat on their back, arms relaxed at their sides above the duvet, palms open and upward, head turned a few degrees to one side on the pillow. A soft amber halo sits just visible around their head.
SETTING: The same bed, seen from directly above. The duvet folds radiate outward from the body like still ripples on water; the nightstand corner with a paperback and a glass of water enters the lower edge of frame, and the headboard caps the top.
COMPOSITION: Overhead top-down shot, camera high and level, looking straight down. The figure runs vertically through the centre of the 9:16 frame with the duvet filling the width, comfortable margin left at head and foot so neither crops.
LIGHTING: Flat cool blue ambient light from a window off-frame left, gentle and even with almost no hard shadow; the amber halo is the single warm accent, glowing softly into the pillow around the head.
DETAIL: Deep soft folds in the bedding with visible weave, a slight sheen where the moonlight catches the fabric crests, faint particles suspended in the air above. Still, ordered, almost clinical calm.`,
      },
      {
        label: 'TEMPLE GLOW MACRO',
        prompt: `SUBJECT: A tight profile of the sleeping character's face resting on the pillow, eyes gently closed with lashes clearly defined, mouth relaxed, one hand curled loosely near the chin. A single warm point of light pulses softly at the temple, just above the cheekbone.
SETTING: The pillow surface fills the lower frame in soft folds; the dark bedroom recedes behind into cool unlit depth with only the faint edge of a lampshade suggested. Nothing else competes for attention.
COMPOSITION: Macro close-up from pillow height, camera level with the face and very close, three-quarter profile from the front. The face sits centred and slightly low in the vertical 9:16 frame, with clear margin above the head so the glow has room to breathe.
LIGHTING: The temple glow is the key light, warm amber and soft, wrapping the near cheek and falling off quickly; cool blue moonlight rims the back of the head and shoulder from behind, separating the figure from the dark.
DETAIL: Soft skin shading with gentle subsurface warmth where the glow passes through, individual pillow fibres catching light, a faint amber bloom ring around the temple point. Intimate, warm, quietly alive.`,
      },
    ],
  },
  {
    concepts: [
      {
        label: 'NEURAL FACTORY',
        prompt: `SUBJECT: The interior of the brain staged as a vast working factory hall. Translucent neural pathways run through it as glass tubes carrying streams of small amber orbs, while a handful of rounded cleanup drones sweep grey dust motes from the walkways with soft brushes.
SETTING: A cathedral-scale industrial space built from smooth organic architecture — arched pathways branching overhead, gantries at mid-height, a wide central floor. The near gantry rail crosses the foreground, the drones work in the middle distance, and the arches vanish into haze behind.
COMPOSITION: Wide establishing shot from walkway height, camera level and looking down the length of the hall. The central channel runs vertically up the middle of the 9:16 frame, with the arches leaving clear headroom at the top and the gantry margin holding the sides safe.
LIGHTING: Warm amber light travels through the glass tubes and underlights everything from within; cool blue ambient fills the hall from above, so the warm streams read bright against a cold room. Shadows are soft and deep between the arches.
DETAIL: Glass surfaces with faint internal reflections, the drones' matte rounded shells, drifting dust caught in the light, gentle bloom where tubes cross. Busy, purposeful, secretly magnificent.`,
      },
      {
        label: 'RIVER OF LIGHT',
        prompt: `SUBJECT: A luminous river of amber particles winding through a cavern, carrying loose grey dust motes away downstream. No figure — the river itself is the subject, its current reading clearly from the far bend toward the camera.
SETTING: A deep blue cavern whose walls are formed from soft neuron trees with branching, rounded canopies. Reeds of light line the near bank in the foreground, the river bends through the middle distance, and the canopy closes overhead in the far depth.
COMPOSITION: Low wide shot from just above the water's surface, camera almost level with the river, looking upstream so the current flows toward and past the lens. The river runs up the centre of the vertical 9:16 frame with the banks holding a comfortable margin on both sides.
LIGHTING: The river is self-illuminating warm amber, throwing rippling light up onto the underside of the canopy; the surrounding cavern sits in cool deep blue with a faint cool rim on the tree edges. Reflections dance on the wet banks.
DETAIL: Individual particles of light with soft falloff, gently rippling surface displacement, a light mist hanging above the water, grey motes visibly dulled against the glow. Flowing, cleansing, serene.`,
      },
      {
        label: 'CONTROL ROOM',
        prompt: `SUBJECT: A small rounded robot operator stands at a console, both hands on a large lever pulled fully down, its single soft-glowing eye fixed on the screens ahead. Its posture leans into the pull.
SETTING: A cosy mission-control room built inside the head, all rounded consoles and padded surfaces. Chunky dials and toggles fill the console in the foreground, three curved screens showing tidy streams of light flowing outward sit at mid-depth, and a porthole window looks out into deep blue behind.
COMPOSITION: Medium shot from slightly below the robot's eye line, angled up so the console dominates the lower frame. The robot sits centred and slightly high in the vertical 9:16 frame, screens filling the space behind, with clear margin above the head and around the console edges.
LIGHTING: Warm amber light spills from the screens onto the robot's front and the console surface; cool blue backlight comes through the porthole, rimming the robot's shoulders and separating it cleanly from the wall.
DETAIL: Matte moulded plastic on the robot's shell with subtle scuffs, glossy console buttons with soft highlights, a faint scanline glow on the curved screens, dust motes drifting through the beam. Homely, competent, quietly busy.`,
      },
    ],
  },
  {
    concepts: [
      {
        label: 'HERO JAR RISE',
        prompt: `SUBJECT: The product stands upright and centred with its lid off beside it, a gentle spiral of glowing powder rising from the open mouth and curling toward the top of frame. Nothing else moves.
SETTING: A bedside table in the blue night bedroom. A folded cloth and a glass of water sit just behind the product, the bed and the softly sleeping figure read as a simple silhouette in the deeper background, and the table edge runs across the foreground.
COMPOSITION: Medium close-up from just below the product's shoulder height, angled very slightly up so it reads heroic. The product stands centred in the lower third of the vertical 9:16 frame with the rising spiral filling the space above it and a clear margin on all sides.
LIGHTING: A warm amber glow rises from inside the open product and underlights the spiral from below; cool blue moonlight from the window rims the product's left edge and the water glass, keeping the background cold against the warm centre.
DETAIL: Smooth matte finish on the container with a soft specular band down one side, individual grains of powder catching the light in the spiral, faint bloom where the glow is strongest, condensation on the glass. Calm, ceremonial, inviting.`,
      },
      {
        label: 'SCOOP POUR',
        prompt: `SUBJECT: A rounded scoop tips slowly, releasing a stream of glowing powder into a glass of water below. The powder is caught mid-fall, the water already beginning to spiral with amber light where the stream has entered.
SETTING: The same nightstand, seen close. The product stands tall just behind the glass with its lid resting beside it, and the folded cloth fills the lower foreground. The bedroom behind is reduced to soft dark blue shapes.
COMPOSITION: Macro close-up from glass height, camera level and very close, angled three-quarter from the left. The glass sits centred and low in the vertical 9:16 frame with the scoop entering from the upper right, leaving clear margin around both so neither crops.
LIGHTING: The falling powder is the brightest source, casting warm amber light up into the scoop's underside and down through the water; cool blue ambient holds the background, and a small warm caustic pattern lands on the tabletop beside the glass.
DETAIL: Individual grains separating in the fall, refraction and light-bending through the glass and water, tiny bubbles rising, a soft glow blooming where powder meets liquid. Precise, satisfying, quietly magical.`,
      },
      {
        label: 'GLOW HANDOFF',
        prompt: `SUBJECT: The character's hand sets the product down on the nightstand, fingers still resting on its lid, while a ribbon of warm light arcs from the product across the frame toward their head on the pillow, physically connecting the two.
SETTING: The bedside table in the foreground with the glass and folded cloth beside the product, the bed running back into the middle of frame, and the pillow with the resting head at the far end. The window sits dark behind.
COMPOSITION: Wide shot from table height, camera level and angled along the length of the bed so both the hand and the head are in frame. The light ribbon runs diagonally through the vertical 9:16 frame, the product low-left and the head upper-right, both held well inside the safe margin.
LIGHTING: The ribbon is the key source, warm amber and glowing along its whole length, spilling onto the duvet beneath it and onto the back of the hand; cool blue moonlight fills everything it does not touch.
DETAIL: Soft translucent falloff along the ribbon's edges, gentle skin shading on the hand, fine duvet texture catching the warm spill, faint particles drifting along the arc. Tender, connective, resolved.`,
      },
    ],
  },
  {
    concepts: [
      {
        label: 'RESTORED MORNING',
        prompt: `SUBJECT: The character sits up in bed mid-stretch, both arms raised and elbows bent, back arched slightly, eyes open and face bright with an easy unforced smile. The duvet has fallen to their waist.
SETTING: The same bedroom at sunrise. The product catches a sunbeam on the nightstand beside the now-empty glass, the paperback sits closed, and the window behind is filled with warm morning light. The bed fills the middle of frame.
COMPOSITION: Medium shot from just below eye level, camera level and straight on. The character is centred in the vertical 9:16 frame with clear headroom above the raised arms so the stretch does not crop, and the nightstand held inside the lower left margin.
LIGHTING: Warm golden sunlight streams in from the window camera-right, wrapping the character's face and shoulders and throwing a long soft shadow across the bed; the room's blues have warmed to a gentle neutral.
DETAIL: Soft rim of light along the hair and shoulder, fine dust drifting in the sunbeam, a warm specular highlight on the product's curve, crisp fabric creases in the pushed-back duvet. Fresh, restored, optimistic.`,
      },
      {
        label: 'AURA WIDE',
        prompt: `SUBJECT: The character lies asleep and completely still, now wrapped head to toe in an even, calm amber aura that follows the contour of their body under the duvet. Their face is smooth and untroubled.
SETTING: The full bedroom, seen wide. The nightstand with the product and glass sits at the left edge of frame, the wardrobe stands in soft shadow at the right, and the window behind is beginning to warm toward dawn.
COMPOSITION: Wide shot from slightly above the bed, camera angled gently down over the whole room. The figure runs horizontally across the middle of the vertical 9:16 frame with generous space above and below, everything crucial held well inside the edges.
LIGHTING: The aura is the dominant source, glowing warm amber outward from the figure and lifting the nearby duvet, floor and nightstand out of the dark; the window contributes a cool-to-warm gradient that meets the aura halfway across the room.
DETAIL: Soft graduated falloff at the aura's outer edge, gentle bloom over the whole frame, fine bedding texture picking up the warm light, a faint haze in the air. Peaceful, complete, quietly triumphant.`,
      },
      {
        label: 'BRAIN AT PEACE',
        prompt: `SUBJECT: The factory hall from before, now spotless and dim. The cleanup drones are parked in a neat row along one wall with their brushes stowed, and one last amber orb drifts slowly upward through the centre of the space.
SETTING: The same organic industrial hall, its arched pathways now clear of dust and glowing a steady even amber. The near gantry rail crosses the foreground, the parked drones sit mid-depth against the left wall, and the arches recede cleanly into soft haze.
COMPOSITION: Wide shot from walkway height, camera level and looking down the hall — the same geometry as the earlier factory frame, so the return reads deliberately. The rising orb sits centred in the vertical 9:16 frame with the arches leaving clear headroom above.
LIGHTING: A calm, even amber glow now fills the tubes and washes the whole hall in warm light; the earlier cold blue ambient has faded to a faint cool edge along the far arches. Shadows are shallow and soft.
DETAIL: Clean reflective surfaces with no dust in the air, a soft bloom trailing the drifting orb, the drones' shells catching a low warm highlight, gentle atmospheric depth. Finished, restful, deeply calm.`,
      },
    ],
  },
]

export function buildDemoContinuousResult(modelId: string, styleId: string): ContinuousResult {
  let stamp = 0
  return {
    style: DEMO_STYLE,
    styleId,
    realism: false,
    modelId,
    demo: true,
    scenes: DEMO_SCENES.map((s, i) => ({
      index: i + 1,
      scriptLine: s.line,
      motionPrompt: s.motion,
      sfx: s.sfx,
      durationSeconds: sceneDuration(s.line, modelId),
    })),
    frames: DEMO_FRAMES.map((f, i) => ({
      index: i + 1,
      concepts: f.concepts.map((c) => ({ id: `demo-cont-${++stamp}`, label: c.label, prompt: c.prompt })),
    })),
  }
}
