// One Shot mode: the whole script → 4 complete video concepts, each a full
// master prompt a multi-cut-capable model (Seedance 2.0 etc.) renders as ONE
// generation. No image step — the concept goes straight to video.
//
// Segment math is deterministic and client-side: we estimate spoken seconds
// from word count (~2.4 words/sec, matching Scripts' WRITE_LENGTH_BUDGET),
// divide by the selected model's longest clip, and tell the LLM exactly how
// many segments to write. The LLM never does arithmetic — it only picks the
// natural sentence boundaries.

import type { OneShotConcept, OneShotDelivery, OneShotResult, OneShotSegment } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { kieChatCompletions, type ChatMessage } from '../../../utils/kie'
import { getChatEndpointPath, getModel, snapVideoDurationUp } from '../../../utils/models'

// Models allowed in the One Shot picker. An explicit allowlist, not a
// constraints filter: "max duration ≥ 10s" would also admit Seedance 1.5 Pro
// and Wan 2.7, which can't do the ref+audio multi-cut combination this mode
// is built around. Kling 3.0 is deliberately in despite taking no reference
// images — the UI warns that refs are dropped (prompt-only likeness).
export const ONE_SHOT_MODEL_IDS = [
  'bytedance/seedance-2',
  'bytedance/seedance-2-fast',
  'bytedance/seedance-2-mini',
  'kling-3.0/video',
  'gemini-omni-video',
]

export const ONE_SHOT_DEFAULT_MODEL_ID = 'bytedance/seedance-2'

// ~2.4 words/sec on-camera pace — same assumption as Scripts' length budgets.
const WORDS_PER_SECOND = 2.4
// Hard ceiling on clips per concept. A script needing more than 4 clips is a
// 60s+ read — that's Line by Line territory, and we warn instead of chaining.
export const MAX_SEGMENTS = 4

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function estimateSpokenSeconds(script: string): number {
  return Math.ceil(wordCount(script) / WORDS_PER_SECOND)
}

export interface SegmentPlan {
  count: number
  maxClipSeconds: number
  capped: boolean
}

// How many sequential clips this script needs on this model. Falls back to
// 15s when the model has no duration grid (shouldn't happen for the allowlist).
export function planSegments(estimatedSeconds: number, modelId: string): SegmentPlan {
  const durations = getModel(modelId)?.videoConstraints?.durations ?? []
  const maxClipSeconds = durations.length > 0 ? durations[durations.length - 1] : 15
  const ideal = Math.max(1, Math.ceil(estimatedSeconds / maxClipSeconds))
  return {
    count: Math.min(MAX_SEGMENTS, ideal),
    maxClipSeconds,
    capped: ideal > MAX_SEGMENTS,
  }
}

// Snapped-up clip length for one segment's excerpt. Dialogue gets 10%
// breathing room for natural delivery pauses; silent footage just needs to
// cover the voiceover span.
function segmentDuration(excerpt: string, delivery: OneShotDelivery, modelId: string): number {
  const durations = getModel(modelId)?.videoConstraints?.durations ?? []
  const buffer = delivery === 'dialogue' ? 1.1 : 1
  const raw = Math.max(2, Math.ceil((wordCount(excerpt) / WORDS_PER_SECOND) * buffer))
  return durations.length > 0 ? snapVideoDurationUp(raw, durations) : raw
}

// ── The system prompt ──────────────────────────────────────────
//
// Each clip is a scene-by-scene BLUEPRINT — the exact format the Scripts app's
// "Scenes" output uses (timestamped `--- Scene N (MM:SS-MM:SS) ---` headers +
// six labelled fields + a VOICE PROFILE block), adapted for B-Roll: the prompt
// goes straight to a video model with reference images attached, so it carries
// [CHARACTER] / [PRODUCT] tokens (resolved to plain words at generation time,
// see resolveOneShotTokens). withIphoneRealism still appends the deterministic
// quality stack into a CAMERA line at request time.

