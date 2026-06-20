import type { GenerateScriptInput, GeneratedScript, RemixAngle, EditableProductContext, WriteStyle, WriteLength } from '../types'
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

// ── Write New (from-scratch) mode ──
//
// Two output formats share one voice spec. The voice rules are the product
// here: members read these scripts out loud (or feed them to TTS), so
// anything that smells like ad copy is a failure.

const HUMAN_VOICE_RULES = `HOW IT MUST SOUND — NON-NEGOTIABLE:
- The words will be spoken out loud by a real person filming themselves on their phone. Every single line must pass this test: "would a normal person in their 20s actually say this to a friend?" If not, rewrite it.
- ALWAYS use contractions: I'm, don't, it's, can't, that's, you're, I've, didn't.
- Use casual spoken reductions where a real person would: gonna, wanna, kinda, gotta, 'cause. Don't force them into every sentence — sprinkle them where they'd naturally land.
- Conversational starters and fillers are allowed in moderation: "okay so", "honestly", "listen", "like", "literally", "no because", "I'm not even kidding".
- Short sentences. Sentence fragments are fine. One thought at a time.
- 6th-grade vocabulary. BANNED WORDS (never use): elevate, unleash, revolutionary, game-changer, game changing, seamless, effortless, transform, indulge, crafted, premium, innovative, "say goodbye to", "say hello to", "look no further", "introducing", "the secret to", "must-have".
- Don't oversell. Real people undersell and let the result do the talking: "and it just... worked" lands harder than "it works amazingly well".
- Specifics beat claims. "two weeks", "$30", "every single morning" — concrete details make it believable.
- No emojis, no hashtags, no [pause] markers.`

const WRITE_SCRIPT_SYSTEM = `You are a top 1% UGC creator who writes organic TikTok/Reels ad scripts. Brands pay you because your scripts hold attention and convert WITHOUT feeling like marketing — they sound like a real person talking to their phone camera.

${HUMAN_VOICE_RULES}
- Mention the product name at most twice, the way a person would ("so I got the X", "this thing").

HOOK RULE: the first line must stop the scroll on its own, in under 2 seconds of speech. Never open with context-setting ("So I've been using this for a while now...") — open mid-thought, with the most interesting beat.

FORMAT RULES — CRITICAL:
1. ONLY return the spoken words.
2. No stage directions, timestamps, headers, bracketed text, emojis, or visual cues.
3. No quotation marks around the text.
4. No introductions or conclusions (e.g. "Here is the script:").
5. Plain text only. EACH SENTENCE ON ITS OWN LINE.`

const WRITE_SCENES_SYSTEM = `You are an elite UGC creative director. You invent a complete scene-by-scene blueprint for a brand-new organic TikTok ad — the visuals AND the spoken dialogue — ready to be generated with AI video models (one scene = one video generation).

First write the dialogue as a real spoken script following the voice rules below, then cut the ad into scenes and embed each dialogue line in the scene where it's spoken.

${HUMAN_VOICE_RULES}
- In dialogue, ALWAYS refer to the product as the literal token [PRODUCT] — never a brand name.

HOOK RULE: scene 1's dialogue must stop the scroll on its own, in under 2 seconds of speech, and its visual must be a pattern interrupt — never a calm establishing shot.

SCENE RULES:
- Scenes run 4–8 seconds each. Timestamps start at 00:00, are contiguous, and end exactly at the ad's total length.
- NEVER describe the character's identity or appearance (gender, age, ethnicity, hair, body, clothing) — always the literal token [CHARACTER]. Emotional state, gaze, gesture, and body language ARE allowed: that's scene direction, not identity.
- NEVER describe the product's physical appearance, container, label, or brand — always the literal token [PRODUCT].
- Each scene block: setting, camera/framing, lighting, what [CHARACTER] does — then the dialogue embedded inline as: [CHARACTER] says: "..."

OUTPUT FORMAT — CRITICAL:
- Every scene starts with a header EXACTLY in this form: --- Scene N: <short label> (MM:SS-MM:SS) ---
- Below each header, one self-contained block: visual direction first, then the embedded dialogue line(s).
- Blank line between scenes. No introduction, conclusion, commentary, or markdown code fences. Plain text only.`

