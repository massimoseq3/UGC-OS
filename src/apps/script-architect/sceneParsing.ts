// How a Scripts take is read back into parts: scene cards, the master voice
// and visual-style blocks, spoken lines, shots and the audio note. Lifted out
// of OutputPanel so the take on screen and Flow's Scripts block (which hands
// each scene or hook on as its own output) are split by one parser — two
// copies would drift into two different answers about where a scene ends.
//
// Every span these return is a character offset into the text they were
// given, which is what lets OutputPanel edit a block IN PLACE with a splice.

// Canonically "--- Scene N: label (mm:ss-mm:ss) ---", but we tolerate a model
// near-miss that drops the surrounding dashes ("Scene 1:", "SCENE 1 —") so a
// scenes/reverse output still splits into cards instead of silently degrading
// to a plain spoken script. Mirrors the scene-header half of
// `detectSceneBlueprint` — only that half, since this reads OUTPUT: an input
// may be routed to the rewrite on its master blocks alone, but the rewrite is
// told to head every scene it writes, so a take always arrives with headers.
const SCENE_HEADER = /^(?:---\s*)?scene\s*\d+\s*[—:–-]/i
const SCENE_REGEX = /(^|\n)\s*(?:---\s*)?scene\s*\d+\s*[—:–-]/i

export interface SceneChunk {
  header: string
  body: string
  // Where `body` sits in the text this chunk was parsed from, as character
  // offsets. This is what makes editing a scene IN PLACE exact: a rendered
  // block knows the span it came from, so committing an edit is a splice rather
  // than a search-and-replace (two scenes can share a sentence) or a
  // reconstruction (the parse trims, strips and filters — it doesn't round-trip).
  bodyStart: number
  bodyEnd: number
  // The whole scene REGION — from the first character of its header line to the
  // start of the next scene's header (or the end of the parsed text). `body`
  // spans are for editing prose; this is what a DELETE splices out, header and
  // all. It runs to the next header rather than to `bodyEnd` so the blank lines
  // between two scenes go with the one being removed instead of stacking up.
  start: number
  end: number
}

// What `splitHeaderLine` returns: the header/body split of ONE line, before
// splitScenes places it in the document.
interface HeaderSplit {
  header: string
  body: string
}

const HEADER_PARTS = /^(?:---\s*)?scene\s*\d+\s*[—:–-]\s*(.*)$/i

// A header line can carry the scene's prose on the SAME line — an Ad Analyzer
// blueprint writes "SCENE 2 — B-ROLL DETAIL: extreme close-up of @PRODUCT…".
// Treating the whole line as the header dropped that prose, and a scene whose
// body came out empty was then filtered away entirely, so a blueprint of
// single-line scenes rendered as a card reading "0 scenes".
function splitHeaderLine(line: string): HeaderSplit {
  const trimmed = line.trim()
  // The canonical "--- Scene 1: THE HOOK (00:00-00:04) ---" is a label only.
  if (/---\s*$/.test(trimmed)) return { header: trimmed, body: '' }
  const parts = HEADER_PARTS.exec(trimmed)
  if (!parts) return { header: trimmed, body: '' }
  const rest = parts[1]
  const cut = (bodyText: string): HeaderSplit => ({
    header: trimmed.slice(0, trimmed.length - bodyText.length).replace(/[\s:]+$/, ''),
    body: bodyText,
  })
  // "SCENE 2 — B-ROLL DETAIL: <prose>" — the shot label ends at its colon. The
  // length floor keeps a bare timecode label ("THE HOOK (00:00-00:04)", whose
  // own colons match) from being read as a label plus a body.
  const labelled = /^[^:]{1,40}:\s*(.+)$/.exec(rest)
  if (labelled && labelled[1].length > 24) return cut(labelled[1])
  // "SCENE 2 — <prose>", no shot label at all.
  if (!labelled && rest.length > 60) return cut(rest)
  return { header: trimmed, body: '' }
}

// The timecode a scene header carries — `--- Scene 1: THE HOOK (00:00-00:04)
// ---` — lifted out so the card can set it as a pill instead of leaving it as
// the tail of one dim uppercase line. It's the thing a member scans a storyboard
// FOR (how long is this beat, where does it land), and at 10px inside the label
// it read as part of the label's own punctuation.
//
// Parens or brackets, a range or a lone stamp, any dash between the two halves —
// the header is written by a model, and the surrounding chrome varies even when
// the prompt contract doesn't. A header with no timecode just keeps its label.
const HEADER_TIME =
  /\s*[([]\s*(\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?)\s*[)\]]\s*$|\s*[-–—]?\s*\b(\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2})\s*$/

