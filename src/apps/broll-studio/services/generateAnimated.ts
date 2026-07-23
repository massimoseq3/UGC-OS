// Animated mode: Zack-D-Films-style keyframe-chain ads. One LLM call turns the
// script into a STORYBOARD — N narration scenes plus N+1 keyframes, where
// keyframe N+1 is simultaneously scene N's end state and scene N+1's start
// state. Each keyframe ships as 3 distinct visual CONCEPTS the user picks from
// (images are cheap; video credits only burn once the chain is locked). Clips
// are frames-to-video generations: first frame = chosen keyframe N, last frame
// = chosen keyframe N+1, prompt = the scene's motion + SFX.
//
// This mode is deliberately the aesthetic opposite of the rest of B-Roll: no
// iPhone realism suffix anywhere — the style block (stylized 3D render by
// default) is appended instead, at fire time, via buildAnimatedPrompt.

import type { AnimatedConcept, AnimatedFrame, AnimatedResult, AnimatedScene } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { kieChatCompletions, type ChatMessage } from '../../../utils/kie'
import { getChatEndpointPath, getModel, snapVideoDurationUp } from '../../../utils/models'

// Models allowed in the Animated picker — frames-to-video capable only (the
// whole mode is first/last-frame interpolation). Gemini Omni is out: it has no
// frame-conditioned mode at all. Seedance 2.0 is the default — cheap,
// first/last-frame native, and it generates the transitional SFX this style
// leans on.
export const ANIMATED_MODEL_IDS = [
  'bytedance/seedance-2',
  'bytedance/seedance-2-fast',
  'bytedance/seedance-2-mini',
  'bytedance/seedance-1.5-pro',
  'kling-3.0/video',
]

export const ANIMATED_DEFAULT_MODEL_ID = 'bytedance/seedance-2'

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

export interface AnimatedStyle {
  id: string
  label: string
  hint: string
}

export const ANIMATED_STYLES: AnimatedStyle[] = [
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
    hint: 'Photoreal cinematic live-action: filmic color grade, shallow-but-controlled depth, deliberate camera language, commercial-grade art direction. Polished on purpose — this is the one style where gloss is the goal.',
  },
]

export function getAnimatedStyle(id: string): AnimatedStyle {
  return ANIMATED_STYLES.find((s) => s.id === id) ?? ANIMATED_STYLES[0]
}

// ── Prompt assembly at fire time ───────────────────────────────

// Final image/video prompt: the editable scene text plus the storyboard-wide
// style block. The style rides OUTSIDE the editable prompt so the cards stay
// readable and the style can't drift per-frame.
export function buildAnimatedPrompt(editable: string, style: string): string {
  const trimmed = editable.trim()
  if (!style.trim()) return trimmed
  return `${trimmed}\n\nSTYLE: ${style.trim()}`
}

// Reference preamble for keyframe image generation. The chain reference (the
// previous frame's chosen keyframe) is the character-lock protocol: it fixes
// style/character/environment continuity without inheriting composition.
export function buildAnimatedPreamble(opts: { chain: boolean; character: boolean; product: boolean }): string {
  const parts: string[] = []
  if (opts.chain) {
    parts.push(
      'The FIRST attached image is the previous keyframe of this same animated sequence. Maintain its exact art style, rendering technique, character design, color palette, and environment continuity — this new frame must look like the very next moment of the same film. Do NOT copy its composition, camera angle, or framing: build the new shot entirely from the scene description below.',
    )
  }
  if (opts.character) {
    parts.push("Match the character's face, hair, and wardrobe to the character reference image, translated faithfully into the sequence's art style.")
  }
  if (opts.product) {
    parts.push("Match the product's shape, label text, and colours exactly to the product reference image, translated into the sequence's art style.")
  }
  if (parts.length === 0) return ''
  return `REFERENCE USAGE — ${parts.join(' ')}`
}

