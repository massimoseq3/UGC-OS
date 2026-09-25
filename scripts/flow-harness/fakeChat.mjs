// The chat half of the kie.ai stub: what a "model" answers, per caller.
//
// Every chat call in UGC OS is one of ~20 prompts, and each caller PARSES the
// answer (hook tags, <SCENE> envelopes, a JSON contract…). So the fake can't
// be one canned string — it is a table of matchers, first match wins:
//
//     { name, match(ctx) → bool, respond(ctx) → string }
//
// `ctx` is transport-neutral (see normaliseMessages in stub.mjs):
//     ctx.system   every system/developer message joined
//     ctx.user     the LAST user message's text
//     ctx.all      every message's text joined (for loose matching)
//     ctx.messages [{ role, text, images }]
//     ctx.model    the model slug/endpoint that was asked
//
// To add a caller: find its system prompt (grep kieChatCompletions / createTask
// in src/), add a row ABOVE `default`, and make the answer satisfy that
// caller's parser. Keep matchers on distinctive phrases of the SYSTEM prompt —
// those are stable; user prompts carry member text.

// ── Small helpers ───────────────────────────────────────────────────────────

const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length]

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.round(sec) % 60).padStart(2, '0')}`

// The product as the prompt describes it. Scripts sends "- Product Name: X";
// B-Roll sends "- Product: X. description"; Describe It sends bank rows.
export function productOf(text) {
  const name =
    /- Product Name: ([^\n]+)/.exec(text)?.[1]?.trim() ??
    /- Product: ([^.\n]+)/.exec(text)?.[1]?.trim() ??
    null
  const full = name || 'this serum'
  const words = full.split(/\s+/)
  // How a person says it: "GlowSerum", not "GlowSerum Vitamin C Serum".
  const spoken = words.length > 2 ? words[0] : full
  const lower = `${full} ${text.slice(0, 4000)}`.toLowerCase()
  const thing = ['serum', 'cream', 'moisturizer', 'cleanser', 'shampoo', 'supplement', 'gummies', 'protein', 'bottle', 'mask', 'oil']
    .find((w) => lower.includes(w)) ?? 'thing'
  return { name: full, spoken, thing }
}

// ── Hooks ───────────────────────────────────────────────────────────────────

const HOOKS = [
  ['MYTH BUSTING', 'Let me de-influence you from eighty dollar serums, because this one does the same job for a third of the price.'],
  ['CURIOSITY GAP', 'Nobody told me the reason my skin looked tired at twenty-nine had nothing to do with sleep.'],
  ['STORYTELLING', "I almost returned this, and now it's the only thing on my bathroom shelf I actually finish."],
  ['COMPARISON', 'I put the drugstore vitamin C on one cheek and {S} on the other for two weeks, and my sister noticed first.'],
  ['PATTERN INTERRUPT', "Stop putting your vitamin C on at night, you're wasting half of it."],
  ['AUTHORITY', "My dermatologist asked what I'd changed in my routine, so here's the one thing I changed."],
  ['DAY IN THE LIFE', 'This is the ninety seconds every morning that got me to stop wearing foundation.'],
  ['EDUCATIONAL', 'If your vitamin C {T} has turned orange, it stopped working weeks ago, and here is how to tell.'],
  ['CURIOSITY GAP', "There's one line on the back of the bottle that tells you if a {T} will actually fade dark spots."],
  ['STORYTELLING', 'Three weeks ago someone asked if I was sick, and today a stranger asked what I use on my skin.'],
  ['MYTH BUSTING', "You don't need a ten-step routine for glowing skin, you need two drops of the right thing."],
  ['COMPARISON', 'I spent two hundred dollars on brightening products last year, and this thirty dollar bottle beat all of them.'],
  ['PATTERN INTERRUPT', 'Put the concealer down for a second, I want to show you what is under it now.'],
  ['EDUCATIONAL', 'Here is why your dark spots come back every summer, and the one step that finally stopped mine.'],
  ['DAY IN THE LIFE', 'Come with me on day twenty-one of using only {S} and nothing else on my face.'],
  ['AUTHORITY', 'I have tested forty vitamin C serums for this page, and exactly one stayed in my routine.'],
  ['CURIOSITY GAP', 'I figured out why my makeup kept looking cakey by lunch, and it was never the makeup.'],
  ['STORYTELLING', 'My husband thought I got a facial, and I let him believe it for a whole week.'],
  ['MYTH BUSTING', "Expensive doesn't mean stronger, and my bathroom drawer full of fancy bottles is the proof."],
  ['PATTERN INTERRUPT', 'This is my skin with zero makeup at seven in the morning, and I am not even filtering it.'],
]

function hooksAnswer(ctx) {
  const count = Number(/Return EXACTLY (\d+) lines/.exec(ctx.system)?.[1] ?? /Write the (\d+) hooks now/.exec(ctx.user)?.[1] ?? 10)
  const { spoken, thing } = productOf(ctx.user)
  const lock = /every one of the \d+ hooks must be <([A-Z ]+)>/.exec(ctx.user)?.[1]
  const out = []
  for (let i = 0; i < count; i++) {
    const [tag, text] = HOOKS[i % HOOKS.length]
    const round = Math.floor(i / HOOKS.length)
    const line = text.replaceAll('{S}', spoken).replaceAll('{T}', thing)
    // Past the pool, vary the line a little so a 50-pack isn't 20 lines x2.5.
    const varied = round === 0 ? line : `${['Okay real talk,', 'Hot take:', 'Be honest,', 'Quick one:'][round % 4]} ${line.charAt(0).toLowerCase()}${line.slice(1)}`
    out.push(`<${lock ?? tag}> ${varied}`)
  }
  return out.join('\n')
}

// ── Scripts (Write New, one take per call) ──────────────────────────────────

// Keyed by a phrase of each WRITE_TAKES instruction, so the five parallel takes
// of one batch come back as five different scripts (a hash would collide).
const TAKE_KEYS = ['personal confession', 'surprising number', 'open mid-story', 'bold claim', "exact reason someone wouldn't buy", 'directly calling out', "the thing they're using right now", 'a mistake the viewer', 'how you found it', 'one specific moment in the day']

const SCRIPTS = [
  // 0 confession
  [
    'I spent three years hiding my dark spots under two layers of concealer.',
    'Every video call, I angled my face toward the window and hoped nobody looked closely.',
    'My best friend finally mailed me {S} and made me promise to use it for a month.',
    'Two drops every morning, before sunscreen, and honestly I forgot about it.',
    'Around week three I caught myself in the car mirror and actually stopped.',
    'The spots on my cheek had faded, and my skin looked awake for the first time in ages.',
    "I haven't touched concealer in two weeks, so grab yours with the link below.",
  ],
  // 1 number / before-after
  [
    'Twenty-one days is how long it took my dark spots to fade by half.',
    'I took a photo in the same window light every single morning to prove it to myself.',
    'Day one, you can see every mark from last summer sitting right on my cheekbones.',
    'Day twenty-one, same light, no filter, and my skin tone is actually even.',
    'The only thing I added was two drops of {S} before my sunscreen.',
    'It is twenty percent vitamin C, and it does not turn orange in the bottle.',
    'Try it for three weeks yourself, the link is right below this video.',
  ],
  // 2 mid-story
  [
    'So I am standing in the checkout line when the cashier asks what I use on my skin.',
    'I genuinely laughed, because a month ago I would have hidden my face from that exact light.',
    'The only new thing in my routine is this little amber bottle of {S}.',
    'Two drops in the morning, it sinks in fast, and it layers perfectly under makeup.',
    'My dark spots have faded, and my skin has this glow I used to fake with highlighter.',
    'I told her the name, and now I am telling you, because it really works.',
    'Tap the link below and grab a bottle before they sell out again.',
  ],
  // 3 bold claim
  [
    'Most vitamin C serums are dead before they ever touch your face.',
    'The formula oxidizes in a clear bottle, turns orange, and stops doing anything at all.',
    'That is why I switched to {S}, which comes in a dark glass bottle that keeps it stable.',
    'I use two drops every morning, and it feels like water, not sticky syrup.',
    'Within a month my dark spots had faded and my skin tone looked even again.',
    'It costs less than the one everyone buys, and it actually lasts to the last drop.',
    'If your serum has gone orange, throw it out and try this one from the link below.',
  ],
  // 4 objection
  [
    'I know, thirty dollars sounds like a lot for a bottle this small.',
    'I thought the exact same thing until I did the maths on how long it lasts.',
    'Two drops a morning means one bottle of {S} gets me through almost three months.',
    'That is about thirty cents a day, which is less than my morning coffee.',
    'And for that, my dark spots are fading and I have stopped buying concealer altogether.',
    'Honestly it has paid for itself twice over already.',
    'Grab one from the link below and see how long yours lasts.',
  ],
  // 5 callout
  [
    'If you cover your dark spots every morning and hate how cakey it looks by lunch, stay here.',
    'That was me for years, layering concealer and blotting it off all day.',
    'What finally fixed it was treating the spots instead of hiding them.',
    'I started using {S}, two drops every morning under my sunscreen.',
    'After a month the spots were lighter and my makeup finally looked like skin.',
    'Now I wear half the coverage and nobody can tell the difference.',
    'Try it for yourself, the link is waiting for you right below.',
  ],
  // 6 what they use now
  [
    'The vitamin C serum everyone buys at the drugstore has been failing you for a reason.',
    'It comes in a clear bottle, it turns orange in a week, and it stings every time.',
    'I used it for a year and my dark spots stayed exactly where they were.',
    'Then I switched to {S}, and the difference showed up in about three weeks.',
    'No sting, no sticky feeling, and the spots on my cheeks finally started fading.',
    'It is the only one I have ever finished to the very last drop.',
    'Make the switch with the link below, your skin will thank you.',
  ],
  // 7 mistake
  [
    'You are probably putting your vitamin C on at the wrong time of day.',
    'Most people use it at night, but it works best in the morning under sunscreen.',
    'It helps your skin fight the sun damage that causes dark spots in the first place.',
    'When I moved {S} to my morning routine, everything changed within a month.',
    'My spots faded, my skin looked brighter, and my sunscreen stopped pilling on top.',
    'Two drops, pat it in, wait a minute, then sunscreen, that is the whole routine.',
    'Try the morning swap with the link below and thank me in three weeks.',
  ],
  // 8 how you found it
  [
    'My sister would not stop texting me about this serum, so I finally caved.',
    'She sent me a before and after of her cheeks and I honestly thought it was edited.',
    'I ordered {S} that night just to prove her wrong.',
    'Three weeks later I am the one sending before and afters to everyone I know.',
    'My dark spots faded, my skin looks bright, and I have not needed foundation all week.',
    'She is insufferable about it now, but she was completely right.',
    'The link is below if you want to be the annoying one in your group chat too.',
  ],
  // 9 moment in the day
  [
    'Seven in the morning, bathroom light, this used to be the worst part of my day.',
    'Every dark spot showed up, and I would reach for concealer before I even brushed my teeth.',
    'Now the first thing I reach for is two drops of {S}.',
    'It sinks in while I make coffee, and then sunscreen goes right on top.',
    'After a month, that same harsh light shows skin that is actually even and bright.',
    'My mornings take half the time and I leave the house feeling good.',
    'Start your own mornings over with the link right below.',
  ],
]

function takeIndex(text) {
  // Only the take's own line: the prompt also names its SIBLINGS' angles
  // ("NOT YOUR ANGLE: … The others are taking …"), which would match too.
  const lower = (/THIS TAKE: ([^\n]+)/.exec(text)?.[1] ?? text).toLowerCase()
  const i = TAKE_KEYS.findIndex((k) => lower.includes(k.toLowerCase()))
  return i >= 0 ? i : hash(text) % SCRIPTS.length
}

function scriptLines(i, product) {
  return SCRIPTS[i % SCRIPTS.length].map((l) => l.replaceAll('{S}', product.spoken).replaceAll('{T}', product.thing))
}

function writeScriptAnswer(ctx) {
  return scriptLines(takeIndex(ctx.user), productOf(ctx.user)).join('\n')
}

const SCENE_LOOKS = [
  'a sunlit bathroom with a white tiled wall and a round mirror, soft window light from camera-left',
  'a cosy bedroom vanity with fairy lights behind, warm lamp light falling across the face',
  'a bright kitchen counter at breakfast, a coffee mug steaming in the foreground',
  'the driver seat of a parked car, daylight through the windscreen, seatbelt on',
]

function blueprintScenes(lines, total = 30) {
  // Two lines per scene, contiguous timestamps from 00:00 to the total.
  const groups = []
  for (let i = 0; i < lines.length; i += 2) groups.push(lines.slice(i, i + 2))
  const per = total / groups.length
  return groups.map((g, i) => ({ index: i + 1, start: Math.round(i * per), end: Math.round((i + 1) * per), lines: g }))
}

function writeScenesAnswer(ctx) {
  const product = productOf(ctx.user)
  const total = Number(/the ad is exactly (\d+) seconds/.exec(ctx.user)?.[1] ?? 30)
  const lines = scriptLines(takeIndex(ctx.user), product)
  const scenes = blueprintScenes(lines, total)
  const labels = ['Mirror confession hook', 'Routine close-up', 'Result reveal', 'Call to action']
  const body = scenes.map((s) => `--- Scene ${s.index}: ${pick(labels, s.index - 1)} (${mmss(s.start)}-${mmss(s.end)}) ---