export function splitHeaderTime(header: string): { label: string; time: string | null } {
  const bare = header.replace(/^---\s*|\s*---$/g, '').trim()
  const match = HEADER_TIME.exec(bare)
  const time = match?.[1] ?? match?.[2]
  if (!match || !time) return { label: bare, time: null }
  // Strip the trailing punctuation the timecode was hanging off, so a label
  // doesn't end on a dangling colon or dash once its bracket is gone.
  const label = bare.slice(0, match.index).replace(/[\s:;,—–-]+$/, '')
  // One dash for every scene: the same blueprint routinely mixes a hyphen and
  // an en dash, and a column of pills is where that shows.
  const normalised = time.replace(/\s*[-–—]\s*/, '–')
  return { label: label || bare, time: normalised }
}

export function splitScenes(text: string): SceneChunk[] | null {
  if (!SCENE_REGEX.test(text)) return null
  const lines = text.split('\n')
  // Spans first, body second. The body is SLICED out of `text` at the end
  // rather than accumulated line by line, so the string and the span it claims
  // to occupy are the same characters by construction. Accumulating them
  // separately drifted: a blank line between the header and the prose (which is
  // how most models format a scene) contributed nothing to the string while
  // still moving the offsets, so every span in that scene sat one character
  // left of the text it described — and an edit then spliced over the newline
  // and dropped the body's last character.
  const spans: Array<{ header: string; headerStart: number; bodyStart: number; bodyEnd: number }> = []
  let current: { header: string; headerStart: number; bodyStart: number; bodyEnd: number } | null = null
  // Running character offset of the current line's first character. `text` is
  // split on '\n' and rejoined with '\n', so line length + 1 is exact.
  let offset = 0
  for (const line of lines) {
    const lineStart = offset
    offset += line.length + 1
    if (SCENE_HEADER.test(line.trim())) {
      if (current) spans.push(current)
      const split = splitHeaderLine(line)
      // A header that carries its own prose ("SCENE 2 — B-ROLL DETAIL: …")
      // starts the body mid-line; a label-only header starts it on the next.
      const bodyStart = split.body ? lineStart + line.indexOf(split.body) : offset
      current = { header: split.header, headerStart: lineStart, bodyStart, bodyEnd: bodyStart + split.body.length }
    } else if (current) {
      current.bodyEnd = lineStart + line.length
    }
  }
  if (current) spans.push(current)
  const chunks = spans
    .map((c) => {
      const raw = text.slice(c.bodyStart, Math.max(c.bodyStart, c.bodyEnd))
      // The trim has to move the span with it, or an edit would splice the
      // surrounding blank lines away along with the body.
      const lead = raw.length - raw.trimStart().length
      const body = raw.trim()
      return {
        header: c.header,
        body,
        bodyStart: c.bodyStart + lead,
        bodyEnd: c.bodyStart + lead + body.length,
        start: c.headerStart,
        end: text.length,
      }
    })
    .filter((c) => c.body.length > 0)
  // Each surviving scene runs to the next SURVIVING one, so a bodiless header
  // in between (which renders nothing) leaves with the scene above it rather
  // than being stranded in the text with nothing on screen to remove it.
  for (let i = 0; i < chunks.length - 1; i++) chunks[i].end = chunks[i + 1].start
  return chunks
}

// Renumber the "SCENE N" headers after one is deleted — 1, 2, 4, 5 reads as a
// bug, and the number is the one part of a header we can fix without inventing
// anything. The timecodes are deliberately left alone: they're the model's own
// timing, and re-cutting them here would be a guess printed as a fact.
//
// Only the digits are rewritten; the word keeps whatever case the take wrote it
// in, and the trailing separator is required so nothing but a real header
// matches.
const SCENE_NUMBER = /^([ \t]*(?:---\s*)?)(scene)(\s*)(\d+)(?=\s*[—:–-])/gim

export function renumberScenes(text: string): string {
  let n = 0
  return text.replace(SCENE_NUMBER, (_m, lead: string, word: string, gap: string) => `${lead}${word}${gap}${++n}`)
}