// ── The storyboard system prompt ───────────────────────────────

const ANIMATED_SYSTEM = `# ROLE

You are the creative director of viral animated explainer ads — the Zack D Films register: short vertical videos that feel like ONE continuous, morphing shot. You storyboard in keyframes: every narration line gets a start image, the next line's image is simultaneously this line's end state, and a video model interpolates the motion between each pair. Because clip N literally ends on clip N+1's first frame, the cuts are invisible.

# YOUR JOB

Turn the user's script into a STORYBOARD:

1. Split the script into narration SCENES (complete sentences — never cut mid-clause; merge any fragment of four words or fewer forward into the next sentence).
2. For every scene, design its START keyframe. After the last scene, design one FINAL keyframe (the end state the last clip lands on). So there is always exactly ONE more frame than there are scenes.
3. For every scene, write the MOTION that carries its keyframe into the NEXT keyframe, plus one transitional SFX.
4. Give every keyframe ${CONCEPTS_PER_FRAME} distinct visual CONCEPTS.

# SHOW, NOT TELL

Every line of narration is represented by a concrete visual action or metaphor — never a static talking head, never text on screen. "Your liver filters toxins" is a glowing factory inside a translucent body, conveyor belts sorting particles — not a person explaining. When the script mentions the product, the product IS the visual.

# KEYFRAME RULES

- Each keyframe is a single striking image: one clear subject, one readable idea. If a frame needs a sentence to explain, simplify it.
- SAFE FRAMING: vertical 9:16 with platform UI overlaying the edges — keep the subject centered with comfortable margins, never so zoomed that crucial elements touch the frame edge.
- CONTINUITY IS EVERYTHING: consecutive keyframes must read as two moments of the same world. Same character design, same palette, same environment unless the story moves. Frame N+1 must be a state that frame N can physically morph or move into.
- Refer to the on-screen person as "the character" and the product as "the product" — reference images fix their exact look. Never describe the character's identity (gender, age, ethnicity) — pose, expression, and action ARE allowed.
- Never mention the art style inside a frame prompt — the style is appended separately to every prompt. Describe only WHAT is in the frame: subject, pose, environment, props, lighting direction, camera angle.
- No captions, subtitles, watermarks, or on-screen text of any kind.

# CONCEPT VARIATIONS

The ${CONCEPTS_PER_FRAME} concepts for one keyframe vary the COMPOSITION, CAMERA ANGLE, and VISUAL METAPHOR — never the story state. Whichever concept the user picks, the sequence must still connect: every concept of frame N must work as the end of scene N-1's motion and the start of scene N's motion. Make them genuinely different stagings (a macro close-up vs a wide aerial vs an inside-the-object view), not three crops of the same image.

# MOTION RULES

- Keep motion prompts SIMPLE and physical: describe the vector of movement from the start state to the end state ("the camera pulls back through the window as the character is lifted into bed", "the bottle rotates as liquid rises around it, the camera orbiting slowly"). One or two sentences.
- The motion must plausibly connect ANY concept of the start frame to ANY concept of the end frame — so describe subject/camera motion in terms of the story state, not one specific composition.
- SFX: name ONE transitional sound direction per scene ("a soft sci-fi whoosh", "a low rumble building", "a gentle pop", or "silence"). No music, no voiceover — the narration and music are added in the edit.

# OUTPUT FORMAT (STRICT)

Wrap your answer in this exact XML envelope. No text outside the tags, no markdown fences.

<STORYBOARD>
<STYLE>One dense paragraph locking the visual style for the whole sequence — rendering technique, character design language, palette, lighting mood. Adapt the style brief you are given to this specific script and product. This paragraph is appended verbatim to every image and video prompt.</STYLE>
<SCENE_1>
<LINE>exact narration slice, a complete sentence</LINE>
<MOTION>the physical motion from this scene's keyframe to the next keyframe</MOTION>
<SFX>one transitional sound direction</SFX>
<FRAME>
<CONCEPT_1>
<LABEL>2-4 word slug naming this staging, e.g. INSIDE THE BOTTLE</LABEL>
<PROMPT>the full image prompt for this keyframe concept — subject, pose, environment, props, lighting direction, camera angle. 40-90 words. No style words.</PROMPT>
</CONCEPT_1>
<CONCEPT_2>...</CONCEPT_2>
<CONCEPT_3>...</CONCEPT_3>
</FRAME>
</SCENE_1>
(repeat <SCENE_N> for every scene, in script order)
<FINAL_FRAME>
<CONCEPT_1>...</CONCEPT_1>
<CONCEPT_2>...</CONCEPT_2>
<CONCEPT_3>...</CONCEPT_3>
</FINAL_FRAME>
</STORYBOARD>`