In ${pick(SCENE_LOOKS, s.index - 1)}, [CHARACTER] holds [PRODUCT] at chest height, tilting it toward the light with a small knowing smile before looking straight into the lens, framed from chest height an arm's length away. [CHARACTER] says: "${s.lines.join(' ')}" Sound is the dialogue plus the quiet room ambience only — NO background music, NO soundtrack, NO score.`).join('\n\n')
  return `${body}

=== VOICE PROFILE (same voice in every scene) ===
Warm, conversational female voice in her late twenties with a neutral American accent, mid pitch, quick but unhurried pace, a bright smile audible on the payoff lines and a slight vocal fry at the ends of sentences, sounding like she is telling a close friend a secret.`
}

// ── Remix (Scripts: winning transcript → new takes) ─────────────────────────

const REMIX_KEYS = ['opening device', 'pain point', 'curiosity gap', 'personal moment', 'concrete result', "wouldn't buy", 'using right now', 'mistake', 'came across it', 'specific moment in the day']

function remixAnswer(ctx) {
  const angle = /(?:^|\n)ANGLE: ([^\n]+)/.exec(ctx.user)?.[1]?.toLowerCase() ?? ''
  let i = REMIX_KEYS.findIndex((k) => angle.includes(k))
  if (i < 0) i = hash(ctx.user) % SCRIPTS.length
  return scriptLines(i, productOf(ctx.user)).join('\n')
}