// Cut a span out of the take and CLOSE THE SEAM it leaves. Emptying a block is
// how it gets deleted, so this runs on every one of them — a script line, a
// spoken line, a scene's direction, a master block.
//
// The separator is the WIDER of the two runs of whitespace either side, never
// their sum: a line inside a paragraph sits between two newlines and has to
// close back to one, while a paragraph sits between two blank lines and has to
// keep one. Adding them turns every deleted line into a paragraph break, and
// dropping them both runs two sentences together.
export function spliceOut(text: string, start: number, end: number): string {
  const head = text.slice(0, start)
  const tail = text.slice(end)
  const headGap = /\s*$/.exec(head)?.[0] ?? ''
  const tailGap = /^\s*/.exec(tail)?.[0] ?? ''
  const body = head.slice(0, head.length - headGap.length)
  const rest = tail.slice(tailGap.length)
  if (!body) return rest
  if (!rest) return body
  const breaks = Math.max(
    (headGap.match(/\n/g) ?? []).length,
    (tailGap.match(/\n/g) ?? []).length,
  )
  if (breaks) return body + (breaks >= 2 ? '\n\n' : '\n') + rest
  // An INLINE cut came out of the middle of a sentence, so it can orphan the
  // punctuation that joined it to what's left — deleting the line out of
  // `"It just works," [CHARACTER] says, turning it over` leaves the comma with
  // nothing in front of it. Only a joining mark is taken, and only at the seam:
  // a full stop or a dash is the prose's own and stays. Nothing tries to repair
  // the grammar beyond that — what remains is exactly the words that were on
  // screen, which is the promise every other edit here keeps.
  return `${body.replace(/[,;:]+$/, '')} ${rest.replace(/^[,;:]+\s*/, '')}`
}

// The look every scene in a blueprint is shot in — the master style block. The
// Ad Analyzer writes it in front of its scenes and the scene rewrite is told to
// lead with the same block, so by contract it sits BEFORE the first header;
// matched wherever it lands anyway, since a model that reproduces it after the
// voice profile is a shape we'd rather render than lose. `MASTER` is optional
// for the same reason it is on the voice header — the two producers word it
// differently and that word sat between the markers and the label.
const STYLE_HEADER_REGEX = /(^|\n)[=\s]*(?:MASTER\s+)?VISUAL STYLE\b[^\n]*\n?/i

// Content that precedes the first "--- Scene N ---" header — used by the scene
// formats to carry a leading "=== VOICE PROFILE ... ===" block. Stripped of its
// own divider markers so it renders as a clean voice card above the scenes.
//
// The style block is preamble too, and this is the fallback that runs when the
// take carries NO voice header at all — so without the cut below, a rewrite
// that emitted a style block and no voice profile would render the same
// paragraph twice, once on each card.
function extractIntro(text: string): string {
  const idx = text.search(SCENE_REGEX)
  if (idx <= 0) return ''
  return dropStyleBlock(text.slice(0, idx))
    .replace(/^[=\s]*VOICE PROFILE[^\n]*\n/i, '')
    .replace(/^[=\s]+|[=\s]+$/g, '')
    .trim()
}

// Cuts a "=== MASTER VISUAL STYLE ... ===" block out of a preamble — its header
// and its body, which runs to the next labelled block or to the end.
function dropStyleBlock(intro: string): string {
  const match = intro.match(STYLE_HEADER_REGEX)
  if (!match || match.index == null) return intro
  const headerStart = match.index + match[1].length
  const bodyStart = headerStart + (match[0].length - match[1].length)
  const nextBlock = intro.slice(bodyStart).search(VOICE_HEADER_REGEX)
  return intro.slice(0, headerStart) + (nextBlock < 0 ? '' : intro.slice(bodyStart + nextBlock))
}

// Matches the voice-profile header line wherever it appears — the model is told
// to emit it AFTER the last scene, so it gets appended to (and merged into) the
// final scene's body unless we pull it out. Case-insensitive; tolerates the
// "(same voice in every scene)" parenthetical and trailing "===" markers.
// `MASTER` is optional because the two producers word it differently: Scripts'
// own prompts emit "=== VOICE PROFILE … ===", the Ad Analyzer's blueprint emits
// "=== MASTER VOICE PROFILE … ===" (ResultsView), and that word sitting between
// the markers and the label meant a blueprint remixed here rendered its voice
// profile buried in the last scene's body instead of on its own card.
const VOICE_HEADER_REGEX = /(^|\n)[=\s]*(?:MASTER\s+)?VOICE PROFILE\b[^\n]*\n?/i
const VOICE_HEADER_GLOBAL = new RegExp(VOICE_HEADER_REGEX.source, 'gi')