const WRITE_STYLE_INSTRUCTION: Record<WriteStyle, string> = {
  pas: 'STRUCTURE — PROBLEM-AGITATE-SOLUTION: open by naming the viewer\'s exact pain in their own words. Spend a beat making it worse (the cost, the embarrassment, the wasted time, the stuff they already tried). Only then bring the product in as the relief. Close with the call-to-action.',
  story: 'STRUCTURE — STORY / TESTIMONIAL: first person, past tense, anchored in one small specific moment ("I genuinely almost returned this"). Arc: skeptical → tried it → specific result with a timeframe. Sound like recounting it to a friend, not pitching. Soft call-to-action.',
  listicle: 'STRUCTURE — LISTICLE: a fast "3 reasons / 3 things" list. Say the numbers out loud the way creators do ("okay one...", "two...", "and three — this is the big one..."). Each beat is punchy and concrete. Save the strongest reason for last, then a quick call-to-action.',
  callout: 'STRUCTURE — NEGATIVE / CALLOUT: open by telling the viewer to stop doing something, or that they\'re doing it wrong. Contrarian and a little spicy, but never insulting the viewer. Explain WHY the usual way fails, then pivot to the product as the smarter move.',
  curiosity: 'STRUCTURE — CURIOSITY GAP: open with a question or a "why is nobody talking about this" beat that makes the viewer NEED the answer. Withhold the actual reveal until at least a third of the way through, then pay it off with something specific.',
  'before-after': 'STRUCTURE — TRANSFORMATION: paint the "before" state vividly and specifically, mark the turning point ("then I tried..."), then the "after" with concrete results and a real timeframe. The contrast IS the pitch. Call-to-action last.',
  demo: 'STRUCTURE — UNBOXING / FIRST IMPRESSIONS: real-time reaction energy. Narrate what you notice as if experiencing it right now ("okay wait, it\'s way smaller than I thought"). Honest beats, including one tiny gripe for credibility, ending in a genuine verdict and call-to-action.',
  comparison: 'STRUCTURE — US VS THEM: what people normally use versus this. Concrete differences — price, time, result. Never name competitor brands; say "the stuff from the drugstore", "the one everyone buys". End on why switching is obvious, then the call-to-action.',
}

// Three parallel takes per generate — same style, deliberately different
// openings so the variations aren't three flavors of one hook.
const WRITE_TAKE_INSTRUCTION: string[] = [
  'THIS TAKE: open with a bold claim or hot take stated as fact.',
  'THIS TAKE: open with a specific personal confession or moment ("I did X for years before I realized...").',
  'THIS TAKE: open by directly calling out the viewer ("if you [pain point], stop scrolling" energy — in your own words, not that phrase).',
]

// Word budgets assume ~2.4 words/sec on-camera pace, so the read time
// actually matches the length the user picked.
const WRITE_LENGTH_BUDGET: Record<WriteLength, { words: string; scenes: string }> = {
  10: { words: '20–28 words', scenes: '2 scenes' },
  15: { words: '30–42 words', scenes: '2–3 scenes' },
  30: { words: '62–82 words', scenes: '4–5 scenes' },
  60: { words: '125–160 words', scenes: '7–9 scenes' },
}

function formatEndTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── Cinematic prompt format ──
//
// Produces ONE structured, self-contained text-to-video prompt for a single
// premium AI commercial — a multi-shot montage an AI video model (Seedance,
// Veo, Kling, Sora) renders in ONE generation. The labelled-section skeleton
// is a generic "AI commercial formula"; the model fills every section fresh
// from the user's product + brief. @INFLUENCER / @PRODUCT are reference tokens
// resolved to bank assets when the prompt is handed to Playground.
const WRITE_PROMPT_SYSTEM = `You are an elite AI video commercial director. You write ONE structured, self-contained text-to-video prompt for a single premium, cinematic brand commercial — the kind of ultra-realistic, photoreal film an AI video model (Seedance, Veo, Kling, Sora) renders as ONE generation containing multiple internal shots and cuts.

Your output is ONE prompt, organised into the exact labelled sections below, in this order. Every section is required. Write each as rich, concrete, visual direction — not marketing copy. The whole thing must describe a SINGLE coherent world, character, product, and story that stays consistent from the first frame to the last.

REFERENCE TOKENS — use these literal tokens; never invent names for them and never describe their literal appearance:
- @INFLUENCER — the on-camera character. Their real identity comes from an attached reference image. In CHARACTER, instruct the model to keep @INFLUENCER EXACTLY consistent with the reference (facial structure, skin tone, distinguishing features) — but do NOT describe what they look like yourself.
- @PRODUCT — the product. Its real packaging comes from an attached reference image. In PRODUCT FORM, instruct the model to keep @PRODUCT's packaging EXACTLY consistent with the reference. You may name the product and direct how it is held / lit / revealed, but never invent packaging details.

SECTIONS — label each in CAPS exactly as written, on its own line, then the content:
STYLE — the film's visual language: realism level, lens/film quality, colour grade, depth of field, and the prestige tone (what calibre of film it should feel like). Photoreal, premium, natural skin texture and film grain. A multi-shot montage, never one static take.
ENVIRONMENT — the single world the whole ad lives in: location, time of day, atmosphere, textures, and where the final product hero shot happens within it.
CHARACTER — who @INFLUENCER is in this world (role, world-appropriate wardrobe, emotional register) plus the consistency instruction. A serious lead, not a typical influencer.
PRODUCT FORM — how @PRODUCT appears: held at correct real-world scale in one hand, packaging consistent with the reference, how light catches it. Never oversized or awkward.
CONTEXT — the story situation: what just happened, why this moment matters, how the product reveal lands as a meaningful beat.
CORE ACTION — the beat-by-beat physical action as an arrow sequence (e.g. walks → stops → looks → reaches → reveals → holds → ends on hero shot).
ENERGY — the emotional tone of the whole piece, in a few words.
CAMERA — explicit multi-shot coverage: list the distinct shots (establishing, tracking, close-up, insert, macro reveal, hero push-in). Never one angle, never one continuous take. Describe camera movement and how framing tightens toward the reveal.
LIGHTING — naturalistic, motivated lighting for this world; no glam beauty lighting; how light catches the product and the character; mood.
PHYSICS — grounded real-world motion: weight, fabric, breath, how the product is handled, how the environment behaves. Believable throughout.
AUDIO — the diegetic soundscape (ambience, footsteps, material sounds) plus a restrained cinematic score, and the silence around the reveal.
VOICEOVER — ONE short, powerful ending line, then the product/brand name. Follow it with 2–3 alternate closing lines labelled "Alt:". Tight and trailer-like — never salesy.
TIMELINE — the ad broken into contiguous time beats covering the full requested length (e.g. "0–3s", "3–6s", …). Each beat: one or two sentences describing the shot, what @INFLUENCER does, and where @PRODUCT appears. The final beat is the polished product hero shot, with the VOICEOVER line landing over it.

HARD RULES:
- Derive STYLE, ENVIRONMENT, and the whole concept FRESH from the user's product, brief, and audience. Do NOT reuse a generic stock world.
- Photoreal and grounded. No fantasy unless the product/brief calls for it. The product reveal must feel iconic but believable.
- Keep @INFLUENCER and @PRODUCT consistent with their references; never describe their literal appearance.
- Output ONLY the labelled prompt. No preamble, no commentary, no markdown code fences, no "Here is…".`

// Three parallel concepts per generate — deliberately different cinematic
// worlds so the cards are real alternatives, not three flavours of one idea.
const WRITE_PROMPT_TAKE_INSTRUCTION: string[] = [
  'THIS CONCEPT — EPIC / GRAND: build a powerful, large-scale, atmospheric world that dramatises the product\'s core benefit as something mythic and larger than life. Wide, awe-driven, cinematic scale.',
  'THIS CONCEPT — INTIMATE / HUMAN: a quiet, real, emotionally-driven moment built around one character. The product appears as a personal ritual or a turning point. Restrained and sincere.',
  'THIS CONCEPT — SLEEK / DESIGN-FORWARD: a stylised, ultra-premium brand-film world — bold colour, striking architecture, or a surreal-but-photoreal setting. Modern, iconic, high-fashion energy.',
]