export interface AnimatedInput {
  scriptText: string
  styleId: string
  modelId: string
  productContext: string
  modelContext: string
  additionalContext: string
}

function buildUserPrompt(input: AnimatedInput): string {
  const style = getAnimatedStyle(input.styleId)
  let prompt = `Storyboard this script as a keyframe-chain animated ad.\n\nScript:\n${input.scriptText}\n\nSTYLE BRIEF (adapt into the <STYLE> block): ${style.hint}\n`
  if (input.productContext) prompt += `\n${input.productContext}\n`
  if (input.modelContext) {
    prompt += `\n${input.modelContext}\nIMPORTANT: never describe the character's physical appearance — say "the character"; a reference image fixes their look.\n`
  }
  if (input.additionalContext) prompt += `\nAdditional context and instructions:\n${input.additionalContext}\n`
  prompt += `\nWrite the full <STORYBOARD> now.`
  return prompt
}

// ── Parser ─────────────────────────────────────────────────────

function extractTag(source: string, tag: string): string | null {
  const m = source.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1].trim() : null
}

let idCounter = 0
function nextConceptId(): string {
  return `anim-${Date.now()}-${++idCounter}`
}

const MAX_SCENES = 40

function parseConcepts(frameBlock: string): AnimatedConcept[] {
  const concepts: AnimatedConcept[] = []
  for (let j = 1; j <= CONCEPTS_PER_FRAME + 2; j++) {
    const block = extractTag(frameBlock, `CONCEPT_${j}`)
    if (!block) continue
    const prompt = extractTag(block, 'PROMPT')
      ?? block.replace(/<LABEL>[\s\S]*?<\/LABEL>/gi, '').replace(/<\/?[A-Z_0-9]+>/g, '').trim()
    if (!prompt.trim()) continue
    concepts.push({
      id: nextConceptId(),
      label: extractTag(block, 'LABEL') ?? `Option ${concepts.length + 1}`,
      prompt: prompt.trim(),
    })
  }
  return concepts
}

// Tolerant parse of the storyboard response. Returns null only when nothing
// usable came back.
export function parseAnimatedResult(responseText: string, input: AnimatedInput): AnimatedResult | null {
  const body = extractTag(responseText, 'STORYBOARD') ?? responseText
  const style = extractTag(body, 'STYLE') ?? getAnimatedStyle(input.styleId).hint

  const scenes: AnimatedScene[] = []
  const frames: AnimatedFrame[] = []
  for (let i = 1; i <= MAX_SCENES; i++) {
    const sceneBlock = extractTag(body, `SCENE_${i}`)
    if (!sceneBlock) break
    const line = extractTag(sceneBlock, 'LINE') ?? ''
    const frameBlock = extractTag(sceneBlock, 'FRAME') ?? sceneBlock
    const concepts = parseConcepts(frameBlock)
    if (concepts.length === 0) continue
    frames.push({ index: frames.length + 1, concepts })
    scenes.push({
      index: scenes.length + 1,
      scriptLine: line,
      motionPrompt: extractTag(sceneBlock, 'MOTION') ?? '',
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
    scenes,
    frames,
    modelId: input.modelId,
  }
}

// ── Entry points ───────────────────────────────────────────────

export async function generateAnimated(input: AnimatedInput): Promise<AnimatedResult> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()
  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: ANIMATED_SYSTEM }] },
    { role: 'user', content: [{ type: 'text', text: buildUserPrompt(input) }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)
  const result = parseAnimatedResult(responseText, input)
  if (!result) throw new Error('The storyboard came back empty. Try again.')
  return result
}