// Pulls the voice-profile block out of a scenes script. It can sit BEFORE the
// first scene (a blueprint pasted out of the Ad Analyzer leads with its
// "=== MASTER VOICE PROFILE ===" block, and a model rewriting that blueprint
// tends to reproduce it where it found it) or be appended AFTER the last scene
// (what our own prompt asks for). Returns the voice-profile body (with its
// "=== ... ===" markers stripped) and the text the scenes are parsed out of.
//
// `rest` is either `text` itself or a PREFIX of it, never a splice: the scene
// spans are offsets into `text`, and any cut from the middle would slide every
// one of them. A leading block therefore isn't removed at all — it's preamble,
// which `splitScenes` already ignores.
export function splitVoiceProfile(text: string): { body: string; rest: string; bodyStart?: number; bodyEnd?: number; blockStart?: number; blockEnd?: number } {
  // The appended block is the one the prompt asks for, so it wins when both
  // shapes are present. Taking the first match unconditionally handed a
  // remixed Ad Analyzer blueprint a "voice profile" containing every scene in
  // the ad, and left the take itself with no scenes to render at all.
  const lastScene = lastSceneHeaderIndex(text)
  const headers = [...text.matchAll(VOICE_HEADER_GLOBAL)]
  const match = headers.find((m) => m.index + m[1].length > lastScene) ?? headers[0]
  if (!match) {
    // No labelled block at all — fall back to the intro-based shape.
    return { body: extractIntro(text), rest: text }
  }
  const headerStart = match.index + match[1].length
  // The block runs from its header to the next scene header, or to the end of
  // the text when nothing follows it. Strip the header line and any standalone
  // "===" divider lines from the body.
  const regionStart = headerStart + (match[0].length - match[1].length)
  const nextScene = text.slice(regionStart).search(SCENE_REGEX)
  // A model that appends BOTH labelled blocks after the last scene puts the
  // style block inside the voice block's region, so the region ends at
  // whichever labelled thing comes first. `appended` still keys on the scene
  // header alone — it asks whether the voice block sits after the scenes, and a
  // style block following it doesn't change that answer.
  const nextStyle = text.slice(regionStart).search(STYLE_HEADER_REGEX)
  const appended = nextScene < 0
  const ends = [nextScene, nextStyle].filter((i) => i >= 0)
  const region = ends.length > 0 ? text.slice(regionStart, regionStart + Math.min(...ends)) : text.slice(regionStart)
  const body = region.replace(/^[=\s]+|[=\s]+$/g, '').trim()
  // Appended → the scenes are everything before it. Leading → the whole text,
  // since the block sits in front of the first header and is dropped anyway.
  const rest = appended ? text.slice(0, headerStart).replace(/\s+$/, '') : text
  if (body) {
    // Only the ends were stripped, so indexOf lands on the true offset — the
    // body can't begin with the `=`/whitespace that was taken off its front.
    const lead = region.indexOf(body)
    // The BLOCK span runs from the header line to the end of the region, so
    // emptying the card removes the label with the paragraph rather than
    // leaving a "=== VOICE PROFILE ===" heading over nothing.
    return {
      body,
      rest,
      bodyStart: regionStart + lead,
      bodyEnd: regionStart + lead + body.length,
      blockStart: headerStart,
      blockEnd: regionStart + region.length,
    }
  }
  return { body: extractIntro(rest), rest }
}

// Pulls the master visual style block out of a scene blueprint — the look the
// whole ad is rendered in, stated once so it can't drift between clips. It
// leads the document by contract, so its body runs from its header to the first
// thing that isn't it: the first scene header, or the voice profile block on a
// take that put the two labelled blocks together.
//
// Read off the FULL take text, not off `splitVoiceProfile`'s `rest` — a leading
// block is preamble either way, and the span has to be an offset into `text`
// for the in-place edit to splice back over the right characters.
export function splitVisualStyle(text: string): { body: string; start: number; end: number; blockStart: number; blockEnd: number } | null {
  const match = text.match(STYLE_HEADER_REGEX)
  if (!match || match.index == null) return null
  const headerStart = match.index + match[1].length
  const regionStart = headerStart + (match[0].length - match[1].length)
  const nextScene = text.slice(regionStart).search(SCENE_REGEX)
  const nextVoice = text.slice(regionStart).search(VOICE_HEADER_REGEX)
  const ends = [nextScene, nextVoice].filter((i) => i >= 0)
  const region = ends.length > 0 ? text.slice(regionStart, regionStart + Math.min(...ends)) : text.slice(regionStart)
  const body = region.replace(/^[=\s]+|[=\s]+$/g, '').trim()
  if (!body) return null
  // Only the ends were stripped, so indexOf lands on the true offset.
  const lead = region.indexOf(body)
  // Header included, for the same reason the voice block's is.
  return {
    body,
    start: regionStart + lead,
    end: regionStart + lead + body.length,
    blockStart: headerStart,
    blockEnd: regionStart + region.length,
  }
}