const VOICE_BRIEF = 'A warm, quick-talking woman in her late twenties with a neutral American accent and a bright mid-range pitch — she sounds like she is filming in her bathroom between errands, confident but never salesy, leaning into the payoff lines with a smile you can hear, dropping to a conspiratorial half-whisper on the reveal, and ending sentences with a light vocal fry.'

function reverseEngineerAnswer(ctx) {
  const product = productOf(ctx.user)
  const headers = [...ctx.user.matchAll(/--- Scene (\d+): ([^\n(]+?)\s*\((\d\d:\d\d)-(\d\d:\d\d)\) ---/g)]
  const scenes = headers.length ? headers.map((m) => ({ n: m[1], label: m[2], start: m[3], end: m[4] })) : [{ n: '1', label: 'Single take', start: '00:00', end: '00:15' }]
  const lines = scriptLines(3, product)
  const body = scenes.map((s, i) => `--- Scene ${s.n}: ${s.label} (${s.start}-${s.end}) ---
[CHARACTER] stands in a sunlit bathroom, framed from chest height an arm's length away, lifting [PRODUCT] toward the lens with raised eyebrows and a half smile, window light from camera-left. She says: "${lines[i % lines.length]}" NO background music, NO soundtrack, NO score — only the spoken dialogue and soft room ambience.`).join('\n\n')
  return `=== MASTER VISUAL STYLE (every scene is shot in this look) ===
Handheld vertical UGC footage with natural window light, slightly warm white balance, soft shadows and a gentle handheld drift; true-to-life skin texture with visible pores, no beauty filter, mild smartphone sharpening and a touch of highlight bloom on bright surfaces; colours stay natural with creamy neutrals and warm skin tones, and the finish is clean, unpolished and authentic rather than commercial.

${body}

=== VOICE PROFILE (same voice in every scene) ===
${VOICE_BRIEF}`
}

// ── B-Roll storyboard (Line-by-Line) ────────────────────────────────────────

// The script as B-Roll pasted it: everything after "Script:\n" up to the first
// block the prompt appends (product / character / staging / extra context).
export function storyboardScript(user) {
  const at = user.indexOf('Script:\n')
  if (at < 0) return ''
  let rest = user.slice(at + 'Script:\n'.length)
  const stops = ['\n\nTHE PRODUCT THIS AD IS FOR', '\n\nModel/Character:', '\n\nAdditional context:', '\n\nStage every variation']
  let end = rest.length
  for (const s of stops) {
    const i = rest.indexOf(s)
    if (i >= 0 && i < end) end = i
  }
  rest = rest.slice(0, end)
  // A scene-staging block (a FORMAT) also rides after a blank line; it never
  // starts like a spoken sentence, so keep only the paragraphs before one that
  // looks like a directive block (ALL CAPS lead-in).
  const paras = rest.split(/\n\n+/)
  const kept = []
  for (const p of paras) {
    if (kept.length && /^[A-Z][A-Z \-—/]{6,}[:—]/.test(p.trim())) break
    kept.push(p)
  }
  return kept.join('\n').trim()
}

// One <LINE> per script sentence-line, merging any line under five words
// forward (the storyboard prompt's own rule), words kept verbatim so
// isStoryboardShort() sees full coverage.
function storyboardLines(script) {
  const raw = script.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const out = []
  let carry = ''
  for (const l of raw) {
    const joined = carry ? `${carry} ${l}` : l
    if (joined.split(/\s+/).length < 5) { carry = joined; continue }
    out.push(joined)
    carry = ''
  }
  if (carry) out.length ? (out[out.length - 1] += ` ${carry}`) : out.push(carry)
  return out
}

const BROLL_IDEAS = [
  ['ACTION', 'DROPPER SQUEEZE', 'both', 'The character stands at a white bathroom sink in soft morning window light, pinching the black rubber bulb of the amber dropper bottle so a single glossy drop of serum is just beginning to fall toward their open palm, fingertips slightly damp, a faint smile starting at the corner of their mouth.', 'The drop falls and lands in the palm, and the character begins to rub their fingertips together.'],
  ['EMOTIONAL', 'MIRROR DOUBLE TAKE', 'character', 'The character leans toward a round bathroom mirror, one hand pulling their hair back from their cheek, eyebrows just starting to lift in surprise as they notice their even, glowing skin tone in the warm light spilling from a window on the left.', 'Their eyebrows rise fully and a delighted grin spreads as they tilt their face toward the light.'],
  ['PRODUCT', 'COUNTER HERO', 'product', 'The amber glass dropper bottle stands on a pale marble counter beside a folded white towel and a small green plant, morning sunlight catching the glass so a warm orange glow pools on the stone, a hand just entering frame from the right to pick it up.', 'The hand closes around the bottle and lifts it off the counter.'],
  ['POV', 'PALM PAT', 'none', 'Seen from the character\'s own eyes, two hands with a thin sheen of serum are about to press flat against their cheeks, the blurred bathroom mirror and a toothbrush cup softly visible beyond the fingertips.', 'The palms press gently onto the cheeks and pat twice.'],
  ['ENVIRONMENT', 'SUNLIT SHELF', 'product', 'A tidy bathroom shelf in early sunlight holds the amber serum bottle between a tube of sunscreen and a ceramic cup of cotton pads, dust motes hanging in a single beam of light that is just beginning to slide across the shelf.', 'The beam of sunlight slowly slides across the shelf and over the bottle.'],
  ['PROOF', 'BEFORE AFTER TAP', 'character', 'The character sits on the edge of a bed holding a printed photo of their old dark spots next to their cheek, finger just starting to tap the photo while they look toward the viewer with raised eyebrows, lamp light warm from the side.', 'Their finger taps the photo twice and they lower it to reveal their clear cheek.'],
  ['TRANSITION', 'TOWEL REVEAL', 'character', 'The character is just beginning to lower a fluffy white towel from their freshly washed face in a bright bathroom, eyes still closed, water droplets on their jawline catching the window light.', 'The towel drops away and their eyes open toward the mirror.'],
]

function brollStoryboardAnswer(ctx) {
  const script = storyboardScript(ctx.user)
  const dialogue = /Break this script into dialogue scenes/.test(ctx.user)
  const lines = storyboardLines(script)
  const positions = ['hook', 'reframe', 'mechanism', 'mechanism', 'payoff', 'payoff', 'CTA']
  const scenes = lines.map((line, s) => {
    const pos = s === 0 ? 'hook' : s === lines.length - 1 ? 'CTA' : pick(positions, s)
    const visible = /serum|bottle|drops?|glowserum|link|it\b/i.test(line) ? 'yes' : 'no'
    const vars = [0, 1, 2].map((v) => {
      const [tag, label, refs0, prompt, motion] = pick(BROLL_IDEAS, s * 3 + v)
      const refs = visible === 'no' ? (refs0 === 'both' ? 'character' : refs0 === 'product' ? 'none' : refs0) : (refs0 === 'character' ? 'both' : refs0 === 'none' ? 'product' : refs0)
      if (dialogue) {
        return `<VAR_${v + 1}>
<TAG>DIALOGUE</TAG>
<LABEL>${['ANCHOR TAKE', 'KITCHEN TALK', 'CAR CONFESSION'][v]}</LABEL>
<REFS>${visible === 'yes' ? 'both' : 'character'}</REFS>
<PROMPT>${['In a sunlit bathroom with a round mirror behind, framed from chest height an arm\'s length away, the character', 'Leaning on a bright kitchen counter with a steaming mug beside them, the character', 'Sitting in the driver seat of a parked car in soft daylight, the character'][v]} looks straight into the lens with an easy half smile and says: "${line}"</PROMPT>
<MOTION>The character says: "${line}" while nodding once and letting the smile widen on the last word.</MOTION>
</VAR_${v + 1}>`
      }
      return `<VAR_${v + 1}>
<TAG>${tag}</TAG>
<LABEL>${label}</LABEL>
<REFS>${refs}</REFS>
<PROMPT>${prompt}</PROMPT>
<MOTION>${motion}</MOTION>
</VAR_${v + 1}>`
    })
    return `<SCENE>
<LINE>${line}</LINE>
<POSITION>${pos}</POSITION>
<VISIBILITY>${visible}</VISIBILITY>
${vars.join('\n')}
</SCENE>`
  })
  const voice = dialogue ? `\n<VOICE_PROFILE>\nVOICE — ${VOICE_BRIEF}\n</VOICE_PROFILE>` : ''
  return scenes.join('\n') + voice
}

// A continuation ask ("That answer stopped before the end…"). Our storyboards
// always cover the script, so this only fires if a parser disagrees; answer
// with nothing new so the loop ends.
function continuationAnswer() {
  return ''
}

// Continuous (keyframe chain) storyboard — opt-in B-Roll mode, not in Flow.
function continuousAnswer(ctx) {
  const numbered = [...ctx.user.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1].trim())
  const concept = (n, still) => `<CONCEPT_${n}>
<LABEL>${['ACROSS THE SINK', 'MIRROR LEAN', 'COUNTER LEVEL'][n - 1]}</LABEL>
<SHOT>medium</SHOT>
<REFS>both</REFS>
<PROMPT>${pick(BROLL_IDEAS, n)[3]}</PROMPT>
${still ? '' : `<MOTION>${pick(BROLL_IDEAS, n)[4]} The camera eases slowly forward; soft room tone only.</MOTION>\n`}</CONCEPT_${n}>`
  const scenes = numbered.map((line, i) => `<SCENE_${i + 1}>
<LINE>${line}</LINE>
<VISIBILITY>yes</VISIBILITY>
<FRAME>
${[1, 2, 3].map((n) => concept(n, false)).join('\n')}
</FRAME>
</SCENE_${i + 1}>`).join('\n')
  return `<STORYBOARD>
<STYLE>Handheld vertical UGC footage in natural window light with a slightly warm white balance, true-to-life skin texture, soft falloff shadows, creamy neutral palette with warm amber accents, gentle handheld drift, mild smartphone sharpening and a clean unpolished finish that reads as filmed at home rather than in a studio.</STYLE>
${scenes}
<FINAL_FRAME>
${[1, 2, 3].map((n) => concept(n, true)).join('\n')}
</FINAL_FRAME>
</STORYBOARD>`
}