const SCENE_FIELDS = `Below each scene header, these labelled lines, each on its own line, in this exact order:
SETTING: where we are and the moment's atmosphere — the real room / place, the surfaces and props actually visible.
CAMERA: framing and movement as GEOMETRY — height relative to the eyeline, distance, angle (e.g. "framed from just below chin height, about an arm's length away, tilted slightly up") — plus the quality register: modern iPhone camera quality, unedited photorealism, sharp focus across the frame, zero bokeh, no colour grade. NEVER name a filming device (no phone, iPhone, front camera, tripod, ring light) — a named device gets drawn into the frame. No mirror selfies.
LIGHTING: the real light source, its direction and warmth (window light camera-left, one overhead bulb). Naturalistic only — no studio lighting, no glam beauty light.
ACTION: what [CHARACTER] physically does — the gesture, gaze, micro-expression, weight shift. Name the actual movement, never a mood word. There is always motion.
DIALOGUE: __DIALOGUE_RULE__
AUDIO: __AUDIO_RULE__ NEVER background music, NEVER a soundtrack or score, NEVER a separate voiceover track (music is added later in editing).`

const TOKENS_BLOCK = `TOKENS — CRITICAL:
- Use the literal token [CHARACTER] for the on-camera person in ALL visual direction (SETTING / CAMERA / ACTION). NEVER describe their identity or appearance — gender, age, ethnicity, hair, body, wardrobe colour. Emotional state, gaze, gesture, and body language ARE allowed. A reference image fixes their look.
- Use the literal token [PRODUCT] for the product in visual direction. NEVER describe its packaging, label, container, or brand there. A reference image fixes it.
- EXCEPTION — spoken dialogue: in a DIALOGUE line, name the product in plain words the way a real person would — its ACTUAL name (from the product context) at most twice across the whole ad, and "this thing" / "it" / the category everywhere else. NEVER put [PRODUCT] or [CHARACTER] inside a spoken line — a voice model reads the token out literally.`

const DIALOGUE_RULES = {
  dialogueLine: '[CHARACTER] says: "the exact spoken line for this beat" — use the script\'s words verbatim, and put [CHARACTER] only before "says", never inside the quotes.',
  audioLine: 'the character\'s spoken voice plus the natural diegetic sound of the scene (room tone, fabric, taps).',
  voiceBlock: `\n\nAfter the last scene of the clip, add a blank line, then this block EXACTLY — repeat it word-for-word identical in every clip of this concept so all clips share one on-camera voice:
=== VOICE PROFILE (same voice in every clip) ===
VOICE — describe, in rich and reproducible detail, HOW the character sounds: perceived age and gender of the voice, accent / region, pitch, pace, texture (warm, raspy, breathy, smooth), energy, and 1-2 signature quirks (uptalk, slight vocal fry, a laugh living in the voice). One dense paragraph you could hand to a TTS engine and get the same person every time. Describe ONLY the sound, never appearance.`,
  deliveryNote: `DELIVERY — WITH DIALOGUE. This is an on-camera ad: [CHARACTER] speaks the script out loud. Every scene where a line is spoken carries it in the DIALOGUE field, verbatim from the script, spread naturally across the scenes so nothing is dropped. Cutaway scenes (hands, product, environment) can set DIALOGUE to none while the voice carries over. Scene 1's DIALOGUE is the opening hook.`,
}

const SILENT_RULES = {
  dialogueLine: 'always exactly the word: none. No one speaks in any scene.',
  audioLine: 'the diegetic sound of the scene only (room tone, fabric, taps, streets) — no dialogue.',
  voiceBlock: '',
  deliveryNote: `DELIVERY — B-ROLL CLIPS. No one speaks in any scene: a finished voiceover is laid over this footage in the edit. Every DIALOGUE line is exactly "none", and there is NO VOICE PROFILE block. Each scene VISUALIZES what the matching script beat is about — the footage shows the act / product / reaction the voiceover will describe, it never says it.`,
}