// Where the last "--- Scene N ---" header starts, or -1. Used to tell an
// appended voice-profile block from one that leads the document.
function lastSceneHeaderIndex(text: string): number {
  let at = -1
  let from = 0
  for (;;) {
    const next = text.slice(from).search(SCENE_REGEX)
    if (next < 0) return at
    at = from + next
    from = at + 1
  }
}

// A scene body is one prose paragraph with the spoken line quoted inline — the
// prompt contract is `[CHARACTER] says: "…"` for a written scene, and remix
// preserves the source's own attribution (`She says: "…"`, `Voiceover: "…"`).
// The quoted words are the only part the member reads aloud, records, and sends
// to Voiceovers, so they're lifted out of the direction rather than left as the
// tail clause of a paragraph about lens height.
// `start`/`end` are offsets into the BODY this segment was split out of — the
// other half of the in-place edit. Add the chunk's own `bodyStart` and you have
// the exact span of the take text that one rendered block owns.
//
// A spoken line carries a SECOND span: `start`/`end` are the words a member
// types over, `cutStart`/`cutEnd` are what a delete takes — the attribution cue
// in front of it, its own quote marks, and a trailing attribution behind it.
// Removing only the words would leave `[CHARACTER] says: ""` sitting in the
// take, which re-parses as direction with a pair of stray quotes in it.
export type SceneSegment =
  | { kind: 'direction'; text: string; start: number; end: number }
  | { kind: 'line'; speaker: string | null; text: string; start: number; end: number; cutStart: number; cutEnd: number }

// The verbs that introduce a line. `speaks` is the one a model reaches for
// most naturally after a [TOKEN] and it was missing, which is most of why one
// scene of a remix rendered as direction + line and the next as a single
// block. Verbs that introduce ON-SCREEN text rather than speech — reads,
// shows, displays — are deliberately absent: this app's scene prompts quote
// overlay copy constantly ("text overlay reading "2 weeks""), and promoting
// that to dialogue would send a caption to Voiceovers. `states` is out for the
// same reason — `the label states clearly: "10g collagen"` is packaging, and
// nothing writes `[CHARACTER] states:` often enough to pay for that.
const SPEECH_VERB_SRC =
  'says?|said|saying|speaks?|spoke|speaking|tells?|told|explains?|explained|adds?|continues?|whispers?|shouts?|asks?|replies|replied|' +
  // The answering half of a two-hander, and the delivery verbs a model reaches
  // for once it stages a second voice (September 2026): `[CHARACTER] responds:
  // "…"` fell through as direction, so the answer to an interviewer's tinted
  // line printed as plain prose with its closing quote stranded on the audio
  // note below it.
  'responds?|responded|answers?|answered|admits?|admitted|confesses|confessed|exclaims?|exclaimed|' +
  'murmurs?|murmured|mutters?|muttered|laughs?|laughed|jokes?|joked|insists?|insisted|repeats?|repeated|' +
  'interjects?|interjected|narrates?|narrated|calls?\\s+out|called\\s+out'