// B-Roll: regenerate ONE variation / enhance one prompt.
function variationAnswer(ctx) {
  const line = /Script line: "([^"]*)"/.exec(ctx.user)?.[1] ?? ''
  const forced = /The variation MUST be a ([A-Z]+) shot/.exec(ctx.user)?.[1]
  const [tag, label, refs, prompt, motion] = pick(BROLL_IDEAS, hash(ctx.user))
  const t = forced ?? tag
  const p = t === 'DIALOGUE' ? `In a sunlit bathroom, framed from chest height, the character looks into the lens and says: "${line}"` : prompt
  return `<VARIATION>
<LABEL>${label}</LABEL>
<TAG>${t}</TAG>
<REFS>${refs}</REFS>
<PROMPT>
${p}
</PROMPT>
<MOTION>
${motion}
</MOTION>
</VARIATION>`
}

function enhanceAnswer(ctx) {
  const draft = /Draft:\s*"""\s*([\s\S]*?)"""/.exec(ctx.user)?.[1]?.trim() ?? /Draft:\s*([\s\S]+)$/.exec(ctx.user)?.[1]?.trim() ?? ctx.user.slice(-400)
  return `${draft.replace(/\s+/g, ' ').trim()} Shot in soft natural window light with true-to-life texture, one clear action caught mid-motion, warm neutral palette and a relaxed, authentic at-home feel.`
}