function oneShotSystem(delivery: OneShotDelivery): string {
  const rules = delivery === 'dialogue' ? DIALOGUE_RULES : SILENT_RULES
  const sceneFields = SCENE_FIELDS
    .replace('__DIALOGUE_RULE__', rules.dialogueLine)
    .replace('__AUDIO_RULE__', rules.audioLine)

  return `# ROLE

You are an elite UGC creative director. You turn a script into a complete, ready-to-generate video ad written as a scene-by-scene BLUEPRINT — the kind an AI video model (Seedance, Kling, Gemini) renders in ONE generation containing multiple internal cuts. You have shipped thousands of paid UGC ads. Everything you write must look like real, unpolished creator footage — the look of a phone camera, never the sight of one.

# YOUR JOB

Design ONE complete video concept for the user's script, following the creative angle they give you. The concept is delivered as one or more CLIPS (the user tells you exactly how many, and the length of each). Each clip is its own scene blueprint: cut it into internal scenes/shots and direct each with the labelled fields below. The clip's scene timestamps start at 00:00, are contiguous, and end at the clip's length.

# HOW TO WRITE A CLIP

Break the clip into as many internal scenes/cuts as the moment earns — roughly one every 2-4 seconds; a single uninterrupted take is fine as ONE scene. Scene 1 is a pattern interrupt, never a calm establishing shot.

Every scene starts with a header EXACTLY in this form:
--- Scene N: <short label> (MM:SS-MM:SS) ---

${sceneFields}

${TOKENS_BLOCK}

${rules.deliveryNote}

# HARD RULES
- UGC realism is the whole aesthetic. Anything that reads as "commercial", "cinematic", "studio", or "polished" is a failure.
- [CHARACTER] looks like the after, not the before: no visible blemishes, frizz, redness, or tiredness — they are the testimonial, not the case study.
- Constant motion: every scene has movement in the frame or the subject. No locked-off still-life.
- [PRODUCT] appears only once the script has earned it — never in Scene 1 unless the script opens on it.
- No captions, subtitles, watermarks, or on-screen text of any kind.
- Specificity over completeness: exact body position, hand position, gaze, micro-expression, real light sources, real props. If a scene could describe two different shots, rewrite it.

# OUTPUT FORMAT (STRICT)

Wrap your answer in this exact XML envelope. No text outside the tags, no markdown fences. Each <PROMPT> body is the full scene blueprint for that clip: its scenes in order${delivery === 'dialogue' ? ', then the VOICE PROFILE block' : ''}.

<CONCEPT>
<ANGLE>2-4 word slug naming the creative angle</ANGLE>
<SUMMARY>one sentence describing the concept</SUMMARY>
<SEGMENT_1>
<EXCERPT>the exact, verbatim script slice this clip covers</EXCERPT>
<PROMPT>
--- Scene 1: <label> (00:00-00:04) ---
SETTING: ...
CAMERA: ...
LIGHTING: ...
ACTION: ...
DIALOGUE: ...
AUDIO: ...

--- Scene 2: <label> (00:04-00:08) ---
...${delivery === 'dialogue' ? '\n\n=== VOICE PROFILE (same voice in every clip) ===\nVOICE — ...' : ''}
</PROMPT>
</SEGMENT_1>
(repeat <SEGMENT_N> for every clip requested, in order)
</CONCEPT>`
}

// [CHARACTER] / [PRODUCT] tokens keep the prompt readable and reference-driven
// while it's edited, but a video model reads them literally — so resolve them
// to plain words the instant before sending. Mirrors the Scripts→Playground
// @INFLUENCER / @PRODUCT resolution.
export function resolveOneShotTokens(prompt: string, productName?: string): string {
  return prompt
    .replace(/\[CHARACTER\]/gi, 'the character')
    .replace(/\[PRODUCT\]/gi, productName?.trim() || 'the product')
}

// Four deliberately different UGC worlds per generate — real alternatives,
// not four flavours of one idea. The UGC counterpart of Scripts'
// WRITE_PROMPT_TAKE_INSTRUCTION.
const ONE_SHOT_ANGLES: string[] = [
  'THIS CONCEPT — DIRECT CONFESSION: straight-to-camera storytime energy. One location, the character close and personal, escalating intimacy as the script builds. The classic "okay I have to tell you about this" register.',
  'THIS CONCEPT — DAY IN THE LIFE: the script carried across a real routine — morning counter, commute, desk, evening wind-down. The product is met naturally mid-day, never presented. Movement between micro-moments gives the cuts.',
  'THIS CONCEPT — DEMO FIRST: hands and product do the talking. Close-in inserts, textures, the actual use of the thing, the visible result. The character orbits the demonstration rather than fronting it.',
  'THIS CONCEPT — REACTION & DISCOVERY: the character encountering the product or its result — skeptical first beat, the try, the genuine reaction. The arc is doubt → surprise → sold.',
]

export interface OneShotInput {
  scriptText: string
  delivery: OneShotDelivery
  modelId: string
  productContext: string
  modelContext: string
  additionalContext: string
}