// Single-clip beat budgets. The cinematic format is V1-capped at one ≤15s
// generation, so only 10s / 15s are offered (anything longer would need a
// multi-clip chain the video models can't do in one shot).
const WRITE_PROMPT_BEATS: Record<number, string> = {
  10: '3–4 contiguous beats spanning 0–10s',
  15: '5 contiguous beats spanning 0–15s',
}

async function runCinematicPrompt(input: GenerateScriptInput, take: number, length: number, apiKey: string, endpoint: string): Promise<string> {
  const effLen = length === 10 ? 10 : 15

  let prompt = `The creator's brief for this commercial:\n\n${input.brief.trim()}\n\n`

  if (input.productName) {
    prompt += `Product / brand name (name it in the VOICEOVER sign-off): ${input.productName}\n\n`
  }

  const ctxLines = productContextLines(input.productContext)
  if (ctxLines) {
    prompt += `The product being advertised:\n${ctxLines}\n\n`
  }

  prompt += `${WRITE_PROMPT_TAKE_INSTRUCTION[take] ?? WRITE_PROMPT_TAKE_INSTRUCTION[0]}\n\n`

  if (input.additionalContext) {
    prompt += `Additional context and instructions:\n${input.additionalContext}\n\n`
  }

  prompt += `LENGTH: a single ${effLen}-second commercial rendered as ONE generation with multiple internal cuts. The TIMELINE must be ${WRITE_PROMPT_BEATS[effLen]}, contiguous from 0s to ${effLen}s.\n\nWrite the full structured prompt now.`

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: WRITE_PROMPT_SYSTEM }] },
    { role: 'user', content: [{ type: 'text', text: prompt }] },
  ]

  return kieChatCompletions(apiKey, endpoint, messages)
}

async function runWrite(input: GenerateScriptInput, take: number, apiKey: string, endpoint: string): Promise<string> {
  const style = input.writeStyle ?? 'pas'
  const format = input.writeFormat ?? 'script'
  const length = input.writeLength ?? 15
  const budget = WRITE_LENGTH_BUDGET[length]

  // Cinematic master-prompt format takes a wholly different system prompt and
  // section structure — branch out before the spoken-script path.
  if (format === 'prompt') {
    return runCinematicPrompt(input, take, length, apiKey, endpoint)
  }

  let prompt = `The creator's brief for this ad:\n\n${input.brief.trim()}\n\n`

  const ctxLines = productContextLines(input.productContext)
  if (ctxLines) {
    prompt += `The product being advertised:\n${ctxLines}\n\n`
  }

  prompt += `${WRITE_STYLE_INSTRUCTION[style]}\n\n${WRITE_TAKE_INSTRUCTION[take] ?? WRITE_TAKE_INSTRUCTION[0]}\n\n`

  if (input.additionalContext) {
    prompt += `Additional context and instructions:\n${input.additionalContext}\n\n`
  }

  if (format === 'scenes') {
    prompt += `LENGTH: the ad is exactly ${length} seconds. Break it into ${budget.scenes} with contiguous timestamps from 00:00 to ${formatEndTimestamp(length)}. Total spoken dialogue across all scenes: ${budget.words} (so it reads aloud in ${length} seconds).\n\nWrite the scene blueprint now.`
  } else {
    prompt += `LENGTH: the script must read aloud in about ${length} seconds — write ${budget.words}. Count the words before you answer and trim until you're inside the range.\n\nWrite the script now.`
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: format === 'scenes' ? WRITE_SCENES_SYSTEM : WRITE_SCRIPT_SYSTEM }] },
    { role: 'user', content: [{ type: 'text', text: prompt }] },
  ]

  return kieChatCompletions(apiKey, endpoint, messages)
}

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

  if (input.mode === 'write') {
    const variations = await Promise.all([0, 1, 2].map((take) => runWrite(input, take, apiKey, endpoint)))
    return { variations }
  }

  const angles: RemixAngle[] = ['hook-led', 'pain-point-led', 'curiosity-led']
  const variations = await Promise.all(angles.map((angle) => runRemix(input, angle, apiKey, endpoint)))
  return { variations }
}
