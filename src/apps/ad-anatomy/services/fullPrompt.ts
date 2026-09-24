// The analysis as text a member (or a Flow block) carries elsewhere: the
// transcript as spoken lines, and the whole recreation — the master look and
// voice, then every scene under its header — as one pasteable blueprint. The
// Ad Analyzer's Copy and Send buttons and Flow's Ad Analyzer block both read
// these, so the two can't hand over different text.

import type { AnalysisResult, MasterVisualStyle, MasterVoiceProfile, ReverseEngineeredPrompt, Scene } from '../types'

// One spoken line per row, timestamps dropped — what Scripts remixes from.
export function transcriptText(result: AnalysisResult): string {
  return result.transcript.map((l) => l.text).join('\n')
}

// EVERY scene carries its "--- Scene N ---" header, a one-scene ad included.
// The header is what makes this text a BLUEPRINT rather than prose: Scripts
// routes a pasted remix source on `detectSceneBlueprint`, which matches on
// those headers, so a lone scene handed over without one was silently remixed
// as a plain spoken script — no scene rewrite, no voice profile, three script
// variations written off a video prompt. And a lone scene is the COMMON case,
// not an edge one: the analyzer's chunking rule returns a single scene for any
// ad of 15 seconds or less. The bare prompt is still one click away on the
// scene's own Copy button, which hands over `scene.prompt` verbatim.
export function sceneHeader(s: Scene): string {
  const time = s.startTime && s.endTime ? ` (${s.startTime}-${s.endTime})` : ''
  return `--- Scene ${s.index}: ${s.label}${time} ---`
}

export function joinScenes(scenes: Scene[]): string {
  return scenes.map((s) => `${sceneHeader(s)}\n${s.prompt}`).join('\n\n')
}

// The two master blocks as plain text. Each scene prompt is self-contained (it
// is fired as its own clip), so these aren't needed to render a single shot —
// they exist so the LOOK and the VOICE can't drift between clips, which is what
// makes a set of separately-generated clips read as one ad.
export function styleText(style: MasterVisualStyle): string {
  return `${style.label} · ${style.liveAction ? 'live action' : 'animated / rendered'}\n${style.brief}`
}

export function voiceText(voice: MasterVoiceProfile): string {
  const head = [voice.label, voice.traits.join(' · '), voice.delivery].filter(Boolean).join('\n')
  return `${head}\n\n${voice.profile}`
}

// The whole recreation as one pasteable artifact — the masters, then the
// scenes. Header wording mirrors the "=== VOICE PROFILE ... ===" block Scripts
// emits at the end of a blueprint, so a member moving text between the two apps
// sees the same shape. Scripts' blueprint detection matches on scene headers
// anywhere in the source, so a preamble in front of them is safe.
export function buildFullPrompt(rep: ReverseEngineeredPrompt): string {
  const masters: string[] = []
  if (rep.masterVisualStyle) {
    masters.push(`=== MASTER VISUAL STYLE (every scene is shot in this look) ===\n${styleText(rep.masterVisualStyle)}`)
  }
  if (rep.masterVoiceProfile) {
    masters.push(`=== MASTER VOICE PROFILE (same voice in every scene) ===\n${voiceText(rep.masterVoiceProfile)}`)
  }
  const scenes = joinScenes(rep.scenes)
  return masters.length > 0 ? `${masters.join('\n\n')}\n\n${scenes}` : scenes
}