const MULTI_CLIP_RULE = `MULTIPLE CLIPS — THESE RENDER SEPARATELY BUT CUT TOGETHER INTO ONE AD. Clip 1 establishes the world; every later clip continues it seamlessly:
- Keep [CHARACTER]'s wardrobe and emotional continuity, the same location and time of day, and the same lighting across every clip — no wardrobe changes, no day→night jumps, no location moves unless the script demands one.
- Repeat the VOICE PROFILE block VERBATIM in every clip so all clips are read by the same voice.
- Each clip's scene timestamps restart at 00:00 (every clip renders independently).`

function buildUserPrompt(input: OneShotInput, plan: SegmentPlan, angle: string): string {
  const est = estimateSpokenSeconds(input.scriptText)
  const words = wordCount(input.scriptText)
  const perClipWords = Math.ceil(words / plan.count)
  const perClipSeconds = Math.min(plan.maxClipSeconds, Math.ceil(est / plan.count))

  let prompt = `Design one complete video concept for this script.\n\nScript:\n${input.scriptText}\n\n${angle}\n\n`

  if (plan.count === 1) {
    prompt += `CLIPS: this is ONE clip covering the whole script, ≈ ${Math.max(est, 4)}s long. Break it into internal scenes with contiguous timestamps from 00:00 to about ${Math.max(est, 4)}s. Output exactly one <SEGMENT_1> whose <EXCERPT> is the full script.\n`
  } else {
    prompt += `CLIPS: split the script into exactly ${plan.count} sequential clips at natural sentence boundaries — never mid-clause. Each clip is ≈ ${perClipSeconds}s (~${perClipWords} words) and holds its own internal scenes timestamped 00:00 to about ${perClipSeconds}s. Cover every script line across the clips; do not drop or compress anything. Output <SEGMENT_1> … <SEGMENT_${plan.count}> in script order.\n\n${MULTI_CLIP_RULE}\n`
  }
  if (plan.capped) {
    prompt += `NOTE: the script runs long for ${plan.count} clips — keep scene descriptions tight, but still cover every line.\n`
  }

  if (input.productContext) {
    prompt += `\n${input.productContext}\n`
  }
  if (input.modelContext) {
    prompt += `\n${input.modelContext}\nIMPORTANT: never describe the character's physical appearance. Refer to them as "the character" — a visual reference image will be attached to fix their exact look.\n`
  }
  if (input.additionalContext) {
    prompt += `\nAdditional context and instructions:\n${input.additionalContext}\n`
  }

  prompt += `\nWrite the full <CONCEPT> now.`
  return prompt
}

// ── Parser ─────────────────────────────────────────────────────

function extractTag(source: string, tag: string): string | null {
  const m = source.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1].trim() : null
}

let conceptCounter = 0
function nextConceptId() {
  return `oneshot-${Date.now()}-${++conceptCounter}`
}

// Tolerant parse of one LLM response into a concept. Returns null only when
// nothing usable came back (treated as a failed call by the caller).
export function parseOneShotConcept(
  responseText: string,
  input: OneShotInput,
): OneShotConcept | null {
  const body = extractTag(responseText, 'CONCEPT') ?? responseText
  const angle = extractTag(body, 'ANGLE') ?? 'CONCEPT'
  const summary = extractTag(body, 'SUMMARY') ?? ''

  const segments: OneShotSegment[] = []
  for (let i = 1; i <= MAX_SEGMENTS; i++) {
    const seg = extractTag(body, `SEGMENT_${i}`)
    if (!seg) continue
    const prompt = extractTag(seg, 'PROMPT') ?? ''
    if (!prompt.trim()) continue
    const excerpt = extractTag(seg, 'EXCERPT') ?? ''
    segments.push({
      index: segments.length + 1,
      scriptExcerpt: excerpt,
      prompt: prompt.trim(),
      durationSeconds: 0, // filled below once excerpts are settled
    })
  }

  // No segment tags at all → treat the whole body as a single-segment prompt
  // (the model answered with a bare master prompt).
  if (segments.length === 0) {
    const bare = body.replace(/<[^>]+>/g, '').trim()
    if (!bare) return null
    segments.push({ index: 1, scriptExcerpt: input.scriptText, prompt: bare, durationSeconds: 0 })
  }

  // Missing excerpts get an even word split of the script so duration math
  // still has something honest to chew on.
  const missing = segments.filter((s) => !s.scriptExcerpt.trim())
  if (missing.length > 0) {
    const words = input.scriptText.trim().split(/\s+/)
    const per = Math.ceil(words.length / segments.length)
    segments.forEach((s, i) => {
      if (!s.scriptExcerpt.trim()) {
        s.scriptExcerpt = words.slice(i * per, (i + 1) * per).join(' ')
      }
    })
  }

  for (const s of segments) {
    s.durationSeconds = segmentDuration(s.scriptExcerpt, input.delivery, input.modelId)
  }

  return { id: nextConceptId(), angle, summary, segments }
}