// ── Ad Analyzer ─────────────────────────────────────────────────────────────

const WINNING_TRANSCRIPT = [
  ['00:00', "Okay I need to talk about the serum that made my dermatologist ask what I changed."],
  ['00:03', 'I have had these dark spots since my twenties and nothing touched them.'],
  ['00:07', 'This one is twenty percent vitamin C in a dark bottle so it does not go orange.'],
  ['00:11', 'Two drops every morning under sunscreen, that is it.'],
  ['00:14', 'Four weeks later, look at my cheek. No filter.'],
  ['00:18', 'It is on sale right now, the link is below, go.'],
]

function adAnalysisAnswer() {
  const scenes = [
    { index: 1, startTime: '00:00', endTime: '00:11', durationSeconds: 11, label: 'Mirror confession hook' },
    { index: 2, startTime: '00:11', endTime: '00:21', durationSeconds: 10, label: 'Routine and result reveal' },
  ].map((s, i) => ({
    ...s,
    prompt: `[0:00–0:0${3 + i}] Medium close-up at eye level, an arm's length away, static with a slight handheld drift: a woman in her late 20s with shoulder-length wavy chestnut hair parted in the middle, light olive skin with faint freckles across the nose, wearing an oversized cream cable-knit sweater and small gold hoop earrings, stands in a white-tiled bathroom lit by soft window light from camera-left. She holds a small amber glass dropper bottle with a black rubber bulb and a cream label reading "GLOW" close to the lens. She says to the lens with her mouth in sync: "${WINNING_TRANSCRIPT[i * 3][1]}" [0:0${3 + i}–0:${i ? '21' : '11'}] Quick cut to a macro of a single drop falling into her palm, then back to the medium shot as she pats it onto her cheek; she says: "${WINNING_TRANSCRIPT[i * 3 + 1][1]}" White word-by-word captions with a black outline run in the lower third. No music, soft bathroom ambience, a small "pop" sound on the macro cut.`,
  }))
  return JSON.stringify({
    adTitle: 'Vitamin C Serum Dermatologist Reveal',
    scorecard: {
      scores: [
        { label: 'Hook Strength', score: 7.8 },
        { label: 'Structure Clarity', score: 7.1 },
        { label: 'Visual Variety', score: 5.6 },
        { label: 'Persuasion Depth', score: 6.4 },
        { label: 'Overall Execution', score: 6.9 },
      ],
      analystNote: 'A strong authority-borrowing hook carries a fairly static bathroom shoot. The proof beat lands but arrives late, and a second angle in the routine section would lift retention.',
    },
    creativeBreakdown: {
      hook: 'Opens on "the serum that made my dermatologist ask what I changed" — a borrowed-authority curiosity gap delivered straight to the lens. It stops the scroll because it implies a visible result a professional noticed, without saying what it is yet.',
      angle: 'Transformation with borrowed authority, aimed at problem-aware women in their late 20s to 30s with sun spots. It assumes the viewer has already tried vitamin C and been let down.',
      structure: '00:00–00:03 Hook — borrowed-authority curiosity gap\n00:03–00:07 Problem — names the long-standing dark spots\n00:07–00:11 Mechanism — 20% vitamin C in a stable dark bottle\n00:11–00:14 Demo — two drops under sunscreen\n00:14–00:18 Proof — no-filter cheek close-up\n00:18–00:21 CTA — sale urgency and link',
    },
    transcript: WINNING_TRANSCRIPT.map(([timestamp, text]) => ({ timestamp, text })),
    reverseEngineeredPrompt: {
      totalDurationSeconds: 21,
      isSingleClip: false,
      masterVisualStyle: {
        styleId: 'ugc',
        label: 'Live-Action UGC',
        liveAction: true,
        brief: 'Vertical handheld smartphone footage in soft natural window light with a slightly warm white balance; true-to-life skin texture with visible pores and no beauty filter; creamy neutral bathroom palette with warm amber accents; gentle handheld drift with occasional quick punch-in cuts; mild sharpening and highlight bloom typical of a phone sensor; clean, unpolished finish that reads as filmed at home.',
      },
      masterVoiceProfile: {
        label: 'Bright American Female, Late 20s',
        traits: ['Female, late 20s', 'General American', 'Quick, conversational', 'Slight vocal fry'],
        delivery: 'On-camera, talking to the lens with the mouth in sync throughout; no voiceover.',
        profile: VOICE_BRIEF,
      },
      scenes,
    },
  })
}

// ── Characters: reference photo → Visual DNA ────────────────────────────────

function characterDnaAnswer() {
  return JSON.stringify({
    model: {
      gender: 'Female', age: '26-30', ethnicity: 'Colombian', bodyType: 'Slim', skinTone: 'Olive, warm undertone',
      skinTexture: 'Visible fine pores across the nose and cheeks, a light scatter of freckles on the bridge of the nose, faint natural shine on the T-zone',
      eyeColor: 'Dark chocolate brown', eyeShape: 'Almond', hairColor: 'Deep espresso brown with subtle caramel ends',
      hairStyle: 'Shoulder-length soft waves with curtain bangs, parted in the middle', hairTexture: 'Wavy',
      facialFeatures: 'Oval face, softly defined cheekbones, full lips, straight nose', facialHair: 'None', distinguishingMarks: 'Small beauty mark above the right corner of the lip',
    },
    style: { clothingStyle: 'Oversized cream cable-knit sweater with a relaxed crew neck, sleeves pushed to the elbows', accessories: 'Small gold hoop earrings; thin gold chain necklace', makeup: 'Natural makeup — brushed-up brows, a touch of mascara, glossy nude lip' },
    pose: { pose: 'Standing square to the lens, shoulders relaxed, one hand tucking hair behind the ear', action: 'Smiling into the lens mid-conversation', expression: 'Soft closed-mouth smile, relaxed eyes looking directly into the lens' },
    location: { location: 'Bright bedroom', background: 'Pale lilac wall, tall window to the right with sheer curtains, a small plant on the sill', lighting: 'Soft daylight from a window camera-right, gentle falloff, neutral-warm colour temperature', weather: 'Indoor (N/A)', timeOfDay: 'Morning' },
    camera: { shotType: 'Medium close-up', cameraAngle: 'Eye level', cameraDevice: 'iPhone front camera' },
  })
}

