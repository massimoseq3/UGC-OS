// A scene script, read as the clips it gets filmed as. This is the loop the
// talking-head ads on the channel are made with by hand: copy scene 1 out of
// Scripts, paste it into Playground with the voice profile on the end, set
// the seconds to the scene's length, attach the character (and the product,
// when the scene shows it), generate, and do it again for scene 2. Scene
// Clips does that loop; this is the reading half of it, pure so it's tested.
//
// Every split is Scripts' own (sceneParsing.ts) — a scene here is exactly a
// scene card there, so what a member reads in Scripts is what gets filmed.

import { splitHeaderTime, splitScenes, splitSpokenLines, splitVisualStyle, splitVoiceProfile } from '../../script-architect/sceneParsing'
import type { ClipRef, FlowBlock } from '../types'
import { LEAD_TAIL_SECONDS, MAX_CLIP_SECONDS, MIN_CLIP_SECONDS, WORDS_PER_SECOND, wordCount } from '../../broll-studio/services/clipDuration'

export interface SceneShot {
  // 1-based, as the script numbers it.
  number: number
  // "Scene 1 · The Hook", for the block and its window.
  label: string
  // The scene as written — direction and lines — which is what's filmed.
  body: string
  // Only the words said, for the pacing and the edit's captions.
  spoken: string
  // How long the clip should run, before the model's own ladder: the scene's
  // timecode, stretched when its lines need longer, so dialogue never rushes.
  seconds: number
  // Whether the scene puts the product in shot, by its [PRODUCT] token. A
  // script that never uses the token shows it everywhere (see readSceneScript).
  showsProduct: boolean
}

export interface SceneScript {
  shots: SceneShot[]
  // The master blocks, pasted into every scene's prompt when asked.
  voice: string
  style: string
  // Whether the script was written in scenes at all. A plain script reads as
  // one shot of the whole thing.
  scenes: boolean
}

const PRODUCT_TOKEN = /\[PRODUCT\]|@PRODUCT\b/i
const RANGE = /^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/

// Seconds a "00:04–00:12" range runs, or null for a lone stamp or a backwards
// range (a model error, not a length to film).
export function rangeSeconds(time: string | null): number | null {
  const parts = time ? RANGE.exec(time.trim()) : null
  if (!parts) return null
  const seconds = Number(parts[3]) * 60 + Number(parts[4]) - (Number(parts[1]) * 60 + Number(parts[2]))
  return seconds > 0 ? seconds : null
}

function spokenOf(body: string): string {
  return splitSpokenLines(body)
    .filter((s) => s.kind === 'line')
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(' ')
}

// How long the words take to say at the pace Scripts writes to, with a beat
// either side — the same estimate B-Roll's dialogue cards use.
export function secondsToSay(spoken: string): number {
  if (!spoken.trim()) return 0
  return wordCount(spoken) / WORDS_PER_SECOND + LEAD_TAIL_SECONDS
}

// The voice and style blocks come off the ends, so neither is filmed as a
// scene's prose; a plain script with neither is the whole text.
function withoutMasters(text: string): string {
  const voice = splitVoiceProfile(text)
  let rest = voice.blockStart !== undefined && voice.blockEnd !== undefined
    ? text.slice(0, voice.blockStart) + text.slice(voice.blockEnd)
    : text
  const style = splitVisualStyle(rest)
  if (style) rest = rest.slice(0, style.blockStart) + rest.slice(style.blockEnd)
  return rest.trim()
}

export function readSceneScript(text: string): SceneScript {
  const voice = splitVoiceProfile(text)
  const style = splitVisualStyle(text)?.body ?? ''
  const chunks = splitScenes(voice.rest)
  if (!chunks?.length) {
    const plain = withoutMasters(text)
    const spoken = spokenOf(plain) || plain
    // Plain words — a hook, a spoken script — carry no direction, and a video
    // model handed a bare sentence films anything. Said to camera by the
    // character is what a talking-head clip of them is.
    const directed = /\[CHARACTER\]|@CHARACTER\b|\bsays?\s*:/i.test(plain)
    const body = directed ? plain : `[CHARACTER] talks straight to the camera, handheld, like a friend telling a friend, and says: "${plain.replace(/\s*\n+\s*/g, ' ')}"`
    return {
      shots: plain ? [{ number: 1, label: 'One Clip', body, spoken, seconds: Math.max(MIN_CLIP_SECONDS, secondsToSay(spoken)), showsProduct: true }] : [],
      voice: voice.body,
      style,
      scenes: false,
    }
  }
  const anyToken = chunks.some((c) => PRODUCT_TOKEN.test(c.body))
  const shots = chunks.map((c, i): SceneShot => {
    const { label, time } = splitHeaderTime(c.header)
    const spoken = spokenOf(c.body)
    const timed = rangeSeconds(time)
    const needed = secondsToSay(spoken)
    const seconds = Math.min(MAX_CLIP_SECONDS, Math.max(MIN_CLIP_SECONDS, timed ?? 0, needed))
    const name = label.replace(/^scene\s*\d+\s*[—:–-]?\s*/i, '').trim()
    return {
      number: i + 1,
      label: name ? `Scene ${i + 1} · ${titleish(name)}` : `Scene ${i + 1}`,
      body: c.body,
      spoken,
      seconds,
      // A script that never marks the product can't say where it's shown,
      // so it goes in every scene rather than none.
      showsProduct: anyToken ? PRODUCT_TOKEN.test(c.body) : true,
    }
  })
  return { shots, voice: voice.body, style, scenes: true }
}