// ── Entry point ────────────────────────────────────────────────

// Four parallel calls, one per creative angle — mirrors the cinematic
// pipeline's fan-out. Partial failures keep whatever parsed; only a total
// wipe-out throws (the first rejection's error, for humanizeError upstream).
export async function generateOneShot(input: OneShotInput): Promise<OneShotResult> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()

  const estimatedSeconds = estimateSpokenSeconds(input.scriptText)
  const plan = planSegments(estimatedSeconds, input.modelId)
  const system = oneShotSystem(input.delivery)

  const settled = await Promise.allSettled(
    ONE_SHOT_ANGLES.map((angle) => {
      const messages: ChatMessage[] = [
        { role: 'system', content: [{ type: 'text', text: system }] },
        { role: 'user', content: [{ type: 'text', text: buildUserPrompt(input, plan, angle) }] },
      ]
      return kieChatCompletions(apiKey, endpoint, messages)
    }),
  )

  const concepts: OneShotConcept[] = []
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    const concept = parseOneShotConcept(result.value, input)
    if (concept) concepts.push(concept)
  }

  if (concepts.length === 0) {
    const firstError = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    throw firstError ? firstError.reason : new Error('No concepts could be generated')
  }

  return {
    concepts,
    delivery: input.delivery,
    modelId: input.modelId,
    estimatedSeconds,
    segmentCount: plan.count,
    capped: plan.capped,
  }
}

// ── Demo / preview data ────────────────────────────────────────
//
// Shown when no kie.ai key is set so a member (or the operator) can see what
// One Shot produces before wiring up billing. Real, plausible concepts for a
// hair-serum ad — a mix of single- and two-clip concepts so the split UI,
// "Generate all", and per-clip controls are all on screen. Durations snap to
// whatever model is selected, exactly like a live result, so the credit chips
// and duration badges look right.

interface DemoScene {
  label: string
  setting: string
  camera: string
  lighting?: string // continuation scenes reuse the clip's established light
  action: string
  spoken?: string // the on-camera line for this scene, dialogue delivery only
  audioTail?: string // extra diegetic sound for this scene
}

interface DemoSegmentSpec {
  excerpt: string
  scenes: DemoScene[]
}

interface DemoConceptSpec {
  angle: string
  summary: string
  voice: string // reused verbatim across a concept's clips (dialogue only)
  segments: DemoSegmentSpec[]
}