// ── Bank: product photo → research brief ────────────────────────────────────

function productBriefAnswer() {
  const f = {
    PRODUCT_NAME: 'GlowSerum Vitamin C Serum',
    DESCRIPTION: 'A lightweight 20% vitamin C face serum in a dark amber dropper bottle that fades dark spots and evens skin tone.',
    UNIQUE_MECHANISM: 'Stabilised 20% L-ascorbic acid in UV-blocking amber glass, so the formula stays potent instead of oxidising orange.',
    TARGET_MARKET: 'Women 25-40 with sun spots or post-acne marks who want brighter skin without a long routine.',
    PAIN_POINTS: 'Dark spots that concealer never fully hides\nSerums that turn orange and stop working\nSticky formulas that pill under sunscreen',
    CURRENT_ALTERNATIVES: 'Drugstore vitamin C in clear bottles that oxidise within weeks\nHeavy concealer every morning',
    OBJECTIONS: 'Price — about 30 cents a day, one bottle lasts almost three months\nSensitivity — gentle pH, no fragrance',
    NOT_FOR: 'Anyone looking for an overnight miracle',
    USPS: 'Dark amber glass keeps the formula stable\nWater-light texture that layers under sunscreen',
    BENEFITS: 'Visibly faded dark spots in three to four weeks\nEven, bright skin tone that needs less makeup',
    PROOF: '4.7 stars from 2,300 reviews (moderate)\nDermatologist-tested (moderate)',
    BEFORE_AFTER: 'Before: every morning starts with two layers of concealer and angling away from the bathroom light.\n\nAfter: two drops, sunscreen, and out the door with bare skin that looks even.',
    OFFER: '20% off your first bottle with free shipping.',
    CTA: 'Tap the link to grab yours',
  }
  return `<READ>GLOW SERUM · Vitamin C 20% · 30 ml</READ>\n${Object.entries(f).map(([k, v]) => `<${k}>${v}</${k}>`).join('\n')}`
}

function styleAnalysisAnswer() {
  return 'Photoreal handheld footage in soft natural window light with a slightly warm white balance, true-to-life skin texture and gentle shadow falloff, a creamy neutral palette lifted by warm amber accents, mild smartphone sharpening, subtle highlight bloom and a clean, unpolished finish that feels filmed at home.'
}

// ── Flow: Describe It / Ask Flow ────────────────────────────────────────────

// "products: id = "Name"; id2 = "Name2"" → [{ id, name }]
function bankRows(user, label) {
  const line = user.split('\n').find((l) => l.startsWith(`${label}:`))
  if (!line || line.includes('(empty)')) return []
  return [...line.matchAll(/([A-Za-z0-9_-]+) = "([^"]*)"/g)].map((m) => ({ id: m[1], name: m[2] }))
}

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, fifty: 50 }

function countIn(lower, nouns) {
  const m = new RegExp(`\\b(\\d+|${Object.keys(WORD_NUMBERS).join('|')})\\s+(?:[a-z-]+\\s+){0,2}(?:${nouns})`).exec(lower)
  if (!m) return null
  return /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1]]
}

const nearest = (n, allowed) => allowed.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), allowed[0])