// The whole script as one clip — the one-shot street interview — at the
// length of every scene together.
export function oneShot(script: SceneScript, text: string): SceneShot | null {
  if (!script.shots.length) return null
  const body = script.scenes ? withoutMasters(text) : script.shots[0].body
  return {
    number: 1,
    label: 'The Whole Script',
    body,
    spoken: script.shots.map((s) => s.spoken).join(' '),
    seconds: script.shots.reduce((n, s) => n + s.seconds, 0),
    showsProduct: script.shots.some((s) => s.showsProduct),
  }
}

export interface PromptParts {
  // The master visual style, in front of the scene.
  style: boolean
  // The voice profile, after it — Playground's own Voice box contract: the
  // prompt, a blank line, the profile verbatim.
  voice: boolean
  // What every clip must obey ("No captions or text on screen.").
  rules: string
}

// What one scene's clip is asked for, in the order Playground would send it.
export function shotPrompt(script: SceneScript, shot: SceneShot, parts: PromptParts): string {
  const out: string[] = []
  if (parts.style && script.style) out.push(script.style)
  out.push(shot.body)
  if (parts.rules.trim()) out.push(parts.rules.trim())
  if (parts.voice && script.voice) out.push(script.voice)
  return out.join('\n\n')
}

// Scripts' headers arrive in capitals ("THE HOOK"); the block shows them the
// way every other label in the app reads.
function titleish(s: string): string {
  if (s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

// ── What a Scene Clips block films ─────────────────────────────────────────

// How many clips of each scene to make, so the edit can pick the best. Test
// With 1 makes one.
export function sceneTakes(block: FlowBlock, test = false): number {
  return test ? 1 : Math.min(3, Math.max(1, Number(block.settings.takes) || 1))
}

// The script's scenes as this block films them: one shot per scene, or the
// whole thing as one clip. Test With 1 films the first scene only — the
// cheapest look at the character, the voice and the look together.
export function scenesToFilm(block: FlowBlock, text: string, test = false, match?: string): { script: SceneScript; shots: SceneShot[] } {
  const own = readSceneScript(text)
  // A script with no voice profile or look of its own (a hook) borrows the
  // ones of the script it's matched to.
  const matched = match ? readSceneScript(match) : null
  const script = matched ? { ...own, voice: own.voice || matched.voice, style: own.style || matched.style } : own
  const one = block.settings.shape === 'one' ? oneShot(script, text) : null
  const shots = one ? [one] : script.shots
  return { script, shots: test ? shots.slice(0, 1) : shots }
}

// A clip's place in the ad: which scene, which take.
export function sceneKey(scene: number, take: number): string {
  return `${scene}:${take}`
}

// Every clip a run of the block should end up with, by sceneKey.
export function wantedClips(block: FlowBlock, text: string, test = false): string[] {
  const { shots } = scenesToFilm(block, text, test)
  const takes = sceneTakes(block, test)
  return shots.flatMap((s) => Array.from({ length: takes }, (_, t) => sceneKey(s.number, t)))
}

// Of those, the ones a finished run doesn't have yet — the scenes a Test
// With 1 left for the full run, or a take added since. How many takes a
// block makes isn't part of its identity (catalog.ts), so adding one films
// only the new take rather than the whole ad again.
export function missingClips(block: FlowBlock, text: string, made: ClipRef[] | undefined, test = false): string[] {
  const have = new Set((made ?? []).filter((c) => c.scene !== undefined).map((c) => sceneKey(c.scene!, c.take ?? 0)))
  return wantedClips(block, text, test).filter((k) => !have.has(k))
}