// A word that can never be the speaker: it means the cue is prose running into
// the verb ("…and says:", "the sign that says") rather than someone talking.
const NOT_A_SPEAKER_SRC = 'and|then|or|but|as|while|that|which|who'
const SPEAKER_SRC = `(?:\\[[A-Z_]+\\]|(?!(?:${NOT_A_SPEAKER_SRC})\\b)(?:the\\s+)?[\\w'’-]+)`
// A short adverbial run between the verb and the quote — `says DIRECTLY TO
// CAMERA: "…"`, `speaks TO THE LENS: "…"`, `says, SMILING: "…"`. Our own
// prompt contract writes the tight `[CHARACTER] says: "…"`, but a blueprint
// rewrite is told to keep the SOURCE's attribution format and the Ad Analyzer
// transcribes what it heard, so a phrase between the verb and the colon is
// what actually arrives here — and every one of those scenes fell through to
// the single-block fallback.
//
// Two bounds keep it honest, because whatever the cue matches is peeled OFF
// the direction: at most four plain words (no sentence punctuation, so it
// can't cross into the previous clause), and a tail only counts when a colon
// or comma follows it. That punctuation is the signal that the phrase was an
// attribution at all — without it, `the overlay asks the viewer to tap
// "Learn more"` is prose with a quote in it, not a spoken line.
const CUE_TAIL_SRC = `(?:\\s*,)?(?:\\s+[\\w'’-]+){0,4}`
const CUE_END_SRC = `(?:${CUE_TAIL_SRC}\\s*[:,]|\\s*[:,]?)`
// The clause that hands off to a quote, anchored to the end of the preceding
// prose so it can only ever eat the introduction itself. A speaker is a
// [TOKEN], a pronoun, or a (optionally "the"-prefixed) name — never a
// connective, which is how "…and says:" used to label the line "it over and".
//
// The punctuation between the cue and the quote is OPTIONAL. Our own prompts
// ask for `[CHARACTER] says: "…"`, but a blueprint rewrite is told to keep the
// attribution format of the source — and the Ad Analyzer transcribes what it
// heard, so `She says, "…"` arrives just as often. Requiring the colon left
// those lines sitting inside the direction as prose.
const NAMED_ATTRIBUTION = new RegExp(
  `(?<=^|[\\s,;.!?—-])(${SPEAKER_SRC}\\s+(?:${SPEECH_VERB_SRC})${CUE_END_SRC}|voice\\s*ove?r|narrator)\\s*[:,]?\\s*$`,
  'i',
)
// The model sometimes folds the cue into the sentence with no subject of its
// own ("…turns it over and says:"). Still dialogue — just nobody to label.
const BARE_ATTRIBUTION = new RegExp(`\\b(?:${SPEECH_VERB_SRC})${CUE_END_SRC}\\s*$`, 'i')
// The screenplay shape, with a speaker label and no verb at all. Only a
// [TOKEN] counts here: a bare word in front of a colon is shot prose
// ("Close-up: …") far more often than it's a speaker.
const TOKEN_ATTRIBUTION = /(?<=^|[\s,;.!?—-])(\[[A-Z_]+\])\s*:\s*$/
// Attribution that FOLLOWS its line — `"…," [CHARACTER] says, holding it up`.
// This is how a hook scene usually opens (the line is the first thing in the
// ad, so it's the first thing on the page), and it was the one dialogue shape
// that rendered as direction, which is why scene 1 of a remixed blueprint kept
// coming out as a plain block of text while every scene under it rendered as
// direction plus a spoken line.
//
// No adverbial tail on this one, on purpose: what it matches is skipped over
// rather than dropped, and the words after the verb here are the rest of the
// sentence (`"…," she says, HOLDING IT UP TO THE LENS`) — direction that
// belongs on the page.
//
// Nor every verb: `laughs` and `repeats` introduce a line fine, but AFTER a
// quote they are usually the reaction to on-screen copy — `…a one-star review:
// "Didn't do anything for me." [CHARACTER] laughs and points at it` — and read
// backwards they promoted the review (or the Comment Reply card) to the
// character's own spoken line and dropped "laughs" from the direction.
const NOT_A_TRAILING_CUE = new Set(['laughs?', 'laughed', 'repeats?', 'repeated'])
const TRAILING_VERB_SRC = SPEECH_VERB_SRC.split('|').filter((verb) => !NOT_A_TRAILING_CUE.has(verb)).join('|')
const TRAILING_ATTRIBUTION = new RegExp(
  `^[\\s,.;:—-]*(${SPEAKER_SRC}\\s+(?:${TRAILING_VERB_SRC})|voice\\s*ove?r|narrator)\\b`,
  'i',
)
// …and what disqualifies one: a cue that runs straight into ANOTHER quote is
// introducing the line in front of it, not reporting the one behind it. The
// shape that exposed this is a scene opening on overlay copy — `text "Days
// 1-7". [CHARACTER] says directly to camera: "…"` — where reading the cue
// backwards promoted the caption to dialogue and then skipped the cue, leaving
// the real spoken line stranded in the direction.
const NEXT_QUOTE_CUE = new RegExp(`^${CUE_TAIL_SRC}\\s*[:,]?\\s*["“]`)
// Strips the cue off a matched label to leave the speaker — the same verb and
// tail the cue was allowed to carry, or `[CHARACTER] says directly to camera`
// would be printed as the speaker's name.
const SPEECH_VERB = new RegExp(`\\s*\\b(?:${SPEECH_VERB_SRC})${CUE_END_SRC}\\s*$`, 'i')
// The connective left dangling on the direction once its attribution is cut.
const TRAILING_CONNECTIVE = /[\s,;:]*\b(?:and|then|as|while)\s*$/i