function fmtTs(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Build a scene-blueprint prompt for one demo clip: distribute the clip's
// duration evenly across its scenes, stamp contiguous timestamps, and append
// the VOICE PROFILE block for dialogue clips.
function assembleDemoPrompt(spec: DemoSegmentSpec, voice: string, delivery: OneShotDelivery, durationSeconds: number): string {
  const n = spec.scenes.length
  const step = durationSeconds / n
  const blocks = spec.scenes.map((sc, i) => {
    const start = fmtTs(Math.round(i * step))
    const end = fmtTs(i === n - 1 ? durationSeconds : Math.round((i + 1) * step))
    const dialogue = delivery === 'dialogue'
      ? (sc.spoken ? `[CHARACTER] says: "${sc.spoken}"` : 'none')
      : 'none'
    const audio = delivery === 'dialogue'
      ? `the character's voice plus soft diegetic room tone${sc.audioTail ? ` (${sc.audioTail})` : ''}. No music.`
      : `diegetic room tone only${sc.audioTail ? ` (${sc.audioTail})` : ''}. No dialogue, no music, no voiceover.`
    return [
      `--- Scene ${i + 1}: ${sc.label} (${start}-${end}) ---`,
      `SETTING: ${sc.setting}`,
      `CAMERA: ${sc.camera}`,
      `LIGHTING: ${sc.lighting ?? 'Same natural light as the previous scene — continuous.'}`,
      `ACTION: ${sc.action}`,
      `DIALOGUE: ${dialogue}`,
      `AUDIO: ${audio}`,
    ].join('\n')
  })
  let out = blocks.join('\n\n')
  if (delivery === 'dialogue') {
    out += `\n\n=== VOICE PROFILE (same voice in every clip) ===\nVOICE — ${voice}`
  }
  return out
}

const DEMO_CONCEPTS: DemoConceptSpec[] = [
  {
    angle: 'DIRECT CONFESSION',
    summary: 'Straight-to-camera, close and personal — the honest "I have to tell you about this" register.',
    voice: 'Warm mid-pitch female voice, late twenties, light American accent, unhurried and conversational with a small laugh living just under the words and a habit of trailing off softly at the end of a thought.',
    segments: [
      {
        excerpt: 'I used to spend two hours every morning fighting my frizzy hair — then my sister left this little bottle at my place.',
        scenes: [
          {
            label: 'Confession',
            setting: 'A real lived-in bathroom, morning, a toothbrush cup and a folded towel on the counter.',
            camera: 'Medium close-up on [CHARACTER], framed from just below chin height about an arm\'s length away, tilted slightly up. Natural handheld drift. Modern iPhone camera quality, sharp across the frame, zero bokeh.',
            lighting: 'Soft daylight through a frosted window camera-left, one warm bulb over the mirror. Naturalistic, no glam.',
            action: '[CHARACTER] leans toward the mirror, pushes a hand back through damp hair, lets out a tired little breath.',
            spoken: 'I used to spend two hours every morning fighting this hair.',
            audioTail: 'a running tap in the next room',
          },
          {
            label: 'The bottle',
            setting: 'Same counter, [PRODUCT] sitting by the sink.',
            camera: 'Tighter insert from chest height as the hand comes into frame; slight push-in. Handheld.',
            action: '[CHARACTER] picks up [PRODUCT], turns it once in the light, a small resigned smile building.',
            spoken: 'Then my sister left this at my place.',
            audioTail: 'the soft set-down of glass on stone',
          },
        ],
      },
    ],
  },
  {
    angle: 'DAY IN THE LIFE',
    summary: 'The routine carried across a real morning — the product met naturally, then the payoff at work.',
    voice: 'Warm mid-pitch female voice, late twenties, light American accent, easy and bright, clipped consonants, a smile you can hear.',
    segments: [
      {
        excerpt: 'Thirty seconds after rinsing I could run my fingers through my hair without snagging once.',
        scenes: [
          {
            label: 'At the sink',
            setting: 'Over the bathroom sink, morning, water running.',
            camera: 'Close insert from chest height looking down at the hands and hair. Handheld. iPhone quality, sharp, no bokeh.',
            lighting: 'Flat daylight from the window, natural.',
            action: '[CHARACTER] rinses, squeezes the water out, breathes in.',
            spoken: 'Thirty seconds after rinsing,',
            audioTail: 'running water, the squeak of wet hair',
          },
          {
            label: 'The finger-run',
            setting: 'Same sink, [CHARACTER] straightening up to the mirror.',
            camera: 'Step back to a waist-up, eye level, handheld with a slow drift.',
            action: '[CHARACTER] runs fingers cleanly from root to tip, eyebrows lifting in surprise.',
            spoken: 'I could run my fingers right through it without snagging once.',
            audioTail: 'a soft laugh',
          },
        ],
      },
      {
        excerpt: 'Three weeks in and people at work keep asking what I changed.',
        scenes: [
          {
            label: 'Office kitchen',
            setting: 'A bright office kitchen, a coworker nearby filling a mug.',
            camera: 'Medium from eye level across the counter, a slight rack toward [CHARACTER]. Handheld.',
            lighting: 'Overhead office light softened by a big window. Natural.',
            action: '[CHARACTER] fills a mug; a coworker gestures at their hair; [CHARACTER] laughs and touches it, shrugging.',
            spoken: 'Three weeks in and people keep asking what I changed.',
            audioTail: 'kitchen chatter, a kettle',
          },
        ],
      },
    ],
  },
  {
    angle: 'DEMO FIRST',
    summary: 'Hands and product do the talking — one pump, one pass, the whole routine.',
    voice: 'Warm mid-pitch female voice, calm and instructional, unrushed, a touch of vocal fry at the end of lines.',
    segments: [
      {
        excerpt: 'One pump, smooth it through damp hair, and that\'s the whole routine.',
        scenes: [
          {
            label: 'One pump',
            setting: 'A countertop, top-down, [PRODUCT] and a folded towel in frame.',
            camera: 'Overhead macro on the open palm. Tight, handheld. iPhone quality, sharp across the frame.',
            lighting: 'Bright even daylight from above. Natural.',
            action: 'A hand presses one pump of [PRODUCT] into the palm, then rubs the hands together.',
            spoken: 'One pump,',
            audioTail: 'the click of the pump',
          },
          {
            label: 'Smoothing through',
            setting: 'Same counter, [CHARACTER] now leaning toward the mirror.',
            camera: 'Three-quarter in-hand shot from the side as the hands go into the hair. Handheld.',
            action: '[CHARACTER] smooths the product through the mid-lengths, then sets [PRODUCT] back down.',
            spoken: 'smooth it through, and that\'s the whole routine.',
            audioTail: 'the soft set-down of the bottle',
          },
        ],
      },
    ],
  },
  {
    angle: 'REACTION & DISCOVERY',
    summary: 'Skeptic to convert — the doubt, the try, the genuine "oh" and the sign-off.',
    voice: 'Warm mid-pitch female voice, dry and a little skeptical at first, opening up as it goes, a real laugh on the turn.',
    segments: [
      {
        excerpt: 'Honestly I didn\'t think a twelve dollar serum would do anything.',
        scenes: [
          {
            label: 'The doubt',
            setting: 'Sitting on the edge of a bed, [PRODUCT] in hand.',
            camera: 'Medium from chest height, an arm\'s length away, tilted very slightly up. Handheld.',
            lighting: 'Warm bedroom lamp plus soft window light. Natural.',
            action: '[CHARACTER] holds [PRODUCT] up doubtfully, reads the label, one eyebrow raised, glances at the lens.',
            spoken: 'Honestly? I didn\'t think a twelve dollar serum would do anything.',
            audioTail: 'quiet bedroom room tone',
          },
        ],
      },
      {
        excerpt: 'Grab one before they sell out again.',
        scenes: [
          {
            label: 'The reveal',
            setting: 'Back at the bathroom mirror, hair now smooth and finished.',
            camera: 'Medium close-up from eye level, a step back, handheld.',
            lighting: 'Soft daylight from the window. Natural.',
            action: '[CHARACTER] runs a hand down the smooth finished hair, a genuine surprised smile breaking.',
            spoken: 'Okay, I get it now.',
            audioTail: 'a soft delighted exhale',
          },
          {
            label: 'Sign-off',
            setting: 'Same mirror, [PRODUCT] lifted beside the face.',
            camera: 'Holds the medium close-up, [CHARACTER] bringing [PRODUCT] up beside their cheek. Handheld.',
            action: '[CHARACTER] lifts [PRODUCT] beside their cheek and gives a small nod to the lens.',
            spoken: 'Grab one before they sell out again.',
            audioTail: 'room tone',
          },
        ],
      },
    ],
  },
]

export function buildDemoOneShotResult(modelId: string, delivery: OneShotDelivery): OneShotResult {
  const durations = getModel(modelId)?.videoConstraints?.durations ?? []
  const buffer = delivery === 'dialogue' ? 1.1 : 1
  let stamp = 0
  const concepts: OneShotConcept[] = DEMO_CONCEPTS.map((spec) => ({
    id: `demo-${++stamp}`,
    angle: spec.angle,
    summary: spec.summary,
    segments: spec.segments.map((seg, i) => {
      const raw = Math.max(2, Math.ceil((wordCount(seg.excerpt) / WORDS_PER_SECOND) * buffer))
      const durationSeconds = durations.length > 0 ? snapVideoDurationUp(raw, durations) : raw
      return {
        index: i + 1,
        scriptExcerpt: seg.excerpt,
        prompt: assembleDemoPrompt(seg, spec.voice, delivery, durationSeconds),
        durationSeconds,
      }
    }),
  }))
  const estimatedSeconds = concepts.reduce(
    (sum, c) => sum + c.segments.reduce((s, seg) => s + seg.durationSeconds, 0),
    0,
  )
  return {
    concepts,
    delivery,
    modelId,
    estimatedSeconds,
    segmentCount: concepts[0]?.segments.length ?? 1,
    demo: true,
  }
}