// Describe It: a proposal built from the request's shape, using real block
// kinds, ports and setting values (templates/describe.ts catalogText).
function describeAnswer(ctx) {
  const want = (/What they want:\n([\s\S]*)$/.exec(ctx.user)?.[1] ?? '').trim()
  const lower = want.toLowerCase()
  const products = bankRows(ctx.user, 'products')
  const models = bankRows(ctx.user, 'models (characters)')
  const swipes = bankRows(ctx.user, 'swipes (saved ads)')
  // Pick a bank row only when the member named it (or said "my …" and there
  // is exactly one); otherwise leave a field, the way the prompt asks.
  const named = (rows, mine) => rows.find((r) => r.name.split(/\s+/).some((w) => w.length > 3 && lower.includes(w.toLowerCase())))
    ?? (mine && rows.length === 1 ? rows[0] : undefined)
  const product = named(products, /\bmy (product|serum|item)\b/.test(lower))
  const character = named(models, /\bmy (character|creator|model|face)\b/.test(lower))
  const bank = (id, label, b, row) => ({ id, kind: 'bank', label, settings: { bank: b }, ...(row ? { pick: row.id } : { field: true }) })
  const notes = []
  let name
  let blocks
  let wires

  if (/still|photo|image|picture/.test(lower) && !/clip|video|b-roll|broll|voice/.test(lower)) {
    // N lifestyle stills: a List of prompts drives one Playground image each.
    const n = Math.min(20, countIn(lower, 'stills|photos|images|pictures|shots') ?? 6)
    const scenes = ['on a sunlit bathroom shelf beside a folded towel', 'in a hand above a marble sink, morning light', 'on a bedside table next to a coffee mug', 'in a gym bag pocket, flat lay', 'on a vanity with fairy lights behind', 'held up against a bright window', 'on a kitchen counter at breakfast', 'next to sunglasses and a beach towel', 'in a travel pouch on a hotel bed', 'on a desk beside a laptop at golden hour']
    name = `${n} Lifestyle Stills`
    blocks = [
      bank('product', 'Your Product', 'products', product),
      { id: 'scenes', kind: 'list', label: 'Scenes', settings: { entries: Array.from({ length: n }, (_, i) => `The product ${scenes[i % scenes.length]}, photographed like a real UGC lifestyle shot`) } },
      { id: 'stills', kind: 'playground', label: 'Lifestyle Still', review: true, settings: { mode: 'image', prompt: '', aspectRatio: '9:16', resolution: '1K' } },
    ]
    wires = [
      { from: 'product', fromPort: 'out', to: 'stills', toPort: 'refs' },
      { from: 'scenes', fromPort: 'all', to: 'stills', toPort: 'prompt' },
    ]
    notes.push('Each scene in the list makes one still of your product. Edit the list to change the shots.')
  } else if (/remix|saved ad|swipe|clone|winner/.test(lower)) {
    const ad = named(swipes, /\bmy saved ad\b/.test(lower) && swipes.length > 0) ?? (swipes.length ? swipes[0] : undefined)
    name = 'Remix a Saved Ad'
    blocks = [
      bank('ad', 'Saved Ad', 'swipes', ad),
      bank('product', 'Your Product', 'products', product),
      bank('character', 'Your Character', 'models', character),
      { id: 'analyzer', kind: 'analyzer', settings: {} },
      { id: 'remix', kind: 'scripts', review: true, settings: { mode: 'remix', writeFormat: 'script', variationCount: 3 } },
      { id: 'voice', kind: 'voice', settings: { voiceId: 'Kore', style: 'Vocal Smile', pace: 'Natural', accent: 'Neutral' } },
      { id: 'broll', kind: 'broll', review: true, settings: { delivery: 'silent', takes: 1, animate: true, aspectRatio: '9:16', styleId: 'ugc' } },
      { id: 'edit', kind: 'edit', settings: {} },
    ]
    wires = [
      { from: 'ad', fromPort: 'out', to: 'analyzer', toPort: 'ad' },
      { from: 'analyzer', fromPort: 'transcript', to: 'remix', toPort: 'source' },
      { from: 'product', fromPort: 'out', to: 'remix', toPort: 'product' },
      { from: 'remix', fromPort: 'all', to: 'voice', toPort: 'script' },
      { from: 'remix', fromPort: 'all', to: 'broll', toPort: 'script' },
      { from: 'character', fromPort: 'out', to: 'broll', toPort: 'character' },
      { from: 'product', fromPort: 'out', to: 'broll', toPort: 'product' },
      { from: 'voice', fromPort: 'audio', to: 'edit', toPort: 'audio' },
      { from: 'broll', fromPort: 'clips', to: 'edit', toPort: 'clips' },
      { from: 'remix', fromPort: 'all', to: 'edit', toPort: 'script' },
    ]
    notes.push('The Ad Analyzer reads your saved ad, Scripts rewrites it for your product on the same beats, and B-Roll shoots your version.')
  } else {
    const hooks = /hook/.test(lower)
    const count = countIn(lower, 'ads|scripts|takes|videos|hooks|versions') ?? (hooks ? 10 : 3)
    const variationCount = nearest(count, [3, 5, 10])
    const hookCount = nearest(count, [10, 20, 50])
    const dialogue = /talk|speak|dialogue|to camera|on camera/.test(lower)
    const female = /female|woman|girl|her voice/.test(lower)
    name = hooks ? `${hookCount} Hooks, Voiced and Shot` : `${product ? product.name.split(' ')[0] : 'Product'} → ${variationCount} UGC Ads`
    blocks = [
      bank('product', 'Your Product', 'products', product),
      bank('character', 'Your Character', 'models', character),
      {
        id: 'scripts', kind: 'scripts', review: true,
        settings: hooks
          ? { mode: 'write', writeFormat: 'hooks', hookCategory: 'auto', hookCount }
          : { mode: 'write', writeFormat: 'script', writeStyle: /story|testimonial/.test(lower) ? 'story' : 'pas', writeLength: /15/.test(lower) ? 15 : 30, variationCount },
      },
      { id: 'voice', kind: 'voice', settings: { voiceId: female ? 'Kore' : 'Puck', style: 'Vocal Smile', pace: 'Natural', accent: 'Neutral' } },
      { id: 'broll', kind: 'broll', review: true, settings: { delivery: dialogue ? 'dialogue' : 'silent', takes: 1, animate: true, aspectRatio: '9:16', styleId: 'ugc' } },
      { id: 'edit', kind: 'edit', settings: {} },
    ]
    wires = [
      { from: 'product', fromPort: 'out', to: 'scripts', toPort: 'product' },
      { from: 'scripts', fromPort: 'all', to: 'voice', toPort: 'script' },
      { from: 'scripts', fromPort: 'all', to: 'broll', toPort: 'script' },
      { from: 'product', fromPort: 'out', to: 'broll', toPort: 'product' },
      { from: 'character', fromPort: 'out', to: 'broll', toPort: 'character' },
      { from: 'voice', fromPort: 'audio', to: 'edit', toPort: 'audio' },
      { from: 'broll', fromPort: 'clips', to: 'edit', toPort: 'clips' },
      { from: 'scripts', fromPort: 'all', to: 'edit', toPort: 'script' },
    ]
    if (hooks && count !== hookCount) notes.push(`Scripts writes hooks in packs of 10, 20 or 50, so this makes ${hookCount} and you keep the best ${count}.`)
    notes.push(`Scripts pauses so you keep only the ${hooks ? 'hooks' : 'takes'} you like before anything is voiced or shot.`)
    notes.push('B-Roll pauses after the stills, so you only pay to animate the ones you keep.')
  }
  // Fenced, with a sentence in front: describe.ts strips fences and reads
  // from the first "{" to the last "}", so this also checks that tolerance.
  return 'Here is the flow:\n```json\n' + JSON.stringify({ name, blocks, wires, notes }, null, 2) + '\n```'
}