export function splitSpokenLines(body: string): SceneSegment[] {
  const segments: SceneSegment[] = []
  const quoted = /["“]([^"”\n]{2,})["”]/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = quoted.exec(body)) !== null) {
    const before = body.slice(cursor, match.index)
    const lead = before.replace(/\s+$/, '')
    const named = NAMED_ATTRIBUTION.exec(lead)
    const bare = named ? null : BARE_ATTRIBUTION.exec(lead)
    const token = named || bare ? null : TOKEN_ATTRIBUTION.exec(lead)
    const cue = named ?? bare ?? token
    const quoteEnd = match.index + match[0].length
    // Nothing in front of it? The attribution may still follow the line —
    // unless it turns out to be the cue for the NEXT quote, in which case this
    // one has no attribution at all and stays in the direction.
    let after = cue ? null : TRAILING_ATTRIBUTION.exec(body.slice(quoteEnd))
    if (after && NEXT_QUOTE_CUE.test(body.slice(quoteEnd + after[0].length))) after = null
    // A quote nobody is introduced as speaking isn't dialogue — it's a scare
    // quote living inside the direction ("has a visible "wait, what?"
    // reaction"). Leaving `cursor` where it is keeps it in the prose instead of
    // promoting it to a line and cutting the sentence in half around it.
    if (!cue && !after) continue
    // Peel the introduction off the direction so it doesn't trail off
    // mid-sentence ("…leans in and [CHARACTER] says:"). A trailing attribution
    // is peeled off the far side instead — `cursor` skips it below — and the
    // whole lead stays as direction.
    const label = named?.[1] ?? token?.[1] ?? after?.[1] ?? null
    const speaker = label ? label.replace(SPEECH_VERB, '').trim() || label.trim() : null
    const direction = (cue ? lead.slice(0, cue.index) : lead)
      .replace(TRAILING_CONNECTIVE, '')
      .replace(/^[\s,;:]+|[\s,;:]+$/g, '')
    // Every step above only strips from the ENDS of a prefix of `before`, so
    // the survivor is one contiguous run and indexOf finds its true offset —
    // it can't match earlier, since a direction never begins with the
    // whitespace/punctuation that was stripped off its front.
    // Everything from here to the end of the line's own region is the line's
    // to remove: the cue, the quote marks, and whatever attribution trails it.
    let cutStart = cursor
    if (direction) {
      const at = cursor + before.indexOf(direction)
      segments.push({ kind: 'direction', text: direction, start: at, end: at + direction.length })
      cutStart = at + direction.length
    }
    // The span is the quoted WORDS, inside the quote marks, so an edit can't
    // delete the quotes the parser finds the line by.
    const raw = match[1]
    const lineStart = match.index + 1 + (raw.length - raw.trimStart().length)
    const cutEnd = quoteEnd + (after ? after[0].length : 0)
    segments.push({ kind: 'line', speaker, text: raw.trim(), start: lineStart, end: lineStart + raw.trim().length, cutStart, cutEnd })
    cursor = cutEnd
  }
  const rest = body.slice(cursor)
  const tail = rest.replace(/^[\s,;:]+|[\s,;:]+$/g, '')
  if (tail) {
    const at = cursor + rest.indexOf(tail)
    segments.push({ kind: 'direction', text: tail, start: at, end: at + tail.length })
  }
  return segments
}

// A SHOT marker inside a scene body — `[0:00–0:04]`, `[0:13]`, parens
// tolerated. The Ad Analyzer's contract asks for one per camera cut and a
// blueprint rewrite is told to preserve them, so one scene routinely holds
// three or four shots inside a single paragraph. Deliberately a second copy of
// the shape `ad-anatomy/utils/scenePrompt.ts` matches: that one reads a raw
// prompt string, this one walks segments that already carry their spans.
const SHOT_MARKER = /[[(](\d{1,2}:\d{2})(?:\s*[-–—]\s*(\d{1,2}:\d{2}))?[\])]/g

export interface SceneBeat {
  // `0:00–0:04`, normalised to an en dash — or null for the prose in front of
  // the first marker, which in a single-shot scene is the whole body.
  time: string | null
  segments: SceneSegment[]
}