// One more concept for a single keyframe (the per-frame "Add concept" card).
// Context: the style block, the motions either side of the frame, and the
// existing labels so the new staging is genuinely fresh.
export async function generateAnimatedConcept(
  result: AnimatedResult,
  frameIndex: number,
  input: Pick<AnimatedInput, 'productContext' | 'modelContext'>,
): Promise<AnimatedConcept> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()
  const frame = result.frames.find((f) => f.index === frameIndex)
  if (!frame) throw new Error(`Unknown frame ${frameIndex}`)
  const inbound = result.scenes.find((s) => s.index === frameIndex - 1)
  const outbound = result.scenes.find((s) => s.index === frameIndex)

  let user = `This is keyframe ${frameIndex} of a keyframe-chain animated ad. Write ONE fresh visual concept for it — a genuinely different staging from the existing ones, same story state.

STYLE (fixed for the sequence, do not restate it in the prompt): ${result.style}
${inbound ? `\nThe motion ARRIVING at this frame (from the previous keyframe): ${inbound.motionPrompt}` : '\nThis is the OPENING keyframe of the ad.'}
${outbound ? `The narration line this frame opens: "${outbound.scriptLine}"\nThe motion LEAVING this frame (into the next keyframe): ${outbound.motionPrompt}` : 'This is the FINAL keyframe — the end state the last clip lands on.'}

Existing concepts to differ from: ${frame.concepts.map((c) => c.label).join(' · ')}
`
  if (input.productContext) user += `\n${input.productContext}\n`
  if (input.modelContext) user += `\n${input.modelContext}\nNever describe the character's appearance — say "the character".\n`
  user += `
Rules: single striking image, one clear subject, safe 9:16 framing with comfortable margins, no on-screen text, no style words (the style is appended separately), and it must still connect with the motions above whichever way the neighbouring frames are staged.

Respond with ONLY this envelope:
<CONCEPT>
<LABEL>2-4 word slug</LABEL>
<PROMPT>the full image prompt, 40-90 words</PROMPT>
</CONCEPT>`

  const messages: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: user }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)
  const block = extractTag(responseText, 'CONCEPT') ?? responseText
  const prompt = extractTag(block, 'PROMPT')
    ?? block.replace(/<LABEL>[\s\S]*?<\/LABEL>/gi, '').replace(/<\/?[A-Z_0-9]+>/g, '').trim()
  if (!prompt.trim()) throw new Error('Could not generate another concept')
  return {
    id: nextConceptId(),
    label: extractTag(block, 'LABEL') ?? 'Fresh staging',
    prompt: prompt.trim(),
  }
}

// ── Demo / preview data ────────────────────────────────────────
// Shown when no kie.ai key is set — a taste of what the storyboard produces.

interface DemoFrameSpec {
  concepts: { label: string; prompt: string }[]
}

const DEMO_STYLE =
  'Glossy stylized 3D render: soft rounded characters with gently exaggerated proportions, vivid saturated palette of deep night blues and warm amber accents, clean smooth surfaces with subtle subsurface glow, soft volumetric lighting with a gentle rim light, rendered like a premium animated short. Never photoreal.'