// Ask Flow: operations against the flow as it stands (templates/describe.ts
// askFlow). Handles the four EXAMPLES in AskFlow.tsx plus a few more.
function askFlowAnswer(ctx) {
  const want = (/What they want:\n([\s\S]*)$/.exec(ctx.user)?.[1] ?? '').trim().toLowerCase()
  let flow = { blocks: [], wires: [] }
  try { flow = JSON.parse(/The flow:\n(\{[\s\S]*?\})\n\nWhat they want:/.exec(ctx.user)?.[1] ?? '{}') } catch { /* keep empty */ }
  const blocks = flow.blocks ?? []
  const wires = flow.wires ?? []
  const byKind = (k) => blocks.find((b) => b.kind === k)
  const ops = []
  let summary = ''
  const scripts = byKind('scripts')
  const edit = byKind('edit')
  const voice = byKind('voice')
  const broll = byKind('broll')
  if (/second voice|another voice/.test(want) && scripts?.items?.length) {
    ops.push({ op: 'add_block', id: 'voice2', kind: 'voice', label: 'Second Voice', settings: { voiceId: voice?.settings?.voiceId === 'Kore' ? 'Puck' : 'Kore', style: 'Vocal Smile', pace: 'Natural', accent: 'Neutral' } })
    ops.push({ op: 'wire', from: scripts.id, fromPort: `item:${scripts.items[0]}`, to: 'voice2', toPort: 'script' })
    summary = 'Added a second Voiceovers block that reads only the first hook, in a different voice.'
  } else if (/pause|review/.test(want)) {
    const target = broll ?? scripts
    if (target) ops.push({ op: 'set_review', block: target.id, on: true })
    summary = `${target?.kind === 'broll' ? 'B-Roll' : 'Scripts'} now pauses for your review before anything is animated.`
  } else if (/face|cast|character/.test(want)) {
    const n = countIn(want, 'new faces|faces|characters') ?? 4
    ops.push({ op: 'add_block', id: 'faces', kind: 'characters', label: 'New Faces', review: true, settings: { count: Math.min(4, n), kind: 'portrait', profile: { gender: 'Female', age: '25-30', location: 'Bright bathroom', lighting: 'Soft window light' } } })
    if (broll) {
      const old = wires.find((w) => w.to === broll.id && w.toPort === 'character')
      if (old) ops.push({ op: 'unwire', from: old.from, fromPort: old.fromPort, to: broll.id, toPort: 'character' })
      ops.push({ op: 'wire', from: 'faces', fromPort: 'all', to: broll.id, toPort: 'character' })
    }
    summary = `Added a Characters block that casts ${Math.min(4, n)} new faces${broll ? ' and wired them into B-Roll in place of your character' : ''}.`
  } else if (/music|song|soundtrack/.test(want) && edit) {
    ops.push({ op: 'add_block', id: 'music', kind: 'playground', label: 'Background Music', settings: { mode: 'music', prompt: 'Upbeat lo-fi pop bed, bright plucked synths, 100 bpm, no vocals', instrumental: true } })
    ops.push({ op: 'wire', from: 'music', fromPort: 'out', to: edit.id, toPort: 'music' })
    summary = 'Added a Playground music block and wired it into the Edit Pack.'
  } else if (/hook/.test(want) && scripts) {
    const n = nearest(countIn(want, 'hooks') ?? 20, [10, 20, 50])
    ops.push({ op: 'set_setting', block: scripts.id, key: 'writeFormat', value: 'hooks' })
    ops.push({ op: 'set_setting', block: scripts.id, key: 'hookCount', value: n })
    summary = `Scripts now writes ${n} hooks.`
  } else if (/(female|woman|male|man)\b/.test(want) && voice) {
    const female = /female|woman/.test(want)
    ops.push({ op: 'set_setting', block: voice.id, key: 'voiceId', value: female ? 'Kore' : 'Puck' })
    ops.push({ op: 'set_setting', block: voice.id, key: 'voiceName', value: female ? 'Kore' : 'Puck' })
    summary = `Voiceovers now reads with a ${female ? 'female' : 'male'} voice.`
  } else if (/(takes|scripts|ads)/.test(want) && scripts) {
    const n = nearest(countIn(want, 'takes|scripts|ads') ?? 5, [3, 5, 10])
    ops.push({ op: 'set_setting', block: scripts.id, key: 'variationCount', value: n })
    summary = `Scripts now writes ${n} takes.`
  } else {
    const product = blocks.find((b) => b.kind === 'bank')
    ops.push({ op: 'add_block', id: 'thumb', kind: 'playground', label: 'Thumbnail', settings: { mode: 'image', prompt: 'A bright scroll-stopping thumbnail of the product on a bathroom counter in morning light, bold empty space at the top for a headline' } })
    if (product) ops.push({ op: 'wire', from: product.id, fromPort: 'out', to: 'thumb', toPort: 'refs' })
    summary = 'Added a Playground block that makes a thumbnail from your product.'
  }
  return JSON.stringify({ summary, ops })
}

// ── The table ───────────────────────────────────────────────────────────────

export const RESPONDERS = [
  { name: 'flow:describe-it', match: (c) => c.system.startsWith('You design flows for UGC OS Flow'), respond: describeAnswer },
  { name: 'flow:ask-flow', match: (c) => c.system.startsWith('You edit an existing UGC OS Flow'), respond: askFlowAnswer },
  { name: 'scripts:hooks', match: (c) => c.system.includes('short-form hook writer'), respond: hooksAnswer },
  { name: 'scripts:write-scenes', match: (c) => c.system.includes('scene-by-scene blueprint for a brand-new organic TikTok ad'), respond: writeScenesAnswer },
  { name: 'scripts:write-script', match: (c) => c.system.includes('writes organic TikTok/Reels ad scripts'), respond: writeScriptAnswer },
  { name: 'scripts:remix-voice', match: (c) => c.system.startsWith('You are a casting director for short-form UGC ads'), respond: () => VOICE_BRIEF },
  { name: 'scripts:remix', match: (c) => c.system.includes('"Structural Adaptation"'), respond: remixAnswer },
  { name: 'scripts:reverse-engineer', match: (c) => c.system.includes('rewrite it so the SAME ad structure can be regenerated'), respond: reverseEngineerAnswer },
  { name: 'broll:continuation', match: (c) => /^That answer stopped before the end of the script/.test(c.user), respond: continuationAnswer },
  { name: 'broll:storyboard', match: (c) => c.user.includes('Break this script into') && c.all.includes('<SCENE>'), respond: brollStoryboardAnswer },
  { name: 'broll:continuous', match: (c) => c.user.includes('Storyboard this script as a keyframe-chain ad'), respond: continuousAnswer },
  { name: 'broll:new-variation', match: (c) => c.user.includes('Generate a single new creative image generation prompt'), respond: variationAnswer },
  { name: 'ad-analyzer', match: (c) => c.system.startsWith('You are an elite UGC ad analyst'), respond: adAnalysisAnswer },
  { name: 'characters:dna', match: (c) => c.system.startsWith('You are a forensic visual analyst'), respond: characterDnaAnswer },
  { name: 'bank:product-brief', match: (c) => c.system.startsWith('You are a direct response copy strategist'), respond: productBriefAnswer },
  { name: 'style-analysis', match: (c) => c.system.includes('reverse-engineering a visual style'), respond: styleAnalysisAnswer },
  { name: 'enhance', match: (c) => /rewrite|Rewrite/.test(c.system + c.user) && /Draft/.test(c.user), respond: enhanceAnswer },
  { name: 'default', match: () => true, respond: (c) => `Stub reply from the fake kie.ai (${c.model}). No responder matched this prompt; add one to fakeChat.mjs.` },
]

export function answerChat(ctx) {
  const row = RESPONDERS.find((r) => r.match(ctx))
  return { name: row.name, text: row.respond(ctx) }
}