// Regroup a scene's segments into the SHOTS they were written as. A shot is
// what gets generated as one clip, so it — not the scene — is the unit a
// member takes out of here; copying one meant hand-selecting a run of prose
// out of the middle of a paragraph.
//
// The split happens INSIDE a direction segment as well as between segments:
// two consecutive shots with no dialogue between them arrive as one direction
// with two markers in it. Spans ride through untouched (offsets into the scene
// body), so every block still edits the exact characters it was rendered from.
export function groupSceneBeats(segments: SceneSegment[]): SceneBeat[] {
  const beats: SceneBeat[] = []
  let current: SceneBeat = { time: null, segments: [] }
  // A beat with nothing in it is dropped — which is what removes the empty
  // untimed run in front of a scene that opens on its first marker.
  const close = () => {
    if (current.segments.length) beats.push(current)
  }
  const addDirection = (seg: SceneSegment, from: number, to: number) => {
    const slice = seg.text.slice(from, to)
    const text = slice.trim()
    if (!text) return
    // Only the ends were trimmed, so indexOf lands on the true offset.
    const at = seg.start + from + slice.indexOf(text)
    current.segments.push({ kind: 'direction', text, start: at, end: at + text.length })
  }
  for (const seg of segments) {
    if (seg.kind !== 'direction') {
      current.segments.push(seg)
      continue
    }
    let cursor = 0
    SHOT_MARKER.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = SHOT_MARKER.exec(seg.text)) !== null) {
      // Mid-word brackets aren't shot markers.
      if (match.index > 0 && !/\s/.test(seg.text[match.index - 1])) continue
      addDirection(seg, cursor, match.index)
      close()
      current = { time: match[2] ? `${match[1]}–${match[2]}` : match[1], segments: [] }
      cursor = match.index + match[0].length
    }
    addDirection(seg, cursor, seg.text.length)
  }
  close()
  return beats
}

// One shot's own words, SLICED out of the scene body verbatim rather than
// rebuilt from the parse (which trims, strips connectives and peels the cue off
// the direction). A line's `start`/`end` are the words INSIDE its quote marks,
// so at either end of the shot a line contributes its wider cut span instead:
// a shot that opens on dialogue keeps its attribution cue and opening mark
// (`[0:03–0:06] [CHARACTER] says: "…"` used to copy as `…" She smiles`), and
// one that ends on dialogue keeps its closing mark and any trailing cue.
export function shotSource(beat: SceneBeat, body: string): string {
  const first = beat.segments[0]
  const last = beat.segments[beat.segments.length - 1]
  if (!first || !last) return ''
  const from = first.kind === 'line' ? first.cutStart : first.start
  const to = last.kind === 'line' ? last.cutEnd : last.end
  return body.slice(from, to).trim()
}

// The audio direction every scene carries — "NO background music, NO
// soundtrack, NO score, only spoken dialogue and natural room ambience". The
// prompt contract writes it ONCE per scene while it governs every shot in it,
// so it's lifted out of the last block, rendered as the scene's own footer, and
// appended to whatever a shot's Copy hands over: a clip generated from one shot
// needs that line as much as the scene does, and a member copying a shot has no
// reason to know it was written at the bottom of the paragraph.
const AUDIO_NOTE = /\bno\s+(?:background\s+music|soundtrack|score)\b/i
// A real one runs ~90 characters. The cap is what stops a model that drops the
// phrase mid-paragraph from handing the rest of the shot over as "audio".
const AUDIO_NOTE_MAX = 300

// Lift it off the END of the scene's last direction, when it sits there. Only a
// suffix is ever taken: cutting a sentence out of the MIDDLE would leave the
// prose either side of it non-contiguous, and every edit on this card is a
// splice of one contiguous span. Mutates `beats`, which its caller builds fresh
// inside the same memo.
export function liftAudioNote(beats: SceneBeat[]): SceneSegment | null {
  const beat = beats[beats.length - 1]
  const seg = beat?.segments[beat.segments.length - 1]
  if (!seg || seg.kind !== 'direction') return null
  const at = seg.text.search(AUDIO_NOTE)
  if (at < 0) return null
  // Back up to the start of the sentence the phrase sits in, then run to the end
  // of the block — the note is often two sentences ("…NO score. Only spoken
  // dialogue and natural room ambience.").
  const before = seg.text.slice(0, at)
  const from = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n')) + 1
  const tail = seg.text.slice(from)
  const note = tail.trim()
  if (!note || note.length > AUDIO_NOTE_MAX) return null
  const noteStart = seg.start + from + tail.indexOf(note)
  const rest = seg.text.slice(0, from).trim()
  if (rest) {
    // `seg.text` is already trimmed, so what's left still starts where it did.
    beat.segments[beat.segments.length - 1] = { kind: 'direction', text: rest, start: seg.start, end: seg.start + rest.length }
  } else {
    beat.segments.pop()
    if (!beat.segments.length) beats.pop()
  }
  return { kind: 'direction', text: note, start: noteStart, end: noteStart + note.length }
}