const DEMO_SCENES = [
  {
    line: 'Your brain never actually switches off at night.',
    motion: 'The camera pushes slowly through the bedroom window toward the sleeping character, then dives into a soft glow at their temple as the room falls away.',
    sfx: 'a soft airy whoosh',
  },
  {
    line: 'While you sleep, it runs a full cleanup cycle — flushing out the waste that builds up all day.',
    motion: 'Tiny glowing orbs stream along the neural pathways and swirl into a bright channel, the camera orbiting as the stream drains downward and the space brightens.',
    sfx: 'a gentle shimmering hum',
  },
  {
    line: 'One scoop of this before bed gives that cycle everything it needs.',
    motion: 'The jar rises into frame as a scoop of powder dissolves into a swirl of light that flows upward and settles into a calm, glowing aura.',
    sfx: 'a soft magical pop',
  },
]

const DEMO_FRAMES: DemoFrameSpec[] = [
  {
    concepts: [
      { label: 'MOONLIT BEDROOM', prompt: 'A cozy bedroom at night seen from just outside the window: the character asleep under a thick duvet, moonlight washing the room in deep blue, a warm amber glow pulsing faintly at their temple. Subject centered with generous margins.' },
      { label: 'OVERHEAD SLEEPER', prompt: 'Directly overhead view of the character asleep in bed, arms relaxed, the duvet folds radiating outward like ripples, a soft amber halo just visible around their head against cool blue sheets.' },
      { label: 'TEMPLE GLOW MACRO', prompt: 'Close profile of the sleeping character\'s face on the pillow, eyes gently closed, one warm point of light glowing softly at the temple, cool blue night tones everywhere else.' },
    ],
  },
  {
    concepts: [
      { label: 'NEURAL FACTORY', prompt: 'Inside the brain rendered as a vast glowing factory hall: translucent neural pathways as glass tubes, tiny amber orbs of light streaming through them, small cleanup drones sweeping motes of grey dust from the walkways.' },
      { label: 'RIVER OF LIGHT', prompt: 'A luminous river of amber particles winding through a dark-blue cavern of soft neuron trees, grey dust motes being carried away by the current, camera at water level looking upstream.' },
      { label: 'CONTROL ROOM', prompt: 'A cozy mission-control room inside the head: rounded consoles with soft glowing dials, one small robot operator pulling a big lever labeled by shape only, screens showing tidy streams of light flowing out.' },
    ],
  },
  {
    concepts: [
      { label: 'HERO JAR RISE', prompt: 'The product jar centered on a soft bedside table in the blue night bedroom, lid off, a gentle spiral of glowing powder rising from it toward the upper frame, the sleeping character softly out of focus behind.' },
      { label: 'SCOOP POUR', prompt: 'Macro of a rounded scoop tipping glowing powder into a glass of water on the nightstand, the liquid beginning to swirl with amber light, the jar standing tall beside it.' },
      { label: 'GLOW HANDOFF', prompt: 'The character\'s hand placing the jar down on the nightstand as a ribbon of warm light arcs from the jar toward their head on the pillow, connecting the two across the frame.' },
    ],
  },
  {
    concepts: [
      { label: 'RESTORED MORNING', prompt: 'The same bedroom at sunrise: the character sitting up in bed mid-stretch with a calm bright expression, warm morning light flooding in, the jar catching a sunbeam on the nightstand.' },
      { label: 'AURA WIDE', prompt: 'Wide shot of the character asleep, now wrapped in a complete calm amber aura from head to toe, the room\'s blues warming toward dawn at the window.' },
      { label: 'BRAIN AT PEACE', prompt: 'The neural factory hall from before, now spotless and dim, every pathway glowing a steady calm amber, the tiny drones parked in a neat row, one last orb drifting peacefully upward.' },
    ],
  },
]

export function buildDemoAnimatedResult(modelId: string, styleId: string): AnimatedResult {
  let stamp = 0
  return {
    style: DEMO_STYLE,
    styleId,
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
      concepts: f.concepts.map((c) => ({ id: `demo-anim-${++stamp}`, label: c.label, prompt: c.prompt })),
    })),
  }
}
